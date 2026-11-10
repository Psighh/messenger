<?php


// src/Controllers/AuthController.php
class AuthController
{
    public function login(): void
    {
        $data = $this->jsonBody();
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if (!$email || !$password) Response::error('Введите почту и пароль');

        $stmt = Database::get()->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Неверная почта или пароль', 401);
        }

        $token = Auth::issueToken((int)$user['id']);
        Response::json([
            'token' => $token,
            'user'  => Auth::publicUser($user),
        ]);
    }

    public function register(): void
    {
        $data = $this->jsonBody();
        $name     = trim($data['name'] ?? '');
        $email    = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $role     = $data['role'] ?? 'student';

        if (mb_strlen($name) < 2)  Response::error('Введите ФИО');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) Response::error('Некорректная почта');
        if (strlen($password) < 8) Response::error('Пароль должен быть не короче 8 символов');
        if (!in_array($role, ['student', 'teacher'], true)) Response::error('Недопустимая роль');

        // уникальность email
        $stmt = Database::get()->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) Response::error('Пользователь с такой почтой уже существует');

        $groupId = null;
        $departmentId = null;
        if ($role === 'student') {
            $groupId = (int)($data['groupId'] ?? 0);
            if (!$groupId) Response::error('Выберите группу');
            $stmt = Database::get()->prepare('SELECT department_id FROM groups WHERE id = ?');
            $stmt->execute([$groupId]);
            $g = $stmt->fetch();
            if (!$g) Response::error('Группа не найдена');
            $departmentId = (int)$g['department_id'];
        } else {
            $departmentId = (int)($data['departmentId'] ?? 0);
            if (!$departmentId) Response::error('Выберите кафедру');
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = Database::get()->prepare(
            'INSERT INTO users (name, email, password_hash, role, group_id, department_id)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$name, $email, $hash, $role, $groupId, $departmentId]);

        $userId = (int)Database::get()->lastInsertId();
        $stmt = Database::get()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        $token = Auth::issueToken($userId);
        Response::json([
            'token' => $token,
            'user'  => Auth::publicUser($user),
        ], 201);
    }

    private function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}