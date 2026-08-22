[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$WorkerConfig = Join-Path $RepositoryRoot 'assistant\wrangler.jsonc'
$PublicConfig = Join-Path $RepositoryRoot 'public\config\assistant.json'
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

function New-RandomHex {
  param([int]$ByteCount = 24)
  $Bytes = New-Object byte[] $ByteCount
  $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Generator.GetBytes($Bytes) } finally { $Generator.Dispose() }
  return -join ($Bytes | ForEach-Object { $_.ToString('x2') })
}

function Convert-SecureValue {
  param([Security.SecureString]$SecureValue)
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer) }
}

function Read-BotTokenFromDialog {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $Dialog = New-Object System.Windows.Forms.Form
  $Dialog.Text = 'VAV Assistant - BotFather token'
  $Dialog.StartPosition = 'CenterScreen'
  $Dialog.Size = New-Object System.Drawing.Size(640, 230)
  $Dialog.MinimumSize = New-Object System.Drawing.Size(640, 230)
  $Dialog.MaximizeBox = $false
  $Dialog.MinimizeBox = $false
  $Dialog.TopMost = $true
  $Dialog.FormBorderStyle = 'FixedDialog'

  $Title = New-Object System.Windows.Forms.Label
  $Title.Text = 'Lipiți tokenul nou BotFather în chenarul de mai jos'
  $Title.Location = New-Object System.Drawing.Point(22, 20)
  $Title.Size = New-Object System.Drawing.Size(580, 24)
  $Title.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
  $Dialog.Controls.Add($Title)

  $Hint = New-Object System.Windows.Forms.Label
  $Hint.Text = 'Faceți clic în chenar și apăsați Ctrl+V. Tokenul este ascuns și nu este salvat în GitHub sau într-un fișier.'
  $Hint.Location = New-Object System.Drawing.Point(22, 50)
  $Hint.Size = New-Object System.Drawing.Size(580, 38)
  $Hint.Font = New-Object System.Drawing.Font('Segoe UI', 9)
  $Dialog.Controls.Add($Hint)

  $TokenBox = New-Object System.Windows.Forms.TextBox
  $TokenBox.Location = New-Object System.Drawing.Point(25, 96)
  $TokenBox.Size = New-Object System.Drawing.Size(575, 30)
  $TokenBox.Font = New-Object System.Drawing.Font('Consolas', 11)
  $TokenBox.UseSystemPasswordChar = $true
  $TokenBox.ShortcutsEnabled = $true
  $Dialog.Controls.Add($TokenBox)

  $ContinueButton = New-Object System.Windows.Forms.Button
  $ContinueButton.Text = 'Continuă'
  $ContinueButton.Location = New-Object System.Drawing.Point(380, 142)
  $ContinueButton.Size = New-Object System.Drawing.Size(105, 34)
  $ContinueButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $Dialog.Controls.Add($ContinueButton)

  $CancelButton = New-Object System.Windows.Forms.Button
  $CancelButton.Text = 'Anulează'
  $CancelButton.Location = New-Object System.Drawing.Point(495, 142)
  $CancelButton.Size = New-Object System.Drawing.Size(105, 34)
  $CancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $Dialog.Controls.Add($CancelButton)

  $Dialog.AcceptButton = $ContinueButton
  $Dialog.CancelButton = $CancelButton
  $Dialog.Add_Shown({ $TokenBox.Focus() })

  try {
    $Result = $Dialog.ShowDialog()
    if ($Result -ne [System.Windows.Forms.DialogResult]::OK) {
      throw 'BotFather token entry was cancelled.'
    }
    return [string]$TokenBox.Text
  } finally {
    $TokenBox.Text = ''
    $Dialog.Dispose()
  }
}

function Set-WorkerSecret {
  param(
    [string]$Name,
    [string]$Value,
    [string]$Node,
    [string]$WranglerScript
  )
  Write-Host "Setting protected server value: $Name" -ForegroundColor DarkCyan
  $StartInfo = New-Object System.Diagnostics.ProcessStartInfo
  $StartInfo.FileName = $Node
  $StartInfo.Arguments = "`"$WranglerScript`" secret put $Name --config `"$WorkerConfig`""
  $StartInfo.UseShellExecute = $false
  $StartInfo.CreateNoWindow = $true
  $StartInfo.RedirectStandardInput = $true
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true

  $SecretProcess = New-Object System.Diagnostics.Process
  $SecretProcess.StartInfo = $StartInfo
  try {
    if (-not $SecretProcess.Start()) { throw "Could not start secret storage for $Name." }
    $SecretProcess.StandardInput.Write($Value)
    $SecretProcess.StandardInput.Close()
    $StandardOutput = $SecretProcess.StandardOutput.ReadToEnd()
    $StandardError = $SecretProcess.StandardError.ReadToEnd()
    $SecretProcess.WaitForExit()
    if ($StandardOutput) { Write-Host $StandardOutput.TrimEnd() }
    if ($StandardError) { Write-Host $StandardError.TrimEnd() }
    if ($SecretProcess.ExitCode -ne 0) {
      throw "Setting $Name failed with exit code $($SecretProcess.ExitCode)."
    }
  } finally {
    $SecretProcess.Dispose()
  }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  $Encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $Encoding)
}

