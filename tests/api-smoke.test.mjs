import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 18743;
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // Server has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API server did not become ready");
}

test.before(async () => {
  server = spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      APP_ORIGIN: "http://localhost:5174",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/deepberg",
      AI_INTEGRATIONS_OPENAI_API_KEY: "",
      FINNHUB_API_KEY: "",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer();
});

test.after(() => {
  server?.kill("SIGTERM");
});

test("health endpoint reports optional service state", async () => {
  const response = await fetch(`${baseUrl}/api/healthz`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.services.ai, "disabled");
  assert.equal(body.services.economicCalendar, "disabled");
});

test("unknown API routes remain JSON 404s", async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "API route not found" });
});

test("invalid symbols are rejected before provider calls", async () => {
  const response = await fetch(`${baseUrl}/api/stocks/INVALID!`);
  assert.equal(response.status, 400);
});

test("AI endpoint degrades gracefully without credentials", async () => {
  const response = await fetch(`${baseUrl}/api/ask-deepberg`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "What is the market doing?" }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test("economic calendar degrades gracefully without Finnhub", async () => {
  const response = await fetch(`${baseUrl}/api/economic-calendar`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.deepEqual(body.events, []);
});

test("iv radar route is mounted", async () => {
  const response = await fetch(`${baseUrl}/api/iv-radar?symbols=AAPL`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 1);
  assert.equal(body[0].symbol, "AAPL");
  assert.equal(typeof body[0].currentIV, "number");
});
