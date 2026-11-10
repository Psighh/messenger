<?php
// src/Controllers/BroadcastController.php
class BroadcastController
{
    /** История для админки */
    public function index(): void
    {
        Auth::requireAdmin();
        $rows = Database::get()->query(
            'SELECT b.*, 
                    (SELECT COUNT(*) FROM broadcast_reads r WHERE r.broadcast_id = b.id) AS reads_count
             FROM broadcasts b ORDER BY b.created_at DESC'
        )->fetchAll();
        Response::json(array_map([$this, 'format'], $rows));
    }

    /** Отправка из админки */
    public function store(): void
    {
        $admin = Auth::requireAdmin();
        $data = $this->jsonBody();
        $title = trim($data['title'] ?? '');
        $text  = trim($data['text'] ?? '');
        $scope = $data['scope'] ?? 'university';

        if (!$title) Response::error('Введите заголовок');
        if (!$text)  Response::error('Введите текст');
        if (!in_array($scope, ['university', 'department', 'group'], true)) {
            Response::error('Недопустимый уровень');
        }
        $departmentId = $scope === 'university' ? null : (int)($data['departmentId'] ?? 0) ?: null;
        $groupId      = $scope === 'group' ? (int)($data['groupId'] ?? 0) ?: null : null;

        if ($scope === 'department' && !$departmentId) Response::error('Выберите кафедру');
        if ($scope === 'group' && !$groupId)           Response::error('Выберите группу');

        $stmt = Database::get()->prepare(
            'INSERT INTO broadcasts (admin_id, title, text, scope, department_id, group_id)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$admin['id'], $title, $text, $scope, $departmentId, $groupId]);
        $id = (int)Database::get()->lastInsertId();

        $stmt = Database::get()->prepare('SELECT * FROM broadcasts WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        $formatted = $this->format($row);
        $formatted['recipients'] = $this->countRecipients($scope, $departmentId, $groupId);
        Response::json($formatted, 201);
    }

    public function destroy(array $params): void
    {
        Auth::requireAdmin();
        $stmt = Database::get()->prepare('DELETE FROM broadcasts WHERE id = ?');
        $stmt->execute([(int)$params['id']]);
        Response::noContent();
    }

    /** Лента для мессенджера — только релевантные пользователю */
    public function inbox(): void
    {
        $user = Auth::requireUser();
        $role = $user['role'];

        if ($role === 'admin') {
            $sql = 'SELECT b.*, 
                    (SELECT COUNT(*) FROM broadcast_reads r WHERE r.broadcast_id = b.id AND r.user_id = ?) AS is_read
                    FROM broadcasts b ORDER BY b.created_at DESC';
            $stmt = Database::get()->prepare($sql);
            $stmt->execute([$user['id']]);
        } else {
            $sql = 'SELECT b.*, 
                    (SELECT COUNT(*) FROM broadcast_reads r WHERE r.broadcast_id = b.id AND r.user_id = ?) AS is_read
                    FROM broadcasts b
                    WHERE b.scope = "university"
                       OR (b.scope = "department" AND b.department_id = ?)
                       OR (b.scope = "group" AND b.group_id = ?)
                    ORDER BY b.created_at DESC';
            $stmt = Database::get()->prepare($sql);
            $stmt->execute([
                $user['id'],
                $user['department_id'] ?? 0,
                $user['group_id'] ?? 0,
            ]);
        }

        $rows = $stmt->fetchAll();
        $out = array_map(function ($r) {
            $f = $this->format($r);
            $f['read'] = (bool)$r['is_read'];
            return $f;
        }, $rows);
        Response::json($out);
    }

    public function markRead(array $params): void
    {
        $user = Auth::requireUser();
        $stmt = Database::get()->prepare(
            'INSERT IGNORE INTO broadcast_reads (broadcast_id, user_id) VALUES (?, ?)'
        );
        $stmt->execute([(int)$params['id'], $user['id']]);
        Response::json(['ok' => true]);
    }

    private function format(array $r): array
    {
        return [
            'id' => (int)$r['id'],
            'title' => $r['title'],
            'text' => $r['text'],
            'scope' => $r['scope'],
            'departmentId' => $r['department_id'] !== null ? (int)$r['department_id'] : null,
            'groupId' => $r['group_id'] !== null ? (int)$r['group_id'] : null,
            'recipients' => isset($r['reads_count']) ? (int)$r['reads_count'] : null,
            'createdAt' => $r['created_at'],
        ];
    }

    private function countRecipients(string $scope, ?int $departmentId, ?int $groupId): int
    {
        if ($scope === 'university') {
            $stmt = Database::get()->query("SELECT COUNT(*) FROM users WHERE role IN ('student','teacher')");
        } elseif ($scope === 'department') {
            $stmt = Database::get()->prepare(
                "SELECT COUNT(*) FROM users WHERE role IN ('student','teacher') AND department_id = ?"
            );
            $stmt->execute([$departmentId]);
        } else {
            $stmt = Database::get()->prepare("SELECT COUNT(*) FROM users WHERE group_id = ?");
            $stmt->execute([$groupId]);
        }
        return (int)$stmt->fetchColumn();
    }

    private function jsonBody(): array
    {
        return json_decode(file_get_contents('php://input'), true) ?: [];
    }
}