import AppKit
import Carbon.HIToolbox
import os

/// Watches every keypress. While Figma is frontmost it swallows recorded
/// shortcuts and plain numpad digits (unless a text field has focus) and hands
/// their Bifrost command to onCommand: numpad N runs Alias N. While recording,
/// it captures the next shortcut instead. After the palette shortcut it holds
/// what's typed until the palette can take it. Everything else passes through.
@MainActor
final class KeyTap {
  private static let digits: [Int64: Int] = [
    Int64(kVK_ANSI_Keypad0): 0, Int64(kVK_ANSI_Keypad1): 1, Int64(kVK_ANSI_Keypad2): 2,
    Int64(kVK_ANSI_Keypad3): 3, Int64(kVK_ANSI_Keypad4): 4, Int64(kVK_ANSI_Keypad5): 5,
    Int64(kVK_ANSI_Keypad6): 6, Int64(kVK_ANSI_Keypad7): 7, Int64(kVK_ANSI_Keypad8): 8,
    Int64(kVK_ANSI_Keypad9): 9,
  ]

  var isEnabled = true
  /// Recorded shortcuts by Bifrost command.
  var shortcuts: [String: Shortcut] = [:]
  /// Set to record: gets the next key with ⌘, ⌃ or ⌥, ⌫ or Esc.
  var recorder: ((Recording) -> Void)?
  private let figma: Figma
  private let onCommand: (String) -> Void
  private var tap: CFMachPort?
  // A key whose keyDown was swallowed also gets its keyUp swallowed, even if
  // focus moved in between, so Figma never sees half a keypress.
  private var swallowed: Set<Int64> = []

  // Figma takes a moment to open the palette, and keys typed meanwhile would
  // reach Figma as shortcuts. They're held (nil = not holding) until a new
  // text field has focus, the palette's input, and then typed into it.
  private var held: [HeldKey]?
  private var holdStart = Date()
  private var focusBefore: AXUIElement?
  private var holdTimer: Timer?
  /// Long enough for a cold plugin start. After it, held keys go to Figma's
  /// focused text field if there is one, else they're dropped.
  private static let holdTimeout: TimeInterval = 3
  /// Marks replayed keys, so the tap lets them through.
  private static let replayMarker: Int64 = 0x4249_4652
  /// Called when held keys were dropped because the palette never got focus.
  var onDropped: (() -> Void)?
  private let log = Logger(subsystem: "no.intility.bifrost-numpad", category: "palette")

  init(figma: Figma, onCommand: @escaping (String) -> Void) {
    self.figma = figma
    self.onCommand = onCommand
  }

  var isRunning: Bool { tap != nil }

