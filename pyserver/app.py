import os
import tempfile
import threading
import time
import json
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from faster_whisper import WhisperModel


MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "1024"))
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
VAD_FILTER = str(os.environ.get("WHISPER_VAD_FILTER", "true")).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
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
        "beam_size": BEAM_SIZE,
        "vad_filter": VAD_FILTER,
        "model_loaded": model is not None,
    }


def decode_options(language: str | None, prompt: str | None, temperature: float | None) -> dict:
    options = {
        "language": language or None,
        "initial_prompt": prompt or None,
        "vad_filter": VAD_FILTER,
        "beam_size": BEAM_SIZE,
    }
    if temperature is not None:
        options["temperature"] = temperature
    return options


def store_upload(file: UploadFile, payload: bytes) -> str:
    suffix = Path(file.filename or "").suffix or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(payload)
        return tmp.name


@app.post("/api/transcribe")
async def transcribe_json(
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

    started = time.time()
    tmp_path = store_upload(file, payload)

    try:
        kwargs = decode_options(language, prompt, temperature)
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


@app.post("/api/transcribe/stream")
async def transcribe_stream(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str | None, Form()] = None,
    prompt: Annotated[str | None, Form()] = None,
    temperature: Annotated[float | None, Form()] = None,
) -> StreamingResponse:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="file is required")
    if len(payload) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="file is too large")

    tmp_path = store_upload(file, payload)
    started = time.time()

    def emitter():
        try:
            kwargs = decode_options(language, prompt, temperature)
            segments_iter, info = get_model().transcribe(tmp_path, **kwargs)
            duration = float(getattr(info, "duration", 0.0) or 0.0)

            yield json.dumps(
                {
                    "type": "meta",
                    "duration": duration,
                    "language": getattr(info, "language", None),
                }
            ) + "\n"

            parts: list[str] = []
            for seg in segments_iter:
                delta = seg.text or ""
                if delta:
                    parts.append(delta)
                progress = None
                if duration > 0 and getattr(seg, "end", None) is not None:
                    progress = max(0.0, min(1.0, float(seg.end) / duration))
                yield json.dumps(
                    {
                        "type": "segment",
                        "start": round(float(seg.start), 3),
                        "end": round(float(seg.end), 3),
                        "delta": delta,
                        "text": "".join(parts).strip(),
                        "progress": progress,
                    }
                ) + "\n"

            yield json.dumps(
                {
                    "type": "done",
                    "text": "".join(parts).strip(),
                    "language": info.language,
                    "language_probability": info.language_probability,
                    "progress": 1.0,
                    "duration_ms": int((time.time() - started) * 1000),
                }
            ) + "\n"
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    return StreamingResponse(emitter(), media_type="application/x-ndjson")


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
