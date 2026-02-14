# AGENTS.md, STT UI

## Context
This repo provides a web UI for local transcription.
Architecture:
- `backend/app.py` is a FastAPI app inside Docker, exposed on port 8010.
- It serves static frontend from `/static` and proxies requests to the host STT API.
- Host STT API is systemd managed at `http://host.docker.internal:8001`.

Upstream STT endpoint:
- POST `${STT_API_BASE}/v1/audio/transcriptions`
- multipart form fields:
  - file (required)
  - language (optional, de|en|pl)
  - prompt (optional)
  - temperature (optional float, default 0.0)
Response JSON includes `text` and may include language metadata.

## How to run locally
- Start UI:
  - `docker compose up -d --build`
- View UI:
  - `http://192.168.0.222:8010`
- Confirm upstream STT:
  - `curl -s http://127.0.0.1:8001/health`

## Development workflow
- Prefer small, reviewable commits.
- Do not introduce heavy frameworks unless requested.
- Keep dependencies minimal.
- Avoid breaking the current file upload flow.

## Code style
- Python: keep functions small, clear error messages, no hidden side effects.
- JavaScript: no frameworks, modern browser APIs only, readable names.
- UI: simple, fast, accessible. Provide clear states: idle, running, error, done.

## Requirements for any change
- Must not require Docker GPU support.
- Must keep proxy pattern, avoid CORS issues.
- Must not change the host `stt_server.py` contract unless explicitly requested.
- Any new feature must include a quick manual test description.

## Next priorities
1) UI polish without changing behavior.
2) Add microphone mode using MediaRecorder, record then transcribe on stop.
3) Add safeguards for large files and long processing time.

## What to do when unsure
- Inspect existing code first.
- Prefer deterministic checks over guesswork.
- If a change impacts ports, confirm what else binds those ports on this host.
