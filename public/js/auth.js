/* =========================================================
   EduMessenger — Auth (Вход / Регистрация)
   Готов к подключению бэкенда: см. блок API внизу файла.
   ========================================================= */

'use strict';

/* ====== КОНФИГ ====== */
const API_BASE = '/api';        // ← поменяй на свой backend
const USE_MOCK = false;            // ← false, когда бэкенд готов
const TOKEN_KEY = 'em_token';
const USER_KEY  = 'em_user';

/* ====== МОК-ДАННЫЕ (для выпадающих списков) ======
   Когда бэкенд готов — эти данные придут с сервера
   (GET /api/public/departments, GET /api/public/groups). */
const MOCK_PUBLIC = {
  departments: [
    { id: 1, name: 'Информатика' },
    { id: 2, name: 'Математика' },
  ],
  groups: [
    { id: 1, name: 'ИС-21', departmentId: 1 },
    { id: 2, name: 'ИС-22', departmentId: 1 },
    { id: 3, name: 'МАТ-11', departmentId: 2 },
  ],
};

/* ====== DOM ====== */
const $ = (id) => document.getElementById(id);

const el = {
  // tabs
  authTabs: document.querySelectorAll('.auth-tab'),
  loginForm: $('loginForm'),
  registerForm: $('registerForm'),

  // login
  loginEmail: $('loginEmail'),
  loginPassword: $('loginPassword'),
  loginError: $('loginError'),
  loginSubmit: $('loginSubmit'),
  forgotLink: $('forgotLink'),

  // register
  roleSelector: $('roleSelector'),
  regName: $('regName'),
  groupField: $('groupField'),
  groupLabel: $('groupLabel'),
  regGroup: $('regGroup'),
  regEmail: $('regEmail'),
  regPassword: $('regPassword'),
  regPassword2: $('regPassword2'),
  registerError: $('registerError'),
  registerSubmit: $('registerSubmit'),
  passwordStrength: $('passwordStrength'),

  toastContainer: $('toastContainer'),
};

/* ====== STATE ====== */
const state = {
  role: 'student',           // 'student' | 'teacher'
  departments: [],
  groups: [],
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

function showError(node, msg) {
  node.textContent = msg;
  node.classList.remove('hidden');
}
function hideError(node) {
  node.textContent = '';
  node.classList.add('hidden');
}

/* =========================================================
   ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК (Вход / Регистрация)
   ========================================================= */
function switchAuthTab(tab) {
  el.authTabs.forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.auth-form').forEach(form => {
    form.classList.toggle('active', form.dataset.form === tab);
  });
  hideError(el.loginError);
  hideError(el.registerError);
}

/* =========================================================
   ПОКАЗ / СКРЫТИЕ ПАРОЛЯ
   ========================================================= */
function bindPasswordToggles() {
  document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.target);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁';
      btn.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
    });
  });
}

/* =========================================================
   НАДЁЖНОСТЬ ПАРОЛЯ
   ========================================================= */
function scorePassword(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Za-zА-Яа-я]/.test(pwd) && /\d/.test(pwd)) score++;
  if (/[^A-Za-zА-Яа-я0-9]/.test(pwd)) score++;
  return Math.min(score, 4); // 0..4
}

function updatePasswordStrength() {
  const pwd = el.regPassword.value;
  const score = scorePassword(pwd);
  const bar = el.passwordStrength.querySelector('.strength-bar span');
  const label = el.passwordStrength.querySelector('.strength-label');

  const levels = [
    { w: '0%',   c: 'var(--danger, #dc2626)',  t: 'Слишком короткий' },
    { w: '25%',  c: 'var(--danger, #dc2626)',  t: 'Слабый пароль' },
    { w: '50%',  c: '#f59e0b',                 t: 'Средний пароль' },
    { w: '75%',  c: '#22c55e',                 t: 'Хороший пароль' },
    { w: '100%', c: 'var(--success, #16a34a)', t: 'Надёжный пароль' },
  ];
  const lvl = levels[score];
  bar.style.width = lvl.w;
  bar.style.background = lvl.c;
  label.textContent = pwd ? lvl.t : 'Надёжность пароля';
  label.style.color = pwd ? lvl.c : '';
}

/* =========================================================
   ВЫПАДАЮЩИЕ СПИСКИ (Группа / Кафедра)
   ========================================================= */
function updateRoleField() {
  const isStudent = state.role === 'student';
  el.groupLabel.textContent = isStudent ? 'Группа' : 'Кафедра';
  el.regGroup.name = isStudent ? 'groupId' : 'departmentId';
  el.regGroup.innerHTML = '<option value="">— Выберите —</option>';

  if (isStudent) {
    state.groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      el.regGroup.appendChild(opt);
    });
  } else {
    state.departments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      el.regGroup.appendChild(opt);
    });
  }
}

