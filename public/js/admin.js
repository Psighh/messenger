/* =========================================================
   EduMessenger — Admin Panel
   Готов к подключению бэкенда: см. блок API внизу файла.
   ========================================================= */

'use strict';

/* ====== КОНФИГ ====== */
const API_BASE = '/App/public/index.php/api';          // ← поменяй на свой backend
const USE_MOCK = false;            // ← false, когда бэкенд готов
const TOKEN_KEY = 'em_token';
const USER_KEY  = 'em_user';

/* ====== AUTH CHECK (заглушка) ====== */
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser()  { try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch { return null; } }

function requireAdmin() {
  const user = getUser();
  if (USE_MOCK) {
    // в мок-режиме просто подставляем админа, если нет
    if (!user || user.role !== 'admin') {
      localStorage.setItem(USER_KEY, JSON.stringify({
        id: 1, name: 'Администратор', role: 'admin'
      }));
    }
    return;
  }
  if (!getToken() || !user || user.role !== 'admin') {
    window.location.href = 'auth.html';
  }
}

/* ====== STATE ====== */
const state = {
  tab: 'departments',
  search: '',
  departments: [],
  groups: [],
  students: [],
  teachers: [],
  filters: {
    groupDept: '',
    studentDept: '',
    studentGroup: '',
    teacherDept: '',
  },
  loading: false,
  broadcast: {
    scope: 'university',
    departmentId: '',
    groupId: '',
    history: [],
  },
};

/* ====== DOM ====== */
const $ = (id) => document.getElementById(id);
const el = {
  // header
  menuToggle: $('menuToggle'),
  sidebar: $('sidebar'),
  sidebarOverlay: $('sidebarOverlay'),
  themeToggle: $('themeToggle'),
  adminAvatar: $('adminAvatar'),
  adminName: $('adminName'),
  logoutBtn: $('logoutBtn'),
  // main
  pageTitle: $('pageTitle'),
  searchInput: $('searchInput'),
  createBtn: $('createBtn'),
  loading: $('loading'),
  emptyState: $('emptyState'),
  emptyText: $('emptyText'),
  // grids
  departmentsGrid: $('departmentsGrid'),
  groupsGrid: $('groupsGrid'),
  studentsTbody: $('studentsTbody'),
  teachersTbody: $('teachersTbody'),
  // filters
  groupDeptFilter: $('groupDeptFilter'),
  studentDeptFilter: $('studentDeptFilter'),
  studentGroupFilter: $('studentGroupFilter'),
  teacherDeptFilter: $('teacherDeptFilter'),
  // modal
  modalOverlay: $('modalOverlay'),
  modalTitle: $('modalTitle'),
  modalFields: $('modalFields'),
  modalError: $('modalError'),
  modalForm: $('modalForm'),
  modalClose: $('modalClose'),
  modalCancel: $('modalCancel'),
  // confirm
  confirmOverlay: $('confirmOverlay'),
  confirmText: $('confirmText'),
  confirmCancel: $('confirmCancel'),
  confirmOk: $('confirmOk'),
  // toast
  toastContainer: $('toastContainer'),
  // broadcast
  scopeSelector: $('scopeSelector'),
  broadcastDeptWrap: $('broadcastDeptWrap'),
  broadcastDept: $('broadcastDept'),
  broadcastGroupWrap: $('broadcastGroupWrap'),
  broadcastGroup: $('broadcastGroup'),
  broadcastTitle: $('broadcastTitle'),
  broadcastText: $('broadcastText'),
  broadcastRecipients: $('broadcastRecipients'),
  broadcastSend: $('broadcastSend'),
  broadcastTbody: $('broadcastTbody'),
};

