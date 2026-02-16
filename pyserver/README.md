# All-in-One Python STT Service

This service runs:
- `faster-whisper` transcription API
- built React frontend as static files

## Endpoints

- `GET /api/health`
- `POST /api/transcribe` (`multipart/form-data` with `file`, optional `language`, `prompt`, `temperature`)
- `POST /api/transcribe/stream` (NDJSON stream with progressive text chunks + progress)

## Docker runtime requirements

- NVIDIA driver + NVIDIA Container Toolkit installed on host
- Docker Compose with GPU support (`gpus: all`)

## Run

```bash
cd /home/peter/Development/stt-ui
docker compose up -d --build
```

After the first successful build, routine restarts usually do not need rebuild:

```bash
docker compose up -d
```

## Fast Dev Loop (no rebuild for backend code edits)

Start frontend build in watch mode:

```bash
cd /home/peter/Development/stt-ui/client
npm run build -- --watch
```

In another terminal, run compose with dev override:

```bash
cd /home/peter/Development/stt-ui
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This mode bind-mounts `pyserver/` and uses `uvicorn --reload`.

UI:
- `http://127.0.0.1:8010`

API:
- `http://127.0.0.1:8010/api/health`

## Performance knobs

Set in `docker-compose.yml`:
- `WHISPER_BEAM_SIZE` (`3` faster, `5` more stable/accurate)
- `WHISPER_VAD_FILTER` (`true`/`false`)
- `WHISPER_COMPUTE_TYPE` (`float16` recommended on CUDA)
