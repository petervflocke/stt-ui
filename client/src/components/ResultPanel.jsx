export default function ResultPanel({
  resultText,
  canUseResult,
  onCopy,
  onDownloadText,
  onDownloadJson,
  onClear
}) {
  return (
    <section className="card">
      <div className="row space">
        <h2>Result</h2>
        <div className="row">
          <button type="button" onClick={onCopy} disabled={!canUseResult}>
            Copy
          </button>
          <button type="button" onClick={onDownloadText} disabled={!canUseResult}>
            Download .txt
          </button>
          <button type="button" onClick={onDownloadJson} disabled={!canUseResult}>
            Download .json
          </button>
          <button type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      <pre className="out">{resultText}</pre>
    </section>
  );
}