/* =========================================================
   УТИЛИТЫ
   ========================================================= */
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type === 'error' ? 'error' : ''}`;
  t.textContent = msg;
  el.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

function deptName(id) {
  return state.departments.find(d => d.id === id)?.name || '—';
}
function groupName(id) {
  return state.groups.find(g => g.id === id)?.name || '—';
}

function showLoading(on) {
  el.loading.classList.toggle('hidden', !on);
}
function showEmpty(on, text = 'Здесь пока пусто') {
  el.emptyText.textContent = text;
  el.emptyState.classList.toggle('hidden', !on);
}

/* =========================================================
   РЕНДЕР
   ========================================================= */
const TAB_TITLES = {
  departments: 'Кафедры',
  groups: 'Группы',
  students: 'Студенты',
  teachers: 'Преподаватели',
  broadcast: 'Рассылки',
};

function switchTab(tab) {
  state.tab = tab;
  state.search = '';
  el.searchInput.value = '';
  el.pageTitle.textContent = TAB_TITLES[tab];

  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-content').forEach(s =>
    s.classList.toggle('active', s.dataset.content === tab)
  );

  // закрыть сайдбар на мобилке
  el.sidebar.classList.remove('open');
  el.sidebarOverlay.classList.remove('open');

  render();
}

function render() {
  showEmpty(false);
  switch (state.tab) {
    case 'departments': renderDepartments(); break;
    case 'groups':      renderGroups();      break;
    case 'students':    renderStudents();    break;
    case 'teachers':    renderTeachers();    break;
    case 'broadcast':   renderBroadcast();   break;
  }
}

/* --- Кафедры --- */
function renderDepartments() {
  const q = state.search.toLowerCase();
  const items = state.departments.filter(d => d.name.toLowerCase().includes(q));
  el.departmentsGrid.innerHTML = items.map(d => {
    const groupsCount = state.groups.filter(g => g.departmentId === d.id).length;
    const teachersCount = state.teachers.filter(t => t.departmentId === d.id).length;
    return `
      <div class="card" data-id="${d.id}">
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(d.name)}</div>
            <div class="card-sub">${escapeHtml(d.description || 'Без описания')}</div>
          </div>
          <div class="card-icon">🏛️</div>
        </div>
        <div class="card-meta">
          <span class="chip">${groupsCount} групп</span>
          <span class="chip">${teachersCount} препод.</span>
        </div>
        <div class="card-actions">
          <button class="edit" data-action="edit" data-id="${d.id}">✏️ Изменить</button>
          <button class="delete" data-action="delete" data-id="${d.id}">🗑️ Удалить</button>
        </div>
      </div>`;
  }).join('');

  if (!items.length) showEmpty(true, q ? 'Ничего не найдено' : 'Кафедр пока нет');
}

/* --- Группы --- */
function renderGroups() {
  const q = state.search.toLowerCase();
  const { groupDept } = state.filters;
  const items = state.groups.filter(g =>
    (!groupDept || g.departmentId === groupDept) &&
    g.name.toLowerCase().includes(q)
  );
  el.groupsGrid.innerHTML = items.map(g => {
    const studentsCount = state.students.filter(s => s.groupId === g.id).length;
    return `
            <div class="card" data-id="${g.id}">
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(g.name)}</div>
            <div class="card-sub">${escapeHtml(deptName(g.departmentId))}</div>
          </div>
          <div class="card-icon">👥</div>
        </div>
        <div class="card-meta">
          <span class="chip">${studentsCount} студ.</span>
        </div>
        <div class="card-actions">
          <button class="edit" data-action="edit" data-id="${g.id}">✏️ Изменить</button>
          <button class="delete" data-action="delete" data-id="${g.id}">🗑️ Удалить</button>
        </div>
      </div>`;
  }).join('');

  if (!items.length) showEmpty(true, q || groupDept ? 'Ничего не найдено' : 'Групп пока нет');
}

/* --- Студенты --- */
function renderStudents() {
  const q = state.search.toLowerCase();
  const { studentDept, studentGroup } = state.filters;
  const items = state.students.filter(s => {
    const deptMatch = !studentDept || s.departmentId === studentDept;
    const groupMatch = !studentGroup || s.groupId === studentGroup;
    const searchMatch = !q ||
      s.name.toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q);
    return deptMatch && groupMatch && searchMatch;
  });

  el.studentsTbody.innerHTML = items.map(s => `
    <tr data-id="${s.id}">
      <td>
        <div class="user-cell">
          <div class="avatar">${escapeHtml(initials(s.name))}</div>
          <div class="user-info">
            <span class="user-name">${escapeHtml(s.name)}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(s.email || '—')}</td>
      <td>${escapeHtml(groupName(s.groupId))}</td>
      <td>${escapeHtml(deptName(s.departmentId))}</td>
      <td>
        <div class="row-actions">
          <button class="edit" data-action="edit" data-id="${s.id}">✏️</button>
          <button class="delete" data-action="delete" data-id="${s.id}">🗑️</button>
        </div>
      </td>
    </tr>`).join('');

  if (!items.length) {
    el.studentsTbody.innerHTML = `<tr class="empty-row"><td colspan="5">${
      q || studentDept || studentGroup ? 'Ничего не найдено' : 'Студентов пока нет'
    }</td></tr>`;
  }
}

/* --- Преподаватели --- */
function renderTeachers() {
  const q = state.search.toLowerCase();
  const { teacherDept } = state.filters;
  const items = state.teachers.filter(t => {
    const deptMatch = !teacherDept || t.departmentId === teacherDept;
    const searchMatch = !q ||
      t.name.toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q);
    return deptMatch && searchMatch;
  });

  el.teachersTbody.innerHTML = items.map(t => `
    <tr data-id="${t.id}">
      <td>
        <div class="user-cell">
          <div class="avatar">${escapeHtml(initials(t.name))}</div>
          <div class="user-info">
            <span class="user-name">${escapeHtml(t.name)}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(t.email || '—')}</td>
      <td>${escapeHtml(deptName(t.departmentId))}</td>
      <td>
        <div class="row-actions">
          <button class="edit" data-action="edit" data-id="${t.id}">✏️</button>
          <button class="delete" data-action="delete" data-id="${t.id}">🗑️</button>
        </div>
      </td>
    </tr>`).join('');

  if (!items.length) {
    el.teachersTbody.innerHTML = `<tr class="empty-row"><td colspan="4">${
      q || teacherDept ? 'Ничего не найдено' : 'Преподавателей пока нет'
    }</td></tr>`;
  }
}

/* --- Рассылки --- */
function renderBroadcast() {
  // селект кафедр
  const deptOptions = state.departments
    .map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`)
    .join('');
  const curDept = el.broadcastDept.value;
  el.broadcastDept.innerHTML = `<option value="">— Выберите кафедру —</option>${deptOptions}`;
  if (curDept) el.broadcastDept.value = curDept;
  else if (state.broadcast.departmentId) el.broadcastDept.value = state.broadcast.departmentId;

  // селект групп (зависит от кафедры)
  updateBroadcastGroupOptions();

  // видимость блоков
  const scope = state.broadcast.scope;
  el.broadcastDeptWrap.classList.toggle('hidden', scope === 'university');
  el.broadcastGroupWrap.classList.toggle('hidden', scope !== 'group');

  // подсветка scope
  el.scopeSelector.querySelectorAll('.scope-option').forEach(b =>
    b.classList.toggle('selected', b.dataset.scope === scope)
  );

  // получатели
  const dept = el.broadcastDept.value ? Number(el.broadcastDept.value) : '';
  const group = el.broadcastGroup.value ? Number(el.broadcastGroup.value) : '';
  const count = countRecipients(scope, dept, group);
  el.broadcastRecipients.innerHTML = `Получателей: <strong>${count}</strong>`;

  // история
  const rows = state.broadcast.history.map(b => {
    let scopeLabel = 'Университет';
    if (b.scope === 'department') scopeLabel = `Кафедра: ${escapeHtml(deptName(b.departmentId))}`;
    if (b.scope === 'group') scopeLabel = `Группа: ${escapeHtml(groupName(b.groupId))}`;
    return `
      <tr data-id="${b.id}">
        <td>${new Date(b.createdAt).toLocaleString('ru-RU')}</td>
        <td>${escapeHtml(b.title)}</td>
        <td>${scopeLabel}</td>
        <td><span class="badge badge-primary">${b.recipients ?? '—'}</span></td>
        <td>
          <div class="row-actions">
            <button class="delete" data-action="delete-broadcast" data-id="${b.id}">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  el.broadcastTbody.innerHTML = rows ||
    `<tr class="empty-row"><td colspan="5">Рассылок пока нет</td></tr>`;
}

function updateBroadcastGroupOptions() {
  const dept = el.broadcastDept.value ? Number(el.broadcastDept.value) : '';
  const groups = state.groups.filter(g => !dept || g.departmentId === dept);
  const cur = el.broadcastGroup.value;
  el.broadcastGroup.innerHTML =
    `<option value="">— Выберите группу —</option>` +
    groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  if (groups.some(g => String(g.id) === cur)) el.broadcastGroup.value = cur;
  else state.broadcast.groupId = '';
}

/* =========================================================
   ФИЛЬТРЫ (селекты)
   ========================================================= */
function populateFilters() {
  // Кафедры → все селекты кафедр
  const deptOptions = state.departments
    .map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`)
    .join('');

  [el.groupDeptFilter, el.studentDeptFilter, el.teacherDeptFilter].forEach(sel => {
    const current = sel.value;
    sel.innerHTML = `<option value="">Все кафедры</option>${deptOptions}`;
    sel.value = current;
  });

  // Группы → селект групп у студентов (зависит от выбранной кафедры)
  updateStudentGroupFilter();
}

