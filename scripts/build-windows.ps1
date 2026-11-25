[CmdletBinding()]
param([switch]$SkipWebBuild)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $projectRoot 'release'
$buildRoot = Join-Path $projectRoot '.desktop-build'
$distRoot = Join-Path $projectRoot 'dist'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is required to create the EXE.' }

Push-Location $projectRoot
try {
    if (-not $SkipWebBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'The web build failed.' }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $distRoot 'index.html'))) { throw 'Build the web app before packaging it.' }
    New-Item -ItemType Directory -Path $releaseRoot, $buildRoot -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Add-Type -AssemblyName System.Drawing

    $notice = "PAN / builder - third-party notices`r`n`r`n"
    foreach ($dependency in @('react', 'react-dom', 'scheduler', 'xlsx')) {
        $packageRoot = Join-Path $projectRoot "node_modules/$dependency"
        $metadata = Get-Content -LiteralPath (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json
        $notice += "$dependency $($metadata.version)`r`n" + ('=' * 72) + "`r`n"
        $notice += (Get-Content -LiteralPath (Join-Path $packageRoot 'LICENSE') -Raw) + "`r`n`r`n"
    }
    $notice += "Oswald variable font - https://github.com/google/fonts/tree/main/ofl/oswald`r`n"
    $notice += Get-Content -LiteralPath (Join-Path $projectRoot 'public/fonts/OFL.txt') -Raw
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $distRoot 'THIRD-PARTY-NOTICES.txt'), $notice, $utf8)
    [IO.File]::WriteAllText((Join-Path $releaseRoot 'THIRD-PARTY-NOTICES.txt'), $notice, $utf8)

    # Package only public build output, never the project or a browser profile.
    $assetZip = Join-Path $buildRoot 'app-assets.zip'
    $zipStream = [IO.File]::Open($assetZip, [IO.FileMode]::Create)
    $zip = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $distRoot -File -Recurse) {
            $entryName = $file.FullName.Substring($distRoot.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $zip.Dispose(); $zipStream.Dispose() }

    # Draw the app's terminal mark as a multi-resolution Windows icon.
    $images = @()
    foreach ($size in @(16, 32, 48, 64, 128, 256)) {
        $bitmap = New-Object Drawing.Bitmap($size, $size)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([Drawing.Color]::Transparent)
        $brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(216, 77, 38))
        $pen = New-Object Drawing.Pen([Drawing.Color]::White, ([single]($size * .065)))
        $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
        $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
        $shape = New-Object Drawing.Drawing2D.GraphicsPath
        $corner = [single]($size * .42)
        $edge = [single]($size - 1)
        $shape.AddArc(0, 0, $corner, $corner, 180, 90)
        $shape.AddArc(($edge - $corner), 0, $corner, $corner, 270, 90)
        $shape.AddArc(($edge - $corner), ($edge - $corner), $corner, $corner, 0, 90)
        $shape.AddArc(0, ($edge - $corner), $corner, $corner, 90, 90)
        $shape.CloseFigure()
        $graphics.FillPath($brush, $shape)
        $graphics.DrawLines($pen, [Drawing.PointF[]]@(
            (New-Object Drawing.PointF(($size * .25), ($size * .30))),
            (New-Object Drawing.PointF(($size * .425), ($size * .50))),
            (New-Object Drawing.PointF(($size * .25), ($size * .70)))
        ))
        $graphics.DrawLine($pen, [single]($size * .525), [single]($size * .70), [single]($size * .75), [single]($size * .70))
        $png = New-Object IO.MemoryStream
        $bitmap.Save($png, [Drawing.Imaging.ImageFormat]::Png)
        $images += ,@{ Size = $size; Data = $png.ToArray() }
        $png.Dispose(); $shape.Dispose(); $pen.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    }
    $iconPath = Join-Path $buildRoot 'app.ico'
    $iconStream = [IO.File]::Open($iconPath, [IO.FileMode]::Create)
    $writer = New-Object IO.BinaryWriter($iconStream)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
        $offset = 6 + 16 * $images.Count
        foreach ($image in $images) {
            $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$image.Data.Length); $writer.Write([uint32]$offset)
            $offset += $image.Data.Length
        }
        foreach ($image in $images) { $writer.Write([byte[]]$image.Data) }
    } finally { $writer.Dispose(); $iconStream.Dispose() }

    $exe = Join-Path $projectRoot 'PaloAltoCommandGenerator.exe'
    & $compiler /nologo /target:winexe /platform:anycpu /optimize+ "/out:$exe" "/win32icon:$iconPath" "/win32manifest:$(Join-Path $projectRoot 'desktop/app.manifest')" "/resource:$assetZip,PANBuilder.Assets.zip" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll (Join-Path $projectRoot 'desktop/Launcher.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Windows EXE compilation failed.' }
    $guide = Join-Path $projectRoot 'START_HERE.txt'
    Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop/README.txt') -Destination $guide -Force

    $portableFiles = @(
        @{ Name = 'PaloAltoCommandGenerator.exe'; Path = $exe },
        @{ Name = 'START_HERE.txt'; Path = $guide },
        @{ Name = 'THIRD-PARTY-NOTICES.txt'; Path = (Join-Path $releaseRoot 'THIRD-PARTY-NOTICES.txt') }
    )
    # The portable ZIP is flat; the repository keeps supporting downloads in release/.
    $packageChecksumPath = Join-Path $buildRoot 'portable-SHA256SUMS.txt'
    $portableChecksums = $portableFiles | ForEach-Object {
        (Get-FileHash -LiteralPath $_.Path -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_.Name
    }
    [IO.File]::WriteAllLines($packageChecksumPath, $portableChecksums, $utf8)

    $packagePath = Join-Path $releaseRoot 'PaloAltoCommandGenerator-1.0.0-Windows.zip'
    $packageStream = [IO.File]::Open($packagePath, [IO.FileMode]::Create)
    $packageZip = New-Object IO.Compression.ZipArchive($packageStream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($file in $portableFiles) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($packageZip, $file.Path, $file.Name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($packageZip, $packageChecksumPath, 'SHA256SUMS.txt', [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    } finally { $packageZip.Dispose(); $packageStream.Dispose() }
    $checksums = @($exe, $guide, (Join-Path $releaseRoot 'THIRD-PARTY-NOTICES.txt'), $packagePath) | ForEach-Object {
        (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_.Substring($projectRoot.Length + 1).Replace('\', '/')
    }
    [IO.File]::WriteAllLines((Join-Path $releaseRoot 'SHA256SUMS.txt'), $checksums, $utf8)
    Get-Item -LiteralPath $exe, $packagePath | Select-Object Name, Length, FullName
} finally { Pop-Location }
