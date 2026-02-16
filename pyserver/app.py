import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from faster_whisper import WhisperModel


MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/client-dist"))

app = FastAPI()
model: WhisperModel | None = None
model_lock = threading.Lock()


def get_model() -> WhisperModel:
    global model
    if model is not None:
        return model
    with model_lock:
        if model is None:
            model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    return model


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "model_loaded": model is not None,
    }


@app.post("/api/transcribe")
async def transcribe(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str | None, Form()] = None,
    prompt: Annotated[str | None, Form()] = None,
    temperature: Annotated[float | None, Form()] = None,
) -> JSONResponse:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="file is required")
    if len(payload) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file is too large")

    suffix = Path(file.filename or "").suffix or ".mp3"
    started = time.time()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(payload)
        tmp_path = tmp.name

    try:
        kwargs = {
            "language": language or None,
            "initial_prompt": prompt or None,
            "vad_filter": True,
            "beam_size": 5,
        }
        if temperature is not None:
            kwargs["temperature"] = temperature

        segments_iter, info = get_model().transcribe(tmp_path, **kwargs)
        segments = list(segments_iter)
        text = "".join(s.text for s in segments).strip()

        return JSONResponse(
            {
                "text": text,
                "language": info.language,
                "language_probability": info.language_probability,
                "duration_ms": int((time.time() - started) * 1000),
            }
        )
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> FileResponse:
    if STATIC_DIR.exists():
        target = STATIC_DIR / full_path
        if full_path and target.exists() and target.is_file():
            return FileResponse(target)
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
    raise HTTPException(status_code=503, detail="Frontend build missing")
