const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
const init = {
  method: input.method,
  headers: input.headers ?? {}
};

if (input.payload !== null && input.payload !== undefined) {
  init.body = JSON.stringify(input.payload);
}

try {
  const response = await fetch(input.url, init);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  process.stdout.write(JSON.stringify({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body
  }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
