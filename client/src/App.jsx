import { useEffect, useMemo, useRef, useState } from "react";
import HealthCheck from "./components/HealthCheck.jsx";
import MicRecorderPanel from "./components/MicRecorderPanel.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import TranscribeForm from "./components/TranscribeForm.jsx";
import { fetchHealth, transcribe } from "./api.js";

const ANALYSIS_INTERVAL_MS = 30;
const CALIBRATION_MS = 1200;
const SILENCE_TRIGGER_MS = 700;
const MIN_CHUNK_MS = 1500;
const FINAL_MIN_CHUNK_MS = 200;
const MIN_VOICE_ACTIVITY_MS = 180;
const MIN_PEAK_RMS = 0.012;

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

export default function App() {
  const [activeTab, setActiveTab] = useState("upload");
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [temperature, setTemperature] = useState("0.0");

  const [healthLoading, setHealthLoading] = useState(false);
  const [healthOutput, setHealthOutput] = useState("");

  const [uploadStatus, setUploadStatus] = useState("idle");
  const [submitting, setSubmitting] = useState(false);
  const [resultText, setResultText] = useState("");

  const [micStatus, setMicStatus] = useState("idle");
  const [micError, setMicError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [micThreshold, setMicThreshold] = useState(0.02);
  const [micSensitivity, setMicSensitivity] = useState(0.02);
  const [micMaxChunkSeconds, setMicMaxChunkSeconds] = useState(12);
  const [micResultMode, setMicResultMode] = useState("clear");
  const [useRollingPrompt, setUseRollingPrompt] = useState(true);

  const canUseResult = useMemo(() => resultText.trim().length > 0, [resultText]);
  const micActive = micStatus === "recording" || micStatus === "sending";

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
  const levelUiTickRef = useRef(0);
  const resultTextRef = useRef("");
  const languageRef = useRef("");
  const promptRef = useRef("");
  const temperatureRef = useRef("0.0");
  const sensitivityRef = useRef(0.02);
  const thresholdRef = useRef(0.02);
  const rollingPromptRef = useRef(true);
  const maxChunkMsRef = useRef(12_000);
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
        const response = await transcribe({
          file,
          language: languageRef.current.trim(),
          prompt: rollingPrompt(),
          temperature: temperatureRef.current.trim()
        });
        const text = extractTranscriptText(response);
        if (text) {
          setResultText((previous) => (previous ? `${previous} ${text}` : text));
        }
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
      stopAudioResources();
    };
  }, []);

  async function handleCheckHealth() {
    setHealthLoading(true);
    setHealthOutput("checking...");
    try {
      const health = await fetchHealth();
      if (health && health.model) {
        setHealthOutput(
          `ok (${health.model}, ${health.device || "n/a"}, ${health.compute_type || "n/a"})`
        );
      } else {
        setHealthOutput("ok");
      }
    } catch {
      setHealthOutput("error");
    } finally {
      setHealthLoading(false);
    }
  }

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
    setResultText("");

    try {
      setUploadStatus("processing...");
      const response = await transcribe({
        file,
        language: language.trim(),
        prompt: prompt.trim(),
        temperature: temperature.trim()
      });
      const text = extractTranscriptText(response);
      setResultText(text);
      setUploadStatus("done");
    } catch (error) {
      setUploadStatus("error");
      setResultText(String(error.message || error));
    } finally {
      setSubmitting(false);
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
    setResultText("");
  }

  return (
    <main className="wrap">
      <h1>Local Transcription</h1>

      <section className="card">
        <HealthCheck loading={healthLoading} output={healthOutput} onCheck={handleCheckHealth} />

        <div className="tabs" role="tablist" aria-label="Input mode">
          <button
            type="button"
            role="tab"
            className={`tab ${activeTab === "upload" ? "active" : ""}`}
            aria-selected={activeTab === "upload"}
            onClick={() => setActiveTab("upload")}
          >
            File Upload
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${activeTab === "mic" ? "active" : ""}`}
            aria-selected={activeTab === "mic"}
            onClick={() => setActiveTab("mic")}
          >
            Microphone
          </button>
        </div>

        <section
          className="tab-panel"
          role="tabpanel"
          aria-label={activeTab === "upload" ? "File upload panel" : "Microphone panel"}
        >
          {activeTab === "upload" ? (
            <TranscribeForm
              language={language}
              prompt={prompt}
              temperature={temperature}
              submitting={submitting}
              status={uploadStatus}
              onLanguageChange={setLanguage}
              onPromptChange={setPrompt}
              onTemperatureChange={setTemperature}
              onSubmit={handleSubmit}
            />
          ) : (
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
          )}
        </section>
      </section>

      <ResultPanel
        resultText={resultText}
        canUseResult={canUseResult}
        onCopy={handleCopy}
        onDownloadText={handleDownloadText}
        onClear={handleClear}
      />
    </main>
  );
}
