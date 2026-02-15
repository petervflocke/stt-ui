import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

const PORT = Number(process.env.PORT || 8011);
const STT_API_BASE = process.env.STT_API_BASE || "http://127.0.0.1:8001";
const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 10_000);
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS || 600_000);
const STATIC_DIR = process.env.STATIC_DIR || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

function pickStaticDir() {
  const candidates = [
    STATIC_DIR,
    path.join(projectRoot, "client", "dist")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

const staticDir = pickStaticDir();

function log(level, message, extra = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...extra
  };
  console.log(JSON.stringify(payload));
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    log("info", "request_complete", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start
    });
  });
  next();
});

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", async (req, res) => {
  try {
    const upstream = await fetchWithTimeout(
      `${STT_API_BASE}/health`,
      { method: "GET" },
      HEALTH_TIMEOUT_MS
    );
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status).type(contentType).send(text);
  } catch (error) {
    log("error", "health_proxy_failed", { error: String(error) });
    res.status(502).json({ detail: `Cannot reach STT server: ${String(error)}` });
  }
});

app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: "file is required" });
  }

  const language = typeof req.body.language === "string" ? req.body.language.trim() : "";
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
  const temperatureInput =
    typeof req.body.temperature === "string" ? req.body.temperature.trim() : "";
  const temperature = temperatureInput || "0.0";

  const form = new FormData();
  const blob = new Blob([req.file.buffer], {
    type: req.file.mimetype || "application/octet-stream"
  });
  form.append(
    "file",
    blob,
    req.file.originalname || "audio"
  );
  form.append("temperature", temperature);
  if (language) form.append("language", language);
  if (prompt) form.append("prompt", prompt);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  const abortUpstreamOnRequestAbort = () => controller.abort();
  const abortUpstreamOnResponseClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  req.on("aborted", abortUpstreamOnRequestAbort);
  res.on("close", abortUpstreamOnResponseClose);

  try {
    const upstream = await fetch(`${STT_API_BASE}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";
    if (res.writableEnded) return;
    res.status(upstream.status).type(contentType).send(text);
  } catch (error) {
    if (controller.signal.aborted && (req.aborted || res.destroyed || res.writableEnded)) {
      log("info", "transcribe_proxy_cancelled_by_client");
      return;
    }
    log("error", "transcribe_proxy_failed", { error: String(error) });
    if (res.writableEnded) return;
    res.status(502).json({ detail: `Cannot reach STT server: ${String(error)}` });
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abortUpstreamOnRequestAbort);
    res.off("close", abortUpstreamOnResponseClose);
  }
});

if (staticDir) {
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.status(503).json({
      detail: "No frontend build found. Set STATIC_DIR or build client first."
    });
  });
}

app.listen(PORT, () => {
  log("info", "server_started", {
    port: PORT,
    sttApiBase: STT_API_BASE,
    staticDir
  });
});
