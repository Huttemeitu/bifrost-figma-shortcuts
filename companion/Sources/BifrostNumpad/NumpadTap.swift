import AppKit
import Carbon.HIToolbox

/// Catches plain numpad digits while Figma is frontmost and not in a text
/// field, swallows them and hands the digit to onDigit. Everything else
/// (other apps, top-row digits, modifier combos, typing) passes through.
@MainActor
final class NumpadTap {
  private static let digits: [Int64: String] = [
    Int64(kVK_ANSI_Keypad0): "0", Int64(kVK_ANSI_Keypad1): "1", Int64(kVK_ANSI_Keypad2): "2",
    Int64(kVK_ANSI_Keypad3): "3", Int64(kVK_ANSI_Keypad4): "4", Int64(kVK_ANSI_Keypad5): "5",
    Int64(kVK_ANSI_Keypad6): "6", Int64(kVK_ANSI_Keypad7): "7", Int64(kVK_ANSI_Keypad8): "8",
    Int64(kVK_ANSI_Keypad9): "9",
  ]

  var isEnabled = true
  private let figma: Figma
  private let onDigit: (String) -> Void
  private var tap: CFMachPort?
  // A key whose keyDown was swallowed also gets its keyUp swallowed, even if
  // focus moved in between, so Figma never sees half a keypress.
  private var swallowed: Set<Int64> = []

  init(figma: Figma, onDigit: @escaping (String) -> Void) {
    self.figma = figma
    self.onDigit = onDigit
  }

  var isRunning: Bool { tap != nil }

  /// Fails without Accessibility permission.
  func start() -> Bool {
    if tap != nil { return true }
    let mask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)
    let callback: CGEventTapCallBack = { _, type, event, info in
      let tap = Unmanaged<NumpadTap>.fromOpaque(info!).takeUnretainedValue()
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

    let modifiers = key.flags.intersection([.maskCommand, .maskControl, .maskAlternate, .maskShift])
    guard isEnabled, let digit = Self.digits[key.code], modifiers.isEmpty, figma.isFrontmost, !figma.isTyping else {
      return false
    }
    swallowed.insert(key.code)
    if !key.isRepeat {
      // Off the callback, so a slow menu press can't time out the tap.
      DispatchQueue.main.async { self.onDigit(digit) }
    }
    return true
  }
}

// CGEvent isn't Sendable, so the callback copies out what it needs.
private struct Key: Sendable {
  let code: Int64
  let flags: CGEventFlags
  let isRepeat: Bool
}
