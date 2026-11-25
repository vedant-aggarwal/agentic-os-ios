import CallKit
import Foundation
import Security

/// Blocks the numbers on Nora's line's blocklist and names the callers she knows, from the list the app saved in the
/// shared keychain group (service agentic-os-line, account blocklist):
/// { version, blocked: [{ number, label }], labels: [{ number, label }] }, numbers as E.164 digits without "+".
/// Every load replaces everything. When the list can't be read, the request is cancelled, so iOS keeps what it has.
final class CallDirectoryHandler: CXCallDirectoryProvider {
  private struct Entry: Decodable {
    let number: String
    let label: String?
  }

  private struct List: Decodable {
    let blocked: [Entry]?
    let labels: [Entry]?
  }

  override func beginRequest(with context: CXCallDirectoryExtensionContext) {
    context.delegate = self
    guard let list = load() else {
      context.cancelRequest(withError: NSError(domain: "AgenticCallDirectory", code: 1))
      return
    }
    if context.isIncremental {
      context.removeAllBlockingEntries()
      context.removeAllIdentificationEntries()
    }
    // iOS wants each list in ascending order, without repeats
    let blocked = Self.numbers(list.blocked ?? [])
    for n in blocked.keys.sorted() { context.addBlockingEntry(withNextSequentialPhoneNumber: n) }
    let named = Self.numbers(list.labels ?? []).filter { blocked[$0.key] == nil && !$0.value.isEmpty }
    for n in named.keys.sorted() { context.addIdentificationEntry(withNextSequentialPhoneNumber: n, label: named[n] ?? "") }
    context.completeRequest()
  }

  /// The saved list; an empty one when none was saved yet; nil when the keychain can't be read (before the first
  /// unlock after a restart).
  private func load() -> List? {
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "agentic-os-line",
      kSecAttrAccount as String: "blocklist",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: CFTypeRef?
    let st = SecItemCopyMatching(q as CFDictionary, &out)
    if st == errSecItemNotFound { return List(blocked: [], labels: []) }
    guard st == errSecSuccess, let data = out as? Data else { return nil }
    return try? JSONDecoder().decode(List.self, from: data)
  }

  /// Number → label, keeping the first label of a number listed twice.
  private static func numbers(_ entries: [Entry]) -> [CXCallDirectoryPhoneNumber: String] {
    var out: [CXCallDirectoryPhoneNumber: String] = [:]
    for e in entries {
      let digits = e.number.filter { $0 >= "0" && $0 <= "9" }
      guard (6...15).contains(digits.count), let n = CXCallDirectoryPhoneNumber(digits), out[n] == nil else { continue }
      out[n] = e.label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    return out
  }
}

extension CallDirectoryHandler: CXCallDirectoryExtensionContextDelegate {
  func requestFailed(for extensionContext: CXCallDirectoryExtensionContext, withError error: Error) {}
}