function bindRoleSelector() {
  el.roleSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.role-option');
    if (!btn) return;
    state.role = btn.dataset.role;
    el.roleSelector.querySelectorAll('.role-option').forEach(b =>
      b.classList.toggle('selected', b === btn)
    );
    updateRoleField();
  });
}

/* =========================================================
   ВАЛИДАЦИЯ
   ========================================================= */
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function validateLogin(data) {
  if (!data.email) return 'Введите почту';
  if (!isEmail(data.email)) return 'Некорректная почта';
  if (!data.password) return 'Введите пароль';
  return null;
}

function validateRegister(data) {
  if (!data.name || data.name.trim().length < 2) return 'Введите ФИО';
  if (!data.roleValue) return state.role === 'student' ? 'Выберите группу' : 'Выберите кафедру';
  if (!data.email) return 'Введите почту';
  if (!isEmail(data.email)) return 'Некорректная почта';
  if (!data.password) return 'Введите пароль';
  if (data.password.length < 8) return 'Пароль должен быть не короче 8 символов';
  if (data.password !== data.password2) return 'Пароли не совпадают';
  return null;
}

/* =========================================================
   API-СЛОЙ
   ========================================================= */
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const api = {
  async getDepartments() {
    if (USE_MOCK) return JSON.parse(JSON.stringify(MOCK_PUBLIC.departments));
    return request('/public/departments');
  },
  async getGroups() {
    if (USE_MOCK) return JSON.parse(JSON.stringify(MOCK_PUBLIC.groups));
    return request('/public/groups');
  },
  async login(email, password) {
    if (USE_MOCK) {
      // мок: admin по special email, иначе student
      if (email === 'admin@edu.ru' && password === 'admin123') {
        return { token: 'mock-admin-token', user: { id: 1, name: 'Администратор', role: 'admin' } };
      }
      const name = email.split('@')[0] || 'Пользователь';
      return { token: 'mock-token', user: { id: 2, name, role: 'student' } };
    }
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async register(payload) {
    if (USE_MOCK) {
      return {
        token: 'mock-token',
        user: {
          id: Math.floor(Math.random() * 1000) + 10,
          name: payload.name,
          role: payload.role,
          email: payload.email,
        },
      };
    }
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

/* =========================================================
   СОХРАНЕНИЕ СЕССИИ
   ========================================================= */
function saveSession({ token, user }) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function redirectByRole(role) {
  if (role === 'admin') window.location.href = 'admin.html';
  else window.location.href = 'messenger.html';
}

/* =========================================================
   ОБРАБОТЧИКИ ФОРМ
   ========================================================= */
function bindLogin() {
  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(el.loginError);

    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    const err = validateLogin({ email, password });
    if (err) return showError(el.loginError, err);

    const btn = el.loginSubmit;
    const original = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Вход...';

    try {
      const session = await api.login(email, password);
      saveSession(session);
      toast('Вход выполнен');
      redirectByRole(session.user?.role);
    } catch (ex) {
      showError(el.loginError, ex.message || 'Неверная почта или пароль');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  el.forgotLink?.addEventListener('click', (e) => {
    e.preventDefault();
    toast('Свяжитесь с администратором для сброса пароля', 'error');
  });
}

function bindRegister() {
  el.regPassword.addEventListener('input', updatePasswordStrength);

  el.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(el.registerError);

    const roleValue = el.regGroup.value ? Number(el.regGroup.value) : '';
    const data = {
      name: el.regName.value.trim(),
      role: state.role,
      roleValue,
      email: el.regEmail.value.trim(),
      password: el.regPassword.value,
      password2: el.regPassword2.value,
    };

    const err = validateRegister(data);
    if (err) return showError(el.registerError, err);

    // payload для бэкенда
    const payload = {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
      ...(data.role === 'student'
        ? { groupId: data.roleValue }
        : { departmentId: data.roleValue }),
    };

    const btn = el.registerSubmit;
    const original = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Регистрация...';

    try {
      const session = await api.register(payload);
      saveSession(session);
      toast('Аккаунт создан');
      redirectByRole(session.user?.role);
    } catch (ex) {
      showError(el.registerError, ex.message || 'Ошибка регистрации');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function bindSwitchLinks() {
  document.querySelectorAll('[data-switch]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthTab(link.dataset.switch);
    });
  });

  el.authTabs.forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab));
  });
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
async function loadDictionaries() {
  try {
    const [departments, groups] = await Promise.all([
      api.getDepartments(),
      api.getGroups(),
    ]);
    state.departments = departments || [];
    state.groups = groups || [];
    updateRoleField();
  } catch (err) {
    toast('Не удалось загрузить списки групп/кафедр', 'error');
  }
}

async function init() {
  bindSwitchLinks();
  bindPasswordToggles();
  bindRoleSelector();
  bindLogin();
  bindRegister();
  updateRoleField();
  await loadDictionaries();
}

document.addEventListener('DOMContentLoaded', init);