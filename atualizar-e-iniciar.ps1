param(
  [int]$Port = 3000,
  [switch]$SkipMigrations
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Step {
  param(
    [string]$Message,
    [scriptblock]$Command
  )

  Write-Step $Message
  & $Command
}

if (-not (Test-Path ".git")) {
  throw "Este script deve ficar na raiz do repositorio Git."
}

$escapedRoot = [regex]::Escape($ProjectRoot)

Invoke-Step "Parando servidor local antigo, se existir" {
  $processes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $escapedRoot -and $_.CommandLine -match "next" }

  if (-not $processes) {
    Write-Host "Nenhum servidor Next deste projeto estava rodando."
    return
  }

  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force
    Write-Host "Servidor parado: PID $($process.ProcessId)"
  }
}

$oldHead = (git rev-parse HEAD).Trim()

Invoke-Step "Atualizando repositorio local" {
  git fetch origin
  git pull --ff-only
}

$newHead = (git rev-parse HEAD).Trim()
$changedFiles = @()

if ($oldHead -ne $newHead) {
  $changedFiles = git diff --name-only "$oldHead..$newHead"
}

$dependenciesChanged = $changedFiles | Where-Object {
  $_ -in @("package.json", "package-lock.json")
}

if ($dependenciesChanged -or -not (Test-Path "node_modules")) {
  Invoke-Step "Instalando dependencias" {
    npm install
  }
}
else {
  Write-Step "Dependencias"
  Write-Host "package.json/package-lock.json nao mudaram; pulando npm install."
}

if (-not $SkipMigrations) {
  Invoke-Step "Aplicando migrations Prisma pendentes" {
    npx prisma migrate deploy
  }

  Invoke-Step "Gerando Prisma Client" {
    npx prisma generate
  }
}
else {
  Write-Step "Prisma"
  Write-Host "Migrations ignoradas por causa de -SkipMigrations."
}

Invoke-Step "Iniciando servidor local" {
  $logDir = Join-Path $ProjectRoot ".codex-logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutLog = Join-Path $logDir "next-dev-$stamp.out.log"
  $stderrLog = Join-Path $logDir "next-dev-$stamp.err.log"

  $process = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--port", "$Port") `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path (Join-Path $logDir "next-dev-current.txt") -Value @(
    "PID=$($process.Id)"
    "URL=http://localhost:$Port"
    "OUT=$stdoutLog"
    "ERR=$stderrLog"
  )

  Write-Host "PID: $($process.Id)"
  Write-Host "URL: http://localhost:$Port"
  Write-Host "Log: $stdoutLog"
}

Invoke-Step "Validando resposta HTTP" {
  $url = "http://localhost:$Port"
  $deadline = (Get-Date).AddSeconds(90)
  $lastError = $null

  do {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
      Write-Host "Servidor respondeu HTTP $($response.StatusCode): $url" -ForegroundColor Green
      exit 0
    }
    catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 3
    }
  } while ((Get-Date) -lt $deadline)

  Write-Warning "Servidor foi iniciado, mas nao respondeu dentro do tempo esperado."
  Write-Warning $lastError
  exit 1
}
