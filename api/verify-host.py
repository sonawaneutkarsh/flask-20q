"""Vercel serverless function: POST /verify-host."""
from http.server import BaseHTTPRequestHandler

import game


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = game.read_json_body(self)
        game.respond_json(
            self,
            200,
            {"isHost": game.verify_host(body.get("password", ""))},
        )
