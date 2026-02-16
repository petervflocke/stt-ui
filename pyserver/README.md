# All-in-One Python STT Service

This service runs:
- `faster-whisper` transcription API
- built React frontend as static files

## Endpoints

- `GET /api/health`
- `POST /api/transcribe` (`multipart/form-data` with `file`, optional `language`, `prompt`, `temperature`)

## Docker runtime requirements

- NVIDIA driver + NVIDIA Container Toolkit installed on host
- Docker Compose with GPU support (`gpus: all`)

## Run

```bash
cd /home/peter/Development/stt-ui
docker compose up -d --build
```

UI:
- `http://127.0.0.1:8010`

API:
- `http://127.0.0.1:8010/api/health`
