
const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const uri = process.env.MONGODB_URI; // Connection string from environment variable
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db("ExpenseTracker");
    const collection = db.collection("Expenses");

    // Add new expense
    app.post('/add-expense', async (req, res) => {
      const { name, expense } = req.body;
      if (!name || !expense) return res.status(400).send("Missing data");
      await collection.insertOne({
        name,
        expense: parseFloat(expense),
        date: new Date()
      });
      res.redirect('/');
    });

    // Get all expenses
    app.get('/expenses', async (req, res) => {
      const allExpenses = await collection.find({}).sort({ date: -1 }).toArray();
      res.json(allExpenses);
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  } catch (err) {
    console.error(err);
  }
}

run();
