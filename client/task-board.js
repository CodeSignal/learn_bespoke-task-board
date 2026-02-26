const COLUMNS = [
  { id: 'pending',    label: 'Pending',     dotClass: 'pending' },
  { id: 'inprogress', label: 'In Progress', dotClass: 'inprogress' },
  { id: 'blocked',    label: 'Blocked',     dotClass: 'blocked' },
  { id: 'done',       label: 'Done',        dotClass: 'done' }
];

const SEED_TASKS = [
  { id: 't1', title: 'Run final staging smoke tests', desc: 'Execute the full regression suite against staging before the 10 AM deploy.', status: 'pending', assignee: 'Alex R.', priority: 'high' },
  { id: 't2', title: 'Prepare rollback runbook', desc: 'Document step-by-step rollback procedure including feature flag and DB migration revert.', status: 'pending', assignee: 'Alex R.', priority: 'high' },
  { id: 't3', title: 'Send customer notification email', desc: 'Notify enterprise customers about the upcoming v2.0 release and expected downtime window.', status: 'done', assignee: 'Marketing', priority: 'medium' },
  { id: 't4', title: 'Update API documentation', desc: 'Add docs for new endpoints introduced in v2.0.', status: 'inprogress', assignee: 'Jordan K.', priority: 'medium' },
  { id: 't5', title: 'Review onboarding flow copy', desc: 'Final copy review for the updated first-run experience.', status: 'done', assignee: 'Sarah C.', priority: 'low' },
  { id: 't6', title: 'Deploy marketing landing page', desc: 'Blocked on engineering go/no-go decision at 9 AM.', status: 'blocked', assignee: 'Marketing', priority: 'medium' },
  { id: 't7', title: 'Post launch announcement in #general', desc: 'Prepare Slack message for all-hands after successful deploy.', status: 'pending', assignee: 'Sarah C.', priority: 'low' }
];

const DATA_VERSION = 1;
let tasks = [];
let nextId = 100;
let _abortController = null;
let _draggedTaskId = null;
let _addFormColumn = null;
let _context = {};

function loadTasks() {
  try {
    const v = localStorage.getItem('task-board-version');
    if (Number(v) === DATA_VERSION) {
      const saved = localStorage.getItem('task-board-tasks');
      if (saved) {
        tasks = JSON.parse(saved);
        nextId = tasks.reduce((max, t) => {
          const n = parseInt(t.id.replace('t', ''), 10);
          return isNaN(n) ? max : Math.max(max, n + 1);
        }, nextId);
        return;
      }
    }
  } catch (err) {
    console.error('Failed to load tasks:', err);
  }
  tasks = JSON.parse(JSON.stringify(SEED_TASKS));
  localStorage.setItem('task-board-version', String(DATA_VERSION));
  saveTasks();
}

