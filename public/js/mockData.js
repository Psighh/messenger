// Заглушка вместо БД. Позже заменяется запросами к серверу.
// Иерархия: кафедра -> группы -> пользователи

export const departments = [
  {
    id: 'isaiu',
    name: 'ИСЭИУ',
    groups: [
      { id: 'pib24e1', name: 'ПИб-24Э1' },
      { id: 'bib24e1', name: 'БИб-24Э1' },
      { id: 'pib23e1', name: 'ПИб-23Э1' }
    ]
  },
  {
    id: 'atnist',
    name: 'АТНИСТ',
    groups: [
      { id: 'atb24e1', name: 'АТб-24Э1' },
      { id: 'atb23e1', name: 'АТб-23Э1' }
    ]
  },
  {
    id: 'econom',
    name: 'Экономика',
    groups: [
      { id: 'ekb24e1', name: 'ЭКб-24Э1' }
    ]
  }
];

// Пользователи (для проверки прав и админки)
export const users = [
  { id: 'u1', fullName: 'Администратор', role: 'admin', departmentId: null, groupId: null },
  { id: 'u2', fullName: 'Иванов Иван', role: 'student', departmentId: 'isaiu', groupId: 'pib24e1' },
  { id: 'u3', fullName: 'Петрова Анна', role: 'student', departmentId: 'isaiu', groupId: 'pib24e1' },
  { id: 'u4', fullName: 'Сидоров Пётр', role: 'teacher', departmentId: 'isaiu', groupId: null },
  { id: 'u5', fullName: 'Козлова Мария', role: 'student', departmentId: 'atnist', groupId: 'atb24e1' }
];

// Текущий пользователь (демо). Роль можно переключать в админке.
export const currentUser = {
  id: 'u1',
  fullName: 'Администратор',
  role: 'admin', // 'admin' | 'teacher' | 'student'
  departmentId: null,
  groupId: null
};

// Личные чаты (демо)
export const chats = [
  { id: 'c1', name: 'Анна Петрова', avatar: 'АП', color: '#e57373', lastMessage: 'Привет! Как дела?', date: '12:45' },
  { id: 'c2', name: 'Иван Сидоров', avatar: 'ИС', color: '#64b5f6', lastMessage: 'Отправил файлы на почту', date: '11:20' },
  { id: 'c3', name: 'Мария Козлова', avatar: 'МК', color: '#81c784', lastMessage: 'Спасибо за помощь! 🙏', date: 'Вчера' }
];

// Общие уведомления (рассылки администратора)
// targetType: 'all' | 'department' | 'group'
export const generalNotifications = [
  {
    id: 'n1', title: 'Обновление мессенджера',
    text: 'Доступна новая версия 2.1 — добавлена тёмная тема',
    time: '10:15', unread: true,
    targetType: 'all', targetId: null, author: 'Администратор'
  },
  {
    id: 'n2', title: 'Собрание группы ПИб-24Э1',
    text: 'В среду в 14:00 в ауд. 312',
    time: '09:42', unread: true,
    targetType: 'group', targetId: 'pib24e1', author: 'Администратор'
  },
  {
    id: 'n3', title: 'Оповещение кафедры ИСЭИУ',
    text: 'Перенос пар на пятницу',
    time: 'Вчера', unread: false,
    targetType: 'department', targetId: 'isaiu', author: 'Администратор'
  }
];

// Проверка: видит ли пользователь уведомление
export function canSeeNotification(user, notif) {
  if (user.role === 'admin') return true;
  if (notif.targetType === 'all') return true;
  if (notif.targetType === 'department') return user.departmentId === notif.targetId;
  if (notif.targetType === 'group') return user.groupId === notif.targetId;
  return false;
}