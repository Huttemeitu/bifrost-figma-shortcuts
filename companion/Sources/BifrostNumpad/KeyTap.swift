import AppKit
import Carbon.HIToolbox

/// Watches every keypress. While Figma is frontmost it swallows recorded
/// shortcuts and plain numpad digits (unless a text field has focus) and hands
/// their Bifrost command to onCommand: numpad N runs Alias N. While recording,
/// it captures the next shortcut instead. Everything else passes through.
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
        isRepeat: event.getIntegerValueField(.keyboardEventAutorepeat) != 0)
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
    if type == .keyUp { return swallowed.remove(key.code) != nil }

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
    // Unlike digits, shortcuts also work in text fields: a modifier combo
    // doesn't type anything.
    if let command = shortcuts.first(where: { $0.value == shortcut })?.key {
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
}

// CGEvent isn't Sendable, so the callback copies out what it needs.
private struct Key: Sendable {
  let code: Int64
  let flags: CGEventFlags
  let isRepeat: Bool
}
