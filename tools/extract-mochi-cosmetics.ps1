Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$script:CropperType = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class MochiOutfitCropper {
  private static bool IsForeground(byte b, byte g, byte r, byte a) {
    if (a < 10) return false;
    int brightness = (r + g + b) / 3;
    return brightness < 245;
  }

  private static void TryEnqueue(
    int nx,
    int ny,
    int width,
    int height,
    byte[] buffer,
    int stride,
    bool[] visited,
    int[] queue,
    ref int tail
  ) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
    int nidx = ny * width + nx;
    if (visited[nidx]) return;
    int noffset = ny * stride + nx * 4;
    byte nb = buffer[noffset + 0];
    byte ng = buffer[noffset + 1];
    byte nr = buffer[noffset + 2];
    byte na = buffer[noffset + 3];
    visited[nidx] = true;
    if (!IsForeground(nb, ng, nr, na)) return;
    queue[tail++] = nidx;
  }

  public static List<Rectangle> FindComponents(string path, int minArea) {
    Bitmap source = new Bitmap(path);
    Bitmap bmp = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(bmp)) {
      g.DrawImageUnscaled(source, 0, 0);
    }
    source.Dispose();

    List<Rectangle> rects = new List<Rectangle>();
    BitmapData data = bmp.LockBits(
      new Rectangle(0, 0, bmp.Width, bmp.Height),
      ImageLockMode.ReadOnly,
      PixelFormat.Format32bppArgb
    );
    try {
      int width = bmp.Width;
      int height = bmp.Height;
      int stride = data.Stride;
      int bytes = Math.Abs(stride) * height;
      byte[] buffer = new byte[bytes];
      Marshal.Copy(data.Scan0, buffer, 0, bytes);
      bool[] visited = new bool[width * height];
      int[] queue = new int[width * height];

      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          int idx = y * width + x;
          if (visited[idx]) continue;
          int offset = y * stride + x * 4;
          byte b = buffer[offset + 0];
          byte g = buffer[offset + 1];
          byte r = buffer[offset + 2];
          byte a = buffer[offset + 3];
          visited[idx] = true;
          if (!IsForeground(b, g, r, a)) continue;

          int head = 0;
          int tail = 0;
          queue[tail++] = idx;
          int minX = x, maxX = x, minY = y, maxY = y;
          int area = 0;

          while (head < tail) {
            int cur = queue[head++];
            int cy = cur / width;
            int cx = cur - cy * width;
            area++;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            TryEnqueue(cx - 1, cy, width, height, buffer, stride, visited, queue, ref tail);
            TryEnqueue(cx + 1, cy, width, height, buffer, stride, visited, queue, ref tail);
            TryEnqueue(cx, cy - 1, width, height, buffer, stride, visited, queue, ref tail);
            TryEnqueue(cx, cy + 1, width, height, buffer, stride, visited, queue, ref tail);
          }

          if (area >= minArea) {
            rects.Add(Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1));
          }
        }
      }
    } finally {
      bmp.UnlockBits(data);
      bmp.Dispose();
    }
    rects.Sort((a, b) => {
      int byY = a.Top.CompareTo(b.Top);
      if (byY != 0) return byY;
      return a.Left.CompareTo(b.Left);
    });
    return rects;
  }

  private static bool IsWhiteLike(Color c) {
    int brightness = (c.R + c.G + c.B) / 3;
    return c.A < 10 || brightness > 245;
  }

  public static void SaveCrop(string sourcePath, Rectangle rect, string outputPath, int padding) {
    Bitmap source = new Bitmap(sourcePath);
    int left = Math.Max(0, rect.Left - padding);
    int top = Math.Max(0, rect.Top - padding);
    int right = Math.Min(source.Width, rect.Right + padding);
    int bottom = Math.Min(source.Height, rect.Bottom + padding);
    int width = Math.Max(1, right - left);
    int height = Math.Max(1, bottom - top);

    Bitmap crop = new Bitmap(width, height, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(crop)) {
      g.DrawImage(source, new Rectangle(0, 0, width, height), new Rectangle(left, top, width, height), GraphicsUnit.Pixel);
    }
    source.Dispose();

    for (int y = 0; y < crop.Height; y++) {
      for (int x = 0; x < crop.Width; x++) {
        Color c = crop.GetPixel(x, y);
        if (IsWhiteLike(c)) {
          crop.SetPixel(x, y, Color.FromArgb(0, 255, 255, 255));
        }
      }
    }

    Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
    crop.Save(outputPath, ImageFormat.Png);
    crop.Dispose();
  }
}
'@

if (-not ('MochiOutfitCropper' -as [type])) {
  Add-Type -TypeDefinition $script:CropperType -Language CSharp -ReferencedAssemblies System.Drawing
}

$sourceFiles = @(
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\E2A859D4-2187-4157-827D-73ECA697C32C.png'
    Prefix = 'shalani-energy'
    MinArea = 16000
    Padding = 14
  },
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\E2C64E2D-5F53-4C91-A34A-2879FB750F77.png'
    Prefix = 'dr-shelly'
    MinArea = 16000
    Padding = 14
  },
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\E597971E-66D4-41E6-8391-2D670EF8DB8A.png'
    Prefix = 'sussballs'
    MinArea = 16000
    Padding = 14
  },
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\BDE2671A-6CD1-44B4-A9BE-61057535FE27.png'
    Prefix = 'watermelon'
    MinArea = 10000
    Padding = 16
  },
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\A028C66F-72E2-4472-8464-C260E0FB8E2A.png'
    Prefix = 'dr-shelly-set-2'
    MinArea = 16000
    Padding = 14
  },
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\C61C07C5-101A-47DD-AF1B-01AAB8D31D2E.png'
    Prefix = 'hair-dark'
    MinArea = 12000
    Padding = 14
  },
  [pscustomobject]@{
    Path = 'C:\Users\ellis\Downloads\4617E5B3-4E82-4C91-87C2-E2067D99031D.png'
    Prefix = 'hair-brown'
    MinArea = 12000
    Padding = 14
  }
)

$outputRoot = 'C:\Users\ellis\Desktop\mochi-bot\web\public\mochi\assets\cosmetics'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$manifest = @()

foreach ($sheet in $sourceFiles) {
  $rects = [MochiOutfitCropper]::FindComponents($sheet.Path, $sheet.MinArea)
  $index = 1
  foreach ($rect in $rects) {
    $fileName = '{0}-{1:00}.png' -f $sheet.Prefix, $index
    $outputPath = Join-Path $outputRoot $fileName
    [MochiOutfitCropper]::SaveCrop($sheet.Path, $rect, $outputPath, $sheet.Padding)
    $manifest += [pscustomobject]@{
      id = '{0}-{1:00}' -f $sheet.Prefix, $index
      file = $fileName
      source = Split-Path -Leaf $sheet.Path
      x = $rect.X
      y = $rect.Y
      width = $rect.Width
      height = $rect.Height
    }
    $index++
  }
}

$manifestPath = Join-Path $outputRoot 'manifest.json'
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host \"Wrote $($manifest.Count) cosmetic crops to $outputRoot\"
