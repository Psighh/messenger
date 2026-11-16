'use strict';

/* ====== КОНФИГ ====== */
const API_BASE = '/api';        // ← поменяй на свой backend
const USE_MOCK = false;            // ← false, когда бэкенд готов
const TOKEN_KEY = 'em_token';
const USER_KEY = 'em_user';

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
    chats: [],                 // [{id, type:'user'|'group', name, avatar, role, status, lastMessage, lastTime, unread, departmentName, groupName, peerUpdatedAt}]
    activeChatId: null,        // 'broadcast' | число
    messages: {},              // chatId -> [{id, senderId, text, createdAt, isRead, isBroadcast}]
    broadcast: [],             // уведомления
    search: '',
    selectedUserProfile: null,
    selectedMessageIdForDelete: null,
    settings: {
        theme: 'dark',
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
    chatDeleteBtn: $('chatDeleteBtn'),
    chatMenuToggle: $('chatMenuToggle'),
    chatMenu: $('chatMenu'),
    chatHeaderActions: $('chatHeaderActions'),
    attachBtn: $('attachBtn'),
    emojiBtn: $('emojiBtn'),
    emojiPicker: $('emojiPicker'),
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
    infoDept: $('infoDept'),
    infoGroup: $('infoGroup'),
    infoAbout: $('infoAbout'),

    // toast
    toastContainer: $('toastContainer'),
};

/* =========================================================
   УТИЛИТЫ
   ========================================================= */
function toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`;
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

function formatOnlineStatus(iso) {
    if (!iso) return 'был(а) давно';
    const d = new Date(iso);
    if (isNaN(d)) return 'был(а) давно';
    const now = new Date();
    const diffSec = (now - d) / 1000;
    if (diffSec < 120) return 'в сети';
    const sameDay = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `был(а) сегодня в ${timeStr}`;
    return `был(а) ${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} в ${timeStr}`;
}

function isQuietHours() {
    if (!state.settings.notificationsEnabled) return true;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = state.settings.quietFrom.split(':').map(Number);
    const [th, tm] = state.settings.quietTo.split(':').map(Number);
    const from = fh * 60 + fm;
    const to = th * 60 + tm;
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
    const userId = state.me?.id || 'guest';
    try {
        const raw = localStorage.getItem(`em_settings_${userId}`) || localStorage.getItem('em_settings');
        const saved = raw ? JSON.parse(raw) : null;
        if (saved) Object.assign(state.settings, saved);
    } catch { }
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
    el.settingsStatus.value = me.status || '';
}

/* =========================================================
   РЕНДЕР: СПИСОК ЧАТОВ
   ========================================================= */
function renderChatList() {
    const q = state.search.toLowerCase();

    const lastBc = state.broadcast[0];
    el.broadcastPreview.textContent = lastBc
        ? lastBc.title || lastBc.text
        : 'Уведомления от администрации';
    el.broadcastTime.textContent = lastBc ? formatTime(lastBc.createdAt) : '';

    const unreadBc = state.broadcast.filter(b => !b.read).length;
    el.broadcastUnread.textContent = unreadBc;
    el.broadcastUnread.classList.toggle('hidden', unreadBc === 0);
    el.pinnedBroadcast.classList.toggle('active', state.activeChatId === 'broadcast');

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
        if (el.chatMenuToggle) el.chatMenuToggle.style.display = 'none';
        if (el.chatMenu) el.chatMenu.classList.add('hidden');
        if (el.chatMenuToggle) el.chatMenuToggle.setAttribute('aria-expanded', 'false');
        el.composer.style.display = 'none';

        state.broadcast.forEach(async b => {
            if (!b.read) {
                b.read = true;
                try {
                    await api.markBroadcastRead(b.id);
                } catch { }
            }
        });

        renderMessages();
        renderChatList();
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
    el.chatStatus.textContent = formatOnlineStatus(chat.peerUpdatedAt);
    if (el.chatMenuToggle) el.chatMenuToggle.style.display = '';
    if (el.chatMenu) el.chatMenu.classList.add('hidden');
    if (el.chatMenuToggle) el.chatMenuToggle.setAttribute('aria-expanded', 'false');
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
        el.messages.innerHTML = '<div class="messages-empty"><p>Сообщений пока нет. Напишите первым!</p></div>';
        return;
    }

    el.messages.innerHTML = list.map(m => {
        const mine = m.senderId === state.me?.id;
        const author = m.isBroadcast
            ? 'Администратор'
            : (mine ? '' : (m.senderName || ''));
        const cls = m.isBroadcast ? 'broadcast' : (mine ? 'out' : 'in');
        const text = escapeHtml(m.text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const ticks = m.isRead ? '✓✓' : '✓';
        const tickTitle = m.isRead ? 'Прочитано' : 'Отправлено (не прочитано)';
        return `
      <div class="message ${cls}" data-message-id="${m.id}">
        ${author ? `<span class="message-author">${escapeHtml(author)}</span>` : ''}
        <div class="message-bubble">${text}</div>
        <span class="message-time">
          ${formatTime(m.createdAt)}
          ${mine && !m.isBroadcast ? `<span class="message-ticks" title="${tickTitle}">${ticks}</span>` : ''}
        </span>
      </div>`;
    }).join('');

    // Клик правой кнопкой или долгое нажатие для удаления сообщения
    el.messages.querySelectorAll('.message').forEach(elMsg => {
        elMsg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const msgId = Number(elMsg.dataset.messageId);
            openDeleteMessageModal(msgId);
        });
    });

    el.messages.scrollTop = el.messages.scrollHeight;
}

/* =========================================================
   УДАЛЕНИЕ СООБЩЕНИЙ
   ========================================================= */
function openDeleteMessageModal(msgId) {
    state.selectedMessageIdForDelete = msgId;
    $('deleteMessageOverlay').classList.remove('hidden');
}

async function deleteSelectedMessage(scope) {
    const msgId = state.selectedMessageIdForDelete;
    if (!msgId) return;
    try {
        await api.deleteMessage(msgId, scope);
        $('deleteMessageOverlay').classList.add('hidden');
        // Удаляем локально из state
        for (const cid in state.messages) {
            state.messages[cid] = state.messages[cid].filter(m => m.id !== msgId);
        }
        renderMessages();
        toast('Сообщение удалено');
    } catch (err) {
        toast(err.message || 'Ошибка удаления сообщения', 'error');
    }
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
    if (el.emojiPicker) el.emojiPicker.classList.add('hidden');
    if (el.emojiBtn) el.emojiBtn.setAttribute('aria-expanded', 'false');

    const optimistic = {
        id: Date.now(),
        senderId: state.me.id,
        senderName: state.me.name,
        text,
        createdAt: new Date().toISOString(),
        isRead: false,
    };
    (state.messages[chatId] = state.messages[chatId] || []).push(optimistic);
    renderMessages();

    try {
        const saved = await api.sendMessage(chatId, text);
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
    const userId = state.me?.id || 'guest';
    try {
        const userSettings = JSON.parse(localStorage.getItem(`em_settings_${userId}`));
        if (userSettings) Object.assign(state.settings, userSettings);
    } catch { }

    applyTheme(state.settings.theme);
    el.themeSelector.querySelectorAll('.theme-option').forEach(b =>
        b.classList.toggle('selected', b.dataset.themeChoice === state.settings.theme)
    );
    el.settingsStatus.value = state.me?.status || '';
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
    const userId = state.me?.id || 'guest';
    state.settings.status = el.settingsStatus.value.trim();
    state.settings.notificationsEnabled = el.notificationsEnabled.checked;
    state.settings.notificationsSound = el.notificationsSound.checked;
    state.settings.quietFrom = el.quietFrom.value || '22:00';
    state.settings.quietTo = el.quietTo.value || '08:00';

    localStorage.setItem(`em_settings_${userId}`, JSON.stringify(state.settings));

    if (state.me) {
        state.me.status = state.settings.status;
        localStorage.setItem(USER_KEY, JSON.stringify(state.me));
    }

    closeSettings();
    toast('Настройки сохранены');
}

/* Закрытие контекстного меню действий чата */
function closeChatMenu() {
    if (el.chatMenu) el.chatMenu.classList.add('hidden');
    if (el.chatMenuToggle) el.chatMenuToggle.setAttribute('aria-expanded', 'false');
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
    el.infoStatus.textContent = formatOnlineStatus(chat.peerUpdatedAt);
    el.infoDept.textContent = `Кафедра: ${chat.departmentName || '—'}`;
    if (chat.role === 'student' && chat.groupName && chat.groupName !== '—') {
        el.infoGroup.textContent = `Группа: ${chat.groupName}`;
        el.infoGroup.style.display = 'block';
    } else {
        el.infoGroup.style.display = 'none';
    }
    el.infoAbout.textContent = chat.status ? `О себе: ${chat.status}` : 'О себе: не указано';
    el.infoOverlay.classList.remove('hidden');
}

/* =========================================================
   API-СЛОЙ (mock + реальный backend)
   ========================================================= */
const MOCK_DB = {
    chats: [
        { id: 10, type: 'user', name: 'Сидоров Пётр', role: 'teacher', status: 'На связи до 18:00', departmentName: 'Информатика', peerUpdatedAt: new Date().toISOString() },
        { id: 11, type: 'user', name: 'Петрова Анна', role: 'student', status: 'Студентка ИС-22', departmentName: 'Информатика', groupName: 'ИС-22', peerUpdatedAt: new Date(Date.now() - 300000).toISOString() },
    ],
    messages: {
        10: [
            { id: 1, senderId: 10, senderName: 'Сидоров Пётр', text: 'Здравствуйте!', createdAt: new Date(Date.now() - 3600e3).toISOString(), isRead: true },
        ]
    },
    broadcasts: [
        { id: 1, title: 'Изменение расписания', text: 'Завтра пары начнутся в 9:00.', scope: 'university', createdAt: new Date(Date.now() - 600e3).toISOString(), read: false },
    ],
};

function mockChats() {
    return JSON.parse(JSON.stringify(MOCK_DB.chats));
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
        isRead: false,
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
        try { msg = (await res.json()).message || msg; } catch { }
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
        return request('/broadcasts/inbox');
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
    async deleteMessage(messageId, scope) {
        if (USE_MOCK) return true;
        return request(`/messages/${messageId}?scope=${scope}`, { method: 'DELETE' });
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
    async searchUsers(params) {
        if (USE_MOCK) return [];
        const query = new URLSearchParams(params).toString();
        return request(`/users/search?${query}`);
    },
    async startChat(userId) {
        if (USE_MOCK) return { chatId: 999 };
        return request('/chats/start', { method: 'POST', body: JSON.stringify({ userId }) });
    },
    async deleteChat(chatId, scope) {
        if (USE_MOCK) return true;
        return request(`/chats/${chatId}?scope=${scope}`, { method: 'DELETE' });
    },
    async getDepartments() {
        return request('/public/departments');
    },
    async getGroups() {
        return request('/public/groups');
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
        state.broadcast = broadcasts || [];
        renderChatList();
    } catch (err) {
        toast(err.message || 'Не удалось загрузить чаты', 'error');
    }
}

async function ensureMessagesLoaded(chatId) {
    if (chatId === 'broadcast') return;
    try {
        state.messages[chatId] = await api.getMessages(chatId);
    } catch (err) {
        state.messages[chatId] = [];
        toast('Не удалось загрузить сообщения', 'error');
    }
}

/* =========================================================
   ПОИСК И УПРАВЛЕНИЕ ЧАТАМИ
   ========================================================= */
async function openSearchModal() {
    $('searchOverlay').classList.remove('hidden');
    $('userQueryInput').focus();
    try {
        const depts = await api.getDepartments();
        const deptSelect = $('filterDept');
        deptSelect.innerHTML = '<option value="">Все кафедры</option>' +
            depts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    } catch { }
    runUserSearch();
}

function closeSearchModal() {
    $('searchOverlay').classList.add('hidden');
}

async function updateSearchGroupOptions() {
    const deptId = $('filterDept').value;
    const groupSelect = $('filterGroup');
    try {
        const groups = await api.getGroups();
        const filtered = deptId ? groups.filter(g => g.departmentId === Number(deptId)) : groups;
        groupSelect.innerHTML = '<option value="">Все группы</option>' +
            filtered.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    } catch {
        groupSelect.innerHTML = '<option value="">Все группы</option>';
    }
}

async function runUserSearch() {
    const q = $('userQueryInput').value.trim();
    const role = $('filterRole').value;
    const deptId = $('filterDept').value;
    const groupId = $('filterGroup').value;

    $('filterGroupWrap').style.display = role === 'teacher' ? 'none' : 'block';

    try {
        const users = await api.searchUsers({ q, role, department_id: deptId, group_id: groupId });
        const listEl = $('searchResultsList');
        if (!users.length) {
            listEl.innerHTML = '<p class="search-hint">Ничего не найдено</p>';
            return;
        }
        listEl.innerHTML = users.map(u => `
      <div class="search-result-item" data-user-id="${u.id}">
        <div class="avatar">${escapeHtml(initials(u.name))}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${escapeHtml(u.name)}</span>
            <span class="chat-item-time">${roleLabel(u.role)}</span>
          </div>
          <span class="chat-item-preview">${escapeHtml(u.departmentName)} ${u.groupName !== '—' ? '· ' + escapeHtml(u.groupName) : ''}</span>
        </div>
      </div>
    `).join('');

        listEl.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const uid = Number(item.dataset.userId);
                const userObj = users.find(x => x.id === uid);
                if (userObj) openUserProfile(userObj);
            });
        });
    } catch (err) {
        toast('Ошибка поиска', 'error');
    }
}

function openUserProfile(user) {
    state.selectedUserProfile = user;
    $('upAvatar').textContent = initials(user.name);
    $('upName').textContent = user.name;
    $('upRole').textContent = roleLabel(user.role);
    $('upDept').textContent = `Кафедра: ${user.departmentName || '—'}`;
    $('upGroup').textContent = user.role === 'student' ? `Группа: ${user.groupName || '—'}` : '';
    $('upGroup').style.display = user.role === 'student' ? 'block' : 'none';
    $('upStatus').textContent = user.status ? `О себе: ${user.status}` : 'О себе: не указано';
    $('upOnline').textContent = formatOnlineStatus(user.peerUpdatedAt);
    $('userProfileOverlay').classList.remove('hidden');
}

async function deleteActiveChat(scope) {
    const chatId = state.activeChatId;
    if (!chatId || chatId === 'broadcast') return;
    try {
        await api.deleteChat(chatId, scope);
        $('deleteChatOverlay').classList.add('hidden');
        closeChat();
        await loadData();
        toast('Чат удален');
    } catch (err) {
        toast(err.message || 'Ошибка удаления', 'error');
    }
}

function debounce(fn, ms) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* =========================================================
   СОБЫТИЯ
   ========================================================= */
function bindEvents() {
    el.chatSearch.addEventListener('focus', openSearchModal);
    el.chatSearch.addEventListener('click', openSearchModal);

    $('searchClose').addEventListener('click', closeSearchModal);
    $('searchOverlay').addEventListener('click', (e) => { if (e.target === $('searchOverlay')) closeSearchModal(); });

    $('userProfileClose').addEventListener('click', () => $('userProfileOverlay').classList.add('hidden'));
    $('userProfileOverlay').addEventListener('click', (e) => { if (e.target === $('userProfileOverlay')) $('userProfileOverlay').classList.add('hidden'); });

    $('userQueryInput').addEventListener('input', debounce(runUserSearch, 300));
    $('filterRole').addEventListener('change', runUserSearch);
    $('filterDept').addEventListener('change', () => {
        updateSearchGroupOptions();
        runUserSearch();
    });
    $('filterGroup').addEventListener('change', runUserSearch);

    $('startChatBtn').addEventListener('click', async () => {
        if (!state.selectedUserProfile) return;
        try {
            const res = await api.startChat(state.selectedUserProfile.id);
            $('userProfileOverlay').classList.add('hidden');
            closeSearchModal();
            await loadData();
            await ensureMessagesLoaded(res.chatId);
            openChat(res.chatId);
        } catch (err) {
            toast(err.message || 'Не удалось начать чат', 'error');
        }
    });

    if (el.chatMenuToggle) {
        el.chatMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.activeChatId || state.activeChatId === 'broadcast') return;
            const isOpening = el.chatMenu.classList.contains('hidden');
            el.chatMenu.classList.toggle('hidden');
            el.chatMenuToggle.setAttribute('aria-expanded', String(isOpening));
        });
    }

    if (el.chatDeleteBtn) {
        el.chatDeleteBtn.addEventListener('click', () => {
            closeChatMenu();
            if (!state.activeChatId || state.activeChatId === 'broadcast') return;
            $('deleteChatOverlay').classList.remove('hidden');
        });
    }
    $('deleteChatClose').addEventListener('click', () => $('deleteChatOverlay').classList.add('hidden'));
    $('deleteChatOverlay').addEventListener('click', (e) => { if (e.target === $('deleteChatOverlay')) $('deleteChatOverlay').classList.add('hidden'); });

    $('deleteForMeBtn').addEventListener('click', () => deleteActiveChat('me'));
    $('deleteForAllBtn').addEventListener('click', () => deleteActiveChat('all'));

    // Удаление сообщения модалка
    $('deleteMessageClose').addEventListener('click', () => $('deleteMessageOverlay').classList.add('hidden'));
    $('deleteMessageOverlay').addEventListener('click', (e) => { if (e.target === $('deleteMessageOverlay')) $('deleteMessageOverlay').classList.add('hidden'); });
    $('deleteMessageForMeBtn').addEventListener('click', () => deleteSelectedMessage('me'));
    $('deleteMessageForAllBtn').addEventListener('click', () => deleteSelectedMessage('all'));

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

    el.backBtn.addEventListener('click', closeChat);

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
        } catch { }
    });

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

    el.chatInfoBtn.addEventListener('click', () => {
        closeChatMenu();
        openChatInfo();
    });
    el.infoClose.addEventListener('click', () => el.infoOverlay.classList.add('hidden'));
    el.infoOverlay.addEventListener('click', (e) => {
        if (e.target === el.infoOverlay) el.infoOverlay.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (el.chatMenu && !el.chatMenu.classList.contains('hidden') &&
            !e.target.closest('#chatMenu') && !e.target.closest('#chatMenuToggle')) {
            closeChatMenu();
        }
        if (el.emojiPicker && !el.emojiPicker.classList.contains('hidden') &&
            !e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) {
            el.emojiPicker.classList.add('hidden');
            el.emojiBtn?.setAttribute('aria-expanded', 'false');
        }
    });

    // Эмодзи вставляются в обычный текст сообщения и отправляются через существующий API.
    if (el.emojiBtn && el.emojiPicker) {
        el.emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpening = el.emojiPicker.classList.contains('hidden');
            el.emojiPicker.classList.toggle('hidden');
            el.emojiBtn.setAttribute('aria-expanded', String(isOpening));
        });

        el.emojiPicker.addEventListener('click', (e) => {
            const choice = e.target.closest('[data-emoji]');
            if (!choice) return;
            const emoji = choice.dataset.emoji;
            const input = el.messageInput;
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.setRangeText(emoji, start, end, 'end');
            input.focus();
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            el.emojiPicker.classList.add('hidden');
            el.emojiBtn.setAttribute('aria-expanded', 'false');
        });
    }

    // Сервер пока принимает только текст: кнопка скрепки обозначает будущую функцию.
    if (el.attachBtn) {
        el.attachBtn.addEventListener('click', () => {
            toast('Прикрепление файлов пока не подключено на сервере', 'info');
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeChatMenu();
            if (el.emojiPicker) el.emojiPicker.classList.add('hidden');
            if (el.emojiBtn) el.emojiBtn.setAttribute('aria-expanded', 'false');
            if (!el.settingsOverlay.classList.contains('hidden')) closeSettings();
            if (!el.infoOverlay.classList.contains('hidden')) el.infoOverlay.classList.add('hidden');
            if (!el.searchOverlay?.classList.contains('hidden')) closeSearchModal();
            if (!el.userProfileOverlay?.classList.contains('hidden')) el.userProfileOverlay.classList.add('hidden');
            if (!el.deleteChatOverlay?.classList.contains('hidden')) el.deleteChatOverlay.classList.add('hidden');
            if (!el.deleteMessageOverlay?.classList.contains('hidden')) $('deleteMessageOverlay').classList.add('hidden');
        }
    });

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