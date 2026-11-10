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
                       u.name AS peer_name, u.role AS peer_role, u.status AS peer_status
                FROM chat_participants cp
                JOIN chats c ON c.id = cp.chat_id
                JOIN chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id <> cp.user_id
                JOIN users u ON u.id = cp2.user_id
                WHERE cp.user_id = ?';
        $stmt = Database::get()->prepare($sql);
        $stmt->execute([$me['id']]);
        $rows = $stmt->fetchAll();

        // Последнее сообщение + непрочитанные
        $out = [];
        foreach ($rows as $r) {
            $chatId = (int)$r['chat_id'];
            $stmt = Database::get()->prepare(
                'SELECT text, created_at FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1'
            );
            $stmt->execute([$chatId]);
            $last = $stmt->fetch() ?: null;

            $out[] = [
                'id' => $chatId,
                'type' => $r['type'] === 'group' ? 'group' : 'user',
                'name' => $r['peer_name'],
                'role' => $r['peer_role'],
                'status' => $r['peer_status'] ?? '',
                'lastMessage' => $last['text'] ?? '',
                'lastTime' => $last['created_at'] ?? null,
                'unread' => 0, // пока считаем 0; при желании можно вести table chat_reads
            ];
        }
        Response::json($out);
    }

    public function messages(array $params): void
    {
        $me = Auth::requireUser();
        $chatId = (int)$params['id'];

        if (!$this->inChat($me['id'], $chatId)) Response::error('Forbidden', 403);

        $stmt = Database::get()->prepare(
            'SELECT m.id, m.sender_id, u.name AS sender_name, m.text, m.created_at
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.chat_id = ? ORDER BY m.id ASC'
        );
        $stmt->execute([$chatId]);
        Response::json(array_map(fn($r) => [
            'id' => (int)$r['id'],
            'senderId' => (int)$r['sender_id'],
            'senderName' => $r['sender_name'],
            'text' => $r['text'],
            'createdAt' => $r['created_at'],
        ], $stmt->fetchAll()));
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

        $stmt = Database::get()->prepare(
            'INSERT INTO messages (chat_id, sender_id, text) VALUES (?, ?, ?)'
        );
        $stmt->execute([$chatId, $me['id'], $text]);
        $id = (int)Database::get()->lastInsertId();

        $stmt = Database::get()->prepare('SELECT * FROM messages WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        Response::json([
            'id' => (int)$row['id'],
            'senderId' => (int)$row['sender_id'],
            'senderName' => $me['name'],
            'text' => $row['text'],
            'createdAt' => $row['created_at'],
        ], 201);
    }

    private function inChat(int $userId, int $chatId): bool
    {
        $stmt = Database::get()->prepare('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?');
        $stmt->execute([$chatId, $userId]);
        return (bool)$stmt->fetchColumn();
    }

    private function jsonBody(): array
    {
        return json_decode(file_get_contents('php://input'), true) ?: [];
    }
}