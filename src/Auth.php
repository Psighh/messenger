<?php
// src/Auth.php
class Auth
{
    public static function issueToken(int $userId): string
    {
        $payload = json_encode(['uid' => $userId, 'time' => time()]);
        return base64_encode($payload);
    }

    public static function requireUser(): array
    {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        
        if (!preg_match('/Bearer\s+(\S+)/', $authHeader, $matches)) {
            Response::error('Unauthorized', 401);
        }

        $token = $matches[1];
        $decoded = json_decode(base64_decode($token), true);

        if (!$decoded || !isset($decoded['uid'])) {
            Response::error('Invalid token', 401);
        }

        $userId = (int)$decoded['uid'];
        $stmt = Database::get()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('User not found', 401);
        }

        return $user;
    }

    public static function requireAdmin(): array
    {
        $user = self::requireUser();
        if ($user['role'] !== 'admin') {
            Response::error('Forbidden: Admin only', 403);
        }
        return $user;
    }

    public static function publicUser(array $user): array
    {
        return [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'status' => $user['status'] ?? '',
            'groupId' => isset($user['group_id']) && $user['group_id'] !== null ? (int)$user['group_id'] : null,
            'departmentId' => isset($user['department_id']) && $user['department_id'] !== null ? (int)$user['department_id'] : null,
        ];
    }
}