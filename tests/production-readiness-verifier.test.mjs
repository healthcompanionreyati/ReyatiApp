import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { verifyProductionReadiness } from "../scripts/verify-production-readiness.mjs";

const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

test("production verifier accepts a healthy branded release and protected sign-in redirect", async (t) => {
  const server = await listen((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { ...securityHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        checks: { application: "ok", database: "ok", pilotData: "ok", providerCatalog: "ok" },
        release: "abc1234",
      }));
      return;
    }
    if (request.url === "/document-capture") {
      response.writeHead(307, { Location: "/sign-in" });
      response.end();
      return;
    }
    response.writeHead(200, { ...securityHeaders, "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Qivaya</title><main>Qivaya connected health</main>");
  });
  t.after(() => server.close());

  const result = await verifyProductionReadiness({ baseUrl: serverUrl(server), expectedRelease: "abc1234", retries: 0 });

  assert.equal(result.passed, true);
  assert.equal(result.release, "abc1234");
  assert.deepEqual(result.summary, { total: 6, passed: 6, failed: 0 });
  assert.equal(result.checks.find((item) => item.name === "protected-document-capture")?.finalUrl, `${serverUrl(server)}/sign-in`);
});

test("production verifier fails closed when security headers are absent", async (t) => {
  const server = await listen((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { ...securityHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        checks: { application: "ok", database: "ok", pilotData: "ok", providerCatalog: "ok" },
        release: "abc1234",
      }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<title>Qivaya</title><main>Page not found</main>");
  });
  t.after(() => server.close());

  const result = await verifyProductionReadiness({ baseUrl: serverUrl(server), retries: 0 });

  assert.equal(result.passed, false);
  assert.equal(result.summary.failed, 5);
  assert.equal(result.checks.find((item) => item.name === "providers")?.reason, "security_header_nosniff_missing");
});

test("production verifier retries transient failures within a fixed bound", async (t) => {
  let requests = 0;
  const server = await listen((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(503, securityHeaders);
      response.end();
      return;
    }
    response.writeHead(200, { ...securityHeaders, "Content-Type": "text/html" });
    response.end("<title>Qivaya</title>");
  });
  t.after(() => server.close());

  const result = await verifyProductionReadiness({
    baseUrl: serverUrl(server),
    checks: [{ name: "home", path: "/", kind: "html" }],
    retries: 1,
  });

  assert.equal(result.passed, true);
  assert.equal(result.checks[0].attempts, 2);
  assert.equal(requests, 2);
});

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function serverUrl(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server is not listening");
  return `http://127.0.0.1:${address.port}`;
}
