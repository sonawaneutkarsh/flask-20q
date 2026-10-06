"""Local development server for flask-20q.

Production deploys use the serverless functions in api/; this Flask app
exists so `python app.py` gives the same experience locally.
"""
import os

from flask import Flask, jsonify, render_template, request

import game

app = Flask(
    __name__,
    template_folder=os.path.join(game.BASE_DIR, "templates"),
    static_folder=os.path.join(game.BASE_DIR, "public", "static"),
)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/verify-host", methods=["POST"])
def verify_host():
    password = (request.get_json(silent=True) or {}).get("password", "")
    status, payload = game.check_host(password, ip=request.remote_addr)
    return jsonify(payload), status


@app.route("/init-room")
def init_room():
    room = request.args.get("room", "default-room")
    status, payload = game.init_room(room)
    return jsonify(payload), status


@app.route("/generate-questions", methods=["POST"])
def generate_questions():
    body = request.get_json(silent=True) or {}
    status, payload = game.generate_questions(
        body.get("room", "default-room"),
        body.get("password", ""),
        ip=request.remote_addr,
    )
    return jsonify(payload), status


if __name__ == "__main__":
    # Fail fast locally if Firebase isn't configured.
    game.ensure_firebase()
    # Safe defaults: localhost only, debugger off. Override with HOST=0.0.0.0
    # or FLASK_DEBUG=1 for local development on a trusted network.
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "3000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
    )
