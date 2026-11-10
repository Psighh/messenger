<?php
// src/Controllers/DepartmentController.php
class DepartmentController
{
    /** Публичный список (для формы регистрации) */
    public function publicList(): void
    {
        $rows = Database::get()->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
        Response::json(array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], $rows));
    }

    /** Админский список */
    public function index(): void
    {
        Auth::requireAdmin();
        $rows = Database::get()->query(
            'SELECT id, name, description FROM departments ORDER BY name'
        )->fetchAll();
        Response::json(array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'description' => $r['description'] ?? '',
        ], $rows));
    }

    public function store(): void
    {
        Auth::requireAdmin();
        $data = $this->jsonBody();
        $name = trim($data['name'] ?? '');
        if (!$name) Response::error('Введите название');

        $stmt = Database::get()->prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
        $stmt->execute([$name, $data['description'] ?? null]);
        $id = (int)Database::get()->lastInsertId();
        Response::json(['id' => $id, 'name' => $name, 'description' => $data['description'] ?? ''], 201);
    }

    public function update(array $params): void
    {
        Auth::requireAdmin();
        $id = (int)$params['id'];
        $data = $this->jsonBody();
        $name = trim($data['name'] ?? '');
        if (!$name) Response::error('Введите название');

        $stmt = Database::get()->prepare('UPDATE departments SET name = ?, description = ? WHERE id = ?');
        $stmt->execute([$name, $data['description'] ?? null, $id]);
        Response::json(['id' => $id, 'name' => $name, 'description' => $data['description'] ?? '']);
    }

    public function destroy(array $params): void
    {
        Auth::requireAdmin();
        $stmt = Database::get()->prepare('DELETE FROM departments WHERE id = ?');
        $stmt->execute([(int)$params['id']]);
        Response::noContent();
    }

    private function jsonBody(): array
    {
        return json_decode(file_get_contents('php://input'), true) ?: [];
    }
}