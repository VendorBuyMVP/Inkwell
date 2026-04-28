$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Build = Join-Path $Root "build/windows-native"
New-Item -ItemType Directory -Force -Path $Build | Out-Null

$Out = Join-Path $Build "InkwellNative.exe"
$Core = Join-Path $Root "core/src/inkwell_core.c"
$Shell = Join-Path $Root "shells/windows-win32/main.cpp"
$Include = Join-Path $Root "core/include"
$Manifest = Join-Path $Root "packaging/windows/InkwellNative.manifest"
$Resource = Join-Path $Root "packaging/windows/inkwell.rc"
$ResourceOut = Join-Path $Build "inkwell.res"
$CoreObj = Join-Path $Build "inkwell_core.obj"
$ShellObj = Join-Path $Build "main.obj"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
  Copy-Item $Manifest (Join-Path $Build "InkwellNative.manifest") -Force
  Copy-Item $Resource (Join-Path $Build "inkwell.rc") -Force
  Push-Location $Build
  Invoke-Native "rc.exe" @("/nologo", "/fo", $ResourceOut, "inkwell.rc")
  Pop-Location
  Invoke-Native "cl.exe" @(
    "/nologo", "/W4", "/WX", "/EHsc", "/D_CRT_SECURE_NO_WARNINGS", "/I$Include",
    $Core, $Shell, $ResourceOut,
    "/link", "Comdlg32.lib", "User32.lib", "Gdi32.lib", "Shell32.lib", "/OUT:$Out"
  )
} elseif (Get-Command clang++ -ErrorAction SilentlyContinue) {
  if (Get-Command llvm-rc -ErrorAction SilentlyContinue) {
    Copy-Item $Manifest (Join-Path $Build "InkwellNative.manifest") -Force
    Copy-Item $Resource (Join-Path $Build "inkwell.rc") -Force
    Push-Location $Build
    Invoke-Native "llvm-rc" @("/fo", $ResourceOut, "inkwell.rc")
    Pop-Location
    Invoke-Native "clang" @("-std=c99", "-Wall", "-Wextra", "-Werror", "-I$Include", "-c", $Core, "-o", $CoreObj)
    Invoke-Native "clang++" @("-std=c++17", "-Wall", "-Wextra", "-Werror", "-D_CRT_SECURE_NO_WARNINGS", "-I$Include", "-c", $Shell, "-o", $ShellObj)
    Invoke-Native "clang++" @($CoreObj, $ShellObj, $ResourceOut, "-lComdlg32", "-lUser32", "-lGdi32", "-lShell32", "-o", $Out)
  } else {
    Invoke-Native "clang" @("-std=c99", "-Wall", "-Wextra", "-Werror", "-I$Include", "-c", $Core, "-o", $CoreObj)
    Invoke-Native "clang++" @("-std=c++17", "-Wall", "-Wextra", "-Werror", "-D_CRT_SECURE_NO_WARNINGS", "-I$Include", "-c", $Shell, "-o", $ShellObj)
    Invoke-Native "clang++" @($CoreObj, $ShellObj, "-lComdlg32", "-lUser32", "-lGdi32", "-lShell32", "-o", $Out)
  }
} else {
  throw "Install Visual Studio Build Tools or clang++ to build the Windows native shell."
}

if (!(Test-Path $Out)) {
  throw "Windows build completed without producing $Out"
}

Write-Output $Out
