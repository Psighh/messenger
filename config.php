<?php
// config.php
return [
    'db' => [
        'host' => '127.0.0.1',
        'name' => 'edumessenger',
        'user' => 'root',
        'pass' => 'root',
        'charset' => 'utf8mb4',
    ],
    'cors' => [
        // Для разработки. В проде — конкретный домен.
        'allowed_origin' => 'http://localhost:8000',
    ],
];