[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $RepositoryRoot

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Find-Executable {
  param(
    [string]$Name,
    [string[]]$Candidates = @()
  )

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

function Invoke-PublicRepositoryAudit {
  param([string]$GitExecutable)

  & $GitExecutable add --all
  Assert-Success 'Staging the release files'

  $TrackedFiles = @(& $GitExecutable ls-files)
  Assert-Success 'Reading the staged file list'

  $ForbiddenPaths = @($TrackedFiles | Where-Object { $_ -match '^(docs|intake|sources|tmp|dist|node_modules|release)/' })
  $ForbiddenExtensions = @($TrackedFiles | Where-Object { $_ -match '\.(pdf|docx?|xlsx?|pptx?|csv|zip|7z|rar|pem|key|p12|pfx)$' })
  $UnexpectedEnvironmentFiles = @($TrackedFiles | Where-Object { $_ -match '(^|/)\.env($|\.)' -and $_ -ne '.env.example' })

  if ($ForbiddenPaths.Count -gt 0) { throw "Private directories are staged: $($ForbiddenPaths -join ', ')" }
  if ($ForbiddenExtensions.Count -gt 0) { throw "Private document or credential types are staged: $($ForbiddenExtensions -join ', ')" }
  if ($UnexpectedEnvironmentFiles.Count -gt 0) { throw "A private environment file is staged: $($UnexpectedEnvironmentFiles -join ', ')" }

  Write-Host "Privacy audit passed for $($TrackedFiles.Count) tracked files." -ForegroundColor Green
}

function Invoke-ProductionBuild {
  $NodeCandidates = @(
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
  )
  $PnpmCandidates = @(
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd')
  )

  $NodeExecutable = Find-Executable -Name 'node' -Candidates $NodeCandidates
  $PnpmExecutable = Find-Executable -Name 'pnpm' -Candidates $PnpmCandidates

  if (-not $NodeExecutable) { throw 'Node.js was not found. Install Node.js 24 or run this project from Codex.' }
  if (-not $PnpmExecutable) { throw 'pnpm was not found. Install pnpm 11.19.0 and run the setup again.' }

  $NodeDirectory = Split-Path -Parent $NodeExecutable
  $env:Path = "$NodeDirectory;$env:Path"
  $env:ASTRO_TELEMETRY_DISABLED = '1'

  & $PnpmExecutable install --frozen-lockfile
  Assert-Success 'Installing the locked dependencies'

  & $PnpmExecutable build
  Assert-Success 'Building and validating the production website'
}

try {
  Write-Step 'Checking the local release repository'

  $GitExecutable = Find-Executable -Name 'git' -Candidates @('C:\Program Files\Git\cmd\git.exe')
  if (-not $GitExecutable) { throw 'Git for Windows was not found.' }
  if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot '.git'))) { throw 'This is not the clean VAV Group release repository.' }

  Write-Step 'Preparing GitHub CLI'
  $GitHubCli = Find-Executable -Name 'gh' -Candidates @('C:\Program Files\GitHub CLI\gh.exe')

  if (-not $GitHubCli) {
    $WingetExecutable = Find-Executable -Name 'winget'
    if (-not $WingetExecutable) { throw 'GitHub CLI is missing and Windows Package Manager is unavailable.' }

    Write-Host 'GitHub CLI is required for one-click setup and will be installed from the official winget package.'
    $InstallAnswer = Read-Host 'Install GitHub CLI now? [Y/n]'
    if ($InstallAnswer -and $InstallAnswer -notmatch '^[YyДд]') { throw 'GitHub CLI installation was declined.' }

    & $WingetExecutable install --id GitHub.cli --exact --source winget --accept-package-agreements --accept-source-agreements
    Assert-Success 'Installing GitHub CLI'

    $GitHubCli = Find-Executable -Name 'gh' -Candidates @('C:\Program Files\GitHub CLI\gh.exe')
    if (-not $GitHubCli) { throw 'GitHub CLI was installed but was not found. Reopen the script once.' }
  }

  Write-Step 'Signing in to the correct GitHub account'
  & $GitHubCli auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'The official GitHub sign-in page will open. Password and 2FA/SMS stay in GitHub and are never stored by this script.'
    & $GitHubCli auth login --hostname github.com --git-protocol https --web
    Assert-Success 'GitHub authentication'
  }

  $GitHubLogin = ((& $GitHubCli api user --jq '.login') | Out-String).Trim()
  Assert-Success 'Reading the active GitHub account'
  if (-not $GitHubLogin) { throw 'The active GitHub username could not be determined.' }

  Write-Host "Active GitHub account: $GitHubLogin" -ForegroundColor Yellow
  $AccountAnswer = Read-Host 'Use this account? [Y/n]'
  if ($AccountAnswer -and $AccountAnswer -notmatch '^[YyДд]') {
    throw 'Sign in to the intended GitHub account, then run the script again.'
  }

  $RepositoryName = Read-Host 'Repository name [vavgroup-site]'
  if (-not $RepositoryName) { $RepositoryName = 'vavgroup-site' }
  if ($RepositoryName -notmatch '^[A-Za-z0-9._-]+$') { throw 'Repository name contains unsupported characters.' }

  $VisibilityAnswer = Read-Host 'Visibility: public or private? [public]'
  $Visibility = 'public'
  if ($VisibilityAnswer -match '^[Pp]rivate$') { $Visibility = 'private' }
  elseif ($VisibilityAnswer -and $VisibilityAnswer -notmatch '^[Pp]ublic$') { throw 'Choose public or private.' }

  Write-Host "`nRelease notice:" -ForegroundColor Yellow
  Write-Host '- The contact form remains disabled until a real Formspree endpoint is configured.'
  Write-Host '- The privacy page is still a draft placeholder and is marked noindex.'
  $ReleaseApproval = Read-Host 'Create the repository and publish this reviewed state now? [y/N]'
  if ($ReleaseApproval -notmatch '^[YyДд]') { throw 'Publication was not approved.' }

  Write-Step 'Running the production checks'
  Invoke-ProductionBuild
  Invoke-PublicRepositoryAudit -GitExecutable $GitExecutable

  if (-not ((& $GitExecutable config user.name) | Out-String).Trim()) {
    & $GitExecutable config user.name 'VAV Group'
  }
  if (-not ((& $GitExecutable config user.email) | Out-String).Trim()) {
    & $GitExecutable config user.email 'valentin@vavgroup.pro'
  }

  & $GitExecutable branch -M main
  Assert-Success 'Selecting the main branch'

  & $GitExecutable diff --cached --quiet
  $CreatedCommit = $false
  if ($LASTEXITCODE -ne 0) {
    & $GitExecutable commit -m 'Release VAV Group website'
    Assert-Success 'Creating the release commit'
    $CreatedCommit = $true
  }

  $FullRepositoryName = "$GitHubLogin/$RepositoryName"
  $RemoteUrl = "https://github.com/$FullRepositoryName.git"

  Write-Step "Preparing GitHub repository $FullRepositoryName"
  & $GitHubCli repo view $FullRepositoryName --json nameWithOwner *> $null
  if ($LASTEXITCODE -ne 0) {
    & $GitHubCli repo create $FullRepositoryName "--$Visibility" --source $RepositoryRoot --remote origin
    Assert-Success 'Creating the GitHub repository'
  } else {
    $ExistingOrigin = ((& $GitExecutable remote get-url origin 2>$null) | Out-String).Trim()
    if ($ExistingOrigin -and $ExistingOrigin -ne $RemoteUrl) {
      $ReplaceAnswer = Read-Host "Replace existing origin '$ExistingOrigin' with '$RemoteUrl'? [y/N]"
      if ($ReplaceAnswer -notmatch '^[YyДд]') { throw 'The existing remote was preserved.' }
      & $GitExecutable remote set-url origin $RemoteUrl
      Assert-Success 'Updating the GitHub remote'
    } elseif (-not $ExistingOrigin) {
      & $GitExecutable remote add origin $RemoteUrl
      Assert-Success 'Adding the GitHub remote'
    }
  }

  Write-Step 'Uploading the clean website repository'
  & $GitExecutable push -u origin main
  Assert-Success 'Pushing the main branch'

  Write-Step 'Enabling GitHub Pages workflow deployment'
  & $GitHubCli api "repos/$FullRepositoryName/pages" *> $null
  if ($LASTEXITCODE -ne 0) {
    & $GitHubCli api --method POST "repos/$FullRepositoryName/pages" -f build_type=workflow
    Assert-Success 'Enabling GitHub Pages'
  }

  if (-not $CreatedCommit) {
    & $GitHubCli workflow run deploy.yml --repo $FullRepositoryName
    Assert-Success 'Starting the GitHub Pages workflow'
  }

  Write-Host "`nRepository: https://github.com/$FullRepositoryName" -ForegroundColor Green
  Write-Host "Deployment: https://github.com/$FullRepositoryName/actions" -ForegroundColor Green
  Write-Host 'No REG.RU or DNS records were changed. Configure the domain only after the Pages deployment reports its real hostname.' -ForegroundColor Yellow
  exit 0
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'No REG.RU or DNS changes were attempted.' -ForegroundColor Yellow
  exit 1
}