function saveTasks() {
  try { localStorage.setItem('task-board-tasks', JSON.stringify(tasks)); }
  catch (err) { console.error('Failed to save tasks:', err); }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function tasksForColumn(colId) {
  return tasks.filter(t => t.status === colId);
}

function renderBoard() {
  const container = document.getElementById('board-columns');
  if (!container) return;

  container.innerHTML = COLUMNS.map(col => {
    const colTasks = tasksForColumn(col.id);
    return `
      <div class="board-column" data-col="${col.id}">
        <div class="board-column-header">
          <span class="board-column-title">
            <span class="status-dot ${col.dotClass}"></span>
            ${col.label}
            <span class="board-column-count">${colTasks.length}</span>
          </span>
          <button class="board-column-add" data-col="${col.id}" title="Add task">+</button>
        </div>
        <div class="board-column-body" data-col="${col.id}">
          ${_addFormColumn === col.id ? renderAddForm(col.id) : ''}
          ${colTasks.map(t => renderTaskCard(t)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderTaskCard(task) {
  const priorityHtml = task.priority
    ? `<span class="task-card-priority ${task.priority}">${task.priority}</span>`
    : '';
  const assigneeHtml = task.assignee
    ? `<span class="task-card-assignee">${escapeHtml(task.assignee)}</span>`
    : '<span></span>';

  return `
    <div class="task-card" draggable="true" data-task-id="${task.id}">
      <div class="task-card-title">${escapeHtml(task.title)}</div>
      ${task.desc ? `<p class="task-card-desc">${escapeHtml(task.desc)}</p>` : ''}
      <div class="task-card-footer">
        ${assigneeHtml}
        ${priorityHtml}
      </div>
    </div>
  `;
}

function renderAddForm(colId) {
  return `
    <form class="add-task-form" data-col="${colId}">
      <input type="text" class="input" name="title" placeholder="Task title" autocomplete="off" required />
      <input type="text" class="input" name="desc" placeholder="Description (optional)" autocomplete="off" />
      <select class="input" name="priority">
        <option value="high">High</option>
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
      </select>
      <div class="add-task-form-actions">
        <button type="submit" class="button button-primary">Add</button>
        <button type="button" class="button button-text add-task-cancel">Cancel</button>
      </div>
    </form>
  `;
}

function handleAddClick(colId) {
  _addFormColumn = colId;
  renderBoard();
  const form = document.querySelector(`.add-task-form[data-col="${colId}"] input[name="title"]`);
  if (form) form.focus();
}

function handleAddSubmit(colId, title, desc, priority) {
  const id = `t${nextId++}`;
  tasks.push({ id, title, desc: desc || '', status: colId, assignee: '', priority: priority || 'medium' });
  saveTasks();
  _addFormColumn = null;
  renderBoard();
  if (_context.emit) {
    _context.emit('task:added', { taskId: id, title, desc: desc || '', status: colId, priority });
  }
}

function handleAddCancel() {
  _addFormColumn = null;
  renderBoard();
}

function moveTask(taskId, newStatus, beforeTaskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const oldStatus = task.status;
  tasks = tasks.filter(t => t.id !== taskId);
  task.status = newStatus;

  if (beforeTaskId) {
    const idx = tasks.findIndex(t => t.id === beforeTaskId);
    if (idx !== -1) { tasks.splice(idx, 0, task); }
    else { tasks.push(task); }
  } else {
    tasks.push(task);
  }
  saveTasks();
  renderBoard();
  if (_context.emit && oldStatus !== newStatus) {
    _context.emit('task:moved', { taskId, title: task.title, from: oldStatus, to: newStatus });
  }
}

function setupDragAndDrop(signal) {
  const container = document.getElementById('board-columns');
  if (!container) return;

  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    _draggedTaskId = card.dataset.taskId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _draggedTaskId);
  }, { signal });

  container.addEventListener('dragend', (e) => {
    const card = e.target.closest('.task-card');
    if (card) card.classList.remove('dragging');
    _draggedTaskId = null;
    document.querySelectorAll('.board-column.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.task-card-placeholder').forEach(el => el.remove());
  }, { signal });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const col = e.target.closest('.board-column');
    if (!col) return;

    document.querySelectorAll('.board-column.drag-over').forEach(el => {
      if (el !== col) el.classList.remove('drag-over');
    });
    col.classList.add('drag-over');

    const body = col.querySelector('.board-column-body');
    if (!body) return;

    let placeholder = body.querySelector('.task-card-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'task-card-placeholder';
    }

    const cards = [...body.querySelectorAll('.task-card:not(.dragging)')];
    let insertBefore = null;
    for (const c of cards) {
      const rect = c.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) { insertBefore = c; break; }
    }

    if (insertBefore) { body.insertBefore(placeholder, insertBefore); }
    else { body.appendChild(placeholder); }
  }, { signal });

  container.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.board-column');
    if (col && !col.contains(e.relatedTarget)) {
      col.classList.remove('drag-over');
      const ph = col.querySelector('.task-card-placeholder');
      if (ph) ph.remove();
    }
  }, { signal });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const col = e.target.closest('.board-column');
    if (!col || !_draggedTaskId) return;

    const colId = col.dataset.col;
    const body = col.querySelector('.board-column-body');
    const placeholder = body?.querySelector('.task-card-placeholder');
    let beforeTaskId = null;

    if (placeholder && placeholder.nextElementSibling) {
      const next = placeholder.nextElementSibling.closest('.task-card');
      if (next) beforeTaskId = next.dataset.taskId;
    }

    document.querySelectorAll('.task-card-placeholder').forEach(el => el.remove());
    document.querySelectorAll('.board-column.drag-over').forEach(el => el.classList.remove('drag-over'));

    moveTask(_draggedTaskId, colId, beforeTaskId);
    _draggedTaskId = null;
  }, { signal });
}

export function init(context = {}) {
  _context = context;
  _abortController = new AbortController();
  const signal = _abortController.signal;

  loadTasks();
  renderBoard();
  setupDragAndDrop(signal);

  const container = document.getElementById('board-columns');

  container.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.board-column-add');
    if (addBtn) {
      handleAddClick(addBtn.dataset.col);
      return;
    }

    const cancelBtn = e.target.closest('.add-task-cancel');
    if (cancelBtn) {
      handleAddCancel();
      return;
    }
  }, { signal });

  container.addEventListener('click', (e) => {
    const badge = e.target.closest('.task-card-priority');
    if (!badge) return;
    const card = badge.closest('.task-card');
    if (!card) return;
    e.stopPropagation();
    const task = tasks.find(t => t.id === card.dataset.taskId);
    if (!task) return;
    const cycle = ['low', 'medium', 'high'];
    const idx = cycle.indexOf(task.priority);
    task.priority = cycle[(idx + 1) % cycle.length];
    saveTasks();
    renderBoard();
  }, { signal });

  container.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target.closest('.add-task-form');
    if (!form) return;
    const title = form.querySelector('input[name="title"]').value.trim();
    if (!title) return;
    const desc = form.querySelector('input[name="desc"]').value.trim();
    const priority = form.querySelector('select[name="priority"]').value;
    handleAddSubmit(form.dataset.col, title, desc, priority);
  }, { signal });
}

export function destroy() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
  tasks = [];
  nextId = 100;
  _draggedTaskId = null;
  _addFormColumn = null;
}

export function onAction(action) {
  if (action.type === 'add-task') {
    const p = action.payload || {};
    const id = `t${nextId++}`;
    tasks.push({
      id,
      title: p.title || 'New Task',
      desc: p.desc || '',
      status: p.status || 'pending',
      assignee: p.assignee || '',
      priority: p.priority || 'medium'
    });
    saveTasks();
    renderBoard();
  } else if (action.type === 'move-task') {
    const p = action.payload || {};
    const task = tasks.find(t => t.id === p.taskId || t.title === p.title);
    if (task && p.to) {
      moveTask(task.id, p.to);
    }
  }
}

export function onMessage(message) {
  console.log('Task Board received message:', message);
}
