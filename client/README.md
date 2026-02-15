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
4. Validate result text, copy button, download `.txt`, and clear action
5. While upload is processing, verify tab switching is locked and `Cancel` stops processing
6. Open `Microphone` tab and allow mic access
7. Set `Max chunk length without silence` (5..120s, default 12s)
8. Start recording (max chunk setting is locked while active)
9. Pause briefly, then confirm chunked text appears in `Result`
10. Verify tab switching is locked during recording/sending
11. Click `Stop recording` and confirm final chunk flushes and copy/download still work
