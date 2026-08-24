param(
  [Parameter(Mandatory = $true)]
  [string]$Database,
  [string]$Config = "wrangler.production.jsonc"
)

$ErrorActionPreference = "Stop"

$productionDatabaseName = "reyati-production"
$productionDatabaseId = "e07e50a2-6b11-4ff9-bc7d-617fb80f3f6c"
$databasePattern = '^qivaya-recovery-rehearsal-[0-9]{14}-[a-f0-9]{8}$'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$configPath = (Resolve-Path -LiteralPath (Join-Path $repoRoot $Config)).Path
$wranglerPath = (Resolve-Path -LiteralPath (Join-Path $repoRoot "node_modules\.bin\wrangler.cmd")).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$runId = [Guid]::NewGuid().ToString("N")
$workRoot = Join-Path $repoRoot "work\hosted-recovery\$runId"
$migrationPath = Join-Path $workRoot "migrations"
$localConfigPath = Join-Path $workRoot "wrangler.local.jsonc"
$remoteConfigPath = Join-Path $workRoot "wrangler.remote.jsonc"
$bootstrapPath = Join-Path $workRoot "bootstrap-admin.sql"
$fixturePath = Join-Path $workRoot "synthetic-pilot.sql"
$backupPath = Join-Path $workRoot "synthetic-recovery-backup.sql"
$evidencePath = Join-Path $workRoot "evidence.json"
$created = $false
$disposed = $false
$remoteDatabaseId = $null
$startedAt = [DateTime]::UtcNow
$restoreStartedAt = $null
$validatedAt = $null
$disposedAt = $null
$counts = $null
$backupHash = $null
$failure = $null

if ($Database -eq $productionDatabaseName -or $Database -notmatch $databasePattern) {
  throw "Refusing unsafe rehearsal target '$Database'. Expected qivaya-recovery-rehearsal-YYYYMMDDhhmmss-xxxxxxxx."
}

function Invoke-Wrangler {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & $wranglerPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    $output | Select-Object -Last 20 | Write-Host
    throw "Wrangler failed: $($Arguments -join ' ')"
  }
}

function Invoke-WranglerJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & $wranglerPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler failed: $($Arguments -join ' ')"
  }
  $text = ($output | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "Wrangler returned no JSON: $($Arguments -join ' ')"
  }
  return $text | ConvertFrom-Json
}

function Get-D1InfoRecord {
  param([Parameter(Mandatory = $true)]$Payload)

  $records = @($Payload)
  if ($records.Count -ne 1) {
    throw "Expected exactly one D1 metadata record; received $($records.Count)."
  }
  return $records[0]
}

function Get-D1QueryRows {
  param([Parameter(Mandatory = $true)]$Payload)

  $envelopes = @($Payload)
  if ($envelopes.Count -lt 1) {
    throw "D1 query returned no result envelope."
  }
  $rows = @()
  foreach ($envelope in $envelopes) {
    if ($null -ne $envelope.results) {
      $rows += @($envelope.results)
    }
  }
  return $rows
}

function Write-Evidence {
  $evidence = [ordered]@{
    schema_version = 1
    data_mode = "synthetic_only"
    target_database = $Database
    target_database_id = $remoteDatabaseId
    production_database = $productionDatabaseName
    production_database_id = $productionDatabaseId
    started_at = $startedAt.ToString("o")
    restore_started_at = if ($null -ne $restoreStartedAt) { $restoreStartedAt.ToString("o") } else { $null }
    validated_at = if ($null -ne $validatedAt) { $validatedAt.ToString("o") } else { $null }
    disposed_at = if ($null -ne $disposedAt) { $disposedAt.ToString("o") } else { $null }
    recovery_time_seconds = if ($null -ne $validatedAt -and $null -ne $restoreStartedAt) { [Math]::Round(($validatedAt - $restoreStartedAt).TotalSeconds, 3) } else { $null }
    recovery_point_loss_records = if ($null -ne $counts) { 0 } else { $null }
    backup_sha256 = $backupHash
    expected_counts = [ordered]@{
      organizations = 1
      providers = 5
      patients = 50
      appointments = 40
      users = 54
      payments = 40
    }
    observed_counts = $counts
    foreign_key_violations = if ($null -ne $counts) { 0 } else { $null }
    unexpected_auth_users = if ($null -ne $counts) { $counts.unexpected_auth_users } else { $null }
    unexpected_emails = if ($null -ne $counts) { $counts.unexpected_emails } else { $null }
    unexpected_payment_states = if ($null -ne $counts) { $counts.unexpected_payment_states } else { $null }
    disposed = $disposed
    failure = $failure
  }
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding utf8
}

