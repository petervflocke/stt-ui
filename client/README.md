# STT UI React Client (Task 2)

## Run in dev mode

Start Node proxy first on `8011`, then:

```bash
cd client
npm install
npm run dev
```

Vite runs on `http://127.0.0.1:5173` and proxies `/api/*` to `http://127.0.0.1:8011`.

## Manual test

1. Open `http://127.0.0.1:5173`
2. Click `Check backend`
3. Upload an audio file and submit transcription
4. Validate result text, copy button, download `.txt`, and download `.json`
