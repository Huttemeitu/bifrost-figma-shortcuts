// Writes an .iconset (for iconutil) with the logo centered on a dark square.
// macOS 26+ shows an icon that doesn't fill its square inside a grey rounded
// square, so the background is full bleed and macOS rounds the corners.
//   swift app-icon.swift Resources/Logo.png AppIcon.iconset
import AppKit

let background = NSColor(srgbRed: 0x15 / 255, green: 0x17 / 255, blue: 0x1C / 255, alpha: 1)
let logoScale = 0.62

let args = CommandLine.arguments
let logo = NSImage(contentsOfFile: args[1])!
let iconset = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

for points in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let pixels = points * scale
    let rep = NSBitmapImageRep(
      bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
      samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
      bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    background.setFill()
    NSRect(x: 0, y: 0, width: pixels, height: pixels).fill()
    let size = Double(pixels) * logoScale
    let inset = (Double(pixels) - size) / 2
    logo.draw(in: NSRect(x: inset, y: inset, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    try rep.representation(using: .png, properties: [:])!.write(to: iconset.appendingPathComponent(name))
  }
}
