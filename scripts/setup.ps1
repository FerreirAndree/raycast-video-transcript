[CmdletBinding()]
param(
  [string]$RaycastHandle,
  [switch]$StartDevelopmentMode
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $InstallHint"
  }
}

Require-Command "node" "Install Node.js 22 or later from https://nodejs.org/."
Require-Command "npm" "Install Node.js 22 or later from https://nodejs.org/."
Require-Command "yt-dlp" "Install it with: winget install yt-dlp.yt-dlp"

if ($RaycastHandle) {
  if ($RaycastHandle -notmatch '^[A-Za-z0-9-]+$') {
    throw "RaycastHandle must be the handle from your Raycast profile URL."
  }

  $manifestPath = Join-Path $PSScriptRoot "..\package.json"
  $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
  $manifest.author = $RaycastHandle
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -NoNewline $manifestPath
}

npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

if ($StartDevelopmentMode) {
  npm run dev
}
else {
  Write-Host "Ready. Run 'npm run dev' to import this extension into Raycast."
}
