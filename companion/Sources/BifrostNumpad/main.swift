import AppKit
import ServiceManagement

/// Menu bar app: numpad digits in Figma run the Bifrost plugin's Numpad N
/// command, which applies the alias named N (assigned in the plugin with
/// =1 button pm). A recordable shortcut opens the palette.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  private let figma = Figma()
  private lazy var tap = KeyTap(
    figma: figma,
    onDigit: { [weak self] digit in self?.run("Numpad \(digit)") },
    onPalette: { [weak self] in self?.run("Open palette") })
  private var permissionTimer: Timer?
  private var recordPanel: NSPanel?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let menu = NSMenu()
    menu.delegate = self
    statusItem.menu = menu
    setIcon("square.grid.3x3")
    tap.paletteShortcut = Shortcut.loadPalette()
    startWhenTrusted()
  }

  private func run(_ command: String) {
    flash(figma.run(command) ? "square.grid.3x3.fill" : "exclamationmark.triangle")
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
      menu.addItem(withTitle: "Open palette: " + (tap.paletteShortcut?.description ?? "no shortcut"), action: nil, keyEquivalent: "")
      menu.addItem(item("Record palette shortcut…", #selector(recordShortcut)))
      if tap.paletteShortcut != nil { menu.addItem(item("Remove palette shortcut", #selector(removeShortcut))) }
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

  // Not saved: pausing is meant to be temporary, so every launch starts enabled.
  @objc private func toggleEnabled() {
    tap.isEnabled.toggle()
    updateIcon()
  }

  // ---------- Recording the palette shortcut ----------

  // A small window that only explains what to do; the key tap does the
  // recording, so it sees combos that a window would never get (like ⌘Q).
  @objc private func recordShortcut() {
    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: 300, height: 80), styleMask: [.titled, .closable],
      backing: .buffered, defer: false)
    panel.title = "Palette shortcut"
    panel.isReleasedWhenClosed = false
    panel.delegate = self
    let label = NSTextField(wrappingLabelWithString: "Press the new shortcut for the palette.\nIt needs ⌘, ⌃ or ⌥. Esc cancels.")
    label.alignment = .center
    label.frame = panel.contentView!.bounds.insetBy(dx: 16, dy: 20)
    label.autoresizingMask = [.width, .height]
    panel.contentView!.addSubview(label)
    panel.center()
    recordPanel = panel
    NSApp.activate()
    panel.makeKeyAndOrderFront(nil)
    tap.recorder = { [weak self] shortcut in self?.finishRecording(shortcut) }
  }

  private func finishRecording(_ shortcut: Shortcut?) {
    if let shortcut {
      tap.paletteShortcut = shortcut
      Shortcut.savePalette(shortcut)
    }
    recordPanel?.close()
  }

  // Also runs when the window's close button is used, which cancels recording.
  func windowWillClose(_ notification: Notification) {
    tap.recorder = nil
    recordPanel = nil
  }

  @objc private func removeShortcut() {
    tap.paletteShortcut = nil
    Shortcut.savePalette(nil)
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

  private func setIcon(_ symbol: String) {
    let image = NSImage(systemSymbolName: symbol, accessibilityDescription: "Bifrost Numpad")
    image?.isTemplate = true
    statusItem.button?.image = image
  }

  // Shows that a key fired (filled grid) or couldn't run (warning), then
  // goes back to the normal icon. Figma shows the plugin's own toast too.
  private func flash(_ symbol: String) {
    setIcon(symbol)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.setIcon("square.grid.3x3") }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
