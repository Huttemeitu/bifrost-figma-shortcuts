// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "BifrostCompanion",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(name: "BifrostCompanion", path: "Sources/BifrostCompanion"),
  ]
)
