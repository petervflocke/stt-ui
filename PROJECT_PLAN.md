# Project plan, STT UI

## Goal
Provide a clean web UI for local speech to text on ai01, using the existing host STT service:
- Backend proxy container on port 8010
- Host STT API on port 8001, endpoint: POST /v1/audio/transcriptions
- Keep Open WebUI mic dictation as is

## Current state
- File upload transcription works (proxy, multipart upload, transcript output, download txt and json).
- Host STT service is persistent via systemd (stt-server).

## Milestones

### M1, UI polish (no behavior changes)
- Improve layout and spacing
- Clear “busy” states, disable controls while running
- Better error messages (show HTTP code and backend detail)
- Add transcript stats (chars, duration if available, language, confidence if returned)

Acceptance
- No new dependencies required on host
- Still runs with `docker compose up -d --build`

### M2, microphone mode (web)
- Browser mic capture using MediaRecorder
- Two modes:
  1) Record then transcribe on stop (simplest)
  2) Optional chunked mode later (append results)
- Output appears in the same transcript panel
- Provide “clear”, “copy”, “download” actions

Acceptance
- Works in Chromium and Firefox
- Handles 30 to 120 seconds smoothly

### M3, long audio workflows
- Support large uploads without timeouts
- Server side streaming not required, but:
  - show progress for upload
  - ensure backend timeouts are high enough
- Optional chunked transcription on backend if we want partial results

Acceptance
- 60 to 90 minute file uploads complete, returns full transcript

### M4, operational hardening
- Health page shows both UI status and upstream STT status
- Add basic access control (optional):
  - simple HTTP basic auth in proxy
  - or allowlist by IP

Acceptance
- No manual cleanup needed
- Logs are readable, no sensitive data logged

## Non goals
- No Docker GPU enablement
- No changes to NVIDIA driver, CUDA, or existing Ollama / Open WebUI setup
