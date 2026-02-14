# Project plan, STT UI (React + Node)

## Goal
Build a structured web app for local transcription that uses the existing host STT service:
- Host STT API stays as is: http://127.0.0.1:8001/v1/audio/transcriptions
- Keep Open WebUI mic dictation as is
- Replace the current UI stack with:
  - Node backend proxy (upload, forward to STT, health)
  - React frontend (upload, results, downloads)
  - Mic mode can be added in step 2
  - Keep implementation minimal: no state library, no UI framework, one page, and dumb components that call a separate API helper

## Non-negotiables
- Do not change the host STT server contract or ports.
- Do not require Docker GPU support.
- Keep requests server side via the proxy, no browser to STT direct calls.
- Keep a single command to run: docker compose up, and it must survive reboots.

## Current baseline
- Docker compose runs a Node proxy container on 8010 and serves the built React app.
- The proxy forwards multipart upload to host STT on port 8001.
- Current stack is Node + React only.

## Target architecture
Repo layout:
- server/ (Node)
  - /api/health: returns upstream STT health JSON
  - /api/transcribe: accepts multipart upload, forwards to STT, returns JSON
  - Serves built frontend assets (production)
- client/ (React, Vite)
  - Upload page
  - Result view (copy, download txt, download json)
  - Later: mic recording UI

Compose:
- One container is fine (Node serving both API and static build), or two containers if needed.
- Must keep host mapping: host.docker.internal -> host-gateway
- Use env STT_API_BASE=http://host.docker.internal:8001

## Milestones
M1, migrate without feature loss
- Create Node proxy with same endpoints as current Python proxy
- Create React app that matches current behavior
- Keep port 8010
Acceptance: upload works, downloads work, health works

M2, mic mode
- MediaRecorder record then transcribe on stop
- Show clear recording state and errors
Acceptance: mic mode works in Chromium and Firefox

M3, hardening
- Better progress and error handling
- Larger file reliability, extend proxy timeouts
Acceptance: long file returns full transcript, no UI truncation

## Commands
- dev: run React dev server + Node proxy with proxying configured
- prod: docker compose up -d --build
- smoke: curl http://127.0.0.1:8010/api/health
