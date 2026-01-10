 require('dotenv').config(); // Load env vars at the very top

const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ----- SESSION -----
app.use(session({
  secret: process.env.SESSION_SECRET || 'raylandsecret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 hour
}));

// ----- MONGODB -----
const client = new MongoClient(process.env.MONGODB_URI);
let db, expensesCol, loginCodesCol;

async function connectDB() {
  await client.connect();
  db = client.db("ExpenseTracker");
  expensesCol = db.collection("Expenses");
  loginCodesCol = db.collection("LoginCodes");
}
connectDB().catch(err => console.error('MongoDB connection failed', err));

// ----- REDIRECT ROOT -----
app.get('/', (req,res) => res.redirect('/login.html'));

// ----- EMAIL TRANSPORT -----
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.APP_EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

// ----- LOGIN API -----

// Request code
app.post('/api/request-code', async (req,res)=>{
  const { email } = req.body;
  if(!email) return res.json({ success:false, error:"Email required" });

  const code = Math.floor(100000 + Math.random()*900000).toString();
  const expiry = new Date(Date.now()+5*60*1000); // 5 min expiry

  // Save code in DB
  await loginCodesCol.updateOne(
    { email },
    { $set: { code, expiry } },
    { upsert:true }
  );

  // Send email
  try{
    await transporter.sendMail({
      from: process.env.APP_EMAIL,
      to: email,
      subject: 'Your RAYLAND login code',
      text: `Your 6-digit code is: ${code}. It expires in 5 minutes.`
    });
    res.json({ success:true });
  } catch(err){
  console.error("EMAIL ERROR 👉", err);
  res.json({ success:false, error: err.message });
}
});

// Verify code
app.post('/api/verify-code', async (req,res)=>{
  const { email, code } = req.body;
  if(!email || !code) return res.json({ success:false, error:"Email & code required" });

  const record = await loginCodesCol.findOne({ email });
  if(!record) return res.json({ success:false, error:"No code sent" });
  if(record.code !== code) return res.json({ success:false, error:"Invalid code" });
  if(new Date() > record.expiry) return res.json({ success:false, error:"Code expired" });

  // Login success → set session
  req.session.email = email;
  res.json({ success:true });
});

// ----- AUTH MIDDLEWARE -----
function requireLogin(req,res,next){
  if(!req.session.email) return res.status(401).json({ error:"Not logged in" });
  next();
}

// ----- EXPENSES API -----
app.get('/api/expenses', requireLogin, async (req,res)=>{
  const expenses = await expensesCol.find({}).sort({ date:-1 }).toArray();
  res.json(expenses.map(e=>({ ...e, amount:e.expense }))); // uniform naming
});

app.post('/api/expenses', requireLogin, async (req,res)=>{
  const { name, amount } = req.body;
  if(!name || !amount) return res.status(400).json({ error:"Missing data" });
  await expensesCol.insertOne({ name, expense:parseFloat(amount), date:new Date() });
  res.json({ success:true });
});

app.put('/api/expenses/:id', requireLogin, async (req,res)=>{
  const { name, amount } = req.body;
  await expensesCol.updateOne({ _id:ObjectId(req.params.id) }, { $set:{ name, expense:parseFloat(amount) } });
  res.json({ success:true });
});

app.delete('/api/expenses/:id', requireLogin, async (req,res)=>{
  await expensesCol.deleteOne({ _id:ObjectId(req.params.id) });
  res.json({ success:true });
});

// ----- PDF & EMAIL -----
app.post('/api/email-pdf', requireLogin, async (req,res)=>{
  const expenses = await expensesCol.find({}).sort({ date:-1 }).toArray();
  const doc = new jsPDF();
  doc.text("RAYLAND Expense Tracker", 10, 10);
  const rows = expenses.map(e => [e.name, e.expense.toString(), new Date(e.date).toLocaleString()]);
  doc.autoTable({ head:[['Name','Expense (Ksh)','Date']], body:rows, startY:20 });
  const pdfData = doc.output('arraybuffer');

  try{
    await transporter.sendMail({
      from: process.env.APP_EMAIL,
      to: process.env.EMAIL_TO,
      subject: 'Rayland Expenses PDF',
      text: 'Attached is your expense PDF.',
      attachments:[{ filename:'Rayland_Expenses.pdf', content:Buffer.from(pdfData) }]
    });
    res.json({ success:true });
  } catch(err){
    console.error(err);
    res.json({ success:false, error:"Failed to send PDF" });
  }
});

// ----- START SERVER -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
