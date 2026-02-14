# Codex task list, STT UI migration (start here)

## Task 1 (start here), Create Node proxy and keep the current UI working
Goal: Add a Node proxy server that replicates the current backend API:
- GET /api/health -> forwards to ${STT_API_BASE}/health
- POST /api/transcribe -> accepts multipart upload and forwards to ${STT_API_BASE}/v1/audio/transcriptions

Constraints:
- Do not remove the existing Python backend yet.
- Do not change the host STT server (port 8001).
- Proxy must use generous timeouts (long audio).

Deliverables:
- New folder `server/` with:
  - package.json
  - src/index.js (or index.ts if preferred)
  - minimal dependencies: express (or fastify), multer (or busboy), node-fetch/undici, cors off (not needed if same origin), and a simple logger.
- A quick local run command for dev (node server on port 8011 or 8010).
- A minimal `/api/health` and `/api/transcribe` implementation.

Acceptance:
- `curl http://127.0.0.1:<port>/api/health` returns JSON from upstream STT.
- A test curl with mp3 file returns JSON with `text`.

Notes:
- Do not add a database.
- Keep code readable and small.

---

## Task 2, Add React app (Vite) that matches current UI features
Goal: Create a React frontend that matches the existing features:
- file upload
- language input
- prompt input
- temperature input
- transcript view
- copy
- download txt and json
- clear status messages

Deliverables:
- New folder `client/` created with Vite React
- A single page UI with simple components
- Calls Node proxy endpoints only (same origin preferred)
- Keep React implementation minimal:
  - no state library
  - no UI framework
  - few components on one page
  - strict split between UI components and API helper

Acceptance:
- Running dev mode shows UI and can transcribe a file end to end via Node proxy.

---

## Task 3, Update Docker compose to run Node + serve React build
Goal: Replace the current Python container with a Node container that serves:
- /api/* from Node proxy
- static frontend (built React assets)

Deliverables:
- Update root `docker-compose.yml` to build/run the Node service
- Ensure `extra_hosts: host.docker.internal:host-gateway`
- Ensure env `STT_API_BASE=http://host.docker.internal:8001`
- Expose port 8010:8010

Acceptance:
- `docker compose up -d --build`
- Open http://192.168.0.222:8010 works
- Upload mp3 works
- Downloads work

---

## Task 4, Remove old Python backend and static frontend (cleanup)
Goal: After Docker based Node + React works, remove old code.
Deliverables:
- Remove `backend/` (Python proxy) and old `frontend/` only if no longer used
- Remove references in compose
- Keep README updated

Acceptance:
- Repo is clean: only Node + React stack remains
- All features still work in production mode

---

## Task 5 (step 2 later), Add microphone mode in React
Add another tab on the screen layoput
Goal: Add “record then transcribe on stop” using MediaRecorder.
Deliverables:
- Mic button, record indicator, stop button
- Transcribe recorded blob via /api/transcribe
- Append transcript or replace transcript, choose simplest

Acceptance:
- Works in Chromium and Firefox
- Clear errors if mic permissions denied

Possible impleemnation idea:
### GUI:
Same page, same Result panel
Keep the existing upload flow unchanged.
Add a mic control cluster on the right of the file input row:
Mic button toggles recording
Small status text: “recording”, “sending”, “idle”
Stream output into the existing Result area.
Result panel behavior
When mic starts: clear or append, user choice, default clear.
While recording: append chunk results as they return.
When stop: finalize, enable copy/download.

### 5.1: Live streaming
Step 1, near live dictation (easy, reliable)

Use MediaRecorder in the browser with mimeType: audio/webm;codecs=opus (Chrome and Firefox).

Every N seconds (2 to 5s), stop the recorder, send that blob to /api/transcribe, append returned text to Result, then start a new chunk.

This feels live, and it reuses your existing API with no backend changes.

Tradeoff: Whisper does not have full context across chunks, so you can get slight word boundaries issues. You can mitigate by:

adding overlap, re send last 0.5s to 1s, then de duplicate, or

pass a rolling prompt with last 200 to 400 characters of transcript.

### 5.2 Improved live streaming
Step 2, better live quality (more work)
Add a websocket endpoint in the Node proxy to accept PCM frames.
Run a streaming ASR engine designed for it.
This is closer to WhisperLive, but it increases complexity.
