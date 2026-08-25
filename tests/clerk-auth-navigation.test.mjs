import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../app", import.meta.url));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

test("browser authentication redirects consistently use the Clerk sign-in route", async () => {
  const files = await sourceFiles(root);
  const failures = [];
  for (const file of files) {
    if (file.endsWith("chatgpt-auth.ts")) continue;
    const source = await readFile(file, "utf8");
    if (/\/signin-with-chatgpt|\/signout-with-chatgpt/.test(source)) failures.push(relative(root, file));
  }
  assert.deepEqual(failures, []);
});
