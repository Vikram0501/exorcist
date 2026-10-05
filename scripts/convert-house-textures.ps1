param([Parameter(Mandatory = $true)][string]$Directory)

Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = [System.Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality, [long]88
)

try {
  foreach ($sourcePath in [System.IO.Directory]::GetFiles($Directory, '*.src')) {
    $format = [System.IO.File]::ReadAllText([System.IO.Path]::ChangeExtension($sourcePath, '.format'))
    $targetPath = [System.IO.Path]::ChangeExtension($sourcePath, $format)
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    try {
      $limit = if ($source.Width -le 2048) { 1024 } else { 2048 }
      $width = [Math]::Min($source.Width, $limit)
      $height = [Math]::Min($source.Height, $limit)
      $result = [System.Drawing.Bitmap]::new($width, $height)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($result)
        try {
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.DrawImage($source, 0, 0, $width, $height)
        } finally { $graphics.Dispose() }
        if ($format -eq '.jpg') {
          $result.Save($targetPath, $codec, $quality)
        } else {
          $result.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
      } finally { $result.Dispose() }
    } finally { $source.Dispose() }
  }
} finally { $quality.Dispose() }
