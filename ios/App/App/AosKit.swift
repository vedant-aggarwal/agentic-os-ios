import Capacitor
import UIKit

/// The 2.0.0 plugins (app/js/svc/native-plugins.js is the JS side). Registered by AppViewController.
enum AosPlugins {
    static func all() -> [CAPPlugin] {
        [AosHapticsPlugin(), AosAuthPlugin(), AosScanPlugin(), AosLivePlugin(), AosAlarmPlugin(), AosNotifyPlugin(),
         AosVoicePlugin(), AosHealthPlugin(), AosSystemPlugin(), AosPersonalPlugin(), AosLLMPlugin(), AosScreenTimePlugin()]
    }
}

/// Every new method answers { available, ok, ... } and never rejects, so the web layer has one path:
/// ok(data) for success, fail(error) when it ran and didn't work, off(reason) when the feature isn't here.
extension CAPPluginCall {
    func ok(_ data: [String: Any] = [:]) {
        var d = data
        if d["available"] == nil { d["available"] = true }
        if d["ok"] == nil { d["ok"] = true }
        resolve(d)
    }

    func fail(_ error: String, cancelled: Bool = false, _ extra: [String: Any] = [:]) {
        var d = extra
        d["available"] = true
        d["ok"] = false
        d["error"] = error
        if cancelled { d["cancelled"] = true }
        resolve(d)
    }

    func off(_ reason: String, _ extra: [String: Any] = [:]) {
        var d = extra
        d["available"] = false
        d["ok"] = false
        d["reason"] = reason
        resolve(d)
    }

    // Plain readers over the JS options (numbers arrive as NSNumber, objects as dictionaries).
    func value(_ key: String) -> Any? {
        guard let v = options?[key], !(v is NSNull) else { return nil }
        return v
    }

    func text(_ key: String) -> String? {
        (value(key) as? String).flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
    }

    func number(_ key: String) -> Double? {
        if let n = value(key) as? NSNumber { return n.doubleValue }
        return (value(key) as? String).flatMap(Double.init)
    }

    /// A whole number in range (a huge or NaN value from JS would trap Int(Double)).
    func integer(_ key: String, _ fallback: Int, _ range: ClosedRange<Int>) -> Int {
        guard let d = number(key), d.isFinite else { return fallback }
        return Int(min(max(d.rounded(), Double(range.lowerBound)), Double(range.upperBound)))
    }

    func flag(_ key: String, _ fallback: Bool) -> Bool {
        (value(key) as? NSNumber)?.boolValue ?? (value(key) as? Bool) ?? fallback
    }

    func object(_ key: String) -> [String: Any]? { value(key) as? [String: Any] }

    func objects(_ key: String) -> [[String: Any]] {
        (value(key) as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    }

    func strings(_ key: String) -> [String] {
        (value(key) as? [Any])?.compactMap { $0 as? String } ?? []
    }

    /// A time from JS: milliseconds (Date.now()), seconds, or an ISO string.
    func date(_ key: String) -> Date? { Dates.parse(value(key)) }
}

enum Dates {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()

    static func parse(_ v: Any?) -> Date? {
        if let n = v as? NSNumber {
            let x = n.doubleValue
            return Date(timeIntervalSince1970: x > 100_000_000_000 ? x / 1000 : x)
        }
        if let s = v as? String {
            if let d = iso.date(from: s) ?? isoPlain.date(from: s) { return d }
            if let x = Double(s) { return Date(timeIntervalSince1970: x > 100_000_000_000 ? x / 1000 : x) }
        }
        return nil
    }

    static func ms(_ d: Date) -> Double { (d.timeIntervalSince1970 * 1000).rounded() }
    static func ms(_ seconds: Double) -> Double { (seconds * 1000).rounded() }
    static func isoString(_ d: Date) -> String { iso.string(from: d) }
}

/// Where native sheets go: the top-most view controller over the web view.
enum Presenter {
    static func top() -> UIViewController? {
        let root = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController
        var vc = root
        while let shown = vc?.presentedViewController, !shown.isBeingDismissed { vc = shown }
        return vc
    }

    static func present(_ vc: UIViewController) -> Bool {
        guard let top = top() else { return false }
        top.present(vc, animated: true)
        return true
    }
}

/// The iOS version as "26.1".
enum Device {
    static var ios: String { UIDevice.current.systemVersion }
}
