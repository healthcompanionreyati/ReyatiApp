param(
  [string]$Database = "reyati-production",
  [string]$Bucket = "reyati-production-documents",
  [string]$Config = "wrangler.production.jsonc"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$workRoot = Join-Path $repoRoot "work\recovery-validation"
$expectedBucket = "reyati-production-documents"

if ($Bucket -ne $expectedBucket) {
  throw "Refusing to run against unexpected bucket '$Bucket'."
}

New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
$runId = [Guid]::NewGuid().ToString("N")
$objectKey = "recovery-smoke/$runId.txt"
$objectPath = "$Bucket/$objectKey"
$sourcePath = Join-Path $workRoot "$runId.source.txt"
$downloadPath = Join-Path $workRoot "$runId.downloaded.txt"
$schemaPath = Join-Path $workRoot "$runId.schema.sql"
$localConfigPath = Join-Path $workRoot "$runId.wrangler.jsonc"
$statePath = Join-Path $workRoot "$runId.state"
$uploaded = $false

if ($objectKey -notmatch '^recovery-smoke/[a-f0-9]{32}\.txt$') {
  throw "Generated R2 key is outside the permitted recovery-smoke prefix."
}

Set-Content -LiteralPath $sourcePath -Encoding utf8 -Value @(
  "Qivaya R2 recovery validation",
  "Synthetic artifact only; contains no customer or patient data.",
  "Marker: $runId"
)

$localConfig = @{
  name = "qivaya-recovery-rehearsal-local"
  compatibility_date = (Get-Date).ToString("yyyy-MM-dd")
  d1_databases = @(@{
    binding = "DB"
    database_name = "qivaya-recovery-rehearsal-local"
    database_id = "11111111-1111-4111-8111-111111111111"
  })
} | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $localConfigPath -Encoding utf8 -Value $localConfig

Push-Location $repoRoot
try {
  npx wrangler d1 info $Database --config $Config --json
  if ($LASTEXITCODE -ne 0) { throw "D1 info failed." }

  npx wrangler d1 time-travel info $Database --config $Config --json
  if ($LASTEXITCODE -ne 0) { throw "D1 Time Travel bookmark retrieval failed." }

  npx wrangler d1 migrations list $Database --remote --config $Config
  if ($LASTEXITCODE -ne 0) { throw "D1 migration check failed." }

  npx wrangler d1 export $Database --remote --config $Config --output $schemaPath --no-data --skip-confirmation
  if ($LASTEXITCODE -ne 0) { throw "D1 schema export failed." }
  if ((Select-String -LiteralPath $schemaPath -Pattern '^INSERT INTO ' -CaseSensitive).Count -ne 0) {
    throw "Schema export unexpectedly contains data statements."
  }

  npx wrangler d1 execute DB --local --config $localConfigPath --persist-to $statePath --file $schemaPath --yes
  if ($LASTEXITCODE -ne 0) { throw "Isolated schema restore failed." }

  npx wrangler d1 execute DB --local --config $localConfigPath --persist-to $statePath --command "SELECT COUNT(*) AS application_tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'; PRAGMA foreign_key_check;" --json
  if ($LASTEXITCODE -ne 0) { throw "Isolated integrity query failed." }

  npx wrangler r2 object put $objectPath --file $sourcePath --content-type text/plain --remote
  if ($LASTEXITCODE -ne 0) { throw "R2 upload failed." }
  $uploaded = $true

  npx wrangler r2 object get $objectPath --file $downloadPath --remote
  if ($LASTEXITCODE -ne 0) { throw "R2 download failed." }

  $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
  $downloadHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash
  if ($sourceHash -ne $downloadHash) { throw "R2 checksum mismatch." }

  Write-Host "Recovery validation passed."
  Write-Host "Schema SHA-256: $((Get-FileHash -LiteralPath $schemaPath -Algorithm SHA256).Hash)"
  Write-Host "R2 SHA-256: $sourceHash"
}
finally {
  if ($uploaded) {
    npx wrangler r2 object delete $objectPath --remote
    if ($LASTEXITCODE -ne 0) {
      throw "Validation finished, but synthetic R2 cleanup failed for exact key '$objectKey'."
    }
  }
  Pop-Location
}
