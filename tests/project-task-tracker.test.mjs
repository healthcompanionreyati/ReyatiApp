import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tracker = readFileSync(new URL("../docs/PROJECT_TASK_TRACKER.md", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("the repository has one persistent task tracker linked from the README", () => {
  assert.match(readme, /^# Qivaya/m);
  assert.match(readme, /docs\/PROJECT_TASK_TRACKER\.md/);
  assert.match(tracker, /^# Qivaya delivery task tracker/m);
});

test("the task tracker uses stable statuses and has exactly one active batch", () => {
  for (const status of ["DONE", "IN PROGRESS", "NEXT", "BLOCKED", "DEFERRED"]) {
    assert.match(tracker, new RegExp(`\\b${status}\\b`));
  }
  const activeTasks = tracker.match(/^- \[ \] \*\*IN PROGRESS — QV-[A-Z]+-\d+:/gm) ?? [];
  assert.equal(activeTasks.length, 1);
});

test("external activation work remains visibly blocked", () => {
  for (const task of ["QV-PILOT-01", "QV-PAY-01", "QV-DOC-03", "QV-OPS-02", "QV-CLIN-01"]) {
    assert.match(tracker, new RegExp(`BLOCKED — ${task}:`));
  }
});
