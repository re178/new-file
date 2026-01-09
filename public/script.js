let editingId = null;

// ---- CHECK LOGIN ----
async function checkLogin() {
  try {
    const res = await fetch('/api/expenses');
    if (res.status === 401) {
      window.location = 'login.html';
      return false;
    }
    return true;
  } catch (err) {
    console.error('Login check failed', err);
    return false;
  }
}

// ---- LOAD EXPENSES ----
async function loadExpenses() {
  if (!(await checkLogin())) return;

  const res = await fetch('/api/expenses');
  const data = await res.json();

  const table = document.getElementById('expenseTable');
  table.querySelectorAll('tr:not(:first-child)').forEach(r => r.remove());

  let total = 0;

  data.forEach(exp => {
    total += exp.amount;

    const row = table.insertRow();
    row.insertCell(0).textContent = exp.name;
    row.insertCell(1).textContent = exp.amount;
    row.insertCell(2).textContent = new Date(exp.date).toLocaleString();

    const actionsCell = row.insertCell(3);
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.backgroundColor = '#ff9900';
    editBtn.style.marginRight = '5px';
    editBtn.onclick = () => editExpense(exp);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.style.backgroundColor = '#ff3333';
    delBtn.onclick = () => deleteExpense(exp._id);

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(delBtn);

    // Warning glow for high expense
    if (exp.amount > 1000) {
      row.classList.add('warning');
    } else {
      row.classList.remove('warning');
    }
  });

  const totalDiv = document.getElementById('totalExpenses');
  totalDiv.textContent = `Total Expenses: Ksh ${total}`;
  if (total > 5000) {
    totalDiv.classList.add('glow');
  } else {
    totalDiv.classList.remove('glow');
  }
}

// ---- ADD / EDIT EXPENSE ----
async function addExpense(name, amount) {
  const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses';
  const method = editingId ? 'PUT' : 'POST';
  await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, amount })
  });
  editingId = null;
  document.getElementById('expenseForm').reset();
  loadExpenses();
}

// ---- DELETE EXPENSE ----
async function deleteExpense(id) {
  if (confirm('Are you sure you want to delete this expense?')) {
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    loadExpenses();
  }
}

// ---- EDIT EXPENSE ----
function editExpense(exp) {
  editingId = exp._id;
  document.getElementById('name').value = exp.name;
  document.getElementById('expense').value = exp.amount;
}

// ---- FORM SUBMIT ----
document.getElementById('expenseForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const amount = parseFloat(document.getElementById('expense').value);
  addExpense(name, amount);
});

// ---- PDF DOWNLOAD & EMAIL ----
document.getElementById('downloadPdf').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/email-pdf', { method: 'POST' });
    const data = await res.json();
    if (data.success) alert('PDF sent to your email!');
    else alert('Failed to send PDF');
  } catch (err) {
    console.error(err);
    alert('Error sending PDF');
  }
});

// ---- AUTO REFRESH ----
setInterval(loadExpenses, 2000);
loadExpenses();
