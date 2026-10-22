import Capacitor
import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

/// Soul's app blocker on Screen Time: pick the apps, pause them now or in his vulnerable windows, and a shield with
/// the agent's line whose "Ask" button brings him back to the app to negotiate.
/// Behind the family_controls CI input (DECISIONS 4): without it the build carries no Family Controls entitlement and no
/// Screen Time extensions, Info.plist AOSFamilyControls is NO, and every call answers { available: false, reason: "flag" }.
/// JS: AosScreenTime.status(), authorize(), pick(), block({ minutes? | until?, line? }), unblock({ minutes? }),
/// schedule({ windows: [{ id, start: "HH:MM", end: "HH:MM", days? }], line? }), setLine({ line }).
/// Event (on Native): "screentime" { action: "unlock-request", at }.
enum ScreenTime {
    static var enabled: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "AOSFamilyControls") as? String)?.uppercased() == "YES"
    }

    static let center = DeviceActivityCenter()

    /// From launch (flag on only): tell the web layer he asked to unlock from the shield.
    static func observe() {
        guard enabled else { return }
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            guard let at = BlockStore.unlockAsked, Date().timeIntervalSince1970 - at < 3600 else { return }
            BlockStore.unlockAsked = nil
            NativeHub.shared.emit("screentime", ["action": "unlock-request", "at": Dates.ms(at)])
        }
    }

    static func status(_ s: AuthorizationStatus) -> String {
        switch s {
        case .approved: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    /// A one-off interval from now (DeviceActivity's shortest is 15 minutes).
    static func interval(minutes: Double) -> DeviceActivitySchedule {
        let cal = Calendar.current
        let now = Date()
        let end = now.addingTimeInterval(max(minutes, 15) * 60)
        return DeviceActivitySchedule(intervalStart: cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: now),
                                      intervalEnd: cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: end),
                                      repeats: false)
    }

    static func hm(_ s: String) -> DateComponents? {
        let parts = s.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { return nil }
        return DateComponents(hour: parts[0], minute: parts[1])
    }
}

@objc(AosScreenTimePlugin)
public class AosScreenTimePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosScreenTimePlugin"
    public let jsName = "AosScreenTime"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "block", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unblock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLine", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        ScreenTime.observe()
    }

    private func gate(_ call: CAPPluginCall) -> Bool {
        guard ScreenTime.enabled else {
            call.off("flag", ["error": "App blocking is built but switched off in this build (family_controls)."])
            return false
        }
        return true
    }

    private func counts() -> [String: Any] {
        let s = BlockStore.selection
        return ["apps": s?.applicationTokens.count ?? 0, "categories": s?.categoryTokens.count ?? 0, "domains": s?.webDomainTokens.count ?? 0]
    }

    @objc func status(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        DispatchQueue.main.async {
            var out = self.counts()
            out["authorization"] = ScreenTime.status(AuthorizationCenter.shared.authorizationStatus)
            out["blocking"] = BlockStore.shielding
            out["windows"] = ScreenTime.center.activities.map(\.rawValue).filter { $0.hasPrefix("aos.w.") }
            out["line"] = BlockStore.line ?? NSNull()
            call.ok(out)
        }
    }

    @objc func authorize(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                call.ok(["authorization": ScreenTime.status(AuthorizationCenter.shared.authorizationStatus)])
            } catch {
                call.fail(error.localizedDescription, ["authorization": ScreenTime.status(AuthorizationCenter.shared.authorizationStatus)])
            }
        }
    }

    @objc func pick(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        DispatchQueue.main.async {
            var host: UIHostingController<BlockPicker>?
            let sheet = BlockPicker(selection: BlockStore.selection ?? FamilyActivitySelection()) { [weak self] picked in
                host?.dismiss(animated: true)
                guard let picked else { return call.fail("Nothing changed.", cancelled: true) }
                BlockStore.selection = picked
                if BlockStore.shielding { BlockStore.shield() }
                call.ok(self?.counts() ?? [:])
            }
            host = UIHostingController(rootView: sheet)
            if let h = host, !Presenter.present(h) { call.fail("The app isn't ready to show the picker.") }
        }
    }

    @objc func block(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        guard BlockStore.selection != nil else { return call.fail("Pick the apps to pause first (pick()).") }
        if let line = call.text("line") { BlockStore.line = line }
        var minutes = call.number("minutes")
        if let until = call.date("until") { minutes = until.timeIntervalSinceNow / 60 }
        BlockStore.shield()
        ScreenTime.center.stopMonitoring([DeviceActivityName("aos.block"), DeviceActivityName("aos.relock")])
        if let m = minutes, m > 0 {
            do { try ScreenTime.center.startMonitoring(DeviceActivityName("aos.block"), during: ScreenTime.interval(minutes: m)) }
            catch { return call.fail("Paused, but the end time didn't take: \(error.localizedDescription)") }
        }
        call.ok(["blocking": true, "minutes": minutes.map { max($0, 15) } ?? NSNull()])
    }

    @objc func unblock(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        BlockStore.unshield()
        ScreenTime.center.stopMonitoring([DeviceActivityName("aos.block"), DeviceActivityName("aos.relock")])
        if let m = call.number("minutes"), m > 0 {
            do { try ScreenTime.center.startMonitoring(DeviceActivityName("aos.relock"), during: ScreenTime.interval(minutes: m)) }
            catch { return call.fail("Unpaused, but it won't pause again by itself: \(error.localizedDescription)") }
        }
        call.ok(["blocking": false])
    }

    @objc func schedule(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        if let line = call.text("line") { BlockStore.line = line }
        let old = ScreenTime.center.activities.filter { $0.rawValue.hasPrefix("aos.w.") }
        ScreenTime.center.stopMonitoring(old)
        var started: [String] = []
        for w in call.objects("windows") {
            guard let id = w["id"] as? String, let start = (w["start"] as? String).flatMap(ScreenTime.hm),
                  let end = (w["end"] as? String).flatMap(ScreenTime.hm) else { continue }
            let days = ((w["days"] as? [Any]) ?? []).compactMap { ($0 as? NSNumber)?.intValue }.filter { (1...7).contains($0) }
            let plan: [(String, DateComponents, DateComponents)]
            if days.isEmpty {
                plan = [("aos.w.\(id)", start, end)]
            } else {
                plan = days.map { d in
                    var s = start, e = end
                    s.weekday = d == 7 ? 1 : d + 1
                    e.weekday = s.weekday
                    return ("aos.w.\(id).\(d)", s, e)
                }
            }
            for (name, s, e) in plan {
                do {
                    try ScreenTime.center.startMonitoring(DeviceActivityName(name), during: DeviceActivitySchedule(intervalStart: s, intervalEnd: e, repeats: true))
                    started.append(name)
                } catch {
                    continue
                }
            }
        }
        call.ok(["windows": started])
    }

    @objc func setLine(_ call: CAPPluginCall) {
        guard gate(call) else { return }
        BlockStore.line = call.text("line")
        call.ok()
    }
}

/// The system's app picker in a sheet with Cancel and Done.
struct BlockPicker: View {
    @State var selection: FamilyActivitySelection
    let done: (FamilyActivitySelection?) -> Void

    var body: some View {
        NavigationStack {
            FamilyActivityPicker(headerText: "Pick what to pause", footerText: "Your agent sees counts, never which apps.",
                                 selection: $selection)
                .navigationTitle("Apps to pause")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { done(selection) } }
                }
        }
    }
}
