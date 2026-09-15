[CmdletBinding()]
param(
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

npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

if ($StartDevelopmentMode) {
  npm run dev
}
else {
  Write-Host "Ready. Run 'npm run dev' to import this extension into Raycast."
}
