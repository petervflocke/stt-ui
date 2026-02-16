import { useEffect, useMemo, useRef, useState } from "react";
import MicRecorderPanel from "./components/MicRecorderPanel.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import TranscribeForm from "./components/TranscribeForm.jsx";
import { fetchHealth, transcribe, transcribeStream } from "./api.js";

const ANALYSIS_INTERVAL_MS = 30;
const CALIBRATION_MS = 1200;
const SILENCE_TRIGGER_MS = 450;
const MIN_CHUNK_MS = 900;
const FINAL_MIN_CHUNK_MS = 200;
const MIN_VOICE_ACTIVITY_MS = 180;
const MIN_PEAK_RMS = 0.012;
const DIAG_HEALTH_REFRESH_MS = 15_000;

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function extractTranscriptText(response) {
  if (response.json) {
    if (typeof response.json.text === "string") {
      return response.json.text.trim();
    }
    return "";
  }
  return String(response.raw || "").trim();
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm"
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatBytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "n/a";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function formatMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "n/a";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(2)} s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = ((value % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("upload");
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [temperature, setTemperature] = useState("");

  const [uploadStatus, setUploadStatus] = useState("idle");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultText, setResultText] = useState("");
  const [diagnosticsText, setDiagnosticsText] = useState("");
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagHealthText, setDiagHealthText] = useState("");

  const [micStatus, setMicStatus] = useState("idle");
  const [micError, setMicError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micThreshold, setMicThreshold] = useState(0.02);
  const [micSensitivity, setMicSensitivity] = useState(0.02);
  const [micMaxChunkSeconds, setMicMaxChunkSeconds] = useState(8);
  const [micResultMode, setMicResultMode] = useState("clear");
  const [useRollingPrompt, setUseRollingPrompt] = useState(true);

  const canUseResult = useMemo(() => resultText.trim().length > 0, [resultText]);
  const micActive = micStatus === "recording" || micStatus === "sending";
  const tabsLocked = submitting || micActive;
  const progressMode = submitting
    ? uploadStatus === "preparing..."
      ? "indeterminate"
      : "determinate"
    : null;

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const analysisTimerRef = useRef(null);
  const sampleBufferRef = useRef(null);

  const shouldRecordRef = useRef(false);
  const chunkStartedAtRef = useRef(0);
  const belowSinceRef = useRef(null);
  const calibratingUntilRef = useRef(0);
  const baselineAccumRef = useRef(0);
  const baselineCountRef = useRef(0);
  const chunksRef = useRef([]);
  const currentMimeTypeRef = useRef("");
  const activeSendCountRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const uploadAbortRef = useRef(null);
  const levelUiTickRef = useRef(0);
  const resultTextRef = useRef("");
  const languageRef = useRef("");
  const promptRef = useRef("");
  const temperatureRef = useRef("");
  const sensitivityRef = useRef(0.02);
  const thresholdRef = useRef(0.02);
  const rollingPromptRef = useRef(true);
  const maxChunkMsRef = useRef(8_000);
  const chunkVoiceMsRef = useRef(0);
  const chunkPeakRmsRef = useRef(0);

  useEffect(() => {
    resultTextRef.current = resultText;
  }, [resultText]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    temperatureRef.current = temperature;
  }, [temperature]);

  useEffect(() => {
    sensitivityRef.current = micSensitivity;
  }, [micSensitivity]);

  useEffect(() => {
    thresholdRef.current = micThreshold;
  }, [micThreshold]);

  useEffect(() => {
    rollingPromptRef.current = useRollingPrompt;
  }, [useRollingPrompt]);

  useEffect(() => {
    maxChunkMsRef.current = micMaxChunkSeconds * 1000;
  }, [micMaxChunkSeconds]);

  function updateMicStatus(nextStatus, nextError = "") {
    setMicStatus(nextStatus);
    setMicError(nextError);
  }

  function renderDiagnostics(lines) {
    return lines
      .map((line) => (typeof line === "string" ? line.trim() : ""))
      .filter(Boolean)
      .join("\n");
  }

  async function refreshDiagnosticsHealth() {
    const at = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setDiagHealthText(`Backend health: checking (${at})`);
    try {
      const health = await fetchHealth();
      const summary =
        health && typeof health === "object"
          ? `status=${health.status || "n/a"} | model=${health.model || "n/a"} | device=${
              health.device || "n/a"
            } | compute=${health.compute_type || "n/a"} | loaded=${String(
              Boolean(health.model_loaded)
            )}`
          : "status=ok";
      setDiagHealthText(`Backend health: ${summary} @ ${at}`);
    } catch (error) {
      setDiagHealthText(`Backend health: error (${String(error.message || error)}) @ ${at}`);
    }
  }

  function rollingPrompt() {
    if (!rollingPromptRef.current) return promptRef.current.trim();
    const tail = resultTextRef.current.slice(-300).trim();
    return [promptRef.current.trim(), tail].filter(Boolean).join("\n");
  }

  function stopAudioResources() {
    if (analysisTimerRef.current) {
      window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    analyserRef.current = null;
    sampleBufferRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setMicLevel(0);
  }

  function finishMicIfIdle() {
    if (!shouldRecordRef.current && activeSendCountRef.current === 0) {
      stopAudioResources();
      updateMicStatus("idle");
    }
  }

  async function sendMicChunk(blob, isFinal) {
    if (!blob || blob.size === 0) {
      if (isFinal) finishMicIfIdle();
      return;
    }

    activeSendCountRef.current += 1;
    updateMicStatus("sending");

    const file = new File([blob], `mic-${Date.now()}.webm`, {
      type: blob.type || "audio/webm"
    });

    queueRef.current = queueRef.current
      .then(async () => {
        const startedAt = performance.now();
        const response = await transcribe({
          file,
          language: languageRef.current.trim(),
          prompt: rollingPrompt(),
          temperature: temperatureRef.current.trim()
        });
        const endedAt = performance.now();
        const text = extractTranscriptText(response);
        const decodeMs =
          response && response.json && typeof response.json.duration_ms === "number"
            ? response.json.duration_ms
            : null;
        if (text) {
          setResultText((previous) => (previous ? `${previous} ${text}` : text));
        }
        setDiagnosticsText(
          renderDiagnostics([
            "Mode: Microphone chunk",
            `Chunk size: ${formatBytes(blob.size)}`,
            `Total: ${formatMs(endedAt - startedAt)}`,
            decodeMs !== null ? `Decode: ${formatMs(decodeMs)}` : ""
          ])
        );
      })
      .catch((error) => {
        updateMicStatus("error", String(error.message || error));
      })
      .finally(() => {
        activeSendCountRef.current -= 1;
        if (shouldRecordRef.current) {
          updateMicStatus("recording");
        } else {
          finishMicIfIdle();
        }
      });
  }

  function tryCutChunk(reason) {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    const elapsed = performance.now() - chunkStartedAtRef.current;
    if (elapsed < MIN_CHUNK_MS) return;
    recorder.stop();
  }

  function startRecorderLoop() {
    const stream = mediaStreamRef.current;
    if (!stream) return;

    const options = currentMimeTypeRef.current ? { mimeType: currentMimeTypeRef.current } : {};
    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;
    chunkStartedAtRef.current = performance.now();
    belowSinceRef.current = null;
    chunksRef.current = [];
    chunkVoiceMsRef.current = 0;
    chunkPeakRmsRef.current = 0;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const durationMs = performance.now() - chunkStartedAtRef.current;
      const isFinal = !shouldRecordRef.current;
      const minDuration = isFinal ? FINAL_MIN_CHUNK_MS : MIN_CHUNK_MS;
      const blob = new Blob(chunksRef.current, {
        type: currentMimeTypeRef.current || "audio/webm"
      });
      const voicedEnough =
        chunkVoiceMsRef.current >= MIN_VOICE_ACTIVITY_MS ||
        chunkPeakRmsRef.current >= Math.max(MIN_PEAK_RMS, thresholdRef.current * 1.1);

      if (shouldRecordRef.current) {
        startRecorderLoop();
      }

      if (durationMs >= minDuration && voicedEnough) {
        sendMicChunk(blob, isFinal);
      } else if (isFinal) {
        finishMicIfIdle();
      }
    };

    recorder.onerror = () => {
      shouldRecordRef.current = false;
      updateMicStatus("error", "Microphone recorder failed.");
      finishMicIfIdle();
    };

    recorder.start();
  }

  function startSilenceAnalysis() {
    if (!analyserRef.current || !sampleBufferRef.current) return;

    analysisTimerRef.current = window.setInterval(() => {
      const analyser = analyserRef.current;
      const data = sampleBufferRef.current;
      if (!analyser || !data) return;

      analyser.getFloatTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const value = data[i];
        sumSquares += value * value;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const now = performance.now();

      if (now < calibratingUntilRef.current) {
        baselineAccumRef.current += rms;
        baselineCountRef.current += 1;
      } else if (baselineCountRef.current > 0) {
        const baseline = baselineAccumRef.current / baselineCountRef.current;
        const nextThreshold = Math.max(0.008, baseline + sensitivityRef.current);
        thresholdRef.current = nextThreshold;
        setMicThreshold(nextThreshold);
        baselineCountRef.current = 0;
      }

      const threshold = thresholdRef.current;
      if (rms >= threshold) {
        chunkVoiceMsRef.current += ANALYSIS_INTERVAL_MS;
      }
      if (rms > chunkPeakRmsRef.current) {
        chunkPeakRmsRef.current = rms;
      }

      if (rms < threshold) {
        if (belowSinceRef.current === null) {
          belowSinceRef.current = now;
        } else if (now - belowSinceRef.current >= SILENCE_TRIGGER_MS) {
          tryCutChunk("silence");
        }
      } else {
        belowSinceRef.current = null;
      }

      if (now - chunkStartedAtRef.current >= maxChunkMsRef.current) {
        tryCutChunk("hard-limit");
      }

      if (now - levelUiTickRef.current >= 120) {
        levelUiTickRef.current = now;
        setMicLevel(Math.min(1, rms * 8));
      }
    }, ANALYSIS_INTERVAL_MS);
  }

  async function startMic() {
    if (micActive) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      updateMicStatus("error", "MediaRecorder is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000
        }
      });
      mediaStreamRef.current = stream;

      const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextImpl();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      sampleBufferRef.current = new Float32Array(analyser.fftSize);

      calibratingUntilRef.current = performance.now() + CALIBRATION_MS;
      baselineAccumRef.current = 0;
      baselineCountRef.current = 0;

      if (micResultMode === "clear") {
        setResultText("");
      }

      shouldRecordRef.current = true;
      currentMimeTypeRef.current = pickMimeType();
      startRecorderLoop();
      startSilenceAnalysis();
      updateMicStatus("recording");
    } catch (error) {
      updateMicStatus("error", `Mic permission or setup failed: ${String(error.message || error)}`);
    }
  }

  function stopMic() {
    shouldRecordRef.current = false;
    if (analysisTimerRef.current) {
      window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      updateMicStatus("sending");
    } else {
      finishMicIfIdle();
    }
  }

  function handleMaxChunkSecondsChange(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(120, Math.max(5, parsed));
    setMicMaxChunkSeconds(clamped);
  }

  useEffect(() => {
    return () => {
      shouldRecordRef.current = false;
      if (uploadAbortRef.current) {
        uploadAbortRef.current.abort();
        uploadAbortRef.current = null;
      }
      stopAudioResources();
    };
  }, []);

  useEffect(() => {
    if (!diagOpen) return undefined;
    refreshDiagnosticsHealth();
    const timer = window.setInterval(() => {
      refreshDiagnosticsHealth();
    }, DIAG_HEALTH_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [diagOpen]);

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setUploadStatus("error");
      setResultText("Please choose an audio file.");
      return;
    }

    setSubmitting(true);
    setUploadStatus("uploading...");
    setUploadProgress(0);
    setResultText("");
    setDiagnosticsText("");
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const requestStartedAt = performance.now();

    try {
      setUploadStatus("uploading...");
      let finalText = "";
      let firstEventAt = null;
      let firstSegmentAt = null;
      let decodeMs = null;
      let prepareMs = null;
      let segmentCount = 0;
      let uploadDoneAt = null;
      await transcribeStream({
        file,
        language: language.trim(),
        prompt: prompt.trim(),
        temperature: temperature.trim(),
        signal: controller.signal,
        onUploadProgress: ({ progress }) => {
          setUploadStatus("uploading...");
          if (typeof progress === "number") {
            const bounded = Math.max(0, Math.min(1, progress));
            setUploadProgress(bounded);
          }
        },
        onUploadComplete: () => {
          if (uploadDoneAt === null) uploadDoneAt = performance.now();
          setUploadStatus("preparing...");
          setUploadProgress(1);
        },
        onEvent: (event) => {
          if (!event || typeof event !== "object") return;
          const now = performance.now();
          if (firstEventAt === null) firstEventAt = now;
          if (event.type === "phase") {
            setUploadStatus("preparing...");
            if (typeof event.upload_store_ms === "number") {
              setDiagnosticsText((previous) =>
                renderDiagnostics([previous, `Server upload store: ${formatMs(event.upload_store_ms)}`])
              );
            }
            return;
          }
          if (event.type === "meta") {
            setUploadStatus("transcribing...");
            setUploadProgress(0);
            if (typeof event.prepare_ms === "number") prepareMs = event.prepare_ms;
            return;
          }
          if (event.type === "segment") {
            if (firstSegmentAt === null) firstSegmentAt = now;
            segmentCount += 1;
            if (typeof event.text === "string") {
              finalText = event.text;
              setResultText(event.text);
            }
            if (typeof event.progress === "number") {
              const bounded = Math.max(0, Math.min(1, event.progress));
              setUploadProgress(bounded);
            }
            return;
          }
          if (event.type === "done") {
            if (typeof event.duration_ms === "number") decodeMs = event.duration_ms;
            if (typeof event.text === "string") {
              finalText = event.text;
            }
            setUploadProgress(1);
          }
        }
      });
      const finishedAt = performance.now();
      setResultText(finalText);
      setUploadStatus("done");
      setDiagnosticsText(
        renderDiagnostics([
          "Mode: File upload stream",
          `File size: ${formatBytes(file.size)}`,
          `Total: ${formatMs(finishedAt - requestStartedAt)}`,
          uploadDoneAt !== null
            ? `Upload: ${formatMs(uploadDoneAt - requestStartedAt)}`
            : "",
          firstEventAt !== null
            ? `First server event: ${formatMs(firstEventAt - requestStartedAt)}`
            : "",
          firstSegmentAt !== null
            ? `First transcript text: ${formatMs(firstSegmentAt - requestStartedAt)}`
            : "",
          decodeMs !== null ? `Decode: ${formatMs(decodeMs)}` : "",
          prepareMs !== null ? `Prepare: ${formatMs(prepareMs)}` : "",
          uploadDoneAt !== null && firstEventAt !== null
            ? `Post-upload gap: ${formatMs(firstEventAt - uploadDoneAt)}`
            : "",
          `Segments: ${segmentCount}`
        ])
      );
    } catch (error) {
      const statusLabel = error && error.name === "AbortError" ? "cancelled" : "error";
      if (error && error.name === "AbortError") {
        setUploadStatus("cancelled");
        setUploadProgress(null);
        setResultText("Transcription cancelled.");
      } else {
        setUploadStatus("error");
        setUploadProgress(null);
        setResultText(String(error.message || error));
      }
      setDiagnosticsText(
        renderDiagnostics([
          "Mode: File upload stream",
          `File size: ${formatBytes(file.size)}`,
          `Status: ${statusLabel}`,
          `Error: ${String(error.message || error)}`
        ])
      );
    } finally {
      uploadAbortRef.current = null;
      setSubmitting(false);
    }
  }

  function handleCancelSubmit() {
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
    }
  }

  async function handleCopy() {
    if (!canUseResult) return;
    await navigator.clipboard.writeText(resultText);
  }

  function handleDownloadText() {
    if (!canUseResult) return;
    download("transcript.txt", resultText, "text/plain");
  }

  function handleClear() {
    setUploadStatus("idle");
    setUploadProgress(null);
    setDiagnosticsText("");
    setResultText("");
  }

  return (
    <main className="wrap">
      <header className="top-bar">
        <h1>Local Transcription</h1>
      </header>

      <section className="card">
        <div className="tabs" role="tablist" aria-label="Input mode">
          <button
            type="button"
            id="tab-upload"
            role="tab"
            className={`tab ${activeTab === "upload" ? "active" : ""}`}
            aria-selected={activeTab === "upload"}
            aria-controls="panel-upload"
            disabled={tabsLocked}
            onClick={() => {
              if (!tabsLocked) setActiveTab("upload");
            }}
          >
            File Upload
          </button>
          <button
            type="button"
            id="tab-mic"
            role="tab"
            className={`tab ${activeTab === "mic" ? "active" : ""}`}
            aria-selected={activeTab === "mic"}
            aria-controls="panel-mic"
            disabled={tabsLocked}
            onClick={() => {
              if (!tabsLocked) setActiveTab("mic");
            }}
          >
            Microphone
          </button>
        </div>

        <section
          id="panel-upload"
          className={`tab-panel ${activeTab === "upload" ? "" : "hidden"}`}
          role="tabpanel"
          aria-labelledby="tab-upload"
          hidden={activeTab !== "upload"}
        >
          <TranscribeForm
            language={language}
            prompt={prompt}
            temperature={temperature}
            submitting={submitting}
            status={uploadStatus}
            onLanguageChange={setLanguage}
            onPromptChange={setPrompt}
            onTemperatureChange={setTemperature}
            canCancel={submitting}
            progress={uploadProgress}
            progressMode={progressMode}
            onCancel={handleCancelSubmit}
            onSubmit={handleSubmit}
          />
        </section>

        <section
          id="panel-mic"
          className={`tab-panel ${activeTab === "mic" ? "" : "hidden"}`}
          role="tabpanel"
          aria-labelledby="tab-mic"
          hidden={activeTab !== "mic"}
        >
          <MicRecorderPanel
            language={language}
            prompt={prompt}
            temperature={temperature}
            micStatus={micStatus}
            micError={micError}
            micLevel={micLevel}
            micThreshold={micThreshold}
            micSensitivity={micSensitivity}
            micMaxChunkSeconds={micMaxChunkSeconds}
            micResultMode={micResultMode}
            useRollingPrompt={useRollingPrompt}
            isActive={micActive}
            onLanguageChange={setLanguage}
            onPromptChange={setPrompt}
            onTemperatureChange={setTemperature}
            onSensitivityChange={(value) => setMicSensitivity(Number(value))}
            onMaxChunkSecondsChange={handleMaxChunkSecondsChange}
            onResultModeChange={setMicResultMode}
            onUseRollingPromptChange={setUseRollingPrompt}
            onStart={startMic}
            onStop={stopMic}
          />
        </section>
      </section>

      <ResultPanel
        resultText={resultText}
        canUseResult={canUseResult}
        diagnostics={renderDiagnostics([diagnosticsText, diagHealthText])}
        onDiagnosticsOpenChange={setDiagOpen}
        onCopy={handleCopy}
        onDownloadText={handleDownloadText}
        onClear={handleClear}
      />
    </main>
  );
}
