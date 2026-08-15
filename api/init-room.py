"""Vercel serverless function: GET /init-room?room=<name>."""
from http.server import BaseHTTPRequestHandler

import game


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        room = game.get_query_param(self.path.split("?", 1)[1] if "?" in self.path else "", "room", "default-room")
        try:
            status, payload = game.init_room(room)
        except Exception as exc:  # noqa: BLE001 - report any backend failure as JSON
            status, payload = 500, {"status": "error", "message": str(exc)}
        game.respond_json(self, status, payload)
