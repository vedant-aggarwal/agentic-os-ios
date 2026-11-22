import Foundation
import Security

/// The sign-in and the PC's address, which the app keeps in a keychain group this keyboard shares
/// (modules/shared-auth: service "agentic-os-pc", accounts "token" and "api"), and calls to the PC's API with them.
/// (A copy of targets/keyboard/Shared.swift: each extension builds its own sources.)
enum Shared {
    private static let service = "agentic-os-pc"
    private static let fallbackApi = "https://agentic.norrita.com/api/v1"

    private static func read(_ account: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static var token: String? { read("token") }
    static var api: String { read("api") ?? fallbackApi }

    /// JSON call to the PC's API (/api/v1 + path) with the saved token. Returns the status (0 when unreachable) and body.
    @discardableResult
    static func send(_ path: String, method: String = "POST", body: [String: Any]? = nil,
                     timeout: TimeInterval = 20) async -> (Int, Data?) {
        let data = body.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        return await request(path, method: method, data: data, type: data == nil ? nil : "application/json", timeout: timeout)
    }

    /// The same call with a raw body (images) or none (GET).
    @discardableResult
    static func request(_ path: String, method: String = "GET", data: Data? = nil, type: String? = nil,
                        timeout: TimeInterval = 20) async -> (Int, Data?) {
        guard let token, let url = URL(string: api + path) else { return (0, nil) }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.timeoutInterval = timeout
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let data {
            r.httpBody = data
            if let type { r.setValue(type, forHTTPHeaderField: "Content-Type") }
        }
        do {
            let (data, resp) = try await URLSession.shared.data(for: r)
            return ((resp as? HTTPURLResponse)?.statusCode ?? 0, data)
        } catch {
            return (0, nil)
        }
    }

    /// The JSON object in a response body, or nil.
    static func json(_ data: Data?) -> [String: Any]? {
        data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    }
}
