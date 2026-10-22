import Capacitor
import LocalAuthentication

/// Face ID / Touch ID for the private corners (Romance, Soul's Clean).
/// JS: AosAuth.status() -> { biometry: faceID | touchID | opticID | none, enrolled }, authenticate({ reason, passcode = true }).
@objc(AosAuthPlugin)
public class AosAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosAuthPlugin"
    public let jsName = "AosAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    static func biometry(_ c: LAContext) -> String {
        switch c.biometryType {
        case .faceID: return "faceID"
        case .touchID: return "touchID"
        case .opticID: return "opticID"
        default: return "none"
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let c = LAContext()
        var err: NSError?
        let bio = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        let any = c.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        call.ok(["biometry": AosAuthPlugin.biometry(c), "enrolled": bio, "passcode": any,
                 "lockedOut": (err?.code ?? 0) == LAError.biometryLockout.rawValue])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.text("reason") ?? "Unlock this page"
        let passcode = call.flag("passcode", true)
        let c = LAContext()
        c.localizedFallbackTitle = passcode ? nil : ""
        let policy: LAPolicy = passcode ? .deviceOwnerAuthentication : .deviceOwnerAuthenticationWithBiometrics
        var err: NSError?
        guard c.canEvaluatePolicy(policy, error: &err) else {
            return call.off("device", ["error": err?.localizedDescription ?? "No Face ID or passcode on this phone.",
                                       "biometry": AosAuthPlugin.biometry(c)])
        }
        c.evaluatePolicy(policy, localizedReason: reason) { ok, error in
            if ok { return call.ok(["biometry": AosAuthPlugin.biometry(c)]) }
            let code = (error as? LAError)?.code
            let cancelled = code == .userCancel || code == .appCancel || code == .systemCancel || code == .userFallback
            call.fail(error?.localizedDescription ?? "Not unlocked.", cancelled: cancelled, ["biometry": AosAuthPlugin.biometry(c)])
        }
    }
}
