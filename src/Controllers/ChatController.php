<?php
// src/Controllers/ChatController.php
class ChatController
{
    /** Список чатов текущего пользователя */
    public function index(): void
    {
        $me = Auth::requireUser();
        $sql = 'SELECT c.id AS chat_id, c.type,
                       cp2.user_id AS peer_id,
                       u.name AS peer_name, u.role AS peer_role, u.status AS peer_status,
                       u.department_id, u.group_id, u.updated_at AS peer_updated_at,
                       d.name AS department_name, g.name AS group_name
                FROM chat_participants cp
                JOIN chats c ON c.id = cp.chat_id
                JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id <> cp.user_id
                JOIN users u ON u.id = cp2.user_id
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN `groups` g ON g.id = u.group_id
                WHERE cp.user_id = ? AND cp.is_deleted = 0';
        $stmt = Database::get()->prepare($sql);
        $stmt->execute([$me['id']]);
        $rows = $stmt->fetchAll();

        $out = [];
        foreach ($rows as $r) {
            $chatId = (int)$r['chat_id'];
            $stmt = Database::get()->prepare(
                'SELECT text, created_at FROM messages WHERE chat_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1'
            );
            $stmt->execute([$chatId]);
            $last = $stmt->fetch() ?: null;

            // Считаем непрочитанные сообщения
            $stmtUnread = Database::get()->prepare(
                'SELECT COUNT(*) FROM messages 
                 WHERE chat_id = ? AND sender_id <> ? AND is_deleted = 0 
                 AND id > COALESCE((SELECT last_read_message_id FROM chat_participants WHERE chat_id = ? AND user_id = ?), 0)'
            );
            $stmtUnread->execute([$chatId, $me['id'], $chatId, $me['id']]);
            $unread = (int)$stmtUnread->fetchColumn();

            $out[] = [
                'id' => $chatId,
                'type' => 'user',
                'name' => $r['peer_name'],
                'role' => $r['peer_role'],
                'status' => $r['peer_status'] ?? '',
                'peerId' => (int)$r['peer_id'],
                'departmentName' => $r['department_name'] ?? '—',
                'groupName' => $r['group_name'] ?? '—',
                'peerUpdatedAt' => $r['peer_updated_at'] ?? null,
                'lastMessage' => $last['text'] ?? '',
                'lastTime' => $last['created_at'] ?? null,
                'unread' => $unread,
            ];
        }
        Response::json($out);
    }

