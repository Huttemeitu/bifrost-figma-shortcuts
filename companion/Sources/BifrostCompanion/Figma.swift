import AppKit
import ApplicationServices

/// Talks to the Figma desktop app through the Accessibility API: presses the
/// Bifrost plugin's menu items and checks whether a text field has focus.
@MainActor
final class Figma {
  static let bundleID = "com.figma.Desktop"
  nonisolated static let paletteCommand = "Open palette"
  nonisolated static let reviewCommand = "Review variables"
  /// Commands that open the palette window, so keys typed right after them are held for it.
  nonisolated static let windowCommands: Set<String> = [paletteCommand, reviewCommand]
  /// Alias 0 to 29: must match ALIAS_COMMANDS in generate.js.
  nonisolated static let aliasCount = 30
  nonisolated static func aliasCommand(_ n: Int) -> String { "Alias \(n)" }
  private static let textRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]

  // Menu items are cached per Figma process. A cached item can go stale when
  // Figma rebuilds its menus, so a failed press searches again.
  private var menuItems: [String: AXUIElement] = [:]
  private var menuPid: pid_t = 0

  private var frontmost: NSRunningApplication? {
    let app = NSWorkspace.shared.frontmostApplication
    return app?.bundleIdentifier == Self.bundleID ? app : nil
  }

  var isFrontmost: Bool { frontmost != nil }
  var pid: pid_t? { frontmost?.processIdentifier }

  /// True while the user types in a field (W/H, layer name, text layer, the
  /// palette's input), so numpad digits should reach Figma as digits.
  var isTyping: Bool { focusedElement.map(isTextField) ?? false }

  /// What has keyboard focus in Figma, while Figma is frontmost.
  var focusedElement: AXUIElement? {
    guard let app = frontmost else { return nil }
    return attribute(AXUIElementCreateApplication(app.processIdentifier), kAXFocusedUIElementAttribute)
  }

  func isTextField(_ element: AXUIElement) -> Bool {
    guard let role: String = attribute(element, kAXRoleAttribute) else { return false }
    return Self.textRoles.contains(role)
  }

  /// Runs a Bifrost plugin command, e.g. "Open palette" or "Alias 1". Returns
  /// false if the menu item can't be found or pressed (plugin not installed, Figma busy).
  func run(_ command: String) -> Bool {
    guard let app = frontmost else { return false }
    if app.processIdentifier != menuPid {
      menuItems = [:]
      menuPid = app.processIdentifier
    }
    if let cached = menuItems[command], press(cached) { return true }
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    guard let bar: AXUIElement = attribute(axApp, kAXMenuBarAttribute),
      let item = findItem(in: bar, title: command, underBifrost: false)
    else { return false }
    menuItems[command] = item
    return press(item)
  }

  private func press(_ item: AXUIElement) -> Bool {
    AXUIElementPerformAction(item, kAXPressAction as CFString) == .success
  }

  // The item must sit somewhere below a "Bifrost" menu: the path differs between
  // a development plugin and one published to the organization.
  private func findItem(in element: AXUIElement, title: String, underBifrost: Bool) -> AXUIElement? {
    let name: String = attribute(element, kAXTitleAttribute) ?? ""
    if name == title && underBifrost { return element }
    let below = underBifrost || name == "Bifrost"
    for child: AXUIElement in attribute(element, kAXChildrenAttribute) ?? [] {
      if let hit = findItem(in: child, title: title, underBifrost: below) { return hit }
    }
    return nil
  }

  private func attribute<T>(_ element: AXUIElement, _ name: String) -> T? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value as? T
  }
}