  /// Fails without Accessibility permission.
  func start() -> Bool {
    if tap != nil { return true }
    let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)
    let callback: CGEventTapCallBack = { _, type, event, info in
      let tap = Unmanaged<KeyTap>.fromOpaque(info!).takeUnretainedValue()
      let key = Key(
        code: event.getIntegerValueField(.keyboardEventKeycode), flags: event.flags,
        isRepeat: event.getIntegerValueField(.keyboardEventAutorepeat) != 0,
        isReplay: event.getIntegerValueField(.eventSourceUserData) == KeyTap.replayMarker)
      // The tap's run loop source is on the main run loop.
      let swallow = MainActor.assumeIsolated { tap.shouldSwallow(type, key) }
      return swallow ? nil : Unmanaged.passUnretained(event)
    }
    tap = CGEvent.tapCreate(
      tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
      eventsOfInterest: CGEventMask(mask), callback: callback,
      userInfo: Unmanaged.passUnretained(self).toOpaque())
    guard let tap else { return false }
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, tap, 0), .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    return true
  }

  private func shouldSwallow(_ type: CGEventType, _ key: Key) -> Bool {
    // macOS turns the tap off if a callback is slow; turn it back on.
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
      return false
    }
    if key.isReplay { return false }
    if type == .keyUp { return swallowed.remove(key.code) != nil || hold(key, isDown: false) }

    let shortcut = Shortcut(keyCode: key.code, flags: key.flags)
    if let recorder {
      swallowed.insert(key.code)
      if key.code == Int64(kVK_Escape) && shortcut.modifiers == 0 {
        finish(recorder, .cancel)
      } else if [Int64(kVK_Delete), Int64(kVK_ForwardDelete)].contains(key.code) && shortcut.modifiers == 0 {
        finish(recorder, .remove)
      } else if !key.flags.isDisjoint(with: [.maskCommand, .maskControl, .maskAlternate]) {
        // Shift alone isn't enough: it would catch normal typing.
        finish(recorder, .shortcut(shortcut))
      }
      return true
    }

    guard isEnabled, figma.isFrontmost else { return false }
    if held != nil {
      if key.code == Int64(kVK_Escape) && shortcut.modifiers == 0 {
        swallowed.insert(key.code)
        dropHeld(reason: "Esc")
        return true
      }
      // The shortcut again (or its auto-repeat) isn't text for the palette.
      if Figma.windowCommands.contains(where: { shortcuts[$0] == shortcut }) {
        swallowed.insert(key.code)
        return true
      }
      return hold(key, isDown: true)
    }
    // Unlike digits, shortcuts also work in text fields: a modifier combo
    // doesn't type anything.
    if let command = shortcuts.first(where: { $0.value == shortcut })?.key {
      if Figma.windowCommands.contains(command) { startHolding() }
      return swallow(key) { $0.onCommand(command) }
    }
    guard let digit = Self.digits[key.code], shortcut.modifiers == 0, !figma.isTyping else { return false }
    return swallow(key) { $0.onCommand(Figma.aliasCommand(digit)) }
  }

  // Runs off the callback, so a slow menu press can't time out the tap.
  private func swallow(_ key: Key, _ action: @escaping (KeyTap) -> Void) -> Bool {
    swallowed.insert(key.code)
    if !key.isRepeat { DispatchQueue.main.async { action(self) } }
    return true
  }

  private func finish(_ recorder: @escaping (Recording) -> Void, _ result: Recording) {
    self.recorder = nil
    DispatchQueue.main.async { recorder(result) }
  }

  // ---------- Holding keys for the palette ----------

  private func startHolding() {
    held = []
    holdStart = Date()
    focusBefore = figma.focusedElement
    holdTimer?.invalidate()
    holdTimer = Timer.scheduledTimer(withTimeInterval: 0.025, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.checkHold() }
    }
  }

  private func hold(_ key: Key, isDown: Bool) -> Bool {
    guard held != nil else { return false }
    held?.append(HeldKey(code: key.code, flags: key.flags, isDown: isDown))
    return true
  }

  /// The menu press failed, so no palette is coming.
  func cancelHold() {
    dropHeld(reason: "menu press failed", quietly: true)
  }

  private var waited: Int { Int(Date().timeIntervalSince(holdStart) * 1000) }

  private func checkHold() {
    guard let keys = held else { return }
    if let focused = figma.focusedElement, figma.isTextField(focused),
      !(focusBefore.map { CFEqual($0, focused) } ?? false)
    {
      log.notice("Palette input focused after \(self.waited) ms, typing \(keys.count) held key events")
      return release(keys)
    }
    guard Date().timeIntervalSince(holdStart) > Self.holdTimeout else { return }
    // Focus never moved (the palette was already open, or Figma's text field
    // isn't one to Accessibility): a text field can still take the keys.
    if figma.isTyping {
      log.notice("No new text field after \(self.waited) ms, typing \(keys.count) held key events into the focused one")
      release(keys)
    } else {
      dropHeld(reason: "no text field after \(waited) ms")
    }
  }

  private func stopHolding() {
    held = nil
    focusBefore = nil
    holdTimer?.invalidate()
    holdTimer = nil
  }

  private func dropHeld(reason: String, quietly: Bool = false) {
    guard let keys = held else { return }
    stopHolding()
    log.notice("Dropped \(keys.count) held key events: \(reason, privacy: .public)")
    if !keys.isEmpty && !quietly { onDropped?() }
  }

  // Posted straight to Figma, past every event tap: keys typed while these
  // are posted still wait in the tap, so the order stays as typed.
  private func release(_ keys: [HeldKey]) {
    stopHolding()
    guard let pid = figma.pid else { return }
    let source = CGEventSource(stateID: .privateState)
    for key in keys {
      guard let event = CGEvent(keyboardEventSource: source, virtualKey: CGKeyCode(key.code), keyDown: key.isDown) else { continue }
      event.flags = key.flags
      event.setIntegerValueField(.eventSourceUserData, value: Self.replayMarker)
      event.postToPid(pid)
    }
  }
}

private struct HeldKey {
  let code: Int64
  let flags: CGEventFlags
  let isDown: Bool
}

// CGEvent isn't Sendable, so the callback copies out what it needs.
private struct Key: Sendable {
  let code: Int64
  let flags: CGEventFlags
  let isRepeat: Bool
  let isReplay: Bool
}
