import ExpoModulesCore
import Security
import WidgetKit

/// Shares the sign-in with the app's extensions (the Action button control in targets/controls). Items go to the
/// keychain group "<team>.<bundle id>.shared", listed in both the app's and the extension's entitlements.
public final class SharedAuthModule: Module {
  private static let service = "agentic-os-pc"

  public func definition() -> ModuleDefinition {
    Name("SharedAuth")

    /// Store (or, with null, remove) the session token and the API address. Returns false when the keychain refused.
    Function("set") { (token: String?, api: String) -> Bool in
      guard let group = Self.sharedGroup() else { return false }
      let ok1 = Self.write("token", token, group)
      let ok2 = Self.write("api", token == nil ? nil : api, group)
      // The home screen widgets read the same sign-in (targets/controls/TodayWidgets.swift): redraw them with it.
      WidgetCenter.shared.reloadAllTimelines()
      return ok1 && ok2
    }

    /// Asks the home and lock screen widgets to fetch the day again (src/lib/widgets.ts).
    Function("reloadWidgets") {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  /// The shared group's full name. The team prefix isn't known at build time here, so it's read off a probe item,
  /// whose default access group is "<team>.<first keychain-access-groups entry>".
  private static func sharedGroup() -> String? {
    let probe: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "agentic-os-probe",
      kSecAttrAccount as String: "probe",
    ]
    var attrs = probe
    attrs[kSecReturnAttributes as String] = true
    var out: CFTypeRef?
    var st = SecItemCopyMatching(attrs as CFDictionary, &out)
    if st == errSecItemNotFound {
      var add = probe
      add[kSecReturnAttributes as String] = true
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
      st = SecItemAdd(add as CFDictionary, &out)
    }
    guard st == errSecSuccess, let a = out as? [String: Any], let g = a[kSecAttrAccessGroup as String] as? String,
          let team = g.split(separator: ".").first, let bundle = Bundle.main.bundleIdentifier else { return nil }
    return "\(team).\(bundle).shared"
  }

  private static func write(_ account: String, _ value: String?, _ group: String) -> Bool {
    let key: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
    ]
    SecItemDelete(key as CFDictionary)
    guard let value else { return true }
    var add = key
    add[kSecValueData as String] = Data(value.utf8)
    // readable while the phone is locked, after the first unlock: the Action button works from the Lock Screen
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }
}
