"""Vercel serverless function: POST /verify-host."""
from http.server import BaseHTTPRequestHandler

import game


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = game.read_json_body(self)
        status, payload = game.check_host(body.get("password", ""), ip=game.client_ip(self))
        game.respond_json(self, status, payload)
