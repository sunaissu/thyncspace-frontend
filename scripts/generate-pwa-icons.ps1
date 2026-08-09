Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$iconDirectory = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot "..\public\icons")
)
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

function Add-RoundedRectangle {
  param(
    [System.Drawing.Drawing2D.GraphicsPath]$Path,
    [System.Drawing.RectangleF]$Rectangle,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $arc = [System.Drawing.RectangleF]::new(
    $Rectangle.X,
    $Rectangle.Y,
    $diameter,
    $diameter
  )

  $Path.AddArc($arc, 180, 90)
  $arc.X = $Rectangle.Right - $diameter
  $Path.AddArc($arc, 270, 90)
  $arc.Y = $Rectangle.Bottom - $diameter
  $Path.AddArc($arc, 0, 90)
  $arc.X = $Rectangle.Left
  $Path.AddArc($arc, 90, 90)
  $Path.CloseFigure()
}

function New-ThyncSpaceIcon {
  param(
    [int]$Size,
    [string]$FileName,
    [switch]$Maskable
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#090b0f"))

  $scale = if ($Maskable) { 0.76 } else { 0.88 }
  $offset = ($Size * (1 - $scale)) / 2
  $unit = $Size * $scale
  $card = [System.Drawing.RectangleF]::new(
    [float]($offset + $unit * 0.12),
    [float]($offset + $unit * 0.08),
    [float]($unit * 0.76),
    [float]($unit * 0.84)
  )

  $cardPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
  Add-RoundedRectangle -Path $cardPath -Rectangle $card -Radius ([float]($unit * 0.12))
  $cardBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml("#171b22")
  )
  $borderPen = [System.Drawing.Pen]::new(
    [System.Drawing.ColorTranslator]::FromHtml("#39414e"),
    [float]($unit * 0.035)
  )
  $graphics.FillPath($cardBrush, $cardPath)
  $graphics.DrawPath($borderPen, $cardPath)

  $fold = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new([float]($offset + $unit * 0.66), [float]($offset + $unit * 0.08)),
    [System.Drawing.PointF]::new([float]($offset + $unit * 0.88), [float]($offset + $unit * 0.30)),
    [System.Drawing.PointF]::new([float]($offset + $unit * 0.74), [float]($offset + $unit * 0.30)),
    [System.Drawing.PointF]::new([float]($offset + $unit * 0.66), [float]($offset + $unit * 0.22))
  )
  $foldBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml("#7dd3fc")
  )
  $graphics.FillPolygon($foldBrush, $fold)

  $linePen = [System.Drawing.Pen]::new(
    [System.Drawing.ColorTranslator]::FromHtml("#eef2f7"),
    [float]($unit * 0.048)
  )
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  foreach ($line in @(
    @(0.30, 0.45, 0.70),
    @(0.30, 0.58, 0.70),
    @(0.30, 0.71, 0.58)
  )) {
    $graphics.DrawLine(
      $linePen,
      [float]($offset + $unit * $line[0]),
      [float]($offset + $unit * $line[1]),
      [float]($offset + $unit * $line[2]),
      [float]($offset + $unit * $line[1])
    )
  }

  $accentBrush = [System.Drawing.SolidBrush]::new(
    [System.Drawing.ColorTranslator]::FromHtml("#a78bfa")
  )
  $accentSize = [float]($unit * 0.08)
  $graphics.FillEllipse(
    $accentBrush,
    [float]($offset + $unit * 0.17),
    [float]($offset + $unit * 0.13),
    $accentSize,
    $accentSize
  )

  $outputPath = Join-Path $iconDirectory $FileName
  $stream = [System.IO.MemoryStream]::new()
  try {
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    [System.IO.File]::WriteAllBytes($outputPath, $stream.ToArray())
  }
  finally {
    $stream.Dispose()
    $accentBrush.Dispose()
    $linePen.Dispose()
    $foldBrush.Dispose()
    $borderPen.Dispose()
    $cardBrush.Dispose()
    $cardPath.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

New-ThyncSpaceIcon -Size 192 -FileName "icon-192.png"
New-ThyncSpaceIcon -Size 512 -FileName "icon-512.png"
New-ThyncSpaceIcon -Size 512 -FileName "icon-512-maskable.png" -Maskable
New-ThyncSpaceIcon -Size 180 -FileName "apple-touch-icon.png"

Write-Output "Generated PWA icons in $iconDirectory"
