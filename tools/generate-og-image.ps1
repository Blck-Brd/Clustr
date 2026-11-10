param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\app\seo\og-image.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$width = 1200
$height = 630
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function New-RoundedRectPath {
    param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Background gradient.
$bgRect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(15, 23, 42),
    [System.Drawing.Color]::FromArgb(22, 34, 61),
    20
)
$graphics.FillRectangle($bgBrush, $bgRect)

# Warm and cool glows.
$warmPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$warmPath.AddEllipse(-180, -220, 760, 620)
$warmBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($warmPath)
$warmBrush.CenterColor = [System.Drawing.Color]::FromArgb(95, 234, 88, 12)
$warmBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 234, 88, 12))
$graphics.FillPath($warmBrush, $warmPath)

$coolPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$coolPath.AddEllipse(780, -260, 620, 560)
$coolBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($coolPath)
$coolBrush.CenterColor = [System.Drawing.Color]::FromArgb(70, 34, 211, 238)
$coolBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 34, 211, 238))
$graphics.FillPath($coolBrush, $coolPath)

# Lightning mark.
$markPoints = @(
    [System.Drawing.PointF]::new(138, 92),
    [System.Drawing.PointF]::new(92, 196),
    [System.Drawing.PointF]::new(132, 196),
    [System.Drawing.PointF]::new(116, 280),
    [System.Drawing.PointF]::new(178, 168),
    [System.Drawing.PointF]::new(138, 168)
)
$markRect = New-Object System.Drawing.Rectangle 90, 90, 100, 200
$markBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $markRect,
    [System.Drawing.Color]::FromArgb(251, 146, 60),
    [System.Drawing.Color]::FromArgb(234, 88, 12),
    45
)
$graphics.FillPolygon($markBrush, $markPoints)

# Badge.
$badgePath = New-RoundedRectPath -X 210 -Y 92 -W 300 -H 40 -R 20
$badgeFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 124, 45, 18))
$graphics.FillPath($badgeFill, $badgePath)
$badgePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(124, 45, 18)), 1.2
$graphics.DrawPath($badgePen, $badgePath)
$badgeFont = New-Object System.Drawing.Font 'Segoe UI', 16, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$badgeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(253, 186, 116))
$graphics.DrawString('FREE  |  LOCAL-FIRST  |  NO UPLOADS', $badgeFont, $badgeBrush, 230, 102)

# Brand and copy.
$brandFont = New-Object System.Drawing.Font 'Segoe UI', 88, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248, 250, 252))
$graphics.DrawString('Clustr', $brandFont, $whiteBrush, 205, 140)

$subtitleFont = New-Object System.Drawing.Font 'Segoe UI', 32, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$mutedBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(148, 163, 184))
$graphics.DrawString('Photo sorter for camera libraries', $subtitleFont, $whiteBrush, 82, 260)

$featureFont = New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$orangeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(251, 146, 60))
$graphics.DrawString('EXIF  |  Google Timeline  |  Heatmaps  |  Lightroom XMP', $featureFont, $orangeBrush, 84, 315)

$bodyFont = New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$bodyRect = New-Object System.Drawing.RectangleF 84, 360, 580, 120
$graphics.DrawString('Turn a camera folder into trips, stops and events, then export folders and XMP sidecars. Everything stays in your browser.', $bodyFont, $mutedBrush, $bodyRect)

$urlFont = New-Object System.Drawing.Font 'Segoe UI', 24, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('clustr-photo.vercel.app', $urlFont, $whiteBrush, 84, 540)
$smallFont = New-Object System.Drawing.Font 'Segoe UI', 17, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('Windows + camera workflow  |  installable PWA  |  Czech / English', $smallFont, $mutedBrush, 84, 578)

# UI panel mock.
$panelPath = New-RoundedRectPath -X 730 -Y 150 -W 390 -H 380 -R 22
$panelFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(17, 28, 51))
$graphics.FillPath($panelFill, $panelPath)
$panelPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(38, 52, 79)), 1.5
$graphics.DrawPath($panelPen, $panelPath)

$panelTitleFont = New-Object System.Drawing.Font 'Segoe UI', 20, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('Folder tree', $panelTitleFont, $whiteBrush, 760, 176)

$rows = @(
    @{ Dot = '#fb923c'; Name = 'Trip 1 - Portugal'; Count = '128' },
    @{ Dot = '#22d3ee'; Name = 'Stop 1 - Lisbon'; Count = '42' },
    @{ Dot = '#22d3ee'; Name = 'Stop 2 - Sintra'; Count = '36' },
    @{ Dot = '#34d399'; Name = 'Home 12'; Count = '24' },
    @{ Dot = '#a78bfa'; Name = 'Screenshot-Clutter'; Count = '9' }
)

$rowFont = New-Object System.Drawing.Font 'Segoe UI', 18, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$countFont = New-Object System.Drawing.Font 'Segoe UI', 17, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$rowY = 222
foreach ($row in $rows) {
    $rowPath = New-RoundedRectPath -X 752 -Y ($rowY - 8) -W 346 -H 44 -R 10
    $rowFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22, 32, 52))
    $graphics.FillPath($rowFill, $rowPath)
    $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($row.Dot))
    $graphics.FillEllipse($dotBrush, 766, ($rowY + 8), 12, 12)
    $rowTextBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(226, 232, 240))
    $graphics.DrawString($row.Name, $rowFont, $rowTextBrush, 790, $rowY)
    $graphics.DrawString($row.Count, $countFont, $mutedBrush, 1040, ($rowY + 2))
    $rowY += 52
}

# Heatmap strip.
$barColors = @('#ea580c', '#f97316', '#fb923c', '#facc15', '#fb923c', '#f97316', '#ea580c', '#f97316', '#fb923c', '#f97316', '#ea580c', '#f97316')
$barX = 760
$barY = 492
for ($i = 0; $i -lt $barColors.Count; $i += 1) {
    $barHeight = 22 + (($i * 13) % 46)
    $barPath = New-RoundedRectPath -X $barX -Y ($barY + (56 - $barHeight)) -W 22 -H $barHeight -R 5
    $barBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($barColors[$i]))
    $graphics.FillPath($barBrush, $barPath)
    $barX += 28
}

$outputDir = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bgBrush.Dispose()
$warmBrush.Dispose()
$coolBrush.Dispose()
$markBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "OG image generated at $OutputPath"