$BotToken = $null
try {
  $GitExecutable = Find-Executable -Name 'git' -Candidates @('C:\Program Files\Git\cmd\git.exe')
  $NodeExecutable = Find-Executable -Name 'node' -Candidates @((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
  $PnpmExecutable = Find-Executable -Name 'pnpm' -Candidates @((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'))
  $WranglerExecutable = Join-Path $RepositoryRoot 'node_modules\.bin\wrangler.cmd'
  $WranglerScript = Join-Path $RepositoryRoot 'node_modules\wrangler\bin\wrangler.js'

  if (-not $GitExecutable -or -not $NodeExecutable -or -not $PnpmExecutable) {
    throw 'Git, Node.js or pnpm was not found. Run the VAV GitHub setup first.'
  }
  if (-not (Test-Path -LiteralPath $WranglerExecutable) -or -not (Test-Path -LiteralPath $WranglerScript)) {
    throw 'Cloudflare Wrangler is not installed. Run pnpm install in the VAV site folder.'
  }
  if (-not (Test-Path -LiteralPath $WorkerConfig)) { throw 'The VAV Assistant server configuration is missing.' }

  $Pending = @(& $GitExecutable status --porcelain)
  Assert-Success 'Checking repository status'
  if ($Pending.Count -gt 0) {
    throw 'The website has unpublished local changes. Publish or review them before connecting the assistant.'
  }

  $NodeDirectory = Split-Path -Parent $NodeExecutable
  $env:Path = "$NodeDirectory;$env:Path"
  $env:ASTRO_TELEMETRY_DISABLED = '1'
  $env:WRANGLER_SEND_METRICS = 'false'

  Write-Host "`nVAV ASSISTANT - SECURE ONE-CLICK SETUP" -ForegroundColor Cyan
  Write-Host 'You will authorize Cloudflare in the official browser window.'
  Write-Host 'Then paste the BotFather token into a hidden prompt. It will not be written to GitHub or a file.'

  & $WranglerExecutable whoami *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`nOpening the official Cloudflare authorization page..." -ForegroundColor Cyan
    & $WranglerExecutable login
    Assert-Success 'Cloudflare authorization'
  }

  Write-Host "`nDeploying the protected VAV Assistant server..." -ForegroundColor Cyan
  $DeployLines = @(& $WranglerExecutable deploy --config $WorkerConfig 2>&1)
  $DeployExit = $LASTEXITCODE
  $DeployLines | ForEach-Object { Write-Host $_ }
  if ($DeployExit -ne 0) { throw "Cloudflare deployment failed with exit code $DeployExit." }

  $DeploymentText = $DeployLines -join "`n"
  $EndpointMatch = [regex]::Match($DeploymentText, 'https://[A-Za-z0-9.-]+\.workers\.dev')
  if (-not $EndpointMatch.Success) {
    throw 'The Worker URL was not returned. Open Cloudflare Workers, enable a workers.dev subdomain, then run this setup again.'
  }
  $WorkerEndpoint = $EndpointMatch.Value.TrimEnd('/')

  Write-Host "`nOpen BotFather, create the VAV bot, copy its HTTP API token, then return here." -ForegroundColor Yellow
  Write-Host 'A protected paste window will open. The token is not written to GitHub or a file.' -ForegroundColor Yellow
  $BotToken = Read-BotTokenFromDialog
  $TokenMatch = [regex]::Match($BotToken, '(?<!\d)\d{6,14}:[A-Za-z0-9_-]{30,}(?![A-Za-z0-9_-])')
  if (-not $TokenMatch.Success) { throw 'No valid BotFather token was found in the pasted text.' }
  $BotToken = $TokenMatch.Value

  $BotInfo = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$BotToken/getMe"
  if (-not $BotInfo.ok -or -not $BotInfo.result.username) { throw 'Telegram did not accept this bot token.' }
  $BotUsername = [string]$BotInfo.result.username
  $WebhookSecret = New-RandomHex 24
  $ConnectCode = New-RandomHex 18

  Set-WorkerSecret -Name 'TELEGRAM_BOT_TOKEN' -Value $BotToken -Node $NodeExecutable -WranglerScript $WranglerScript
  Set-WorkerSecret -Name 'TELEGRAM_WEBHOOK_SECRET' -Value $WebhookSecret -Node $NodeExecutable -WranglerScript $WranglerScript
  Set-WorkerSecret -Name 'TELEGRAM_CONNECT_CODE' -Value $ConnectCode -Node $NodeExecutable -WranglerScript $WranglerScript

  $WebhookPayload = @{
    url = "$WorkerEndpoint/telegram/webhook"
    secret_token = $WebhookSecret
    allowed_updates = @('message')
    drop_pending_updates = $false
  } | ConvertTo-Json -Depth 4
  $WebhookResult = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$BotToken/setWebhook" -ContentType 'application/json' -Body $WebhookPayload
  if (-not $WebhookResult.ok) { throw 'Telegram webhook activation failed.' }

  $CommandsPayload = @{
    commands = @(
      @{ command = 'start'; description = 'Connect VAV lead notifications' },
      @{ command = 'status'; description = 'Check VAV Assistant status' }
    )
  } | ConvertTo-Json -Depth 5
  $CommandsResult = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$BotToken/setMyCommands" -ContentType 'application/json' -Body $CommandsPayload
  if (-not $CommandsResult.ok) { throw 'Telegram command setup failed.' }

  $ConnectUrl = "https://t.me/${BotUsername}?start=$ConnectCode"
  $ConnectCommand = "/start $ConnectCode"
  Set-Clipboard -Value $ConnectCommand
  Write-Host "`nTelegram will open now. Press START in the bot." -ForegroundColor Green
  Start-Process $ConnectUrl
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "Telegram s-a deschis.`n`nDacă nu vedeți butonul START, faceți clic în chat, apăsați Ctrl+V și apoi Enter. Comanda temporară completă a fost copiată automat.`n`nNu copiați comanda în alte aplicații.",
    'VAV Assistant - conectare Telegram',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null

  $Connected = $false
  for ($Attempt = 1; $Attempt -le 60; $Attempt++) {
    Start-Sleep -Seconds 3
    try {
      $Health = Invoke-RestMethod -Method Get -Uri "$WorkerEndpoint/health?setup=$Attempt"
      if ($Health.telegram_connection_current -eq $true) { $Connected = $true; break }
    } catch { }
    Write-Progress -Activity 'Waiting for Telegram START' -Status "Attempt $Attempt of 60" -PercentComplete (($Attempt / 60) * 100)
  }
  Write-Progress -Activity 'Waiting for Telegram START' -Completed
  if (-not $Connected) { throw 'Telegram was not connected in time. Run this setup again and press START when the bot opens.' }
  if ((Get-Clipboard -Raw) -eq $ConnectCommand) { Set-Clipboard -Value '' }

  $TestPayload = @{
    name = 'VAV Setup Test'
    contact = 'valentin@vavgroup.pro'
    message = 'Technical test: the website can deliver a lead to Telegram.'
    page = 'https://vavgroup.pro/contacts/'
    transcript = @()
    consent = $true
    website = ''
    session_id = "setup_$((New-RandomHex 8))"
  } | ConvertTo-Json -Depth 5
  $TestResult = Invoke-RestMethod -Method Post -Uri "$WorkerEndpoint/lead" -Headers @{ Origin = 'https://vavgroup.pro' } -ContentType 'application/json' -Body $TestPayload
  if (-not $TestResult.ok) { throw 'The Telegram delivery test did not complete.' }

  $AssistantConfig = [ordered]@{
    enabled = $true
    endpoint = $WorkerEndpoint
    bot_username = $BotUsername
  } | ConvertTo-Json
  Write-Utf8NoBom -Path $PublicConfig -Content ($AssistantConfig + "`n")

  Write-Host "`nTesting the assistant and building the website..." -ForegroundColor Cyan
  & $PnpmExecutable run test:assistant
  Assert-Success 'Assistant tests'
  & $PnpmExecutable run build
  Assert-Success 'Website build'

  & $GitExecutable add -- public/config/assistant.json
  Assert-Success 'Staging public assistant configuration'
  & $GitExecutable diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    & $GitExecutable commit -m 'Connect VAV Assistant and Telegram'
    Assert-Success 'Creating the assistant connection commit'
    & $GitExecutable push origin main
    Assert-Success 'Publishing the assistant connection'
  }

  Write-Host "`nSUCCESS" -ForegroundColor Green
  Write-Host "Bot: @$BotUsername"
  Write-Host "Server: $WorkerEndpoint"
  Write-Host 'A technical test message was delivered to your Telegram bot.'
  Write-Host 'GitHub Pages is publishing the connected assistant automatically.'
  exit 0
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'No token was added to GitHub or the public website.' -ForegroundColor Yellow
  exit 1
} finally {
  $BotToken = $null
  $SecureToken = $null
}
