// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "BifrostNumpad",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(name: "BifrostNumpad", path: "Sources/BifrostNumpad"),
  ]
)
