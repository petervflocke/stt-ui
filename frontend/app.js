const el = (id) => document.getElementById(id);

let lastJson = null;

function setStatus(msg) {
  el("status").textContent = msg || "";
}

function enableResultButtons(on) {
  el("copy").disabled = !on;
  el("downloadTxt").disabled = !on;
  el("downloadJson").disabled = !on;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

el("checkHealth").addEventListener("click", async () => {
  el("healthOut").textContent = "checking...";
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    el("healthOut").textContent = r.ok ? `ok (${j.model}, ${j.device}, ${j.compute_type})` : "error";
  } catch (e) {
    el("healthOut").textContent = "error";
  }
});

el("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  setStatus("uploading...");
  enableResultButtons(false);
  el("out").textContent = "";
  lastJson = null;

  const f = el("file").files[0];
  if (!f) return;

  const fd = new FormData();
  fd.append("file", f);

  const language = el("language").value.trim();
  const prompt = el("prompt").value.trim();
  const temperature = el("temperature").value.trim();

  if (language) fd.append("language", language);
  if (prompt) fd.append("prompt", prompt);
  if (temperature) fd.append("temperature", temperature);

  try {
    const r = await fetch("/api/transcribe", { method: "POST", body: fd });
    const txt = await r.text();

    let j = null;
    try { j = JSON.parse(txt); } catch {}

    if (!r.ok) {
      setStatus("error");
      el("out").textContent = j ? JSON.stringify(j, null, 2) : txt;
      return;
    }

    lastJson = j;
    const outText = (j && j.text) ? j.text : txt;
    el("out").textContent = outText;
    setStatus("done");
    enableResultButtons(true);
  } catch (e) {
    setStatus("error");
    el("out").textContent = String(e);
  }
});

el("copy").addEventListener("click", async () => {
  const text = el("out").textContent || "";
  await navigator.clipboard.writeText(text);
});

el("downloadTxt").addEventListener("click", () => {
  const text = el("out").textContent || "";
  download("transcript.txt", text, "text/plain");
});

el("downloadJson").addEventListener("click", () => {
  download("transcript.json", JSON.stringify(lastJson || {}, null, 2), "application/json");
});
