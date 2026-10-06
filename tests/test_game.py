"""Offline tests for game.py and the HTTP entry points. No Firebase access."""
import importlib.util
import io
import json
import os

import pytest

import game

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class FakeRef:
    def __init__(self, store, path):
        self.store, self.path = store, path

    def get(self):
        return self.store.get(self.path)

    def set(self, value):
        self.store[self.path] = value

    def update(self, value):
        self.store.setdefault(("update", self.path), []).append(value)
        if self.path.endswith("/questions"):
            self.store[self.path] = value


class FakeDb:
    def __init__(self):
        self.store = {}

    def reference(self, path):
        return FakeRef(self.store, path)


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(game, "get_db", lambda: db)
    game._rate_attempts.clear()
    yield db
    game._rate_attempts.clear()


@pytest.fixture
def host_pw(monkeypatch):
    monkeypatch.setenv("HOST_PASSWORD", "s3cret")
    return "s3cret"


def test_question_bank_has_104_unique_questions():
    assert len(game.ALL_QUESTIONS) == 104
    assert len(set(game.ALL_QUESTIONS)) == 104


def test_pick_questions_returns_unique_subset():
    picked = game.pick_questions()
    assert len(picked) == 20 and len(set(picked)) == 20
    assert set(picked) <= set(game.ALL_QUESTIONS)
    assert len(game.pick_questions(500)) == len(game.ALL_QUESTIONS)


def test_verify_host_fails_closed_without_env(monkeypatch):
    monkeypatch.delenv("HOST_PASSWORD", raising=False)
    assert game.verify_host("") is False
    assert game.verify_host("host123") is False


def test_verify_host_checks_password(host_pw):
    assert game.verify_host(host_pw) is True
    assert game.verify_host("wrong") is False
    assert game.verify_host(None) is False
    assert game.verify_host("pässwörd") is False  # non-ASCII must not raise


@pytest.mark.parametrize("room", ["party1", "default-room", "a_b-C9"])
def test_normalize_room_accepts_safe_names(room):
    assert game.normalize_room(room) == room


@pytest.mark.parametrize("room", ["a.b", "a#b", "a/b", "a$b", "x" * 41, "a b"])
def test_normalize_room_rejects_unsafe_names(room):
    assert game.normalize_room(room) is None


def test_normalize_room_defaults_blank():
    assert game.normalize_room("") == "default-room"
    assert game.normalize_room(None) == "default-room"


def test_init_room_writes_questions_once(fake_db):
    status, payload = game.init_room("party1")
    assert status == 200 and payload["room"] == "party1"
    questions = fake_db.store["/party1/questions"]
    assert len(questions) == 20 and set(questions) == {f"q{i}" for i in range(1, 21)}
    assert fake_db.store["/party1/current"] == 1
    game.init_room("party1")
    assert len(fake_db.store[("update", "/party1/questions")]) == 1


def test_init_room_rejects_bad_room(fake_db):
    assert game.init_room("a.b")[0] == 400
    assert fake_db.store == {}


def test_generate_questions_rejects_wrong_password(fake_db, host_pw):
    status, _ = game.generate_questions("party1", "nope", ip="1.2.3.4")
    assert status == 403
    assert fake_db.store == {}


def test_generate_questions_resets_room_atomically(fake_db, host_pw):
    status, payload = game.generate_questions("party1", host_pw, ip="1.2.3.4")
    assert status == 200 and len(payload["questions"]) == 20
    (update,) = fake_db.store[("update", "/party1")]
    assert update["current"] == 1
    for key in ("answers", "history", "chat", "reactions"):
        assert key in update and update[key] is None
    assert len(update["questions"]) == 20


def test_generate_questions_throttles_failed_guesses(fake_db, host_pw):
    statuses = [game.generate_questions("r", "bad", ip="9.9.9.9")[0] for _ in range(12)]
    assert statuses[:10] == [403] * 10
    assert statuses[10:] == [429, 429]
    # Another client is not affected.
    assert game.generate_questions("r", host_pw, ip="8.8.8.8")[0] == 200


def test_check_host_only_counts_password_attempts(fake_db, host_pw):
    for _ in range(30):
        assert game.check_host("", ip="5.5.5.5") == (200, {"isHost": False})
    statuses = [game.check_host("bad", ip="5.5.5.5")[0] for _ in range(11)]
    assert statuses[:10] == [200] * 10 and statuses[10] == 429


def test_database_rules_are_valid_json():
    with open(os.path.join(ROOT, "database.rules.json"), encoding="utf-8") as f:
        rules = json.load(f)
    assert "$room" in rules["rules"]


def test_no_audio_files_in_tree():
    for dirpath, _, files in os.walk(ROOT):
        if ".git" in dirpath.split(os.sep):
            continue
        assert not [f for f in files if f.lower().endswith((".mp3", ".wav", ".ogg", ".m4a"))]


# --- Flask app ------------------------------------------------------------


@pytest.fixture
def client(fake_db):
    import app as app_module

    app_module.app.testing = True
    return app_module.app.test_client()


def test_flask_index_and_static(client):
    assert client.get("/").status_code == 200
    assert client.get("/static/script.js").status_code == 200


def test_flask_verify_host(client, host_pw):
    assert client.post("/verify-host", json={"password": host_pw}).get_json() == {"isHost": True}
    assert client.post("/verify-host", json={"password": "x"}).get_json() == {"isHost": False}


def test_flask_init_room_bad_name_is_400_not_traceback(client):
    res = client.get("/init-room?room=a.b%23c")
    assert res.status_code == 400
    assert res.get_json()["message"] == "Invalid room name."


# --- Vercel handlers ------------------------------------------------------


def _load_handler(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "api", f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.handler


def _call(handler_cls, method, path, body=None, headers=None):
    raw = json.dumps(body).encode() if body is not None else b""
    hdrs = {"Content-Length": str(len(raw)), **(headers or {})}
    h = handler_cls.__new__(handler_cls)
    h.path, h.headers, h.client_address = path, hdrs, ("10.0.0.1", 0)
    h.rfile, h.wfile = io.BytesIO(raw), io.BytesIO()
    h.request_version, h.command, h.requestline = "HTTP/1.1", method, f"{method} {path} HTTP/1.1"
    h.log_message = lambda *a, **k: None
    getattr(h, f"do_{method}")()
    head, _, payload = h.wfile.getvalue().partition(b"\r\n\r\n")
    status = int(head.split(b" ", 2)[1])
    return status, payload


def test_vercel_verify_host(fake_db, host_pw):
    status, payload = _call(_load_handler("verify-host"), "POST", "/verify-host", {"password": host_pw})
    assert status == 200 and json.loads(payload) == {"isHost": True}


def test_vercel_init_room_hides_exception_text(fake_db, monkeypatch):
    def boom():
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(game, "get_db", boom)
    status, payload = _call(_load_handler("init-room"), "GET", "/init-room?room=party1")
    assert status == 500
    assert b"secret internal detail" not in payload


def test_vercel_rate_limit_uses_forwarded_ip(fake_db, host_pw):
    handler = _load_handler("generate-questions")
    for _ in range(10):
        _call(handler, "POST", "/generate-questions", {"password": "bad"}, {"X-Forwarded-For": "7.7.7.7, 10.0.0.1"})
    assert ("7.7.7.7") in game._rate_attempts
    status, _ = _call(handler, "POST", "/generate-questions", {"password": host_pw}, {"X-Forwarded-For": "6.6.6.6"})
    assert status == 200


def test_vercel_index_serves_page():
    status, payload = _call(_load_handler("index"), "GET", "/")
    assert status == 200 and b"<html" in payload.lower()
