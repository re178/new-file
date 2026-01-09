let editingId = null;

async function loadExpenses() {
  const res = await fetch('/expenses');
  const data = await res.json();
  const table = document.getElementById('expenseTable');
  table.querySelectorAll('tr:not(:first-child)').forEach(r => r.remove());

  let total = 0;

  data.forEach(exp => {
    total += exp.expense;
    const row = table.insertRow();
    row.insertCell(0).textContent = exp.name;
    row.insertCell(1).textContent = exp.expense;
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

    // Highlight warning if expense > 1000
    if(exp.expense > 1000){
      row.classList.add('warning');
    } else {
      row.classList.remove('warning');
    }
  });

  document.getElementById('totalExpenses').textContent = `Total Expenses: Ksh ${total}`;
}

async function addExpense(name, expense) {
  if(editingId){
    await fetch(`/edit-expense/${editingId}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, expense})
    });
    editingId = null;
  } else {
    await fetch('/add-expense', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, expense})
    });
  }
  document.getElementById('expenseForm').reset();
  loadExpenses();
}

async function deleteExpense(id){
  if(confirm("Are you sure you want to delete this expense?")){
    await fetch(`/delete-expense/${id}`, {method:'DELETE'});
    loadExpenses();
  }
}

function editExpense(exp){
  editingId = exp._id;
  document.getElementById('name').value = exp.name;
  document.getElementById('expense').value = exp.expense;
}

document.getElementById('expenseForm').addEventListener('submit', e=>{
  e.preventDefault();
  const name = document.getElementById('name').value;
  const expense = parseFloat(document.getElementById('expense').value);
  addExpense(name, expense);
});

// PDF Download
document.getElementById('downloadPdf').addEventListener('click', ()=>{
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text("RAYLAND Expense Tracker", 10, 10);
  const rows = [];
  document.querySelectorAll('#expenseTable tr:not(:first-child)').forEach(tr=>{
    const row = [];
    tr.querySelectorAll('td:not(:last-child)').forEach(td=>row.push(td.textContent));
    rows.push(row);
  });
  doc.autoTable({
    head:[['Name','Expense (Ksh)','Date']],
    body:rows,
    startY:20
  });
  doc.save('Rayland_Expenses.pdf');
});

// Auto-refresh every 2 seconds
setInterval(loadExpenses,2000);
loadExpenses();