    /** Поиск пользователей с фильтрами */
    public function searchUsers(): void
    {
        $me = Auth::requireUser();
        $q = trim($_GET['q'] ?? '');
        $role = trim($_GET['role'] ?? '');
        $deptId = (int)($_GET['department_id'] ?? 0);
        $groupId = (int)($_GET['group_id'] ?? 0);

        $sql = 'SELECT u.id, u.name, u.email, u.role, u.status, u.department_id, u.group_id, u.updated_at,
                       d.name AS department_name, g.name AS group_name
                FROM users u
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN `groups` g ON g.id = u.group_id
                WHERE u.id <> ? AND u.role <> "admin"';
        $params = [$me['id']];

        if ($q !== '') {
            $sql .= ' AND (u.name LIKE ? OR u.email LIKE ?)';
            $params[] = "%$q%";
            $params[] = "%$q%";
        }
        if ($role !== '') {
            $sql .= ' AND u.role = ?';
            $params[] = $role;
        }
        if ($deptId > 0) {
            $sql .= ' AND u.department_id = ?';
            $params[] = $deptId;
        }
        if ($groupId > 0) {
            $sql .= ' AND u.group_id = ?';
            $params[] = $groupId;
        }

        $sql .= ' ORDER BY u.name LIMIT 30';
        $stmt = Database::get()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        Response::json(array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'email' => $r['email'],
            'role' => $r['role'],
            'status' => $r['status'] ?? '',
            'departmentName' => $r['department_name'] ?? '—',
            'groupName' => $r['group_name'] ?? '—',
            'peerUpdatedAt' => $r['updated_at'] ?? null,
        ], $rows));
    }

    /** Начать или открыть чат с пользователем */
    public function startChat(): void
    {
        $me = Auth::requireUser();
        $data = $this->jsonBody();
        $userId = (int)($data['userId'] ?? 0);

        if (!$userId || $userId === $me['id']) {
            Response::error('Некорректный пользователь');
        }

        $stmt = Database::get()->prepare(
            'SELECT c.id FROM chats c
             JOIN chat_participants cp1 ON cp1.chat_id = c.id AND cp1.user_id = ?
             JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id = ?
             WHERE c.type = "direct" LIMIT 1'
        );
        $stmt->execute([$me['id'], $userId]);
        $chat = $stmt->fetch();

        if ($chat) {
            $chatId = (int)$chat['id'];
            $stmt = Database::get()->prepare('UPDATE chat_participants SET is_deleted = 0 WHERE chat_id = ? AND user_id = ?');
            $stmt->execute([$chatId, $me['id']]);
        } else {
            $db = Database::get();
            $db->beginTransaction();
            $stmt = $db->prepare('INSERT INTO chats (type) VALUES ("direct")');
            $stmt->execute();
            $chatId = (int)$db->lastInsertId();

            $stmt = $db->prepare('INSERT INTO chat_participants (chat_id, user_id, is_deleted, last_read_message_id) VALUES (?, ?, 0, 0), (?, ?, 0, 0)');
            $stmt->execute([$chatId, $me['id'], $chatId, $userId]);
            $db->commit();
        }

        Response::json(['chatId' => $chatId]);
    }

    public function messages(array $params): void
    {
        $me = Auth::requireUser();
        $chatId = (int)$params['id'];

        if (!$this->inChat($me['id'], $chatId)) Response::error('Forbidden', 403);

        // Обновляем активность пользователя (онлайн)
        $stmtPing = Database::get()->prepare('UPDATE users SET updated_at = NOW() WHERE id = ?');
        $stmtPing->execute([$me['id']]);

        // Обновляем last_read_message_id текущего пользователя при открытии чата
        $stmtRead = Database::get()->prepare(
            'UPDATE chat_participants 
             SET last_read_message_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE chat_id = ? AND is_deleted = 0)
             WHERE chat_id = ? AND user_id = ?'
        );
        $stmtRead->execute([$chatId, $chatId, $me['id']]);

        // Получаем сообщения и информацию о том, какое последнее сообщение прочитал собеседник
        $stmtPeer = Database::get()->prepare(
            'SELECT last_read_message_id FROM chat_participants WHERE chat_id = ? AND user_id <> ?'
        );
        $stmtPeer->execute([$chatId, $me['id']]);
        $peerReadId = (int)$stmtPeer->fetchColumn();

        $stmt = Database::get()->prepare(
            'SELECT m.id, m.sender_id, u.name AS sender_name, m.text, m.created_at, m.deleted_for_all
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.chat_id = ? AND m.is_deleted = 0 ORDER BY m.id ASC'
        );
        $stmt->execute([$chatId]);
        
        $messages = [];
        foreach ($stmt->fetchAll() as $r) {
            $msgId = (int)$r['id'];
            $senderId = (int)$r['sender_id'];
            
            // Проверяем удаление сообщения для себя
            $stmtDelMe = Database::get()->prepare(
                'SELECT 1 FROM message_deletions WHERE message_id = ? AND user_id = ?'
            );
            $stmtDelMe->execute([$msgId, $me['id']]);
            if ($stmtDelMe->fetch()) {
                continue; // пропустить сообщение, если оно удалено у себя
            }

            $messages[] = [
                'id' => $msgId,
                'senderId' => $senderId,
                'senderName' => $r['sender_name'],
                'text' => $r['text'],
                'createdAt' => $r['created_at'],
                'isRead' => ($senderId === $me['id']) ? ($msgId <= $peerReadId) : true,
            ];
        }

        Response::json($messages);
    }

    public function send(array $params): void
    {
        $me = Auth::requireUser();
        $chatId = (int)$params['id'];
        if (!$this->inChat($me['id'], $chatId)) Response::error('Forbidden', 403);

        $data = $this->jsonBody();
        $text = trim($data['text'] ?? '');
        if (!$text) Response::error('Пустое сообщение');
        if (mb_strlen($text) > 4000) Response::error('Слишком длинное сообщение');

        $stmt = Database::get()->prepare('UPDATE chat_participants SET is_deleted = 0 WHERE chat_id = ?');
        $stmt->execute([$chatId]);

        $stmt = Database::get()->prepare('INSERT INTO messages (chat_id, sender_id, text) VALUES (?, ?, ?)');
        $stmt->execute([$chatId, $me['id'], $text]);
        $id = (int)Database::get()->lastInsertId();

        // Автоматически обновляем last_read_message_id для отправителя
        $stmtRead = Database::get()->prepare(
            'UPDATE chat_participants SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?'
        );
        $stmtRead->execute([$id, $chatId, $me['id']]);

        $stmt = Database::get()->prepare('SELECT * FROM messages WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        Response::json([
            'id' => (int)$row['id'],
            'senderId' => (int)$row['sender_id'],
            'senderName' => $me['name'],
            'text' => $row['text'],
            'createdAt' => $row['created_at'],
            'isRead' => false,
        ], 201);
    }

    /** Удаление сообщения (у себя / у всех) */
    public function deleteMessage(array $params): void
    {
        $me = Auth::requireUser();
        $messageId = (int)$params['id'];
        $scope = $_GET['scope'] ?? 'me';

        $stmt = Database::get()->prepare('SELECT m.*, cp.chat_id FROM messages m JOIN chat_participants cp ON cp.chat_id = m.chat_id WHERE m.id = ? AND cp.user_id = ?');
        $stmt->execute([$messageId, $me['id']]);
        $msg = $stmt->fetch();
        if (!$msg) Response::error('Сообщение не найдено', 404);

        if ($scope === 'all') {
            if ((int)$msg['sender_id'] !== $me['id']) {
                Response::error('Можно удалить чужое сообщение только у себя', 403);
            }
            $stmtDel = Database::get()->prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?');
            $stmtDel->execute([$messageId]);
        } else {
            $stmtIns = Database::get()->prepare('INSERT IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)');
            $stmtIns->execute([$messageId, $me['id']]);
        }

        Response::json(['ok' => true]);
    }

    /** Удаление чата (у себя / у всех) */
    public function destroyChat(array $params): void
    {
        $me = Auth::requireUser();
        $chatId = (int)$params['id'];
        $scope = $_GET['scope'] ?? 'me';

        $stmt = Database::get()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?');
        $stmt->execute([$chatId, $me['id']]);
        if (!$stmt->fetch()) Response::error('Forbidden', 403);

        if ($scope === 'all') {
            $db = Database::get();
            $stmt = $db->prepare('UPDATE messages SET is_deleted = 1 WHERE chat_id = ?');
            $stmt->execute([$chatId]);
            $stmt = $db->prepare('UPDATE chat_participants SET is_deleted = 1 WHERE chat_id = ?');
            $stmt->execute([$chatId]);
        } else {
            $stmt = Database::get()->prepare('UPDATE chat_participants SET is_deleted = 1 WHERE chat_id = ? AND user_id = ?');
            $stmt->execute([$chatId, $me['id']]);
        }

        Response::json(['ok' => true]);
    }

    private function inChat(int $userId, int $chatId): bool
    {
        $stmt = Database::get()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_deleted = 0');
        $stmt->execute([$chatId, $userId]);
        return (bool)$stmt->fetchColumn();
    }

    private function jsonBody(): array
    {
        return json_decode(file_get_contents('php://input'), true) ?: [];
    }
}