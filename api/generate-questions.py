"""Vercel serverless function: POST /generate-questions."""
from http.server import BaseHTTPRequestHandler

import game


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = game.read_json_body(self)
        try:
            status, payload = game.generate_questions(
                body.get("room", "default-room"),
                body.get("password", ""),
                ip=game.client_ip(self),
            )
        except Exception:  # noqa: BLE001 - never leak exception text to the client
            status, payload = 500, {"status": "error", "message": "Server error."}
        game.respond_json(self, status, payload)
