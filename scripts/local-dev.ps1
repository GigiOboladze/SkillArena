# Helper for start-local-windows.cmd (SkillArena local development on Windows).
#   -Action stop   : stop every Node process that belongs to this project (old dev
#                    server, its file watcher and helper workers, a running test
#                    suite, and a stuck "prisma dev" database), so nothing keeps the
#                    Prisma engine file locked or the database port busy.
#   -Action waitdb : wait until "prisma dev" reports that the database is running
#                    (read from prisma-dev.log) AND the port accepts connections.
#                    Exit 0 = ready, 2 = prisma dev reported an error, 1 = timeout.
#   -Action dburl  : print DATABASE_URL from .env with connection settings tuned
#                    for "prisma dev" (small pool; wait for a connection instead of
#                    failing with P1001 while it is busy). Only localhost URLs are
#                    tuned; anything else is printed unchanged. .env is not edited.
param(
  [ValidateSet("stop", "waitdb", "dburl", "applylocal")] [string]$Action,
  [int]$Port = 51214,
  [int]$TimeoutSeconds = 120
)

$project = Split-Path -Parent $PSScriptRoot

if ($Action -eq "stop") {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $cmd = $_.CommandLine
    $cmd -and (
      $cmd -like "*$project*" -or
      ($cmd -like "*@prisma*" -and $cmd -like "*dev*")
    )
  }
  if (-not $procs) { Write-Output "No old SkillArena processes were running." }
  foreach ($p in $procs) {
    $short = $p.CommandLine.Substring(0, [Math]::Min(150, $p.CommandLine.Length))
    Write-Output ("Stopping PID {0}: {1}" -f $p.ProcessId, $short)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  exit 0
}

if ($Action -eq "applylocal") {
  # Local databases created without migration history can't take
  # "migrate deploy" (P3005). Migrations marked "@local-idempotent" are safe
  # to run more than once, so apply those directly.
  $failed = $false
  Get-ChildItem (Join-Path $project "prisma\migrations") -Directory | Sort-Object Name | ForEach-Object {
    $file = Join-Path $_.FullName "migration.sql"
    if ((Test-Path $file) -and (Select-String -Path $file -Pattern "@local-idempotent" -Quiet)) {
      Write-Output "applying $($_.Name)"
      & npx prisma db execute --file $file --schema (Join-Path $project "prisma\schema.prisma")
      if ($LASTEXITCODE -ne 0) { $failed = $true }
    }
  }
  if ($failed) { exit 1 } else { exit 0 }
}

if ($Action -eq "dburl") {
  $envFile = Join-Path $project ".env"
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $line) { exit 1 }
  $url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
  if ($url -notmatch '@(localhost|127\.0\.0\.1):') { Write-Output $url; exit 0 }
  $parts = $url.Split('?', 2)
  $params = [ordered]@{}
  if ($parts.Length -gt 1) {
    foreach ($pair in $parts[1].Split('&')) {
      $kv = $pair.Split('=', 2)
      if ($kv[0]) { $params[$kv[0]] = $(if ($kv.Length -gt 1) { $kv[1] } else { "" }) }
    }
  }
  $params['connection_limit'] = '5'
  $params['connect_timeout'] = '0'
  $params['pool_timeout'] = '0'
  if (-not $params.Contains('sslmode')) { $params['sslmode'] = 'disable' }
  if (-not $params.Contains('pgbouncer')) { $params['pgbouncer'] = 'true' }
  $query = ($params.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value }) -join '&'
  Write-Output ($parts[0] + '?' + $query)
  exit 0
}

if ($Action -eq "waitdb") {
  $log = Join-Path $project "prisma-dev.log"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $text = ""
    try { $text = Get-Content -Raw -ErrorAction Stop $log } catch { continue }
    if ($text -match "is now running") {
      try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("127.0.0.1", $Port)
        $client.Close()
        Write-Output "Database is running and accepting connections on port $Port."
        exit 0
      } catch { continue }
    }
    if ($text -match "Lock file is already being held" -or $text -match "ERROR") {
      Write-Output "prisma dev reported an error:"
      Write-Output ($text -replace "\x1b\[[0-9;]*m", "")
      exit 2
    }
  }
  Write-Output "The database did not report 'now running' within $TimeoutSeconds seconds."
  exit 1
}
