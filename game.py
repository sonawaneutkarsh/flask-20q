"""Shared backend logic for flask-20q.

Used by both the local Flask preview server (app.py) and the serverless
Vercel functions under api/ so the behavior is identical everywhere.
"""
import hmac
import json
import os
import random
import time

import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Firebase (lazy so functions that don't need it, like the page, can boot
# without credentials)
# ---------------------------------------------------------------------------
_firebase_app = None


def _load_questions():
    with open(os.path.join(BASE_DIR, "questions.json"), "r", encoding="utf-8") as f:
        return json.load(f)


ALL_QUESTIONS = _load_questions()


def pick_questions(count=20):
    """Pick a random set of questions, tolerating fewer than `count` in the bank."""
    return random.sample(ALL_QUESTIONS, min(count, len(ALL_QUESTIONS)))


def ensure_firebase():
    """Initialize the Firebase Admin SDK (idempotent). Raises on missing config."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    cred_path = os.getenv("FIREBASE_CRED_PATH")
    cred_json = os.getenv("FIREBASE_CRED_JSON")
    db_url = os.getenv("FIREBASE_DB_URL")

    if db_url and cred_json:
        cred = credentials.Certificate(json.loads(cred_json))
    elif db_url and cred_path:
        cred = credentials.Certificate(cred_path)
    else:
        raise RuntimeError(
            "Firebase not configured. Set FIREBASE_DB_URL and either "
            "FIREBASE_CRED_PATH (path to a service-account JSON) or "
            "FIREBASE_CRED_JSON (the service-account JSON content)."
        )

    _firebase_app = firebase_admin.initialize_app(cred, {"databaseURL": db_url})
    return _firebase_app


def get_db():
    """Return the Firebase Realtime Database reference root, initializing first."""
    ensure_firebase()
    return db


# ---------------------------------------------------------------------------
# Host password
# ---------------------------------------------------------------------------
def host_password():
    """Host password from env, defaulting to the legacy value."""
    return os.getenv("HOST_PASSWORD", "host123")


def verify_host(password):
    """Constant-time check of the host password."""
    return hmac.compare_digest(str(password or ""), host_password())


# ---------------------------------------------------------------------------
# Room operations
# ---------------------------------------------------------------------------
def init_room(room):
    """Ensure a room has questions and a current question pointer."""
    database = get_db()
    room = (room or "default-room").strip() or "default-room"

    questions_ref = database.reference(f"/{room}/questions")
    if questions_ref.get() is None:
        questions_ref.update({f"q{i+1}": q for i, q in enumerate(pick_questions())})

    if database.reference(f"/{room}/current").get() is None:
        database.reference(f"/{room}/current").set(1)

    return 200, {"status": "initialized", "room": room}


# Best-effort in-memory rate limit (per function instance; adequate for a
# party game, not a hard security boundary).
_RATE_WINDOW = 600  # seconds
_RATE_LIMIT = 10  # requests per window
_rate_attempts = {}


def _rate_limited(key):
    now = time.monotonic()
    stamps = [t for t in _rate_attempts.get(key, []) if now - t < _RATE_WINDOW]
    if len(stamps) >= _RATE_LIMIT:
        _rate_attempts[key] = stamps
        return True
    stamps.append(now)
    _rate_attempts[key] = stamps
    return False


def generate_questions(room, password, ip=None):
    """Host-only: deal a fresh set of questions and reset the room."""
    if not verify_host(password):
        return 403, {"status": "error", "message": "Invalid host password."}

    if _rate_limited(ip or "unknown"):
        return 429, {"status": "error", "message": "Too many requests. Try again later."}

    database = get_db()
    room = (room or "default-room").strip() or "default-room"
    questions = pick_questions()

    # One request per update: new questions, reset pointer, clear game state.
    database.reference(f"/{room}").update(
        {
            "questions": {f"q{i+1}": q for i, q in enumerate(questions)},
            "current": 1,
            "answers": None,
            "history": None,
            "chat": None,
            "reactions": None,
        }
    )

    return 200, {"status": "success", "questions": questions, "room": room}


# ---------------------------------------------------------------------------
# Page + HTTP helpers (shared by Flask and the api/ handlers)
# ---------------------------------------------------------------------------
def index_html():
    with open(os.path.join(BASE_DIR, "templates", "index.html"), "r", encoding="utf-8") as f:
        return f.read()


def get_query_param(query_string, name, default=None):
    """Parse a single query-string parameter (handles urlencoded values)."""
    from urllib.parse import parse_qs

    values = parse_qs(query_string)
    return values.get(name, [default])[0]


def respond_json(handler, status, payload):
    """Write a JSON response to a BaseHTTPRequestHandler."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler):
    """Read and parse a JSON request body from a BaseHTTPRequestHandler."""
    try:
        length = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        length = 0
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}
