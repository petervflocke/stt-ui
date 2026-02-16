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

export async function warmupModel() {
  const response = await fetch("/api/warmup", { method: "POST" });
  const text = await response.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(json ? JSON.stringify(json) : text || "Model warmup failed");
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
  onUploadProgress,
  onUploadComplete,
  onEvent
}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    if (language) formData.append("language", language);
    if (prompt) formData.append("prompt", prompt);
    if (temperature) formData.append("temperature", temperature);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/transcribe/stream", true);

    let readOffset = 0;
    let buffer = "";
    let settled = false;

    function finishWithError(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function parseResponseChunk() {
      const chunk = xhr.responseText.slice(readOffset);
      if (!chunk) return;
      readOffset = xhr.responseText.length;
      buffer += chunk;

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

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      if (onUploadProgress) {
        onUploadProgress({
          loaded: event.loaded,
          total: event.total,
          progress: event.total > 0 ? event.loaded / event.total : 0
        });
      }
    };
    xhr.upload.onload = () => {
      if (onUploadComplete) onUploadComplete();
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
        parseResponseChunk();
      }
      if (xhr.readyState !== XMLHttpRequest.DONE || settled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim());
            if (onEvent) onEvent(event);
          } catch {
            // ignore malformed tail
          }
        }
        settled = true;
        resolve();
        return;
      }
      finishWithError(new Error(xhr.responseText || "Transcription stream failed"));
    };

    xhr.onerror = () => {
      finishWithError(new Error("Network error during streaming transcription"));
    };
    xhr.onabort = () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      finishWithError(error);
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
    }

    xhr.send(formData);
  });
}
