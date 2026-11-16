/* =========================================================
   EduMessenger — Messenger
   Готов к подключению бэкенда: см. блок API внизу файла.
   ========================================================= */

'use strict';

/* ====== КОНФИГ ====== */
const API_BASE = '/api';        // ← поменяй на свой backend
const USE_MOCK = false;            // ← false, когда бэкенд готов
const TOKEN_KEY = 'em_token';
const USER_KEY  = 'em_user';

/* ====== AUTH ====== */
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; }
  catch { return null; }
}

function requireAuth() {
  const user = getUser();
  if (USE_MOCK) {
    if (!user) {
      localStorage.setItem(USER_KEY, JSON.stringify({
        id: 2, name: 'Иванов Иван', role: 'student', email: 'ivanov@edu.ru'
      }));
    }
    return;
  }
  if (!getToken() || !user) {
    window.location.href = 'auth.html';
  }
}

/* ====== STATE ====== */
const state = {
  me: null,
  chats: [],                 // [{id, type:'user'|'group', name, avatar, role, status, lastMessage, lastTime, unread}]
  activeChatId: null,        // 'broadcast' | число
  messages: {},              // chatId -> [{id, senderId, text, createdAt, isBroadcast}]
  broadcast: [],             // уведомления
  search: '',
  settings: {
    theme: 'light',
    status: '',
    notificationsEnabled: true,
    notificationsSound: true,
    quietFrom: '22:00',
    quietTo: '08:00',
  },
};

/* ====== DOM ====== */
const $ = (id) => document.getElementById(id);
const el = {
  // sidebar
  userChip: $('userChip'),
  myAvatar: $('myAvatar'),
  myName: $('myName'),
  myRole: $('myRole'),
  settingsBtn: $('settingsBtn'),
  chatSearch: $('chatSearch'),
  pinnedBroadcast: $('pinnedBroadcast'),
  broadcastTime: $('broadcastTime'),
  broadcastPreview: $('broadcastPreview'),
  broadcastUnread: $('broadcastUnread'),
  chatItems: $('chatItems'),
  chatListEmpty: $('chatListEmpty'),
  chatListPanel: $('chatListPanel'),

  // chat panel
  chatPanel: $('chatPanel'),
  chatPlaceholder: $('chatPlaceholder'),
  chatActive: $('chatActive'),
  backBtn: $('backBtn'),
  chatAvatar: $('chatAvatar'),
  chatName: $('chatName'),
  chatStatus: $('chatStatus'),
  chatInfoBtn: $('chatInfoBtn'),
  messages: $('messages'),
  messagesEmpty: $('messagesEmpty'),
  composer: $('composer'),
  messageInput: $('messageInput'),
  sendBtn: $('sendBtn'),

  // settings
  settingsOverlay: $('settingsOverlay'),
  settingsClose: $('settingsClose'),
  settingsCancel: $('settingsCancel'),
  settingsSave: $('settingsSave'),
  settingsAvatar: $('settingsAvatar'),
  settingsName: $('settingsName'),
  settingsRole: $('settingsRole'),
  settingsStatus: $('settingsStatus'),
  themeSelector: $('themeSelector'),
  notificationsEnabled: $('notificationsEnabled'),
  notificationsSound: $('notificationsSound'),
  quietFrom: $('quietFrom'),
  quietTo: $('quietTo'),

  // info
  infoOverlay: $('infoOverlay'),
  infoClose: $('infoClose'),
  infoAvatar: $('infoAvatar'),
  infoName: $('infoName'),
  infoRole: $('infoRole'),
  infoStatus: $('infoStatus'),

  // toast
  toastContainer: $('toastContainer'),
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
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('');
}

