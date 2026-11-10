<?php
// src/Controllers/UserController.php
class UserController
{
    /* ===== Студенты ===== */
    public function students(): void
    {
        Auth::requireAdmin();
        Response::json($this->listByRole('student'));
    }
    public function storeStudent(): void    { $this->storeUser('student'); }
    public function updateStudent(array $p): void { $this->updateUser((int)$p['id'], 'student'); }
    public function destroyStudent(array $p): void { $this->deleteUser((int)$p['id'], 'student'); }

    /* ===== Преподаватели ===== */
    public function teachers(): void
    {
        Auth::requireAdmin();
        Response::json($this->listByRole('teacher'));
    }
    public function storeTeacher(): void    { $this->storeUser('teacher'); }
    public function updateTeacher(array $p): void { $this->updateUser((int)$p['id'], 'teacher'); }
    public function destroyTeacher(array $p): void { $this->deleteUser((int)$p['id'], 'teacher'); }

    /* ===== Профиль ===== */
    public function updateProfile(): void
    {
        $user = Auth::requireUser();
        $data = $this->jsonBody();
        $status = trim($data['status'] ?? '');
        $stmt = Database::get()->prepare('UPDATE users SET status = ? WHERE id = ?');
        $stmt->execute([$status, $user['id']]);
        Response::json(['ok' => true]);
    }

    public function updateNotifications(): void
    {
        // Пока храним настройки в localStorage на фронте.
        // Здесь можно добавить таблицу user_settings, когда понадобится.
        Auth::requireUser();
        Response::json(['ok' => true]);
    }

    /* ===== Общие методы ===== */
    private function listByRole(string $role): array
    {
        $stmt = Database::get()->prepare(
            'SELECT id, name, email, group_id, department_id FROM users WHERE role = ? ORDER BY name'
        );
        $stmt->execute([$role]);
        return array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'email' => $r['email'],
            'groupId' => $r['group_id'] !== null ? (int)$r['group_id'] : null,
            'departmentId' => $r['department_id'] !== null ? (int)$r['department_id'] : null,
        ], $stmt->fetchAll());
    }

    private function storeUser(string $role): void
    {
        Auth::requireAdmin();
        $data = $this->jsonBody();
        $name  = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Проверьте имя и почту');
        }
        $stmt = Database::get()->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) Response::error('Почта уже используется');

        $groupId = null;
        $departmentId = null;
        if ($role === 'student') {
            $groupId = (int)($data['groupId'] ?? 0) ?: null;
            $departmentId = (int)($data['departmentId'] ?? 0) ?: null;
            if (!$groupId || !$departmentId) Response::error('Укажите кафедру и группу');
        } else {
            $departmentId = (int)($data['departmentId'] ?? 0) ?: null;
            if (!$departmentId) Response::error('Укажите кафедру');
        }

        // временный пароль; пользователь не входит до сброса (можно добавить reset)
        $hash = password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT);

        $stmt = Database::get()->prepare(
            'INSERT INTO users (name, email, password_hash, role, group_id, department_id)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$name, $email, $hash, $role, $groupId, $departmentId]);
        $id = (int)Database::get()->lastInsertId();
        Response::json([
            'id' => $id, 'name' => $name, 'email' => $email,
            'groupId' => $groupId, 'departmentId' => $departmentId,
        ], 201);
    }

    private function updateUser(int $id, string $role): void
    {
        Auth::requireAdmin();
        $data = $this->jsonBody();
        $name  = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Проверьте имя и почту');
        }
        $groupId = null;
        $departmentId = null;
        if ($role === 'student') {
            $groupId = (int)($data['groupId'] ?? 0) ?: null;
            $departmentId = (int)($data['departmentId'] ?? 0) ?: null;
        } else {
            $departmentId = (int)($data['departmentId'] ?? 0) ?: null;
        }

        $stmt = Database::get()->prepare(
            'UPDATE users SET name = ?, email = ?, group_id = ?, department_id = ?
             WHERE id = ? AND role = ?'
        );
        $stmt->execute([$name, $email, $groupId, $departmentId, $id, $role]);
        Response::json([
            'id' => $id, 'name' => $name, 'email' => $email,
            'groupId' => $groupId, 'departmentId' => $departmentId,
        ]);
    }

    private function deleteUser(int $id, string $role): void
    {
        Auth::requireAdmin();
        $stmt = Database::get()->prepare('DELETE FROM users WHERE id = ? AND role = ?');
        $stmt->execute([$id, $role]);
        Response::noContent();
    }

    private function jsonBody(): array
    {
        return json_decode(file_get_contents('php://input'), true) ?: [];
    }
}