[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repoRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$qaRoot = Join-Path $projectRoot ('.qa/installer-' + [Guid]::NewGuid().ToString('N'))
$qaRegistry = 'HKCU:\Software\PANBuilderInstallerTests\Shortcuts'
$compiler = Join-Path $projectRoot '.desktop-build/tools/nsis-3.13/makensis.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Run npm run build:windows first.' }
if (Test-Path -LiteralPath $qaRegistry) { throw 'A previous installer test registry key exists; stop before overwriting it.' }
New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
$setup = Join-Path $qaRoot 'Test-Setup.exe'
$installedRoot = Join-Path $qaRoot 'Installed App'
$installedExe = Join-Path $installedRoot 'PaloAltoCommandGenerator.exe'
$uninstaller = Join-Path $installedRoot 'Uninstall.exe'
$desktopLink = Join-Path $qaRoot 'Desktop/PAN Builder.lnk'
$menuLink = Join-Path $qaRoot 'Start Menu/PAN Builder/PAN Builder.lnk'
$removeLink = Join-Path $qaRoot 'Start Menu/PAN Builder/Uninstall PAN Builder.lnk'
$appProcess = $null
$shell = $null

function Invoke-SilentInstaller([string]$File) {
    $process = Start-Process -FilePath $File -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
}

try {
    & $compiler /V2 "/DPROJECT_ROOT=$repoRoot" "/DQA_ROOT=$qaRoot" "/DSETUP_OUT=$setup" (Join-Path $projectRoot 'desktop/Installer.nsi')
    if ($LASTEXITCODE -ne 0) { throw 'Test installer compilation failed.' }
    Invoke-SilentInstaller $setup
    if ((Get-FileHash -LiteralPath $installedExe).Hash -ne (Get-FileHash -LiteralPath (Join-Path $projectRoot '.desktop-build/PaloAltoCommandGenerator.exe')).Hash) { throw 'Installed executable differs from the packaged app.' }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($linkPath in @($desktopLink, $menuLink, $removeLink)) {
        if (-not (Test-Path -LiteralPath $linkPath)) { throw "Shortcut missing: $linkPath" }
        $link = $shell.CreateShortcut($linkPath)
        try {
            $expected = if ($linkPath -eq $removeLink) { $uninstaller } else { $installedExe }
            if ($link.TargetPath -ne $expected) { throw "Shortcut points to the wrong file: $linkPath" }
            if ($link.WorkingDirectory -ne $installedRoot) { throw 'Shortcut has the wrong working directory.' }
            if ($linkPath -ne $removeLink -and $link.IconLocation -notlike "$installedExe,*") { throw 'App shortcut icon is missing.' }
        } finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) | Out-Null }
    }
    $registration = Get-ItemProperty -LiteralPath $qaRegistry
    if ($registration.DisplayVersion -ne '1.1.0' -or $registration.InstallLocation -ne $installedRoot) { throw 'Installed Apps registration is incorrect.' }

    # Test the shortcut target without opening a browser or changing the real desktop.
    $appProcess = Start-Process -FilePath $installedExe -ArgumentList '--headless', '--port', '52575' -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($appProcess.HasExited) { throw 'Installed app exited before starting.' }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri 'http://127.0.0.1:52575/__pan_builder_health'
            if ($response.Content -eq 'PANBuilder.Desktop.1') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 100 }
    }
    if (-not $ready) { throw 'Installed app did not start.' }
    Stop-Process -Id $appProcess.Id
    $appProcess.WaitForExit()
    $appProcess = $null

    Remove-Item -LiteralPath $desktopLink
    Invoke-SilentInstaller $setup
    if (-not (Test-Path -LiteralPath $desktopLink)) { throw 'Reinstallation did not restore the desktop shortcut.' }

    $keep = Join-Path $installedRoot 'unrelated-user-file.txt'
    [IO.File]::WriteAllText($keep, 'Installer must preserve files it did not create.')
    Invoke-SilentInstaller $uninstaller
    for ($attempt = 0; $attempt -lt 40 -and (Test-Path -LiteralPath $uninstaller); $attempt++) { Start-Sleep -Milliseconds 100 }
    foreach ($path in @($installedExe, $desktopLink, $menuLink, $removeLink, $uninstaller, $qaRegistry)) {
        if (Test-Path -LiteralPath $path) { throw "Uninstall left a product item behind: $path" }
    }
    if (-not (Test-Path -LiteralPath $keep)) { throw 'Uninstall removed an unrelated user file.' }
    'Installer checks passed: current-user installation, desktop and Start menu shortcut targets/icons, Installed Apps registration, app startup, shortcut repair and uninstall.'
    "All test files and shortcuts were isolated under $qaRoot"
} finally {
    if ($appProcess -and -not $appProcess.HasExited) { Stop-Process -Id $appProcess.Id; $appProcess.WaitForExit() }
    if (Test-Path -LiteralPath $uninstaller) { Invoke-SilentInstaller $uninstaller }
    if ($shell) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null }
}
