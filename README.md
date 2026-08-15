# 🎯 flask-20q

A live multiplayer **20 Questions** party game. A Python backend picks 20 random
questions and syncs them to a Firebase Realtime Database; players join a room
in the browser and answer together — with live chat, emoji reactions, a word
cloud, player profiles, and host-controlled pacing.

## Features

- **20 questions per round**, drawn randomly from a 104-question bank (`questions.json`)
- **Join screen** instead of browser prompts — pick a name, optionally enter the host password
- **Live chat** with avatars and player colors
- **Live player list** with online presence (auto-removed on disconnect)
- **Player profiles**: avatar, color, games played, questions answered (saved to `localStorage`)
- **Host controls**: advance questions, clear chat, start a new game (password-verified server-side)
- **Emoji reactions** with flying-emoji animations
- **Word cloud** of the most common words in answers
- **Answer history** per question, persisted in Firebase, exportable as a text file
- **5 themes** with custom background music: Pav, Kari, Oman, Raj, Biswa
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
4. The host moves the game forward or starts a new game (which clears answers,
   history, chat, and reactions in a single atomic update).

## Getting started

### Prerequisites

- Python 3.10+ (the repo pins 3.12 via `.python-version`; the Freebuff preview uses `uv`)
- A [Firebase](https://firebase.google.com) project with **Realtime Database**
  enabled and a **service account** key (Admin SDK JSON)

### 1. Install

```bash
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
# or: python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
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
| `FIREBASE_CRED_JSON` | one of | The service-account JSON **content** (handy for secret managers / the Freebuff Keys UI) |
| `HOST_PASSWORD` | optional | Password that grants host controls. Defaults to `host123`; **set your own in production** |

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

### 4. Run locally

```bash
uv run python app.py
# Server listens on 0.0.0.0:$PORT (default 3000)
```

Open `http://localhost:3000` and join. To join a specific room, visit
`http://localhost:3000/?room=party1`.

## Freebuff Cloud preview

The repo is preconfigured for Freebuff Cloud previews:

- **Install**: `uv venv --python 3.12 .venv && uv pip install -r requirements.txt`
- **Preview**: `uv run python app.py` (port 3000)
- **Build**: `true` (no build step — hosting builds the `api/*.py` functions itself)

## Freebuff Cloud hosting (Vercel)

The app is deployable: hosting detects the Python functions in `api/`, installs
`requirements.txt`, and serves static assets from `public/`. `vercel.json`
maps clean URLs (`/`, `/init-room`, `/generate-questions`, `/verify-host`) to
the functions and keeps `public/**` out of the function bundles.

Set `FIREBASE_DB_URL`, `FIREBASE_CRED_JSON`, and `HOST_PASSWORD` in the
production environment (separate from the sandbox `.env` values).

## Project structure

```
app.py               # Local/preview Flask server (uses game.py)
game.py              # Shared backend logic: Firebase init, questions, host check, room ops
api/index.py         # Serverless function: serves the game page
api/init-room.py     # Serverless function: GET /init-room
api/generate-questions.py # Serverless function: POST /generate-questions (host-only)
api/verify-host.py   # Serverless function: POST /verify-host
vercel.json          # Hosting rewrites + function config
public/static/       # Static assets served from the CDN (css, js, mp3)
templates/index.html # Game page (used by the Flask dev server)
questions.json       # Question bank (104 questions)
env.example          # Template for the environment variables described above
requirements.txt     # Python dependencies
database.rules.json  # Firebase Realtime Database security rules (deploy via console)
.python-version      # Python version for hosting (3.12)
```

## Configuration notes

- **Host password** is verified server-side against `HOST_PASSWORD` (default
  `host123`). It is never included in the client bundle — but it is still a
  shared secret, so set a strong value before going public.
- **Client Firebase config**: the web SDK config (apiKey, databaseURL) is
  hardcoded at the top of `public/static/script.js` — client-side configs are
  public by design, but the database URL must match `FIREBASE_DB_URL`.
- **Rate limiting**: the new-game endpoint is rate-limited per IP (best-effort,
  in-memory) to discourage spam.

## License

[MIT](LICENSE) © 2025 Utkarsh Sonawane
