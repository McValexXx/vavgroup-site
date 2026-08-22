[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $RepositoryRoot

function Find-Executable {
  param([string]$Name, [string[]]$Candidates = @())
  $Command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $Command) { return $Command.Source }
  foreach ($Candidate in $Candidates) {
    if ($Candidate -and (Test-Path -LiteralPath $Candidate)) { return $Candidate }
  }
  return $null
}

function Assert-Success {
  param([string]$Action)
  if ($LASTEXITCODE -ne 0) { throw "$Action failed with exit code $LASTEXITCODE." }
}

try {
  $GitExecutable = Find-Executable -Name 'git' -Candidates @('C:\Program Files\Git\cmd\git.exe')
  $GitHubCli = Find-Executable -Name 'gh' -Candidates @('C:\Program Files\GitHub CLI\gh.exe')
  $NodeExecutable = Find-Executable -Name 'node' -Candidates @((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
  $PnpmExecutable = Find-Executable -Name 'pnpm' -Candidates @((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'))

  if (-not $GitExecutable -or -not $GitHubCli -or -not $NodeExecutable -or -not $PnpmExecutable) {
    throw 'First run setup-github-pages.bat to prepare GitHub and the required tools.'
  }

  $Origin = ((& $GitExecutable remote get-url origin 2>$null) | Out-String).Trim()
  if (-not $Origin) { throw 'GitHub remote is not configured. Run setup-github-pages.bat first.' }

  & $GitHubCli auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) {
    & $GitHubCli auth login --hostname github.com --git-protocol https --web
    Assert-Success 'GitHub authentication'
  }

  $NodeDirectory = Split-Path -Parent $NodeExecutable
  $env:Path = "$NodeDirectory;$env:Path"
  $env:ASTRO_TELEMETRY_DISABLED = '1'

  Write-Host '`n==> Building and validating VAV Group' -ForegroundColor Cyan
  & $PnpmExecutable install --frozen-lockfile
  Assert-Success 'Installing the locked dependencies'
  & $PnpmExecutable build
  Assert-Success 'Production validation'

  Write-Host '`n==> Auditing the public repository' -ForegroundColor Cyan
  & $GitExecutable add --all
  Assert-Success 'Staging the update'

  $TrackedFiles = @(& $GitExecutable ls-files)
  $Forbidden = @($TrackedFiles | Where-Object {
    $_ -match '^(docs|intake|sources|tmp|dist|node_modules|release)/' -or
    $_ -match '\.(pdf|docx?|xlsx?|pptx?|csv|zip|7z|rar|pem|key|p12|pfx)$' -or
    ($_ -match '(^|/)\.env($|\.)' -and $_ -ne '.env.example')
  })
  if ($Forbidden.Count -gt 0) { throw "Publication blocked by private files: $($Forbidden -join ', ')" }

  & $GitExecutable diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'No website changes are waiting to be published.' -ForegroundColor Yellow
    exit 0
  }

  $CommitMessage = 'Update VAV Group site ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  & $GitExecutable commit -m $CommitMessage
  Assert-Success 'Creating the update commit'

  Write-Host '`n==> Uploading the update' -ForegroundColor Cyan
  & $GitExecutable push origin main
  Assert-Success 'Pushing the main branch'

  Write-Host 'The GitHub Pages workflow started automatically.' -ForegroundColor Green
  exit 0
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Nothing was changed in REG.RU or DNS.' -ForegroundColor Yellow
  exit 1
}
