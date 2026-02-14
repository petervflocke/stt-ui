import os
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

STT_API_BASE = os.environ.get("STT_API_BASE", "http://127.0.0.1:8001")

app = FastAPI(title="STT UI", version="0.1.0")

# Serve frontend files
app.mount("/static", StaticFiles(directory="/app/frontend"), name="static")

@app.get("/")
def index():
    return FileResponse("/app/frontend/index.html")

@app.get("/api/health")
async def api_health():
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(f"{STT_API_BASE}/health")
        r.raise_for_status()
        return r.json()

@app.post("/api/transcribe")
async def api_transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    prompt: str | None = Form(default=None),
    temperature: float = Form(default=0.0),
):
    # Proxy the upload to your existing STT server
    try:
        data = {"temperature": str(temperature)}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        async with httpx.AsyncClient(timeout=600.0) as client:
            files = {"file": (file.filename or "audio", await file.read(), file.content_type or "application/octet-stream")}
            r = await client.post(f"{STT_API_BASE}/v1/audio/transcriptions", data=data, files=files)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach STT server: {e}") from e

    if r.status_code >= 400:
        # pass through error body if possible
        try:
            return JSONResponse(status_code=r.status_code, content=r.json())
        except Exception:
            raise HTTPException(status_code=r.status_code, detail=r.text)

    return r.json()
