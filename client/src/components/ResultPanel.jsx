import { useEffect, useRef, useState } from "react";

export default function ResultPanel({
  resultText,
  canUseResult,
  diagnostics,
  onDiagnosticsOpenChange,
  onCopy,
  onDownloadText,
  onCopyDiagnostics,
  onClear
}) {
  const [open, setOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const outRef = useRef(null);

  useEffect(() => {
    if (onDiagnosticsOpenChange) onDiagnosticsOpenChange(open);
  }, [open, onDiagnosticsOpenChange]);

  useEffect(() => {
    if (!autoScroll) return;
    if (!outRef.current) return;
    outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [resultText, autoScroll]);

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
        <>
          <div className="diag-toolbar">
            <label className="check small diag-check">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(event) => setAutoScroll(event.target.checked)}
              />
              <span>Auto-scroll result</span>
            </label>
          </div>
          <div className="diag-box-wrap">
            <button
              type="button"
              className="btn-icon diag-copy-floating"
              onClick={onCopyDiagnostics}
              aria-label="Copy diagnostics"
              title="Copy diagnostics"
            >
              ⧉
            </button>
            <pre className="diag-box">{diagnostics || "No diagnostics yet."}</pre>
          </div>
        </>
      ) : null}

      <pre
        className="out"
        ref={(element) => {
          outRef.current = element;
        }}
      >
        {resultText}
      </pre>
    </section>
  );
}
