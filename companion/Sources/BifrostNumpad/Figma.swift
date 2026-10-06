import AppKit
import ApplicationServices

/// Talks to the Figma desktop app through the Accessibility API: presses the
/// Bifrost plugin's "Numpad N" menu items and checks whether a text field has focus.
@MainActor
final class Figma {
  static let bundleID = "com.figma.Desktop"
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

  /// True while the user types in a field (W/H, layer name, text layer), so
  /// numpad digits should reach Figma as digits.
  var isTyping: Bool {
    guard let app = frontmost,
      let focused: AXUIElement = attribute(AXUIElementCreateApplication(app.processIdentifier), kAXFocusedUIElementAttribute),
      let role: String = attribute(focused, kAXRoleAttribute)
    else { return false }
    return Self.textRoles.contains(role)
  }

  /// Runs Plugins › … › Bifrost › Numpad › Numpad <digit>. Returns false if the
  /// menu item can't be found or pressed (plugin not installed, Figma busy).
  func runNumpad(_ digit: String) -> Bool {
    guard let app = frontmost else { return false }
    if app.processIdentifier != menuPid {
      menuItems = [:]
      menuPid = app.processIdentifier
    }
    if let cached = menuItems[digit], press(cached) { return true }
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    guard let bar: AXUIElement = attribute(axApp, kAXMenuBarAttribute),
      let item = findItem(in: bar, title: "Numpad \(digit)", underBifrost: false)
    else { return false }
    menuItems[digit] = item
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
