import AppKit

/// The palette's aliases as of the last "Import aliases from clipboard", read
/// from its Copy as JSON: names for the Aliases menu, their ⌃⌥ keys and the
/// slot that runs each one. ⌃⌥ keys don't need it: ⌃⌥Q presses "Key q",
/// and the plugin knows which alias has that key.
struct Aliases: Codable {
  var expansions: [String: String] = [:]
  /// Key → alias name.
  var keys: [String: String] = [:]
  var slots: [String: Int] = [:]

  /// The menu command that runs the alias, or nil if it has neither a slot
  /// (more aliases than slots) nor a key. Before the first import, an alias
  /// named like a key ("3") is tried on that key, which it had before keys
  /// were set in the palette.
  func command(for name: String) -> String? {
    if let slot = slots[name] { return Figma.slotCommand(slot) }
    if let key = key(of: name) ?? (expansions.isEmpty && Figma.aliasKeys.contains(name) ? name : nil) {
      return Figma.keyCommand(key)
    }
    return nil
  }

  func key(of name: String) -> String? {
    keys.first { $0.value == name }?.key
  }

  // ---------- Import ----------

  enum ImportError: LocalizedError {
    case noAliases

    var errorDescription: String? {
      "The clipboard has no aliases. In the Bifrost palette, open ? › Aliases and click Copy as JSON, then import again."
    }
  }

  private struct Export: Decodable {
    let aliases: [String: String]
    let keys: [String: String]?
    let slots: [String: Int]?
  }

  static func fromClipboard() throws -> Aliases {
    guard let text = NSPasteboard.general.string(forType: .string),
      let export = try? JSONDecoder().decode(Export.self, from: Data(text.utf8))
    else { throw ImportError.noAliases }
    return Aliases(expansions: export.aliases, keys: export.keys ?? [:], slots: export.slots ?? [:])
  }

  // ---------- Saved ----------

  private static let defaultsKey = "aliases"

  static func load() -> Aliases {
    guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return Aliases() }
    return (try? JSONDecoder().decode(Aliases.self, from: data)) ?? Aliases()
  }

  func save() {
    UserDefaults.standard.set(try? JSONEncoder().encode(self), forKey: Self.defaultsKey)
  }
}
