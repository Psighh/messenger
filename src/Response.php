<?php
// src/Response.php
class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(string $message, int $status = 400): void
    {
        self::json(['message' => $message], $status);
    }

    public static function noContent(): void
    {
        http_response_code(204);
        exit;
    }
}