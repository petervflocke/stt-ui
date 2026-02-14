export async function fetchHealth() {
  const response = await fetch("/api/health");
  const text = await response.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(json ? JSON.stringify(json) : text || "Health check failed");
  }

  return json;
}

export async function transcribe({
  file,
  language,
  prompt,
  temperature
}) {
  const formData = new FormData();
  formData.append("file", file);
  if (language) formData.append("language", language);
  if (prompt) formData.append("prompt", prompt);
  if (temperature) formData.append("temperature", temperature);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData
  });
  const text = await response.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(json ? JSON.stringify(json) : text || "Transcription failed");
  }

  return {
    json,
    raw: text
  };
}
