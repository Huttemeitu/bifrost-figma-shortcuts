import AppKit
import Carbon.HIToolbox

/// A key plus modifiers (⌘⌃⌥⇧ only), e.g. the palette shortcut ⌃⌥Space.
struct Shortcut: Codable, Equatable, Sendable {
  let keyCode: Int64
  let modifiers: UInt64

  static let relevantFlags: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift]
  static let paletteDefault = Shortcut(keyCode: Int64(kVK_Space), flags: [.maskControl, .maskAlternate])

  init(keyCode: Int64, flags: CGEventFlags) {
    self.keyCode = keyCode
    modifiers = flags.intersection(Self.relevantFlags).rawValue
  }

  /// Shown in the menu in the current keyboard layout, so Norwegian keys show as Ø, not ;.
  var description: String {
    let flags = CGEventFlags(rawValue: modifiers)
    let symbols: [(CGEventFlags, String)] = [(.maskControl, "⌃"), (.maskAlternate, "⌥"), (.maskShift, "⇧"), (.maskCommand, "⌘")]
    return symbols.filter { flags.contains($0.0) }.map(\.1).joined() + keyName(keyCode)
  }

  // ---------- Saved shortcuts ----------

  private static let defaultsKey = "shortcuts"

  /// Recorded shortcuts by Bifrost command ("Open palette", "Alias 3"). Until
  /// anything is recorded, the palette has the default.
  static func load() -> [String: Shortcut] {
    guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return [Figma.paletteCommand: paletteDefault] }
    return (try? JSONDecoder().decode([String: Shortcut].self, from: data)) ?? [:]
  }

  static func save(_ shortcuts: [String: Shortcut]) {
    UserDefaults.standard.set(try? JSONEncoder().encode(shortcuts), forKey: defaultsKey)
  }
}

/// What the recorder got: a new shortcut, ⌫ (remove it) or Esc (cancel).
enum Recording: Sendable {
  case shortcut(Shortcut)
  case remove
  case cancel
}

private let specialKeys: [Int: String] = [
  kVK_Space: "Space", kVK_Return: "↩", kVK_Tab: "⇥", kVK_Delete: "⌫", kVK_ForwardDelete: "⌦",
  kVK_Escape: "⎋", kVK_LeftArrow: "←", kVK_RightArrow: "→", kVK_DownArrow: "↓", kVK_UpArrow: "↑",
  kVK_ANSI_KeypadEnter: "⌤", kVK_F1: "F1", kVK_F2: "F2", kVK_F3: "F3", kVK_F4: "F4", kVK_F5: "F5",
  kVK_F6: "F6", kVK_F7: "F7", kVK_F8: "F8", kVK_F9: "F9", kVK_F10: "F10", kVK_F11: "F11", kVK_F12: "F12",
]

private func keyName(_ code: Int64) -> String {
  if let name = specialKeys[Int(code)] { return name }
  guard let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
    let layout = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData)
  else { return "Key \(code)" }
  let data = Unmanaged<CFData>.fromOpaque(layout).takeUnretainedValue() as Data
  var deadKeys: UInt32 = 0
  var length = 0
  var chars = [UniChar](repeating: 0, count: 4)
  let status = data.withUnsafeBytes { raw in
    UCKeyTranslate(
      raw.bindMemory(to: UCKeyboardLayout.self).baseAddress, UInt16(code), UInt16(kUCKeyActionDisplay), 0,
      UInt32(LMGetKbdType()), OptionBits(kUCKeyTranslateNoDeadKeysBit), &deadKeys, chars.count, &length, &chars)
  }
  guard status == noErr, length > 0 else { return "Key \(code)" }
  return String(utf16CodeUnits: chars, count: length).uppercased()
}
