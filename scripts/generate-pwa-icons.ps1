Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
if (-not ("ThyncSpaceNativeIcon" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ThyncSpaceNativeIcon
{
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr handle);
}
"@
}

$publicDirectory = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot "..\public")
)
$iconDirectory = Join-Path $publicDirectory "icons"
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

$brandBlue = [System.Drawing.ColorTranslator]::FromHtml("#0b63e5")
$brandBlueStrong = [System.Drawing.ColorTranslator]::FromHtml("#0849b5")
$foldBlue = [System.Drawing.ColorTranslator]::FromHtml("#bfdbfe")
$paperWhite = [System.Drawing.Color]::White

function New-ThyncSpaceIconPngBytes {
  param(
    [ValidateRange(16, 1024)]
    [int]$Size,
    [switch]$Maskable
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear($brandBlue)

    $scale = if ($Maskable) { 0.70 } else { 0.86 }
    $offset = [float](($Size * (1 - $scale)) / 2)
    $unit = [float]($Size * $scale)
    $left = [float]($offset + $unit * 0.09)
    $top = [float]($offset + $unit * 0.04)
    $right = [float]($offset + $unit * 0.91)
    $bottom = [float]($offset + $unit * 0.96)
    $fold = [float]($unit * 0.24)

    $pagePoints = [System.Drawing.PointF[]]@(
      [System.Drawing.PointF]::new($left, $top),
      [System.Drawing.PointF]::new($right, $top),
      [System.Drawing.PointF]::new($right, [float]($bottom - $fold)),
      [System.Drawing.PointF]::new([float]($right - $fold), $bottom),
      [System.Drawing.PointF]::new($left, $bottom)
    )
    $pagePath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $pageBrush = [System.Drawing.SolidBrush]::new($paperWhite)
    $borderPen = [System.Drawing.Pen]::new(
      $brandBlueStrong,
      [float][Math]::Max(1, $unit * 0.032)
    )

    try {
      $borderPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
      $pagePath.AddPolygon($pagePoints)
      $graphics.FillPath($pageBrush, $pagePath)
      $graphics.DrawPath($borderPen, $pagePath)

      $foldPoints = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new([float]($right - $fold), $bottom),
        [System.Drawing.PointF]::new([float]($right - $fold), [float]($bottom - $fold)),
        [System.Drawing.PointF]::new($right, [float]($bottom - $fold))
      )
      $foldBrush = [System.Drawing.SolidBrush]::new($foldBlue)
      try {
        $graphics.FillPolygon($foldBrush, $foldPoints)
        $graphics.DrawPolygon($borderPen, $foldPoints)
      }
      finally {
        $foldBrush.Dispose()
      }

      $linePen = [System.Drawing.Pen]::new(
        $brandBlue,
        [float][Math]::Max(1, $unit * 0.052)
      )
      try {
        $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        foreach ($line in @(
          @(0.28, 0.35, 0.72),
          @(0.28, 0.51, 0.72),
          @(0.28, 0.67, 0.59)
        )) {
          $graphics.DrawLine(
            $linePen,
            [float]($offset + $unit * $line[0]),
            [float]($offset + $unit * $line[1]),
            [float]($offset + $unit * $line[2]),
            [float]($offset + $unit * $line[1])
          )
        }
      }
      finally {
        $linePen.Dispose()
      }
    }
    finally {
      $borderPen.Dispose()
      $pageBrush.Dispose()
      $pagePath.Dispose()
    }

    $stream = [System.IO.MemoryStream]::new()
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    }
    finally {
      $stream.Dispose()
    }
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Save-ThyncSpaceIcon {
  param(
    [int]$Size,
    [string]$FileName,
    [switch]$Maskable
  )

  [byte[]]$bytes = New-ThyncSpaceIconPngBytes -Size $Size -Maskable:$Maskable
  [System.IO.File]::WriteAllBytes((Join-Path $iconDirectory $FileName), $bytes)
}

Save-ThyncSpaceIcon -Size 192 -FileName "icon-192.png"
Save-ThyncSpaceIcon -Size 512 -FileName "icon-512.png"
Save-ThyncSpaceIcon -Size 512 -FileName "icon-512-maskable.png" -Maskable
Save-ThyncSpaceIcon -Size 180 -FileName "apple-touch-icon.png"

$faviconPath = Join-Path $publicDirectory "favicon.ico"
[byte[]]$faviconPng = New-ThyncSpaceIconPngBytes -Size 32
$pngStream = [System.IO.MemoryStream]::new($faviconPng)
$faviconBitmap = [System.Drawing.Bitmap]::FromStream($pngStream)
$faviconHandle = [IntPtr]::Zero
try {
  $faviconHandle = $faviconBitmap.GetHicon()
  $faviconIcon = [System.Drawing.Icon]::FromHandle($faviconHandle)
  try {
    $faviconStream = [System.IO.File]::Create($faviconPath)
    try {
      $faviconIcon.Save($faviconStream)
    }
    finally {
      $faviconStream.Dispose()
    }
  }
  finally {
    $faviconIcon.Dispose()
  }
}
finally {
  if ($faviconHandle -ne [IntPtr]::Zero) {
    [ThyncSpaceNativeIcon]::DestroyIcon($faviconHandle) | Out-Null
  }
  $faviconBitmap.Dispose()
  $pngStream.Dispose()
}

Write-Output "Generated blue-and-white PWA and favicon assets in $publicDirectory"
