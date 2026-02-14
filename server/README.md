# STT UI Node Proxy (Task 1)

## Local run

```bash
cd server
npm install
STT_API_BASE=http://127.0.0.1:8001 PORT=8011 npm run dev
```

## Smoke tests

```bash
curl -s http://127.0.0.1:8011/api/health
curl -s -X POST http://127.0.0.1:8011/api/transcribe \
  -F "file=@/path/to/sample.mp3" \
  -F "language=en" \
  -F "temperature=0.0"
```

## Docker run (Task 3)

From repo root:

```bash
docker compose up -d --build
```

The Node container serves:
- API proxy on `/api/*`
- React build on `/`

### Quick manual test

```bash
curl -iS http://127.0.0.1:8010/api/health
```

Open `http://127.0.0.1:8010` and verify:
1. Upload audio and submit transcription
2. Result text renders
3. Copy, `Download .txt`, and `Download .json` work
