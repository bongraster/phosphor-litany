# Joos setup for After Effects (Windows)
# Installs Joos CEP panel + enables unsigned extension debug mode.
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File setup_joos.ps1

$ErrorActionPreference = 'Stop'

$JoosVersion = '1.2.17'
$ZipUrl = "https://github.com/nthnerr/Joos/releases/download/v$JoosVersion/Joos.v$JoosVersion.zip"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ZipPath = Join-Path $ProjectDir "Joos.v$JoosVersion.zip"
$ExtractDir = Join-Path $env:TEMP "Joos_setup_extract"
$CepDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$JoosDest = Join-Path $CepDir 'Joos'

Write-Host 'Downloading Joos...'
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath

if (Test-Path $ExtractDir) { Remove-Item $ExtractDir -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

$Source = Join-Path $ExtractDir "Joos v$JoosVersion\Joos"
if (-not (Test-Path $Source)) {
    throw "Joos folder not found inside zip at: $Source"
}

Write-Host 'Installing Joos to user CEP extensions folder...'
New-Item -ItemType Directory -Force -Path $CepDir | Out-Null
if (Test-Path $JoosDest) { Remove-Item $JoosDest -Recurse -Force }
Copy-Item -Path $Source -Destination $JoosDest -Recurse -Force

# Apply Windows/AE 2022 compatibility patch for output-module template install.
$PatchFile = Join-Path $ProjectDir 'joos_main.jsx.patch'
if (Test-Path $PatchFile) {
    Copy-Item -Path $PatchFile -Destination (Join-Path $JoosDest 'jsx\main.jsx') -Force
    Write-Host 'Applied joos_main.jsx.patch'
}

Write-Host 'Enabling CEP debug mode (CSXS 9-12)...'
foreach ($ver in 9..12) {
    reg add "HKCU\Software\Adobe\CSXS.$ver" /v PlayerDebugMode /t REG_SZ /d 1 /f | Out-Null
}

$required = @(
    'CSXS\manifest.xml',
    'assets\outputModule.aep',
    'bin\ffmpeg.exe',
    'jsx\loader.jsx'
)

Write-Host ''
Write-Host 'Verification:'
foreach ($rel in $required) {
    $ok = Test-Path (Join-Path $JoosDest $rel)
    Write-Host ("  [{0}] {1}" -f ($(if ($ok) { 'OK' } else { 'MISSING' })), $rel)
}

Write-Host ''
Write-Host 'Done.'
Write-Host "Installed to: $JoosDest"
Write-Host 'Next steps:'
Write-Host '  1. Restart After Effects completely'
Write-Host '  2. Open Window > Extensions > Joos'
Write-Host '  3. Save your project (.aep)'
Write-Host '  4. Select comp "path 1" and export'
