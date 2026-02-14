export default function TranscribeForm({
  language,
  prompt,
  temperature,
  submitting,
  status,
  onLanguageChange,
  onPromptChange,
  onTemperatureChange,
  onSubmit
}) {
  return (
    <form onSubmit={onSubmit}>
      <label className="label" htmlFor="file">
        Audio file
      </label>
      <input id="file" name="file" type="file" accept="audio/*" required />

      <div className="grid">
        <div>
          <label className="label" htmlFor="language">
            Language (optional)
          </label>
          <input
            id="language"
            name="language"
            placeholder="de, en, pl"
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="temperature">
            Temperature
          </label>
          <input
            id="temperature"
            name="temperature"
            value={temperature}
            onChange={(event) => onTemperatureChange(event.target.value)}
          />
        </div>
      </div>

      <label className="label" htmlFor="prompt">
        Prompt (optional)
      </label>
      <textarea
        id="prompt"
        name="prompt"
        rows="3"
        placeholder="Context, names, topic..."
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
      />

      <div className="row">
        <button type="submit" disabled={submitting}>
          {submitting ? "Transcribing..." : "Transcribe"}
        </button>
        <span className="muted">{status}</span>
      </div>
    </form>
  );
}
