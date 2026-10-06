# flask-20q

[![ci](https://github.com/sonawaneutkarsh/flask-20q/actions/workflows/ci.yml/badge.svg)](https://github.com/sonawaneutkarsh/flask-20q/actions/workflows/ci.yml)

A live multiplayer **20 Questions** party game. A Python backend picks 20 random
questions and syncs them to a Firebase Realtime Database; players join a room
in the browser and answer together — with live chat, emoji reactions, a word
cloud, player profiles, and host-controlled pacing.

> **Status: no live demo.** There is no public deployment, and the Firebase
> database that the shipped web config in `public/static/script.js` points to
> has been deactivated. To play, run it locally against your own Firebase
> project (see [Getting started](#getting-started)).

## Features

- **20 questions per round**, drawn randomly from a 104-question bank (`questions.json`)
- **Join screen** instead of browser prompts — pick a name, optionally enter the host password
- **Live chat** with avatars and player colors
- **Live player list** with online presence (auto-removed on disconnect)
- **Player profiles**: avatar, color, games played, questions answered (saved to `localStorage`)
- **Host controls**: start a new game (password-verified on the server), advance questions, clear chat and history (hidden from non-hosts in the UI only; see [Limitations](#limitations))
- **Emoji reactions** with flying-emoji animations
- **Word cloud** of the most common words in answers
- **Answer history** per question, persisted in Firebase, exportable as a text file
- **5 color themes**: Pav, Kari, Oman, Raj, Biswa
- **Rooms** via `?room=<name>` URL parameter — questions are room-scoped, so rooms don't overwrite each other

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | Python: shared logic in `game.py`, a Flask dev server (`app.py`), and serverless Vercel functions (`api/*.py`) |
| Database | Firebase Realtime Database (Admin SDK server-side, Web SDK v8 + anonymous auth client-side) |
| Frontend | Vanilla HTML/CSS/JS |

## How it works

1. A player opens the app (optionally with `?room=<name>` to create/join a room)
   and joins through the join screen. The host password is verified server-side
   against the `HOST_PASSWORD` env var — it is never shipped to the browser.
2. The client signs in anonymously to Firebase (required by the shipped
   security rules), then the backend initializes the room and, if needed,
   writes 20 random questions to `/{room}/questions`.
3. The browser subscribes to the room in real time: current question, answers,
   chat, reactions, player presence, and history — all room-scoped.
4. The host moves the game forward or starts a new game. Starting a new game
   goes through the server, which checks the host password and clears answers,
   history, chat, and reactions in a single atomic update.

## Getting started

### Prerequisites

- Python 3.10+ (the repo pins 3.12 via `.python-version`)
- A [Firebase](https://firebase.google.com) project with **Realtime Database**
  enabled and a **service account** key (Admin SDK JSON)

### 1. Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment variables

Copy `env.example` to `.env` and fill it in:

```bash
cp env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_DB_URL` | ✅ | Your Realtime Database URL, e.g. `https://<project>-default-rtdb.firebaseio.com` |
| `FIREBASE_CRED_PATH` | one of | Path to a service-account JSON file (e.g. `firebase-admin-key.json`) |
| `FIREBASE_CRED_JSON` | one of | The service-account JSON **content** (handy for secret managers and hosting env vars) |
| `HOST_PASSWORD` | ✅ | Password that grants host controls. There is no default: if it is unset, nobody can become the host |
| `HOST` / `PORT` / `FLASK_DEBUG` | optional | Local dev server only. Defaults: `127.0.0.1`, `3000`, debugger off (`FLASK_DEBUG=1` turns it on) |

The local dev server refuses to start without the Firebase variables.
`firebase-admin-key.json` and `.env` are gitignored — never commit service-account keys.

### 3. Deploy the security rules

`database.rules.json` contains locked-down Realtime Database rules: anonymous
auth is required to read/write rooms, and data shapes are validated (message
lengths, types, etc.). Open the Firebase console → **Realtime Database →
Rules** and paste the contents of `database.rules.json`. The client signs in
anonymously automatically, so the app works with these rules.

> If you'd rather keep the rules wide open during development, skip this step —
> the app still works, but anyone with the URL can read/write every room.

### 4. Point the web client at your database

The Firebase **web** config (apiKey, databaseURL, …) is hardcoded at the top of
`public/static/script.js` and still points to the original, deactivated
project. Replace it with the web config of your own Firebase project
(Project settings → Your apps → Web app). Its `databaseURL` must match
`FIREBASE_DB_URL`.

### 5. Run locally

```bash
python app.py
# Listens on 127.0.0.1:3000 by default (set HOST/PORT to change)
```

Open `http://localhost:3000` and join. To join a specific room, visit
`http://localhost:3000/?room=party1`. Room names may contain letters, digits,
`-` and `_` (up to 40 characters).

### Tests

```bash
pip install -r requirements-dev.txt
ruff check .
pytest
```

The tests run offline: they replace the Firebase database with an in-memory
fake and exercise `game.py`, the Flask routes, and the `api/*.py` handlers.
CI runs the same commands on every push.

## Deploy to Vercel

The app is set up for Vercel: Vercel detects the Python functions in `api/`, installs
`requirements.txt`, and serves static assets from `public/`. `vercel.json`
maps clean URLs (`/`, `/init-room`, `/generate-questions`, `/verify-host`) to
the functions and keeps `public/**` out of the function bundles.

Set `FIREBASE_DB_URL`, `FIREBASE_CRED_JSON`, and `HOST_PASSWORD` in the
Vercel project's environment variables.

## Project structure

```
app.py               # Local Flask dev server (uses game.py)
game.py              # Shared backend logic: Firebase init, questions, host check, room ops
api/index.py         # Serverless function: serves the game page
api/init-room.py     # Serverless function: GET /init-room
api/generate-questions.py # Serverless function: POST /generate-questions (host-only)
api/verify-host.py   # Serverless function: POST /verify-host
vercel.json          # Hosting rewrites + function config
public/static/       # Static assets served from the CDN (css, js)
templates/index.html # Game page (used by the Flask dev server)
questions.json       # Question bank (104 questions)
env.example          # Template for the environment variables described above
requirements.txt     # Python dependencies
database.rules.json  # Firebase Realtime Database security rules (deploy via console)
tests/               # Offline pytest suite (fake database)
pyproject.toml       # ruff + pytest configuration
.python-version      # Python version for hosting (3.12)
```

## Configuration notes

- **Host password** is verified on the server against `HOST_PASSWORD`. It is
  never included in the client bundle, but it is still a shared secret, so set
  a strong value. If it is unset, host verification always fails.
- **Client Firebase config**: client-side Firebase configs are public by
  design; see step 4 above.
- **Rate limiting**: `/generate-questions` and password attempts on
  `/verify-host` are rate-limited per IP (best-effort, in-memory, per server
  instance).

## Limitations

- Only **New Game** is enforced on the server. **Next question**, **Clear
  chat**, and **Clear history** are hidden from non-hosts in the UI, but the
  database rules let any signed-in (anonymous) player write the room, so a
  player who uses the browser console can do them too. Enforcing them would
  need server endpoints plus per-path database rules.
- Players are identified by display name, so two players with the same name
  share one answer slot and profile.
- The rate limit is in memory, so it resets on restart and is not shared
  between serverless instances.

## License

[MIT](LICENSE) © 2025 Utkarsh Sonawane