New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot "drizzle") -Destination $migrationPath -Recurse

$localConfig = [ordered]@{
  '$schema' = (Join-Path $repoRoot "node_modules\wrangler\config-schema.json")
  name = "qivaya-recovery-source-$runId"
  compatibility_date = "2026-08-14"
  d1_databases = @([ordered]@{
    binding = "DB"
    database_name = "qivaya-recovery-source-$runId"
    database_id = "11111111-1111-4111-8111-111111111111"
    migrations_dir = "./migrations"
  })
}
$localConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $localConfigPath -Encoding utf8

$bootstrapSql = @"
PRAGMA foreign_keys = ON;
INSERT INTO users (id,auth_user_id,email,display_name,preferred_language,status,created_at,updated_at)
VALUES ('qv-recovery-admin','synthetic:recovery:admin','recovery.admin@synthetic.qivaya.invalid','Synthetic Recovery Administrator','en','active',unixepoch('now') * 1000,unixepoch('now') * 1000);
INSERT INTO platform_roles (user_id,role,status,created_at,updated_at)
VALUES ('qv-recovery-admin','platform_admin','active',unixepoch('now') * 1000,unixepoch('now') * 1000);
"@
$bootstrapSql | Set-Content -LiteralPath $bootstrapPath -Encoding utf8

& $nodePath (Join-Path $repoRoot "scripts\generate-production-pilot-seed.mjs") "--output=$fixturePath"
if ($LASTEXITCODE -ne 0) {
  throw "Synthetic recovery fixture generation failed."
}

$fixtureSql = Get-Content -LiteralPath $fixturePath -Raw
@($bootstrapSql, $fixtureSql) | Set-Content -LiteralPath $backupPath -Encoding utf8

$backupText = Get-Content -LiteralPath $backupPath -Raw
if ($backupText -notmatch 'qv-syn-' -or $backupText -notmatch 'synthetic\.qivaya\.invalid' -or $backupText -notmatch 'INSERT OR IGNORE INTO') {
  throw "Synthetic backup does not contain the expected recovery fixture."
}
foreach ($forbidden in @("@gmail.com", "@qivaya.com", $productionDatabaseName, $productionDatabaseId, 'INSERT INTO "d1_migrations"')) {
  if ($backupText -match [Regex]::Escape($forbidden)) {
    throw "Synthetic backup contains forbidden production marker '$forbidden'."
  }
}
$backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash

