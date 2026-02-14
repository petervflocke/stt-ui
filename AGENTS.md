# AGENTS.md, STT UI (React + Node migration)

## High level instruction
Migrate the current UI to React + Node in a controlled way.
Keep the current working baseline functional at all times.

## Constraints
- Do not modify the host STT server, its code, or its systemd unit.
- STT server stays at http://host.docker.internal:8001 with:
  - GET /health
  - POST /v1/audio/transcriptions (multipart file upload)
- Do not introduce Docker GPU requirements.
- Prefer small, reviewable changes.
- Always keep a working path to upload and transcribe.

## Required endpoints in the new Node proxy
- GET /api/health
  - Fetch `${STT_API_BASE}/health` and return JSON.
- POST /api/transcribe
  - Accept multipart form-data with:
    - file (required)
    - language (optional)
    - prompt (optional)
    - temperature (optional)
  - Forward to `${STT_API_BASE}/v1/audio/transcriptions` and return the JSON response.
  - Use generous timeouts for long audio.

## Frontend requirements
- Provide upload flow and show full transcript text.
- Provide copy button.
- Provide download transcript.txt and transcript.json.
- Provide clear states: idle, uploading, processing, done, error.
- Keep UI simple and fast.
- Keep React footprint small:
  - no state library
  - no UI framework
  - one page with a few components
  - strict split: dumb UI components + API helper module

## Migration strategy
1) Add new folders server/ and client/ without deleting existing code.
2) Implement Node proxy first, keep same behavior as current Python proxy.
3) Implement React UI to match current features.
4) Update docker compose to run Node and serve the built React app.
5) Remove old Python proxy only after the new stack is verified.

## Testing checklist
- docker compose up -d --build
- Open http://192.168.0.222:8010
- Upload small mp3, get transcript
- Upload large mp3, get full transcript
- curl http://127.0.0.1:8010/api/health returns upstream info

## Step 2, mic mode (later)
Implement record then transcribe on stop using MediaRecorder.
Do not attempt realtime streaming unless requested.
