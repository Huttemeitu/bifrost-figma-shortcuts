import AppKit
import ServiceManagement

/// Menu bar app: numpad digits and recorded shortcuts in Figma press the
/// Bifrost plugin's menu commands. Alias N applies the alias named N (saved in
/// the palette's Aliases tab); Open palette and Fix variables can have one too.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  private let figma = Figma()
  private lazy var tap = KeyTap(figma: figma, onCommand: { [weak self] in self?.run($0) })
  private var permissionTimer: Timer?
  private var recordPanel: NSPanel?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let menu = NSMenu()
    menu.delegate = self
    statusItem.menu = menu
    statusItem.button?.image = logo
    tap.shortcuts = Shortcut.load()
    startWhenTrusted()
  }

  private func run(_ command: String) {
    if figma.run(command) { flashSuccess() } else { flashFailure() }
  }

  // Without Accessibility permission the tap can't be created. Ask once, then
  // check every 2 s so the app starts working as soon as it's granted.
  private func startWhenTrusted() {
    let prompt = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
    if AXIsProcessTrustedWithOptions(prompt), tap.start() { return updateIcon() }
    updateIcon()
    permissionTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, AXIsProcessTrusted(), self.tap.start() else { return }
        self.permissionTimer?.invalidate()
        self.updateIcon()
      }
    }
  }

  // ---------- Menu ----------

  // Rebuilt on every open so permission and login status are always current.
  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    if tap.isRunning {
      let enabled = item("Enabled", #selector(toggleEnabled))
      enabled.state = tap.isEnabled ? .on : .off
      menu.addItem(enabled)
      menu.addItem(.separator())
      menu.addItem(.sectionHeader(title: "Shortcuts: click to record"))
      menu.addItem(shortcutItem(Figma.paletteCommand))
      menu.addItem(shortcutItem(Figma.fixCommand))
      let aliases = NSMenuItem(title: "Aliases", action: nil, keyEquivalent: "")
      aliases.submenu = NSMenu()
      for n in 0..<Figma.aliasCount {
        aliases.submenu!.addItem(shortcutItem(Figma.aliasCommand(n), numpad: n < 10 ? "Numpad \(n)" : nil))
      }
      menu.addItem(aliases)
    } else {
      menu.addItem(item("Grant Accessibility access…", #selector(openAccessibilitySettings)))
    }
    menu.addItem(.separator())
    let login = item("Launch at login", #selector(toggleLaunchAtLogin))
    login.state = SMAppService.mainApp.status == .enabled ? .on : .off
    menu.addItem(login)
    menu.addItem(.separator())
    menu.addItem(item("Quit Bifrost Numpad", #selector(NSApplication.terminate(_:)), key: "q"))
  }

  private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.target = action == #selector(NSApplication.terminate(_:)) ? NSApp : self
    return item
  }

  // "Alias 3      Numpad 3, ⌃⌥B", the keys right-aligned and grey.
  private func shortcutItem(_ command: String, numpad: String? = nil) -> NSMenuItem {
    let item = item(command, #selector(recordShortcut(_:)))
    item.representedObject = command
    let style = NSMutableParagraphStyle()
    style.tabStops = [NSTextTab(textAlignment: .right, location: 200)]
    let title = NSMutableAttributedString(string: command, attributes: [.font: NSFont.menuFont(ofSize: 0), .paragraphStyle: style])
    let keys = [numpad, tap.shortcuts[command]?.description].compactMap { $0 }
    if !keys.isEmpty {
      title.append(NSAttributedString(
        string: "\t" + keys.joined(separator: ", "),
        attributes: [.font: NSFont.menuFont(ofSize: 0), .paragraphStyle: style, .foregroundColor: NSColor.secondaryLabelColor]))
    }
    item.attributedTitle = title
    return item
  }

  // Not saved: pausing is meant to be temporary, so every launch starts enabled.
  @objc private func toggleEnabled() {
    tap.isEnabled.toggle()
    updateIcon()
  }

  // ---------- Recording a shortcut ----------

  // A small window that only explains what to do; the key tap does the
  // recording, so it sees combos that a window would never get (like ⌘Q).
  @objc private func recordShortcut(_ sender: NSMenuItem) {
    guard let command = sender.representedObject as? String else { return }
    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: 300, height: 96), styleMask: [.titled, .closable],
      backing: .buffered, defer: false)
    panel.title = command
    panel.isReleasedWhenClosed = false
    panel.delegate = self
    let label = NSTextField(wrappingLabelWithString: "Press the new shortcut for \(command).\nIt needs ⌘, ⌃ or ⌥. ⌫ removes it, Esc cancels.")
    label.alignment = .center
    label.frame = panel.contentView!.bounds.insetBy(dx: 16, dy: 20)
    label.autoresizingMask = [.width, .height]
    panel.contentView!.addSubview(label)
    panel.center()
    recordPanel = panel
    NSApp.activate()
    panel.makeKeyAndOrderFront(nil)
    tap.recorder = { [weak self] result in self?.finishRecording(command, result) }
  }

  private func finishRecording(_ command: String, _ result: Recording) {
    switch result {
    case .shortcut(let shortcut):
      // A shortcut runs one command, so it moves here from any other.
      tap.shortcuts = tap.shortcuts.filter { $0.value != shortcut }
      tap.shortcuts[command] = shortcut
      Shortcut.save(tap.shortcuts)
    case .remove:
      tap.shortcuts[command] = nil
      Shortcut.save(tap.shortcuts)
    case .cancel:
      break
    }
    recordPanel?.close()
  }

  // Also runs when the window's close button is used, which cancels recording.
  func windowWillClose(_ notification: Notification) {
    tap.recorder = nil
    recordPanel = nil
  }

  @objc private func toggleLaunchAtLogin() {
    do {
      if SMAppService.mainApp.status == .enabled {
        try SMAppService.mainApp.unregister()
      } else {
        try SMAppService.mainApp.register()
      }
    } catch {
      NSAlert(error: error).runModal()
    }
  }

  @objc private func openAccessibilitySettings() {
    NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
  }

  // ---------- Icon ----------

  private func updateIcon() {
    statusItem.button?.appearsDisabled = !tap.isRunning || !tap.isEnabled
  }

  private let logo: NSImage = {
    let image = Bundle.main.image(forResource: "MenuIcon")!
    image.size = NSSize(width: 16, height: 16)
    image.accessibilityDescription = "Bifrost Numpad"
    return image
  }()

  // Shows that a key fired (highlight) or couldn't run (warning), then goes
  // back to normal. Figma shows the plugin's own toast too.
  private func flashSuccess() {
    statusItem.button?.highlight(true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.statusItem.button?.highlight(false) }
  }

  private func flashFailure() {
    let warning = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Bifrost Numpad")
    warning?.isTemplate = true
    statusItem.button?.image = warning
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
      guard let self else { return }
      self.statusItem.button?.image = self.logo
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
