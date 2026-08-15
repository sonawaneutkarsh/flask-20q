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
                ip=self.client_address[0],
            )
        except Exception as exc:  # noqa: BLE001 - report any backend failure as JSON
            status, payload = 500, {"status": "error", "message": str(exc)}
        game.respond_json(self, status, payload)
