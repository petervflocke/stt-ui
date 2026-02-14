import { useMemo, useState } from "react";
import HealthCheck from "./components/HealthCheck.jsx";
import ResultPanel from "./components/ResultPanel.jsx";
import TranscribeForm from "./components/TranscribeForm.jsx";
import { fetchHealth, transcribe } from "./api.js";

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

export default function App() {
  const [language, setLanguage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [temperature, setTemperature] = useState("0.0");

  const [healthLoading, setHealthLoading] = useState(false);
  const [healthOutput, setHealthOutput] = useState("");

  const [status, setStatus] = useState("idle");
  const [submitting, setSubmitting] = useState(false);
  const [resultText, setResultText] = useState("");
  const [resultJson, setResultJson] = useState(null);

  const canUseResult = useMemo(() => resultText.trim().length > 0, [resultText]);

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
      setStatus("error");
      setResultText("Please choose an audio file.");
      setResultJson(null);
      return;
    }

    setSubmitting(true);
    setStatus("uploading...");
    setResultText("");
    setResultJson(null);

    try {
      setStatus("processing...");
      const response = await transcribe({
        file,
        language: language.trim(),
        prompt: prompt.trim(),
        temperature: temperature.trim()
      });
      const text = response.json?.text || response.raw;
      setResultJson(response.json);
      setResultText(text);
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setResultText(String(error.message || error));
      setResultJson(null);
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

  function handleDownloadJson() {
    download("transcript.json", JSON.stringify(resultJson || {}, null, 2), "application/json");
  }

  function handleClear() {
    setStatus("idle");
    setResultText("");
    setResultJson(null);
  }

  return (
    <main className="wrap">
      <h1>Local Transcription</h1>

      <section className="card">
        <HealthCheck loading={healthLoading} output={healthOutput} onCheck={handleCheckHealth} />
        <TranscribeForm
          language={language}
          prompt={prompt}
          temperature={temperature}
          submitting={submitting}
          status={status}
          onLanguageChange={setLanguage}
          onPromptChange={setPrompt}
          onTemperatureChange={setTemperature}
          onSubmit={handleSubmit}
        />
      </section>

      <ResultPanel
        resultText={resultText}
        canUseResult={canUseResult}
        onCopy={handleCopy}
        onDownloadText={handleDownloadText}
        onDownloadJson={handleDownloadJson}
        onClear={handleClear}
      />

      <p className="muted small">Mic mode will be added in step 2.</p>
    </main>
  );
}
