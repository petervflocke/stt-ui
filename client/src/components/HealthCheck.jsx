export default function HealthCheck({ loading, output, onCheck }) {
  return (
    <div className="row">
      <button type="button" onClick={onCheck} disabled={loading}>
        {loading ? "Checking..." : "Check backend"}
      </button>
      <span className="muted">{output}</span>
    </div>
  );
}
