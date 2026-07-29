param(
  [string]$Source = "build/source-avatar.jpg"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-RoundedAvatar {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size
  )
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $bitmap.SetResolution(96, 96)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $margin = [Math]::Max(1, [int]($Size * 0.035))
  $diameter = $Size - ($margin * 2)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $radius = [int]($Size * 0.22)
  $bounds = [System.Drawing.Rectangle]::new($margin, $margin, $diameter, $diameter)
  $path.AddArc($bounds.Left, $bounds.Top, $radius, $radius, 180, 90)
  $path.AddArc($bounds.Right - $radius, $bounds.Top, $radius, $radius, 270, 90)
  $path.AddArc($bounds.Right - $radius, $bounds.Bottom - $radius, $radius, $radius, 0, 90)
  $path.AddArc($bounds.Left, $bounds.Bottom - $radius, $radius, $radius, 90, 90)
  $path.CloseFigure()
  $graphics.SetClip($path)

  $side = [Math]::Min($Image.Width, $Image.Height)
  $source = [System.Drawing.Rectangle]::new(
    [int](($Image.Width - $side) / 2),
    [int](($Image.Height - $side) / 2),
    $side,
    $side
  )
  $graphics.DrawImage($Image, $bounds, $source, [System.Drawing.GraphicsUnit]::Pixel)
  $graphics.Dispose()
  $path.Dispose()
  return $bitmap
}

function Write-PngIco {
  param(
    [string]$Path,
    [byte[][]]$PngImages,
    [int[]]$Sizes
  )
  $stream = [System.IO.File]::Create($Path)
  $writer = [System.IO.BinaryWriter]::new($stream)
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$PngImages.Count)
  $offset = 6 + (16 * $PngImages.Count)
  for ($index = 0; $index -lt $PngImages.Count; $index++) {
    $size = $Sizes[$index]
    $writer.Write([byte]($(if ($size -eq 256) { 0 } else { $size })))
    $writer.Write([byte]($(if ($size -eq 256) { 0 } else { $size })))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$PngImages[$index].Length)
    $writer.Write([UInt32]$offset)
    $offset += $PngImages[$index].Length
  }
  foreach ($png in $PngImages) {
    $writer.Write($png)
  }
  $writer.Dispose()
  $stream.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root $Source
$rendererDirectory = Join-Path $root "src/renderer/assets"
$buildDirectory = Join-Path $root "build"
New-Item -ItemType Directory -Force -Path $rendererDirectory, $buildDirectory | Out-Null

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngImages = @()
foreach ($size in $sizes) {
  $bitmap = New-RoundedAvatar -Image $sourceImage -Size $size
  $memory = [System.IO.MemoryStream]::new()
  $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngImages += ,$memory.ToArray()
  if ($size -eq 256) {
    $bitmap.Save(
      (Join-Path $rendererDirectory "bag-lab-avatar.png"),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
    $bitmap.Save(
      (Join-Path $buildDirectory "icon.png"),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
  }
  $memory.Dispose()
  $bitmap.Dispose()
}
$sourceImage.Dispose()

Write-PngIco `
  -Path (Join-Path $rendererDirectory "bag-lab-avatar.ico") `
  -PngImages $pngImages `
  -Sizes $sizes
Copy-Item `
  -LiteralPath (Join-Path $rendererDirectory "bag-lab-avatar.ico") `
  -Destination (Join-Path $buildDirectory "icon.ico") `
  -Force