function updateStudentGroupFilter() {
  const dept = state.filters.studentDept;
  const groups = state.groups.filter(g => !dept || g.departmentId === dept);
  const current = el.studentGroupFilter.value;
  el.studentGroupFilter.innerHTML =
    `<option value="">Все группы</option>` +
    groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  // сохраняем выбор, если группа ещё доступна
  if (groups.some(g => g.id === current)) el.studentGroupFilter.value = current;
  else state.filters.studentGroup = '';
}

/* =========================================================
   МОДАЛКА: схемы полей
   ========================================================= */
const FIELD_SCHEMAS = {
  departments: () => [
    { name: 'name', label: 'Название кафедры', type: 'text', required: true },
    { name: 'description', label: 'Описание', type: 'textarea' },
  ],
  groups: () => [
    { name: 'name', label: 'Название группы', type: 'text', required: true },
    {
      name: 'departmentId', label: 'Кафедра', type: 'select', required: true,
      options: state.departments.map(d => ({ value: d.id, label: d.name })),
    },
  ],
  students: () => [
    { name: 'name', label: 'ФИО', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    {
      name: 'departmentId', label: 'Кафедра', type: 'select', required: true,
      options: state.departments.map(d => ({ value: d.id, label: d.name })),
    },
    {
      name: 'groupId', label: 'Группа', type: 'select', required: true,
      options: state.groups.map(g => ({ value: g.id, label: g.name })),
    },
  ],
  teachers: () => [
    { name: 'name', label: 'ФИО', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    {
      name: 'departmentId', label: 'Кафедра', type: 'select', required: true,
      options: state.departments.map(d => ({ value: d.id, label: d.name })),
    },
  ],
};

const TAB_LABELS = {
  departments: 'кафедру',
  groups: 'группу',
  students: 'студента',
  teachers: 'преподавателя',
};

function renderFields(schema, values = {}) {
  return schema.map(f => {
    const val = values[f.name] ?? '';
    const req = f.required ? '<span class="required">*</span>' : '';
    if (f.type === 'select') {
      const opts = (f.options || []).map(o =>
        `<option value="${o.value}" ${String(o.value) === String(val) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
      ).join('');
      return `
        <div class="form-field">
          <label>${escapeHtml(f.label)}${req}</label>
          <select name="${f.name}" ${f.required ? 'required' : ''}>
            <option value="">— Выберите —</option>${opts}
          </select>
        </div>`;
    }
    if (f.type === 'textarea') {
      return `
        <div class="form-field">
          <label>${escapeHtml(f.label)}${req}</label>
          <textarea name="${f.name}" ${f.required ? 'required' : ''}>${escapeHtml(val)}</textarea>
        </div>`;
    }
    return `
      <div class="form-field">
        <label>${escapeHtml(f.label)}${req}</label>
        <input type="${f.type}" name="${f.name}" value="${escapeHtml(val)}" ${f.required ? 'required' : ''} />
      </div>`;
  }).join('');
}

/* =========================================================
   CRUD
   ========================================================= */
let editingId = null;

function openModal(mode, item = null) {
  editingId = mode === 'edit' ? item.id : null;
  const tab = state.tab;
  el.modalTitle.textContent =
    (mode === 'edit' ? 'Изменить ' : 'Добавить ') + TAB_LABELS[tab];
  el.modalFields.innerHTML = renderFields(FIELD_SCHEMAS[tab](), item || {});
  el.modalError.classList.add('hidden');
  el.modalError.textContent = '';
  el.modalOverlay.classList.remove('hidden');
  // фокус на первое поле
  requestAnimationFrame(() => {
    el.modalFields.querySelector('input, select, textarea')?.focus();
  });
}

function closeModal() {
  el.modalOverlay.classList.add('hidden');
  editingId = null;
}

function readForm() {
  const data = {};
  el.modalFields.querySelectorAll('input, select, textarea').forEach(inp => {
    data[inp.name] = inp.value.trim();
  });
  // приводим id-поля к числу, если они числовые
  ['departmentId', 'groupId'].forEach(k => {
    if (k in data && data[k] !== '') data[k] = Number(data[k]);
  });
  return data;
}

async function submitForm(e) {
  e.preventDefault();
  el.modalError.classList.add('hidden');
  const data = readForm();

  // клиентская валидация
  const schema = FIELD_SCHEMAS[state.tab]();
  for (const f of schema) {
    if (f.required && (data[f.name] === '' || data[f.name] == null)) {
      el.modalError.textContent = `Заполните поле «${f.label}»`;
      el.modalError.classList.remove('hidden');
      return;
    }
  }

  const submitBtn = $('modalSubmit');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span> Сохранение...';

  try {
    if (editingId == null) {
      await api.create(state.tab, data);
      toast('Запись добавлена');
    } else {
      await api.update(state.tab, editingId, data);
      toast('Изменения сохранены');
    }
    closeModal();
    await reloadAll();
  } catch (err) {
    el.modalError.textContent = err.message || 'Ошибка сохранения';
    el.modalError.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
}

/* --- Подтверждение удаления --- */
let pendingDelete = null;

function askDelete(tab, id, label) {
  pendingDelete = { tab, id };
  el.confirmText.textContent = `Удалить ${label}? Это действие необратимо.`;
  el.confirmOverlay.classList.remove('hidden');
}

function closeConfirm() {
  el.confirmOverlay.classList.add('hidden');
  pendingDelete = null;
}

async function confirmDelete() {
  if (!pendingDelete) return;
  const { tab, id } = pendingDelete;
  $('confirmOk').disabled = true;
  try {
    await api.remove(tab, id);
    toast('Удалено');
    closeConfirm();
    await reloadAll();
  } catch (err) {
    toast(err.message || 'Ошибка удаления', 'error');
  } finally {
    $('confirmOk').disabled = false;
  }
}

/* =========================================================
   ЗАГРУЗКА ДАННЫХ
   ========================================================= */
async function reloadAll() {
  showLoading(true);
  try {
    const [departments, groups, students, teachers] = await Promise.all([
      api.list('departments'),
      api.list('groups'),
      api.list('students'),
      api.list('teachers'),
    ]);
    state.departments = departments;
    state.groups = groups;
    state.students = students;
    state.teachers = teachers;
    state.broadcast.history = await api.list('broadcasts');
    populateFilters();
    render();
  } catch (err) {
    toast(err.message || 'Не удалось загрузить данные', 'error');
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   API-СЛОЙ (mock + реальный backend)
   ========================================================= */
const MOCK_DB = {
  departments: [
    { id: 1, name: 'Информатика', description: 'Кафедра ИТ' },
    { id: 2, name: 'Математика', description: 'Кафедра мат. анализа' },
  ],
  groups: [
    { id: 1, name: 'ИС-21', departmentId: 1 },
    { id: 2, name: 'ИС-22', departmentId: 1 },
    { id: 3, name: 'МАТ-11', departmentId: 2 },
  ],
  students: [
    { id: 1, name: 'Иванов Иван', email: 'ivanov@edu.ru', groupId: 1, departmentId: 1 },
    { id: 2, name: 'Петрова Анна', email: 'petrova@edu.ru', groupId: 2, departmentId: 1 },
  ],
  teachers: [
    { id: 1, name: 'Сидоров Пётр', email: 'sidorov@edu.ru', departmentId: 1 },
  ],
  broadcasts: [
    { id: 1, title: 'Добро пожаловать', text: 'Приветствуем на портале!', scope: 'university', departmentId: null, groupId: null, recipients: 3, createdAt: new Date().toISOString() },
  ],
};

function mockList(resource) {
  return JSON.parse(JSON.stringify(MOCK_DB[resource] || []));
}
function mockCreate(resource, data) {
  const arr = MOCK_DB[resource];
  const id = arr.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const item = { id, ...data };
  arr.push(item);
  return JSON.parse(JSON.stringify(item));
}
function mockUpdate(resource, id, data) {
  const arr = MOCK_DB[resource];
  const i = arr.findIndex(x => x.id === id);
  if (i === -1) throw new Error('Не найдено');
  arr[i] = { ...arr[i], ...data, id };
  return JSON.parse(JSON.stringify(arr[i]));
}
function mockRemove(resource, id) {
  const arr = MOCK_DB[resource];
  const i = arr.findIndex(x => x.id === id);
  if (i !== -1) arr.splice(i, 1);
  return true;
}

function countRecipients(scope, departmentId, groupId) {
  if (scope === 'university') {
    return state.students.length + state.teachers.length;
  }
  if (scope === 'department') {
    return state.students.filter(s => s.departmentId === departmentId).length +
           state.teachers.filter(t => t.departmentId === departmentId).length;
  }
  if (scope === 'group') {
    return state.students.filter(s => s.groupId === groupId).length;
  }
  return 0;
}

function mockSendBroadcast(payload) {
  const recipients = countRecipients(payload.scope, payload.departmentId, payload.groupId);
  const item = {
    id: (MOCK_DB.broadcasts.reduce((m, x) => Math.max(m, x.id), 0)) + 1,
    ...payload,
    recipients,
    createdAt: new Date().toISOString(),
  };
  MOCK_DB.broadcasts.unshift(item);
  return JSON.parse(JSON.stringify(item));
}

function mockRemoveBroadcast(id) {
  const i = MOCK_DB.broadcasts.findIndex(x => x.id === id);
  if (i !== -1) MOCK_DB.broadcasts.splice(i, 1);
  return true;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const api = {
  async list(resource) {
    if (USE_MOCK) return mockList(resource);
    return request(`/${resource}`);
  },
  async create(resource, data) {
    if (USE_MOCK) return mockCreate(resource, data);
    return request(`/${resource}`, { method: 'POST', body: JSON.stringify(data) });
  },
  async update(resource, id, data) {
    if (USE_MOCK) return mockUpdate(resource, id, data);
    return request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async remove(resource, id) {
    if (USE_MOCK) return mockRemove(resource, id);
    return request(`/${resource}/${id}`, { method: 'DELETE' });
  },
  async send(payload) {
    if (USE_MOCK) return mockSendBroadcast(payload);
    return request('/broadcasts', { method: 'POST', body: JSON.stringify(payload) });
  },
  async removeBroadcast(id) {
    if (USE_MOCK) return mockRemoveBroadcast(id);
    return request(`/broadcasts/${id}`, { method: 'DELETE' });
  },
};

/* =========================================================
   СОБЫТИЯ
   ========================================================= */
function bindEvents() {
  // Навигация
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // Мобильный сайдбар
  el.menuToggle.addEventListener('click', () => {
    el.sidebar.classList.toggle('open');
    el.sidebarOverlay.classList.toggle('open');
  });
  el.sidebarOverlay.addEventListener('click', () => {
    el.sidebar.classList.remove('open');
    el.sidebarOverlay.classList.remove('open');
  });

  // Тема
  el.themeToggle.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    localStorage.setItem('em_theme', cur);
  });

  // Выход
  el.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = 'auth.html';
  });

  // Поиск
  el.searchInput.addEventListener('input', () => {
    state.search = el.searchInput.value.trim();
    render();
  });

  // Создание
  el.createBtn.addEventListener('click', () => openModal('create'));

  // Модалка
  el.modalClose.addEventListener('click', closeModal);
  el.modalCancel.addEventListener('click', closeModal);
  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });
  el.modalForm.addEventListener('submit', submitForm);

  // Confirm
  el.confirmCancel.addEventListener('click', closeConfirm);
  el.confirmOverlay.addEventListener('click', (e) => {
    if (e.target === el.confirmOverlay) closeConfirm();
  });
  el.confirmOk.addEventListener('click', confirmDelete);

  // Делегирование кликов по карточкам и таблицам
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    const tab = state.tab;

    if (action === 'delete-broadcast') {
      if (!confirm('Удалить рассылку?')) return;
      api.removeBroadcast(id).then(() => {
        state.broadcast.history = state.broadcast.history.filter(b => b.id !== id);
        toast('Рассылка удалена');
        renderBroadcast();
      }).catch(err => toast(err.message || 'Ошибка', 'error'));
      return;
    }

    if (action === 'edit') {
      const item = state[tab].find(x => x.id === id);
      if (item) openModal('edit', item);
    } else if (action === 'delete') {
      const label = TAB_LABELS[tab];
      askDelete(tab, id, label);
    }
  });

  // Фильтры
  el.groupDeptFilter.addEventListener('change', () => {
    state.filters.groupDept = el.groupDeptFilter.value ? Number(el.groupDeptFilter.value) : '';
    renderGroups();
  });

  el.studentDeptFilter.addEventListener('change', () => {
    state.filters.studentDept = el.studentDeptFilter.value ? Number(el.studentDeptFilter.value) : '';
    updateStudentGroupFilter();
    renderStudents();
  });

  el.studentGroupFilter.addEventListener('change', () => {
    state.filters.studentGroup = el.studentGroupFilter.value ? Number(el.studentGroupFilter.value) : '';
    renderStudents();
  });

  el.teacherDeptFilter.addEventListener('change', () => {
    state.filters.teacherDept = el.teacherDeptFilter.value ? Number(el.teacherDeptFilter.value) : '';
    renderTeachers();
  });

  // Esc закрывает модалки
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.modalOverlay.classList.contains('hidden')) closeModal();
      if (!el.confirmOverlay.classList.contains('hidden')) closeConfirm();
    }
  });

    // ===== BROADCAST =====
  el.scopeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.scope-option');
    if (!btn) return;
    state.broadcast.scope = btn.dataset.scope;
    renderBroadcast();
  });

  el.broadcastDept.addEventListener('change', () => {
    state.broadcast.departmentId = el.broadcastDept.value ? Number(el.broadcastDept.value) : '';
    updateBroadcastGroupOptions();
    renderBroadcast();
  });

  el.broadcastGroup.addEventListener('change', () => {
    state.broadcast.groupId = el.broadcastGroup.value ? Number(el.broadcastGroup.value) : '';
    renderBroadcast();
  });

  el.broadcastSend.addEventListener('click', async () => {
    const scope = state.broadcast.scope;
    const title = el.broadcastTitle.value.trim();
    const text  = el.broadcastText.value.trim();
    const dept  = el.broadcastDept.value ? Number(el.broadcastDept.value) : null;
    const group = el.broadcastGroup.value ? Number(el.broadcastGroup.value) : null;

    if (!title)  return toast('Введите заголовок', 'error');
    if (!text)   return toast('Введите текст', 'error');
    if (scope === 'department' && !dept)  return toast('Выберите кафедру', 'error');
    if (scope === 'group' && !group)      return toast('Выберите группу', 'error');

    el.broadcastSend.disabled = true;
    try {
      const saved = await api.send({
        title, text, scope,
        departmentId: scope === 'university' ? null : dept,
        groupId: scope === 'group' ? group : null,
      });
      state.broadcast.history.unshift(saved);
      toast('Рассылка отправлена');
      el.broadcastTitle.value = '';
      el.broadcastText.value = '';
      renderBroadcast();
    } catch (err) {
      toast(err.message || 'Ошибка отправки', 'error');
    } finally {
      el.broadcastSend.disabled = false;
    }
  });
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
function applyTheme() {
  const saved = localStorage.getItem('em_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

function applyUser() {
  const user = getUser();
  if (user) {
    if (el.adminName) el.adminName.textContent = user.name || 'Администратор';
    if (el.adminAvatar) el.adminAvatar.textContent = initials(user.name || 'A');
  }
}

async function init() {
  applyTheme();
  requireAdmin();
  applyUser();
  bindEvents();
  await reloadAll();
}

document.addEventListener('DOMContentLoaded', init);