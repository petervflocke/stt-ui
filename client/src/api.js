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
  temperature,
  signal
}) {
  const formData = new FormData();
  formData.append("file", file);
  if (language) formData.append("language", language);
  if (prompt) formData.append("prompt", prompt);
  if (temperature) formData.append("temperature", temperature);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
    signal
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

export async function transcribeStream({
  file,
  language,
  prompt,
  temperature,
  signal,
  onEvent
}) {
  const formData = new FormData();
  formData.append("file", file);
  if (language) formData.append("language", language);
  if (prompt) formData.append("prompt", prompt);
  if (temperature) formData.append("temperature", temperature);

  const response = await fetch("/api/transcribe/stream", {
    method: "POST",
    body: formData,
    signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Transcription stream failed");
  }
  if (!response.body) {
    throw new Error("Streaming response body is not available");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const event = JSON.parse(line);
          if (onEvent) onEvent(event);
        } catch {
          // ignore malformed lines
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }
}
