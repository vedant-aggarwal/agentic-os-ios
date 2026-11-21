import AppIntents
import Security
import SwiftUI
import WidgetKit

// PC command mode from the Action button (or Control Center, or the Lock Screen). iOS runs the intent here, in the
// extension, without opening the app: it asks the PC (POST /pc/keys cmd-toggle) to start Wispr listening for a
// command, or, on the next press, to stop and hand what was said to the PC agent. The app keeps the sign-in in a
// keychain group this extension shares (modules/shared-auth).

enum PCLink {
  static func read(_ account: String) -> String? {
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "agentic-os-pc",
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}

enum PCError: Error, CustomLocalizedStringResourceConvertible {
  case signedOut, unreachable
  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .signedOut: return "Open Agentic OS and sign in first."
    case .unreachable: return "Couldn't reach your PC."
    }
  }
}

struct PCCommandIntent: AppIntent {
  static let title: LocalizedStringResource = "PC command"
  static let description = IntentDescription("Press to give your PC a spoken command. Press again to send it.")
  static let openAppWhenRun = false

  func perform() async throws -> some IntentResult {
    guard let token = PCLink.read("token"), let api = PCLink.read("api"), let url = URL(string: api + "/pc/keys") else {
      throw PCError.signedOut
    }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = 8
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["action": "cmd-toggle"])
    let (_, resp) = try await URLSession.shared.data(for: req)
    guard let http = resp as? HTTPURLResponse, http.statusCode < 300 else { throw PCError.unreachable }
    return .result()
  }
}

struct PCCommandControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.norrita.agenticos.pc-command") {
      ControlWidgetButton(action: PCCommandIntent()) {
        Label("PC command", systemImage: "waveform.circle.fill")
      }
    }
    .displayName("PC command")
    .description("Press to talk to your PC, press again to send.")
  }
}

@main
struct AgenticControls: WidgetBundle {
  var body: some Widget {
    PCCommandControl()
  }
}
