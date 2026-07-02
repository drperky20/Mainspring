$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $repoRoot 'apps\desktop\assets'

Add-Type -AssemblyName System.Drawing

function New-ColorBrush([int]$r, [int]$g, [int]$b) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($r, $g, $b))
}

function New-PenColor([int]$r, [int]$g, [int]$b, [float]$width) {
  return [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($r, $g, $b), $width)
}

if (-not (Test-Path $assetsDir)) {
  New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

$size = 512
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$backgroundBrush = New-ColorBrush 17 17 17
$brassBrush = New-ColorBrush 194 154 76
$greenBrush = New-ColorBrush 88 122 111
$ivoryBrush = New-ColorBrush 241 236 223
$shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
$brassPen = New-PenColor 194 154 76 28
$springPen = New-PenColor 241 236 223 20
$springPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$springPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$graphics.FillEllipse($shadowBrush, 54, 60, 404, 404)
$graphics.FillEllipse($backgroundBrush, 40, 40, 432, 432)
$graphics.DrawEllipse($brassPen, 60, 60, 392, 392)
$graphics.FillEllipse($greenBrush, 138, 138, 236, 236)
$graphics.FillEllipse($ivoryBrush, 208, 208, 96, 96)

$points = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(170, 168),
  [System.Drawing.PointF]::new(222, 220),
  [System.Drawing.PointF]::new(170, 272),
  [System.Drawing.PointF]::new(222, 324),
  [System.Drawing.PointF]::new(170, 376),
  [System.Drawing.PointF]::new(318, 228),
  [System.Drawing.PointF]::new(370, 280),
  [System.Drawing.PointF]::new(318, 332),
  [System.Drawing.PointF]::new(370, 384)
)
$graphics.DrawLines($springPen, $points)

$pngPath = Join-Path $assetsDir 'icon.png'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$icoPath = Join-Path $assetsDir 'icon.ico'
$graphics.Dispose()
$backgroundBrush.Dispose()
$brassBrush.Dispose()
$greenBrush.Dispose()
$ivoryBrush.Dispose()
$shadowBrush.Dispose()
$brassPen.Dispose()
$springPen.Dispose()
$bitmap.Dispose()

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($null -eq $ffmpeg) {
  throw 'ffmpeg is required to generate apps/desktop/assets/icon.ico'
}

& $ffmpeg.Source -y -i $pngPath -vf 'scale=256:256' $icoPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg failed while generating $icoPath"
}

Write-Output "Generated $pngPath"
Write-Output "Generated $icoPath"
