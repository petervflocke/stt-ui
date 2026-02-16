import { useEffect, useState } from "react";

export default function ResultPanel({
  resultText,
  canUseResult,
  diagnostics,
  onDiagnosticsOpenChange,
  onCopy,
  onDownloadText,
  onClear
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (onDiagnosticsOpenChange) onDiagnosticsOpenChange(open);
  }, [open, onDiagnosticsOpenChange]);

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
          <button type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      <button
        type="button"
        className="diag-toggle"
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? "v Diagnostics" : "> Diagnostics"}
      </button>
      {open ? (
        <pre className="diag-box">{diagnostics || "No diagnostics yet."}</pre>
      ) : null}

      <pre className="out">{resultText}</pre>
    </section>
  );
}
