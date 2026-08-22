import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../db/d1-rest.ts", import.meta.url), "utf8");

test("D1 REST binds SQLite-compatible boolean parameters", () => {
  assert.match(source, /typeof value === "boolean" \? Number\(value\) : value/);
  assert.match(source, /params\.map\(normalizeD1Parameter\)/);
});

test("D1 REST preserves non-boolean values", () => {
  assert.match(source, /: value;/);
  assert.doesNotMatch(source, /JSON\.stringify\(value\)/);
});

test("D1 REST uses ordered raw rows for Drizzle result mapping", () => {
  assert.match(source, /\/d1\/database\/\$\{encodeURIComponent\(databaseId\)\}\/raw/);
  assert.match(source, /return this\.database\.executeRaw/);
  assert.match(source, /rows\?: unknown\[\]\[\]/);
  assert.match(source, /results\?\.rows \?\? \[\]/);
  assert.doesNotMatch(source, /Object\.values\(row\)/);
});
