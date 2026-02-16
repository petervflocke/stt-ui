export default function MicRecorderPanel({
  language,
  prompt,
  temperature,
  micStatus,
  micError,
  micLevel,
  micThreshold,
  micSensitivity,
  micMaxChunkSeconds,
  micResultMode,
  useRollingPrompt,
  isActive,
  onLanguageChange,
  onPromptChange,
  onTemperatureChange,
  onSensitivityChange,
  onMaxChunkSecondsChange,
  onResultModeChange,
  onUseRollingPromptChange,
  onStart,
  onStop
}) {
  return (
    <div>
      <div className="row">
        <button type="button" onClick={isActive ? onStop : onStart}>
          {isActive ? "Stop recording" : "Start recording"}
        </button>
        <span className="muted">Mic status: {micStatus}</span>
      </div>

      {micError ? <p className="error">{micError}</p> : null}

      <div className="grid mic-controls-row">
        <div>
          <label className="label" htmlFor="max-chunk-seconds">
            Max chunk length without silence (seconds)
          </label>
          <input
            id="max-chunk-seconds"
            type="number"
            min="5"
            max="120"
            step="1"
            value={micMaxChunkSeconds}
            disabled={isActive}
            onChange={(event) => onMaxChunkSecondsChange(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="sensitivity">
            Sensitivity margin ({micSensitivity.toFixed(3)})
          </label>
          <input
            id="sensitivity"
            type="range"
            min="0.005"
            max="0.08"
            step="0.001"
            value={micSensitivity}
            disabled={isActive}
            onChange={(event) => onSensitivityChange(event.target.value)}
          />
        </div>
      </div>

      <div className="level-wrap">
        <div className="level-label muted">
          level {(micLevel * 100).toFixed(0)}% | threshold {(micThreshold * 100).toFixed(1)}%
        </div>
        <div className="level-bar">
          <div className="level-fill" style={{ width: `${Math.max(2, micLevel * 100)}%` }} />
        </div>
      </div>

      <div className="grid">
        <div>
          <label className="label" htmlFor="language-mic">
            Language (optional)
          </label>
          <input
            id="language-mic"
            name="language-mic"
            placeholder="de, en, pl"
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="temperature-mic">
            Temperature (optional)
          </label>
          <input
            id="temperature-mic"
            name="temperature-mic"
            placeholder="leave empty for model default"
            value={temperature}
            onChange={(event) => onTemperatureChange(event.target.value)}
          />
        </div>
      </div>

      <label className="label" htmlFor="prompt-mic">
        Prompt (optional)
      </label>
      <textarea
        id="prompt-mic"
        name="prompt-mic"
        rows="3"
        placeholder="Context, names, topic..."
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
      />

      <div className="grid">
        <div>
          <label className="label" htmlFor="result-mode">
            On mic start
          </label>
          <select
            id="result-mode"
            disabled={isActive}
            value={micResultMode}
            onChange={(event) => onResultModeChange(event.target.value)}
          >
            <option value="clear">Clear result</option>
            <option value="append">Append to result</option>
          </select>
        </div>
        <div />
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={useRollingPrompt}
          disabled={isActive}
          onChange={(event) => onUseRollingPromptChange(event.target.checked)}
        />
        <span>Use rolling prompt continuity (last 300 chars)</span>
      </label>
    </div>
  );
}
