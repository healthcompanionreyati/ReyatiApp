import assert from "node:assert/strict";
import test from "node:test";
import { roleJourneys, verifyAuthenticatedJourneys } from "../scripts/verify-authenticated-journeys.mjs";

test("authenticated verifier covers patient, provider, and admin with read-only requests", async () => {
  const observed = [];
  const result = await verifyAuthenticatedJourneys({
    baseUrl: "http://localhost:3000",
    sessions: { patient: "p=secret", provider: "v=secret", admin: "a=secret" },
    fetchImpl: async (url, init) => {
      observed.push({ url: String(url), method: init.method, cookie: init.headers.Cookie });
      const json = String(url).includes("/api/");
      return new Response(json ? "{}" : "<title>Qivaya</title>", {
        status: 200,
        headers: { "Content-Type": json ? "application/json" : "text/html" },
      });
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.summary.rolesPassed, 3);
  assert.equal(result.summary.checks, Object.values(roleJourneys).flat().length);
  assert.equal(observed.every((request) => request.method === "GET"), true);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("authenticated verifier fails closed when a role session is absent", async () => {
  const result = await verifyAuthenticatedJourneys({
    baseUrl: "http://localhost:3000",
    sessions: { patient: "p=secret", provider: "", admin: "a=secret" },
    fetchImpl: async (url) => new Response(String(url).includes("/api/") ? "{}" : "<title>Qivaya</title>", {
      status: 200,
      headers: { "Content-Type": String(url).includes("/api/") ? "application/json" : "text/html" },
    }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.roles.find((role) => role.role === "provider")?.reason, "session_not_configured");
});

test("authenticated verifier reports authorization failures without response bodies", async () => {
  const result = await verifyAuthenticatedJourneys({
    baseUrl: "http://localhost:3000",
    sessions: { patient: "p=secret", provider: "v=secret", admin: "a=secret" },
    fetchImpl: async () => new Response('{"private":"do-not-log"}', { status: 403, headers: { "Content-Type": "application/json" } }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.roles[0].checks[0].reason, "http_403");
  assert.equal(JSON.stringify(result).includes("do-not-log"), false);
});