Push-Location $workRoot
try {
  Invoke-Wrangler @("d1", "migrations", "apply", "DB", "--local", "--config", $localConfigPath)
  Invoke-Wrangler @("d1", "execute", "DB", "--local", "--config", $localConfigPath, "--file", $backupPath, "--yes")
  $localForeignKeyPayload = Invoke-WranglerJson @("d1", "execute", "DB", "--local", "--config", $localConfigPath, "--command", "PRAGMA foreign_key_check;", "--json", "--yes")
  if (@(Get-D1QueryRows $localForeignKeyPayload).Count -ne 0) {
    throw "Synthetic backup failed the isolated local foreign-key check."
  }

  Invoke-Wrangler @("d1", "create", $Database, "--location", "apac", "--config", $configPath)
  $created = $true

  $info = Get-D1InfoRecord (Invoke-WranglerJson @("d1", "info", $Database, "--config", $configPath, "--json"))
  $remoteDatabaseId = [string]$info.uuid
  if ([string]$info.name -ne $Database -or [string]::IsNullOrWhiteSpace($remoteDatabaseId)) {
    throw "Created D1 metadata does not match the requested rehearsal target."
  }
  if ($remoteDatabaseId -eq $productionDatabaseId) {
    throw "Cloudflare resolved the protected production database ID; aborting."
  }

  $remoteConfig = [ordered]@{
    '$schema' = (Join-Path $repoRoot "node_modules\wrangler\config-schema.json")
    name = "qivaya-recovery-target-$runId"
    compatibility_date = "2026-08-14"
    d1_databases = @([ordered]@{
      binding = "DB"
      database_name = $Database
      database_id = $remoteDatabaseId
      migrations_dir = "./migrations"
    })
  }
  $remoteConfig | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $remoteConfigPath -Encoding utf8

  $restoreStartedAt = [DateTime]::UtcNow
  Invoke-Wrangler @("d1", "migrations", "apply", "DB", "--remote", "--config", $remoteConfigPath)
  Invoke-Wrangler @("d1", "execute", "DB", "--remote", "--config", $remoteConfigPath, "--file", $backupPath, "--yes")

  $validationSql = "SELECT (SELECT COUNT(*) FROM organizations WHERE id LIKE 'qv-syn-%') AS organizations, (SELECT COUNT(*) FROM provider_profiles WHERE id LIKE 'qv-syn-provider-%') AS providers, (SELECT COUNT(*) FROM patient_profiles WHERE id LIKE 'qv-syn-patient-%') AS patients, (SELECT COUNT(*) FROM appointments WHERE id LIKE 'qv-syn-appointment-%') AS appointments, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM payment_ledger_entries WHERE id LIKE 'qv-syn-payment-%') AS payments, (SELECT COUNT(*) FROM users WHERE auth_user_id NOT LIKE 'synthetic:%') AS unexpected_auth_users, (SELECT COUNT(*) FROM users WHERE email NOT LIKE '%@synthetic.qivaya.invalid') AS unexpected_emails, (SELECT COUNT(*) FROM payment_ledger_entries WHERE id LIKE 'qv-syn-payment-%' AND status <> 'not_charged') AS unexpected_payment_states;"
  $validationPayload = Invoke-WranglerJson @("d1", "execute", "DB", "--remote", "--config", $remoteConfigPath, "--command", $validationSql, "--json", "--yes")
  $validationRows = @(Get-D1QueryRows $validationPayload)
  if ($validationRows.Count -ne 1) {
    throw "Expected one recovery validation row; received $($validationRows.Count)."
  }
  $counts = $validationRows[0]

  $expected = [ordered]@{ organizations = 1; providers = 5; patients = 50; appointments = 40; users = 54; payments = 40 }
  foreach ($field in $expected.Keys) {
    if ([int64]$counts.$field -ne [int64]$expected[$field]) {
      throw "Recovery validation failed for ${field}: expected $($expected[$field]), observed $($counts.$field)."
    }
  }
  foreach ($field in @("unexpected_auth_users", "unexpected_emails", "unexpected_payment_states")) {
    if ([int64]$counts.$field -ne 0) {
      throw "Recovery isolation validation failed for ${field}: observed $($counts.$field)."
    }
  }

  $foreignKeyPayload = Invoke-WranglerJson @("d1", "execute", "DB", "--remote", "--config", $remoteConfigPath, "--command", "PRAGMA foreign_key_check;", "--json", "--yes")
  $foreignKeyRows = @(Get-D1QueryRows $foreignKeyPayload)
  if ($foreignKeyRows.Count -ne 0) {
    throw "Recovered database has $($foreignKeyRows.Count) foreign-key violation(s)."
  }

  $validatedAt = [DateTime]::UtcNow
  Write-Evidence
  Write-Host "Hosted D1 recovery rehearsal passed."
  Write-Host "Target: $Database ($remoteDatabaseId)"
  Write-Host "Backup SHA-256: $backupHash"
  Write-Host "Recovery time: $([Math]::Round(($validatedAt - $restoreStartedAt).TotalSeconds, 3)) seconds"
}
catch {
  $failure = $_.Exception.Message
  throw
}
finally {
  if ($created) {
    $cleanupInfo = Get-D1InfoRecord (Invoke-WranglerJson @("d1", "info", $Database, "--config", $configPath, "--json"))
    if ([string]$cleanupInfo.name -ne $Database -or [string]$cleanupInfo.uuid -ne $remoteDatabaseId) {
      throw "Cleanup stopped because the exact D1 target could not be re-verified. Manual review required for '$Database'."
    }
    if ([string]$cleanupInfo.uuid -eq $productionDatabaseId -or [string]$cleanupInfo.name -eq $productionDatabaseName) {
      throw "Cleanup stopped at the production database safety boundary."
    }
    Invoke-Wrangler @("d1", "delete", $Database, "--skip-confirmation", "--config", $configPath)
    $disposed = $true
    $disposedAt = [DateTime]::UtcNow
  }
  Write-Evidence
  Pop-Location
}
