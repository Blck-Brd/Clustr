param(
    [string]$OutputDir = (Join-Path $PSScriptRoot '..\app\icons')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function New-ClustrIcon {
    param([int]$Size, [string]$Path)

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))

    $rect = [System.Drawing.Rectangle]::new(
        [int](0.10 * $Size),
        [int](0.10 * $Size),
        [int](0.80 * $Size),
        [int](0.80 * $Size)
    )
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(251, 146, 60),
        [System.Drawing.Color]::FromArgb(234, 88, 12),
        45
    )

    $points = @(
        [System.Drawing.PointF]::new(0.58 * $Size, 0.14 * $Size),
        [System.Drawing.PointF]::new(0.28 * $Size, 0.55 * $Size),
        [System.Drawing.PointF]::new(0.48 * $Size, 0.55 * $Size),
        [System.Drawing.PointF]::new(0.40 * $Size, 0.88 * $Size),
        [System.Drawing.PointF]::new(0.74 * $Size, 0.45 * $Size),
        [System.Drawing.PointF]::new(0.52 * $Size, 0.45 * $Size)
    )

    $graphics.FillPolygon($brush, $points)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $brush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

New-ClustrIcon -Size 192 -Path (Join-Path $OutputDir 'icon-192.png')
New-ClustrIcon -Size 512 -Path (Join-Path $OutputDir 'icon-512.png')
New-ClustrIcon -Size 180 -Path (Join-Path $OutputDir 'apple-touch-icon.png')
New-ClustrIcon -Size 64 -Path (Join-Path $OutputDir 'favicon.png')

Write-Host "Icons generated in $OutputDir"
