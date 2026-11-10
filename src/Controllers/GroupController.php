<?php
// src/Controllers/GroupController.php
class GroupController
{
    public function publicList(): void
    {
        $rows = Database::get()->query(
            'SELECT id, name, department_id FROM `groups` ORDER BY name'
        )->fetchAll();
        Response::json(array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'departmentId' => (int)$r['department_id'],
        ], $rows));
    }

    public function index(): void
    {
        Auth::requireAdmin();
        $rows = Database::get()->query(
            'SELECT id, name, department_id FROM `groups` ORDER BY name'
        )->fetchAll();
        Response::json(array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'departmentId' => (int)$r['department_id'],
        ], $rows));
    }

    public function store(): void
    {
        Auth::requireAdmin();
        $data = $this->jsonBody();
        $name = trim($data['name'] ?? '');
        $deptId = (int)($data['departmentId'] ?? 0);
        if (!$name) Response::error('Введите название');
        if (!$deptId) Response::error('Выберите кафедру');

        $stmt = Database::get()->prepare('INSERT INTO `groups` (name, department_id) VALUES (?, ?)');
        $stmt->execute([$name, $deptId]);
        $id = (int)Database::get()->lastInsertId();
        Response::json(['id' => $id, 'name' => $name, 'departmentId' => $deptId], 201);
    }

    public function update(array $params): void
    {
        Auth::requireAdmin();
        $id = (int)$params['id'];
        $data = $this->jsonBody();
        $name = trim($data['name'] ?? '');
        $deptId = (int)($data['departmentId'] ?? 0);
        if (!$name) Response::error('Введите название');
        if (!$deptId) Response::error('Выберите кафедру');

        $stmt = Database::get()->prepare('UPDATE `groups` SET name = ?, department_id = ? WHERE id = ?');
        $stmt->execute([$name, $deptId, $id]);
        Response::json(['id' => $id, 'name' => $name, 'departmentId' => $deptId]);
    }

    public function destroy(array $params): void
    {
        Auth::requireAdmin();
        $stmt = Database::get()->prepare('DELETE FROM `groups` WHERE id = ?');
        $stmt->execute([(int)$params['id']]);
        Response::noContent();
    }

    private function jsonBody(): array
    {
        return json_decode(file_get_contents('php://input'), true) ?: [];
    }
}