function roleLabel(role) {
  return ({ student: 'Студент', teacher: 'Преподаватель', admin: 'Администратор' })[role] || role;
}

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const diff = (now - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function isQuietHours() {
  if (!state.settings.notificationsEnabled) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = state.settings.quietFrom.split(':').map(Number);
  const [th, tm] = state.settings.quietTo.split(':').map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  // интервал через полночь
  if (from <= to) return cur >= from && cur < to;
  return cur >= from || cur < to;
}

/* =========================================================
   ТЕМА
   ========================================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('em_theme', theme);
  state.settings.theme = theme;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('em_settings'));
    if (saved) Object.assign(state.settings, saved);
  } catch {}
  applyTheme(state.settings.theme);
}

function saveSettings() {
  localStorage.setItem('em_settings', JSON.stringify(state.settings));
}

/* =========================================================
   ПРОФИЛЬ
   ========================================================= */
function applyUser() {
  const me = state.me;
  if (!me) return;
  const av = initials(me.name);
  el.myAvatar.textContent = av;
  el.myName.textContent = me.name;
  el.myRole.textContent = roleLabel(me.role);
  el.settingsAvatar.textContent = av;
  el.settingsName.textContent = me.name;
  el.settingsRole.textContent = roleLabel(me.role);
  el.settingsStatus.value = state.settings.status || '';
}

/* =========================================================
   РЕНДЕР: СПИСОК ЧАТОВ
   ========================================================= */
function renderChatList() {
  const q = state.search.toLowerCase();

  // Рассылки — превью
  const lastBc = state.broadcast[0];
  el.broadcastPreview.textContent = lastBc
    ? lastBc.title || lastBc.text
    : 'Уведомления от администрации';
  el.broadcastTime.textContent = lastBc ? formatTime(lastBc.createdAt) : '';

  const unreadBc = state.broadcast.filter(b => !b.read).length;
  el.broadcastUnread.textContent = unreadBc;
  el.broadcastUnread.classList.toggle('hidden', unreadBc === 0);
  el.pinnedBroadcast.classList.toggle('active', state.activeChatId === 'broadcast');

  // Обычные чаты
  const chats = state.chats.filter(c =>
    !q || c.name.toLowerCase().includes(q)
  );

  el.chatItems.innerHTML = chats.map(c => {
    const last = c.lastMessage || '';
    const time = c.lastTime ? formatTime(c.lastTime) : '';
    const unread = c.unread || 0;
    return `
      <div class="chat-item ${state.activeChatId === c.id ? 'active' : ''}" data-chat-id="${c.id}" role="button" tabindex="0">
        <div class="avatar">${escapeHtml(initials(c.name))}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${escapeHtml(c.name)}</span>
            <span class="chat-item-time">${time}</span>
          </div>
          <span class="chat-item-preview">${escapeHtml(last)}</span>
        </div>
        ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
      </div>`;
  }).join('');

  el.chatListEmpty.classList.toggle('hidden', chats.length > 0);
}

/* =========================================================
   РЕНДЕР: АКТИВНЫЙ ЧАТ
   ========================================================= */
function openChat(chatId) {
  state.activeChatId = chatId;

  if (chatId === 'broadcast') {
    el.chatPlaceholder.classList.add('hidden');
    el.chatActive.classList.remove('hidden');
    el.chatAvatar.textContent = '📢';
    el.chatAvatar.classList.add('broadcast-avatar');
    el.chatName.textContent = 'Рассылки';
    el.chatStatus.textContent = 'Уведомления от администрации';
    el.chatInfoBtn.style.display = 'none';
    el.composer.style.display = 'none'; // нельзя писать в рассылки
    // отметить прочитанными
    state.broadcast.forEach(b => b.read = true);
    renderMessages();
    renderChatList();
    // мобильный режим
    document.body.classList.add('chat-open');
    return;
  }

  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;

  el.chatPlaceholder.classList.add('hidden');
  el.chatActive.classList.remove('hidden');
  el.chatAvatar.textContent = initials(chat.name);
  el.chatAvatar.classList.remove('broadcast-avatar');
  el.chatName.textContent = chat.name;
  el.chatStatus.textContent = chat.status || roleLabel(chat.role);
  el.chatInfoBtn.style.display = '';
  el.composer.style.display = '';
  chat.unread = 0;
  renderMessages();
  renderChatList();
  document.body.classList.add('chat-open');
}

function closeChat() {
  state.activeChatId = null;
  el.chatActive.classList.add('hidden');
  el.chatPlaceholder.classList.remove('hidden');
  document.body.classList.remove('chat-open');
  renderChatList();
}

function renderMessages() {
  const chatId = state.activeChatId;
  const list = chatId === 'broadcast'
    ? state.broadcast.map(b => ({
        id: b.id,
        senderId: 'admin',
        senderName: 'Администратор',
        text: `${b.title ? `**${b.title}**\n` : ''}${b.text}`,
        createdAt: b.createdAt,
        isBroadcast: true,
      }))
    : (state.messages[chatId] || []);

  if (!list.length) {
    el.messages.innerHTML = '';
    el.messagesEmpty.classList.remove('hidden');
    return;
  }
  el.messagesEmpty.classList.add('hidden');

  el.messages.innerHTML = list.map(m => {
    const mine = m.senderId === state.me?.id;
    const author = m.isBroadcast
      ? 'Администратор'
      : (mine ? '' : (m.senderName || ''));
    const cls = m.isBroadcast ? 'broadcast' : (mine ? 'out' : 'in');
    const text = escapeHtml(m.text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return `
      <div class="message ${cls}">
        ${author ? `<span class="message-author">${escapeHtml(author)}</span>` : ''}
        <div class="message-bubble">${text}</div>
        <span class="message-time">${formatTime(m.createdAt)}</span>
      </div>`;
  }).join('');

  // прокрутка вниз
  el.messages.scrollTop = el.messages.scrollHeight;
}

/* =========================================================
   ОТПРАВКА СООБЩЕНИЯ
   ========================================================= */
async function sendMessage() {
  const text = el.messageInput.value.trim();
  if (!text) return;
  if (!state.activeChatId || state.activeChatId === 'broadcast') return;

  const chatId = state.activeChatId;
  el.messageInput.value = '';
  el.messageInput.style.height = 'auto';

  const optimistic = {
    id: Date.now(),
    senderId: state.me.id,
    senderName: state.me.name,
    text,
    createdAt: new Date().toISOString(),
  };
  (state.messages[chatId] = state.messages[chatId] || []).push(optimistic);
  renderMessages();

  try {
    const saved = await api.sendMessage(chatId, text);
    // заменяем оптимистичное на серверное
    const arr = state.messages[chatId];
    const idx = arr.findIndex(m => m.id === optimistic.id);
    if (idx !== -1 && saved) arr[idx] = saved;

    const chat = state.chats.find(c => c.id === chatId);
    if (chat) {
      chat.lastMessage = text;
      chat.lastTime = saved?.createdAt || optimistic.createdAt;
    }
    renderChatList();
  } catch (err) {
    toast(err.message || 'Не удалось отправить сообщение', 'error');
  }
}

/* =========================================================
   НАСТРОЙКИ
   ========================================================= */
function openSettings() {
  el.settingsStatus.value = state.settings.status || '';
  el.notificationsEnabled.checked = state.settings.notificationsEnabled;
  el.notificationsSound.checked = state.settings.notificationsSound;
  el.quietFrom.value = state.settings.quietFrom;
  el.quietTo.value = state.settings.quietTo;
  el.themeSelector.querySelectorAll('.theme-option').forEach(b =>
    b.classList.toggle('selected', b.dataset.themeChoice === state.settings.theme)
  );
  el.settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  el.settingsOverlay.classList.add('hidden');
}

function saveSettingsFromUI() {
  state.settings.status = el.settingsStatus.value.trim();
  state.settings.notificationsEnabled = el.notificationsEnabled.checked;
  state.settings.notificationsSound = el.notificationsSound.checked;
  state.settings.quietFrom = el.quietFrom.value || '22:00';
  state.settings.quietTo = el.quietTo.value || '08:00';
  saveSettings();
  closeSettings();
  toast('Настройки сохранены');
}

/* =========================================================
   ИНФО О ЧАТЕ
   ========================================================= */
function openChatInfo() {
  if (!state.activeChatId || state.activeChatId === 'broadcast') return;
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) return;
  el.infoAvatar.textContent = initials(chat.name);
  el.infoName.textContent = chat.name;
  el.infoRole.textContent = roleLabel(chat.role);
  el.infoStatus.textContent = chat.status || 'Нет статуса';
  el.infoOverlay.classList.remove('hidden');
}

/* =========================================================
   API-СЛОЙ (mock + реальный backend)
   ========================================================= */
const MOCK_DB = {
  chats: [
    { id: 10, type: 'user', name: 'Сидоров Пётр', role: 'teacher', status: 'На связи до 18:00' },
    { id: 11, type: 'user', name: 'Петрова Анна', role: 'student', status: 'Студентка ИС-22' },
    { id: 12, type: 'user', name: 'Кузнецов Артём', role: 'teacher', status: '' },
  ],
  messages: {
    10: [
      { id: 1, senderId: 10, senderName: 'Сидоров Пётр', text: 'Здравствуйте! Вопрос по лабораторной.', createdAt: new Date(Date.now() - 3600e3).toISOString() },
      { id: 2, senderId: 2, senderName: 'Иванов Иван', text: 'Добрый день, слушаю.', createdAt: new Date(Date.now() - 3500e3).toISOString() },
    ],
    11: [
      { id: 3, senderId: 11, senderName: 'Петрова Анна', text: 'Привет! Скинь конспект, пожалуйста.', createdAt: new Date(Date.now() - 7200e3).toISOString() },
    ],
  },
  broadcasts: [
    { id: 1, title: 'Изменение расписания', text: 'Завтра пары начнутся в 9:00.', scope: 'university', createdAt: new Date(Date.now() - 600e3).toISOString(), read: false },
    { id: 2, title: 'Собрание кафедры', text: 'Студенты кафедры Информатики — сбор в 15:00.', scope: 'department', createdAt: new Date(Date.now() - 86400e3).toISOString(), read: false },
  ],
};

function mockChats() {
  const chats = JSON.parse(JSON.stringify(MOCK_DB.chats));
  chats.forEach(c => {
    const msgs = MOCK_DB.messages[c.id] || [];
    const last = msgs[msgs.length - 1];
    c.lastMessage = last ? last.text : '';
    c.lastTime = last ? last.createdAt : null;
    c.unread = c.id === 11 ? 1 : 0;
  });
  return chats;
}
function mockBroadcasts() {
  return JSON.parse(JSON.stringify(MOCK_DB.broadcasts));
}
function mockMessages(chatId) {
  return JSON.parse(JSON.stringify(MOCK_DB.messages[chatId] || []));
}
function mockSendMessage(chatId, text) {
  const arr = MOCK_DB.messages[chatId] = MOCK_DB.messages[chatId] || [];
  const msg = {
    id: Date.now(),
    senderId: 2,
    senderName: 'Иванов Иван',
    text,
    createdAt: new Date().toISOString(),
  };
  arr.push(msg);
  return JSON.parse(JSON.stringify(msg));
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
  async getChats() {
    if (USE_MOCK) return mockChats();
    return request('/chats');
  },
  async getBroadcasts() {
    if (USE_MOCK) return mockBroadcasts();
    return request('/broadcasts/inbox'); // только релевантные пользователю
  },
  async getMessages(chatId) {
    if (USE_MOCK) return mockMessages(chatId);
    return request(`/chats/${chatId}/messages`);
  },
  async sendMessage(chatId, text) {
    if (USE_MOCK) return mockSendMessage(chatId, text);
    return request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
  async markBroadcastRead(id) {
    if (USE_MOCK) return true;
    return request(`/broadcasts/${id}/read`, { method: 'POST' });
  },
  async saveProfile(payload) {
    if (USE_MOCK) return true;
    return request('/me/profile', { method: 'PUT', body: JSON.stringify(payload) });
  },
  async saveNotificationSettings(payload) {
    if (USE_MOCK) return true;
    return request('/me/notifications', { method: 'PUT', body: JSON.stringify(payload) });
  },
};

/* =========================================================
   ЗАГРУЗКА ДАННЫХ
   ========================================================= */
async function loadData() {
  try {
    const [chats, broadcasts] = await Promise.all([
      api.getChats(),
      api.getBroadcasts(),
    ]);
    state.chats = chats || [];
    state.broadcast = (broadcasts || []).map(b => ({ read: false, ...b }));

    // подгружаем сообщения для чатов при первом открытии
    renderChatList();
  } catch (err) {
    toast(err.message || 'Не удалось загрузить чаты', 'error');
  }
}

async function ensureMessagesLoaded(chatId) {
  if (chatId === 'broadcast') return;
  if (state.messages[chatId]) return;
  try {
    state.messages[chatId] = await api.getMessages(chatId);
  } catch (err) {
    state.messages[chatId] = [];
    toast('Не удалось загрузить сообщения', 'error');
  }
}

/* =========================================================
   СОБЫТИЯ
   ========================================================= */
function bindEvents() {
  // Поиск
  el.chatSearch.addEventListener('input', () => {
    state.search = el.chatSearch.value.trim();
    renderChatList();
  });

  // Клик по чатам (делегирование)
  el.chatItems.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-chat-id]');
    if (!item) return;
    const id = Number(item.dataset.chatId);
    await ensureMessagesLoaded(id);
    openChat(id);
  });

  el.pinnedBroadcast.addEventListener('click', () => openChat('broadcast'));
  el.pinnedBroadcast.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat('broadcast'); }
  });

  // Назад (мобилка)
  el.backBtn.addEventListener('click', closeChat);

  // Отправка
  el.sendBtn.addEventListener('click', sendMessage);
  el.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  el.messageInput.addEventListener('input', () => {
    el.messageInput.style.height = 'auto';
    el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 120) + 'px';
  });

  // Настройки
  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.settingsCancel.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === el.settingsOverlay) closeSettings();
  });
  el.settingsSave.addEventListener('click', async () => {
    saveSettingsFromUI();
    try {
      await api.saveProfile({ status: state.settings.status });
      await api.saveNotificationSettings({
        enabled: state.settings.notificationsEnabled,
        sound: state.settings.notificationsSound,
        quietFrom: state.settings.quietFrom,
        quietTo: state.settings.quietTo,
      });
    } catch { /* mock — игнорируем */ }
  });

  // Тема в настройках
  el.themeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-option');
    if (!btn) return;
    const choice = btn.dataset.themeChoice;
    state.settings.theme = choice;
    applyTheme(choice);
    el.themeSelector.querySelectorAll('.theme-option').forEach(b =>
      b.classList.toggle('selected', b === btn)
    );
  });

  // Инфо о чате
  el.chatInfoBtn.addEventListener('click', openChatInfo);
  el.infoClose.addEventListener('click', () => el.infoOverlay.classList.add('hidden'));
  el.infoOverlay.addEventListener('click', (e) => {
    if (e.target === el.infoOverlay) el.infoOverlay.classList.add('hidden');
  });

  // Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.settingsOverlay.classList.contains('hidden')) closeSettings();
      if (!el.infoOverlay.classList.contains('hidden')) el.infoOverlay.classList.add('hidden');
    }
  });

    // Выход из аккаунта
    $('logoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = 'auth.html';
    });
}

/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
async function init() {
  requireAuth();
  state.me = getUser();
  loadSettings();
  applyUser();
  bindEvents();
  await loadData();
}

document.addEventListener('DOMContentLoaded', init);