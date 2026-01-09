const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// ---- MIDDLEWARE ----
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'raylandsecret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 10 * 60 * 1000 } // 10 minutes
}));

// ---- TEMPORARY STORAGE FOR EMAIL CODES ----
const codes = {}; // {email:{code,expires}}

// ---- MONGODB SETUP ----
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let collection;

async function run() {
  try {
    await client.connect();
    const db = client.db("ExpenseTracker");
    collection = db.collection("Expenses");
    console.log("MongoDB connected");
  } catch (err) {
    console.error(err);
  }
}
run();

// ---- NODEMAILER SETUP ----
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.APP_EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

// ---- LOGIN ROUTES ----

// Step 1: Request 6-digit code
app.post('/api/request-code', (req, res) => {
  const { email } = req.body;
  if (email !== process.env.APP_EMAIL) return res.status(401).json({ error: 'Email not allowed' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = { code, expires: Date.now() + 5 * 60 * 1000 }; // 5 min

  transporter.sendMail({
    from: process.env.APP_EMAIL,
    to: email,
    subject: 'Your Rayland Expense Tracker Code',
    text: `Your login code is: ${code}. Expires in 5 minutes.`
  }).then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: 'Email send failed' }));
});

// Step 2: Verify code
app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  const record = codes[email];
  if (!record) return res.status(401).json({ error: 'No code sent' });
  if (record.expires < Date.now()) return res.status(401).json({ error: 'Code expired' });
  if (record.code !== code) return res.status(401).json({ error: 'Wrong code' });

  // success → set session
  req.session.loggedIn = true;
  delete codes[email]; // one-time use
  res.json({ success: true });
});

// ---- AUTH MIDDLEWARE ----
function auth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ---- EXPENSE ROUTES ----
app.post('/api/expenses', auth, async (req, res) => {
  const { name, amount } = req.body;
  if (!name || amount == null) return res.status(400).json({ error: 'Missing data' });
  await collection.insertOne({ name, amount: Number(amount), date: new Date() });
  res.json({ success: true });
});

app.get('/api/expenses', auth, async (req, res) => {
  const all = await collection.find({}).sort({ date: -1 }).toArray();
  res.json(all);
});

app.delete('/api/expenses/:id', auth, async (req, res) => {
  await collection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

app.put('/api/expenses/:id', auth, async (req, res) => {
  const { name, amount } = req.body;
  await collection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { name, amount: Number(amount) } });
  res.json({ success: true });
});

// ---- PDF DOWNLOAD + EMAIL ----
const { jsPDF } = require('jspdf');
const fs = require('fs');

app.post('/api/email-pdf', auth, async (req, res) => {
  const expenses = await collection.find({}).sort({ date: -1 }).toArray();

  const doc = new jsPDF();
  doc.text("RAYLAND Expense Tracker", 10, 10);
  let y = 20;
  expenses.forEach(e => {
    doc.text(`${e.name} - Ksh ${e.amount} - ${new Date(e.date).toLocaleString()}`, 10, y);
    y += 10;
  });

  const filename = '/tmp/Rayland_Expenses.pdf';
  doc.save(filename);

  transporter.sendMail({
    from: process.env.APP_EMAIL,
    to: process.env.EMAIL_TO,
    subject: 'Your Rayland Expenses PDF',
    text: 'Attached is your PDF',
    attachments: [{ filename: 'Rayland_Expenses.pdf', path: filename }]
  }).then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: 'Email failed' }));
});

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

