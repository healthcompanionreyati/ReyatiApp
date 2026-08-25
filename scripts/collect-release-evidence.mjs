import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyProductionReadiness } from "./verify-production-readiness.mjs";

const DEFAULT_MIGRATIONS_DIRECTORY = resolve(process.cwd(), "drizzle");

export async function collectReleaseEvidence(options = {}) {
  const expectedRelease = options.expectedRelease ?? process.env.QIVAYA_EXPECTED_RELEASE ?? "";
  const buildVerified = options.buildVerified ?? parseBoolean(process.env.QIVAYA_BUILD_VERIFIED);
  const runtimeErrorCount = options.runtimeErrorCount ?? parseCount(process.env.QIVAYA_RUNTIME_ERROR_COUNT);
  const migrationCount = options.migrationCount ?? await countSqlFiles(options.migrationsDirectory ?? DEFAULT_MIGRATIONS_DIRECTORY);
  const readiness = options.readiness ?? await verifyProductionReadiness({
    baseUrl: options.baseUrl,
    expectedRelease,
    fetchImpl: options.fetchImpl,
    retries: options.retries,
    timeoutMs: options.timeoutMs,
  });

  const controls = {
    expectedReleaseProvided: expectedRelease.length > 0,
    buildVerified: buildVerified === true,
    migrationsPresent: migrationCount > 0,
    runtimeErrorScanProvided: runtimeErrorCount !== null,
    runtimeErrorsClear: runtimeErrorCount === 0,
    productionReadinessPassed: readiness.passed === true,
  };

  return {
    schemaVersion: 1,
    evidenceType: "qivaya-production-release",
    checkedAt: new Date().toISOString(),
    passed: Object.values(controls).every(Boolean),
    release: readiness.release,
    expectedRelease: expectedRelease || null,
    baseUrl: readiness.baseUrl,
    build: { verified: buildVerified === true },
    database: { expandOnlyMigrationFiles: migrationCount },
    runtime: { errorCount: runtimeErrorCount, scanProvided: runtimeErrorCount !== null },
    controls,
    production: readiness,
  };
}

async function countSqlFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) count += await countSqlFiles(path);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".sql") count += 1;
  }
  return count;
}

function parseBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function parseCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

async function main() {
  const result = await collectReleaseEvidence();
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const outputFile = process.env.QIVAYA_EVIDENCE_FILE;
  if (outputFile) {
    if (extname(outputFile).toLowerCase() !== ".json") throw new Error("QIVAYA_EVIDENCE_FILE must end in .json");
    const absolutePath = resolve(process.cwd(), outputFile);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, serialized, "utf8");
  }
  console.log(serialized.trim());
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
