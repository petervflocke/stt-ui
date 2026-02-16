# STT UI (All-in-One Docker, FastAPI + React + faster-whisper)

This project provides a local speech-to-text web UI backed by `faster-whisper`, packaged as a single Dockerized service.

It includes:
- React frontend (file upload + microphone input)
- FastAPI backend API
- GPU-accelerated transcription with `faster-whisper`
- Streaming transcription progress and diagnostics

The app is exposed on `http://<host>:8010`.

## Architecture

- `pyserver/app.py`: FastAPI backend + static file serving
- `client/`: React UI
- `pyserver/Dockerfile`: builds frontend, then serves via Python runtime
- `docker-compose.yml`: production-like runtime
- `docker-compose.dev.yml`: development override (bind mounts + reload)

## Requirements

### System
- Linux host with NVIDIA GPU (recommended for performance)
- NVIDIA driver installed
- NVIDIA Container Toolkit installed and working
- Docker + Docker Compose plugin

### NVIDIA Container Toolkit install

### Ubuntu (22.04/24.04)
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Fedora
```bash
curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
  sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo

sudo dnf install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Optional checks
```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

## Quick Start

### 1) Build and run
From repo root:
```bash
make deploy
```

Open:
- `http://127.0.0.1:8010`

### 2) Fast restart without rebuild
```bash
make quick-deploy
```

Use this after configuration/runtime restarts where image content did not change.

## Makefile Commands

- `make build`: build images only
- `make deploy`: full redeploy (`down` + `up -d --build`)
- `make quick-deploy`: quick start/recreate without rebuild
- `make dev`: start with dev override (`docker-compose.dev.yml`)
- `make dev-down`: stop dev-mode stack
- `make up`: `docker compose up -d`
- `make down`: `docker compose down`
- `make restart`: restart services
- `make logs`: tail logs
- `make ps`: show compose status

## Development Workflow

For backend live reload and local source mounts:

```bash
make dev
```

This uses both:
- `docker-compose.yml`
- `docker-compose.dev.yml`

Dev override enables:
- `uvicorn --reload`
- bind mount `./pyserver -> /app/pyserver`
- bind mount `./client/dist -> /app/client-dist`

To refresh frontend build continuously in dev, run in another terminal:
```bash
cd client
npm run build -- --watch
```

## API Endpoints

Backend endpoints (same host/port as UI):

- `GET /api/health`
  - Returns model/device/runtime config
- `POST /api/warmup`
  - Loads model into memory early (reduces first-request latency)
- `POST /api/transcribe`
  - Multipart upload (`file`, optional `language`, `prompt`, `temperature`)
  - Returns JSON transcript
- `POST /api/transcribe/stream`
  - Multipart upload
  - Returns NDJSON stream with progress events

## Example: health
```bash
curl http://127.0.0.1:8010/api/health
```

## Example: JSON transcription
```bash
curl -s -X POST http://127.0.0.1:8010/api/transcribe \
  -F "file=@/path/to/sample.mp3"
```

## Runtime Configuration

Configured in `docker-compose.yml`:

- `WHISPER_MODEL` (default: `small`)
- `WHISPER_DEVICE` (default: `cuda`)
- `WHISPER_COMPUTE_TYPE` (default: `float16`)
- `WHISPER_BEAM_SIZE` (default: `3`)
- `WHISPER_VAD_FILTER` (default: `true`)
- `MAX_UPLOAD_MB` (default: `1024`)

## Volumes and Caching

`docker-compose.yml` mounts:
- `hf_cache:/root/.cache/huggingface`
- `ctranslate2_cache:/root/.cache/ctranslate2`

Purpose:
- Preserve model/cache artifacts across container recreation
- Avoid repeated large downloads/conversions
- Reduce startup latency after first run

These are cache volumes, not source-code volumes.

## UI Behavior Notes

- Upload flow has phases:
  - `uploading...` (determinate progress)
  - `preparing...` (indeterminate animation)
  - `transcribing...` (determinate progress)
- Diagnostics section includes timing breakdown (upload, prepare, decode, etc.)
- Diagnostics supports quick copy icon and result auto-scroll toggle
- Mic sensitivity can be adjusted live during recording
- Warm model button is available in the header

## Troubleshooting

### Container not starting
```bash
make ps
make logs
```

### Slow first transcription
- Click `Warm model` in UI, or call:
```bash
curl -X POST http://127.0.0.1:8010/api/warmup
```

### Large file appears stuck after upload
- Check Diagnostics:
  - `Upload`
  - `Prepare`
  - `Decode`
  - `Post-upload gap`
- This helps identify whether delay is network, file handling, model prep, or decoding.

## Project Structure

```text
.
├─ client/                 # React UI
├─ pyserver/               # FastAPI + faster-whisper service
│  ├─ app.py
│  ├─ requirements.txt
│  └─ Dockerfile
├─ docker-compose.yml
├─ docker-compose.dev.yml
├─ Makefile
└─ README.md
```

## Notes

- `backend-api/` files may exist as local references/symlinks from earlier phases; the active runtime for this project is now the all-in-one `pyserver` stack.
- For production updates after code changes, use `make deploy`.
- For fast iteration, use `make dev`.
