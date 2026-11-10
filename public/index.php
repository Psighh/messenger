<?php
// public/index.php

// ===== CORS =====
$cfg = require __DIR__ . '/../config.php';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === $cfg['cors']['allowed_origin']) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ===== Автозагрузка =====
spl_autoload_register(function ($class) {
    // Контроллеры лежат в src/Controllers/
    $file = __DIR__ . '/../src/Controllers/' . $class . '.php';
    if (file_exists($file)) { require $file; return; }
    // Остальные — в src/
    $file = __DIR__ . '/../src/' . $class . '.php';
    if (file_exists($file)) require $file;
});

require __DIR__ . '/../src/Router.php';

$router = new Router();

// --- Auth ---
$router->post('/api/auth/login',    [AuthController::class, 'login']);
$router->post('/api/auth/register', [AuthController::class, 'register']);

// --- Public dictionaries ---
$router->get('/api/public/departments', [DepartmentController::class, 'publicList']);
$router->get('/api/public/groups',      [GroupController::class, 'publicList']);

// --- Admin CRUD ---
$router->get('/api/departments',    [DepartmentController::class, 'index']);
$router->post('/api/departments',   [DepartmentController::class, 'store']);
$router->put('/api/departments/{id}',    [DepartmentController::class, 'update']);
$router->delete('/api/departments/{id}', [DepartmentController::class, 'destroy']);

$router->get('/api/groups',    [GroupController::class, 'index']);
$router->post('/api/groups',   [GroupController::class, 'store']);
$router->put('/api/groups/{id}',    [GroupController::class, 'update']);
$router->delete('/api/groups/{id}', [GroupController::class, 'destroy']);

$router->get('/api/students',    [UserController::class, 'students']);
$router->post('/api/students',   [UserController::class, 'storeStudent']);
$router->put('/api/students/{id}',    [UserController::class, 'updateStudent']);
$router->delete('/api/students/{id}', [UserController::class, 'destroyStudent']);

$router->get('/api/teachers',    [UserController::class, 'teachers']);
$router->post('/api/teachers',   [UserController::class, 'storeTeacher']);
$router->put('/api/teachers/{id}',    [UserController::class, 'updateTeacher']);
$router->delete('/api/teachers/{id}', [UserController::class, 'destroyTeacher']);

// --- Broadcasts ---
$router->get('/api/broadcasts',         [BroadcastController::class, 'index']);
$router->post('/api/broadcasts',        [BroadcastController::class, 'store']);
$router->delete('/api/broadcasts/{id}', [BroadcastController::class, 'destroy']);
$router->get('/api/broadcasts/inbox',   [BroadcastController::class, 'inbox']);
$router->post('/api/broadcasts/{id}/read', [BroadcastController::class, 'markRead']);

// --- Messenger ---
$router->get('/api/chats',                  [ChatController::class, 'index']);
$router->get('/api/chats/{id}/messages',    [ChatController::class, 'messages']);
$router->post('/api/chats/{id}/messages',   [ChatController::class, 'send']);

// --- Profile ---
$router->put('/api/me/profile',        [UserController::class, 'updateProfile']);
$router->put('/api/me/notifications',  [UserController::class, 'updateNotifications']);

// ===== Нормализация URI =====
// Приходят разные варианты:
//   /App/public/index.php/api/public/groups  → /api/public/groups
//   /App/public/api/public/groups            → /api/public/groups
//   /api/public/groups                       → /api/public/groups
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

$prefixes = [
    '/App/public/index.php',
    '/App/public',
    '/public/index.php',
    '/public',
    '/App',
    '/index.php',
];
foreach ($prefixes as $prefix) {
    if ($uri === $prefix) { $uri = '/'; break; }
    if (str_starts_with($uri, $prefix . '/')) {
        $uri = substr($uri, strlen($prefix));
        break;
    }
}
if ($uri === '') $uri = '/';

// ===== Редирект корня на страницу входа =====
if ($uri === '/') {
    header('Location: /auth.html');
    exit;
}

// ===== Отдаём роутеру =====
$router->dispatch($_SERVER['REQUEST_METHOD'], $uri);