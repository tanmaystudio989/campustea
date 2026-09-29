# CampusTea MVP

A beginner-friendly college micro-community app built with FastAPI, SQLite, and plain HTML, CSS, and JavaScript.

## Run it

1. Open a terminal in this folder.
2. Create and activate a virtual environment (recommended):

   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

3. Install dependencies and start the app:

   ```powershell
   python -m pip install -r requirements.txt
   python -m uvicorn main:app --reload
   ```

4. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The first run creates a `campustea.db` SQLite file in this folder — that's where accounts, posts, and community memberships live from now on, so nothing resets when you restart the server.

## What is included

- Sign up or log in with a username and password (passwords are hashed, never stored as plain text).
- Choose your college at signup — the feed only shows posts from people at your own college.
- Browse the campus feed and filter it by community.
- Browse communities and join or leave them.
- Publish a text post to a community you've joined.
- Like posts — likes are saved to the database.
- Edit your profile (display name and bio) and log out.
- FastAPI JSON endpoints are documented at `/docs`.

## Notes for going further

- `SESSION_SECRET` — set this environment variable to a real random secret before deploying anywhere public. The code falls back to a dev-only value otherwise.
- Password hashing uses Python's built-in `hashlib` (PBKDF2) so there's nothing extra to install. Fine for learning and small use; consider `passlib`/`bcrypt` if this grows into something bigger.
- The database automatically switches to Postgres when a `DATABASE_URL` environment variable is set (which hosting platforms provide), and falls back to the local SQLite file otherwise — no code changes needed either way.

## Deploying it as a real web app

This repo includes `render.yaml`, so on [Render](https://render.com):

1. Push this project to a GitHub repo.
2. In Render, choose "New Blueprint" and point it at your repo — it will read `render.yaml` and set up both the web service and a free Postgres database automatically.
3. Deploy. Render gives you a public URL (like `campustea.onrender.com`) that anyone can open.

A `Procfile` is also included if you'd rather use a platform like Railway that reads that format instead.

