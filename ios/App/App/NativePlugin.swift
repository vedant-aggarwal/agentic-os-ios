import ActivityKit
import Capacitor
import Photos
import UIKit
import UserNotifications
import WidgetKit

/// The web layer's way into the phone: widgets, push, the day's Live Activity and Nora's phone calls.
/// JS: Capacitor.Plugins.Native.share({ token, snapshot: JSON string }), registerPush() -> { granted, voip }, call({ reason }),
/// requestPhotos() -> { status: granted | limited | denied | restricted } (the keyboard's "Latest screenshot" needs it),
/// keyboardStatus() -> { photos, added, seen }, openSettings() opens the app's page in Settings.
/// Events: "notificationAction" { action: answer | open, incomingId } or { action: link, url } (a session alert),
/// "callState" { state: ringing | live | ended }.
@objc(NativePlugin)
public class NativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePlugin"
    public let jsName = "Native"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerPush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "call", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keyboardStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NativeHub.shared.plugin = self
    }

    @objc func share(_ call: CAPPluginCall) {
        if let token = call.getString("token"), !token.isEmpty, token != Shared.token {
            Shared.token = token
            NativeHub.shared.tokenChanged()
        }
        if let json = call.getString("snapshot"), let data = json.data(using: .utf8),
           let snap = try? JSONDecoder().decode(Snapshot.self, from: data) {
            Shared.snapshot = snap
            WidgetCenter.shared.reloadAllTimelines()
            DispatchQueue.main.async { LiveDay.shared.update(snap) }
        }
        call.resolve()
    }

    @objc func registerPush(_ call: CAPPluginCall) {
        NativeHub.shared.registerPush { granted in
            call.resolve(["granted": granted, "voip": CallManager.shared.voipReady])
        }
    }

    @objc func call(_ call: CAPPluginCall) {
        DispatchQueue.main.async { CallManager.shared.startOutgoing(reason: call.getString("reason") ?? "") }
        call.resolve()
    }

    /// Photos access for the keyboard's "Latest screenshot" (extensions use the app's permission but can't ask for it).
    /// Already denied, or Limited (new screenshots stay hidden): opens the app's page in Settings.
    @objc func requestPhotos(_ call: CAPPluginCall) {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if current == .denied || current == .limited {
            DispatchQueue.main.async {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            call.resolve(["status": NativePlugin.name(current)])
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(["status": NativePlugin.name(status)])
        }
    }

    /// added: the keyboard is in Settings > General > Keyboard > Keyboards (iOS lists them in AppleKeyboards).
    /// seen: when it last opened with Full Access (seconds), or null.
    @objc func keyboardStatus(_ call: CAPPluginCall) {
        let id = (Bundle.main.bundleIdentifier ?? "com.norrita.agenticos") + ".keyboard"
        let added = (UserDefaults.standard.array(forKey: "AppleKeyboards") as? [String])?.contains { $0.hasPrefix(id) } ?? false
        var out: [String: Any] = ["photos": NativePlugin.name(PHPhotoLibrary.authorizationStatus(for: .readWrite)),
                                  "added": added || Shared.keyboardSeen != nil]
        out["seen"] = Shared.keyboardSeen ?? NSNull()
        call.resolve(out)
    }

    /// The app's page in Settings, where Keyboards > Agentic OS and Allow Full Access live.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        }
        call.resolve()
    }

    /// Keeps an independent file and opens Save to Files / the system share sheet.
    @objc func exportFile(_ call: CAPPluginCall) {
        guard let rawName = call.getString("name"), !rawName.isEmpty,
              let encoded = call.getString("base64"), let data = Data(base64Encoded: encoded) else {
            call.reject("The backup file could not be read."); return
        }
        do {
            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("VoiceExports", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let file = dir.appendingPathComponent((rawName as NSString).lastPathComponent)
            try data.write(to: file, options: .atomic)
            DispatchQueue.main.async {
                guard let root = self.bridge?.viewController else { call.reject("Could not open Save to Files. The file is kept in VoiceExports."); return }
                var presenter: UIViewController = root
                while let shown = presenter.presentedViewController { presenter = shown }
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                if let popover = sheet.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                }
                sheet.completionWithItemsHandler = { _, completed, _, error in
                    if let error { call.reject(error.localizedDescription) } else { call.resolve(["completed": completed]) }
                }
                presenter.present(sheet, animated: true)
            }
        } catch { call.reject("Could not save the backup: \(error.localizedDescription)") }
    }

    static func name(_ s: PHAuthorizationStatus) -> String {
        switch s {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "prompt"
        }
    }
}

/// App-wide native state: notification permission and taps, the APNs token, and events for the web layer.
final class NativeHub: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NativeHub()
    weak var plugin: NativePlugin? { didSet { flush() } }
    private var apnsToken: String?
    private var pending: [(String, [String: Any], Bool)] = []
    private var viewReady = false
    private var pendingLinks: [URL] = []

    /// From didFinishLaunching: PushKit has to be ready before a VoIP push can be delivered.
    func launch() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        registerCategories()
        NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { [weak self] _ in
            guard let self, !self.viewReady else { return }
            self.viewReady = true
            let links = self.pendingLinks
            self.pendingLinks.removeAll()
            for url in links { self.deliver(url) }
        }
        CallManager.shared.start()
        LiveDay.shared.observe()
        LiveWork.shared.observe()
        LiveKit.shared.observe()
        FlowRecorder.shared.observe()
        Geofences.shared.observe()
        Alarms.shared.observe()
        Task { await Shared.flushQueue() }
        center.getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    /// An agenticos:// link from the native side (a quick action, a Spotlight result, an App Intent, a notification
    /// button, a geofence). It goes to the web layer the same way a widget tap does: the App plugin's appUrlOpen,
    /// held until the web view is up on a cold start.
    func openLink(_ url: URL) {
        DispatchQueue.main.async {
            if self.viewReady { self.deliver(url) } else { self.pendingLinks.append(url) }
        }
    }

    func openLink(_ string: String) {
        if let url = URL(string: string) { openLink(url) }
    }

    private func deliver(_ url: URL) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    /// Links the keyboard opens that the app answers natively: agenticos://keyboard/photos asks for Photos access
    /// (an extension can't ask itself). True when handled.
    func handleLink(_ url: URL) -> Bool {
        guard url.scheme == "agenticos", url.host == "keyboard", url.path == "/photos" else { return false }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            DispatchQueue.main.async {
                let ok = status == .authorized
                let alert = UIAlertController(title: ok ? "Photos allowed" : status == .limited ? "Photos is Limited" : "Photos are off",
                                              message: ok ? "Swipe back to your app and tap Latest screenshot again."
                                                          : "Set Photos to All Photos for Agentic OS in Settings, so the keyboard sees your newest screenshot.",
                                              preferredStyle: .alert)
                if !ok {
                    alert.addAction(UIAlertAction(title: "Settings", style: .default) { _ in
                        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                    })
                }
                alert.addAction(UIAlertAction(title: "OK", style: .cancel))
                let root = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController
                (root?.presentedViewController ?? root)?.present(alert, animated: true)
            }
        }
        return true
    }

    func registerPush(_ done: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
                done(granted)
            }
        }
    }

    func didRegister(_ token: Data) {
        apnsToken = token.hex
        postDevice("apns", token.hex)
    }

    /// Signed in (or a new token): send the PC every push token this phone has.
    func tokenChanged() {
        if let t = apnsToken { postDevice("apns", t) }
        CallManager.shared.repost()
        LiveDay.shared.repost()
        LiveWork.shared.repost()
    }

    func postDevice(_ kind: String, _ token: String, extra: [String: Any] = [:]) {
        guard Shared.token != nil else { return }
        let body = extra.merging(["kind": kind, "token": token]) { $1 }
        Task { await Shared.send("/devices", body: body) }
    }

    /// An event for the web layer on the Native plugin. retain keeps it until a listener is added (taps, actions);
    /// streams like levels and breath phases pass retain: false, so nothing piles up when no screen listens.
    func emit(_ event: String, _ data: [String: Any], retain: Bool = true) {
        DispatchQueue.main.async {
            if let p = self.plugin { p.notifyListeners(event, data: data, retainUntilConsumed: retain) }
            else if retain { self.pending.append((event, data, retain)) }
        }
    }

    private func flush() {
        guard let p = plugin else { return }
        for (event, data, retain) in pending { p.notifyListeners(event, data: data, retainUntilConsumed: retain) }
        pending.removeAll()
    }

    /// A notice on the phone when something native fails where nobody is looking (a call that couldn't connect).
    func notice(_ title: String, _ body: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.threadIdentifier = "nora"
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
    }

    private func registerCategories() {
        let answer = UNNotificationAction(identifier: "ANSWER", title: "Answer", options: [.foreground])
        let later = UNNotificationAction(identifier: "LATER", title: "Later", options: [])
        let reply = UNTextInputNotificationAction(identifier: "REPLY", title: "Reply", options: [],
                                                  textInputButtonTitle: "Send", textInputPlaceholder: "Message Nora")
        // A job asking to run a command or edit: answer it from the banner (server/work-activity.ts sends the ids).
        let allow = UNNotificationAction(identifier: "ALLOW", title: "Allow", options: [.authenticationRequired])
        let deny = UNNotificationAction(identifier: "DENY", title: "Deny", options: [.destructive])
        UNUserNotificationCenter.current().setNotificationCategories(Set([
            UNNotificationCategory(identifier: "NORA_CALL", actions: [answer, later], intentIdentifiers: [], options: [.customDismissAction]),
            UNNotificationCategory(identifier: "NORA_MESSAGE", actions: [reply], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "WORK_PERMISSION", actions: [allow, deny], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "WORK", actions: [], intentIdentifiers: [], options: []),
        ]).union(Notify.categories()))
    }

    // In the app, Nora's call shows as the in-app incoming screen, so only messages show as banners.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done(notification.request.content.categoryIdentifier == "NORA_CALL" ? [] : [.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler done: @escaping () -> Void) {
        // 2.0.0 notifications (tasks, nudges, streaks, alarms; local or pushed) carry an "aos" payload: App/Notify.swift.
        if Notify.handle(response, done) { return }
        let content = response.notification.request.content
        let incomingId = content.userInfo["incomingId"] as? String
        let isCall = content.categoryIdentifier == "NORA_CALL"
        // Session alerts (jobs, terminals) carry data: { event, jobId | termId, url, requestId?, allow?, deny? }.
        let work = content.userInfo["data"] as? [String: Any]
        switch response.actionIdentifier {
        case "ALLOW", "DENY":
            guard let work, let job = work["jobId"] as? String, let req = work["requestId"] as? String,
                  let option = work[response.actionIdentifier == "ALLOW" ? "allow" : "deny"] as? String else { return done() }
            Task {
                let (code, _) = await Shared.send("/jobs/\(job)/permission", body: ["requestId": req, "optionId": option])
                // Already answered elsewhere, or the PC is unreachable: say so, then the tap-through still works.
                if code != 200 { self.notice("Couldn't answer", code == 409 ? "That request was already answered." : "The PC didn't answer. Open the job to reply.") }
                LiveWork.shared.refresh()
                done()
            }
        case "LATER":
            guard let id = incomingId else { return done() }
            Task { await Shared.send("/nora/incoming/\(id)/snooze", body: [:]); done() }
        case UNNotificationDismissActionIdentifier:
            guard isCall, let id = incomingId else { return done() }
            Task { await Shared.send("/nora/incoming/\(id)/decline", body: [:]); done() }
        case "REPLY":
            let text = (response as? UNTextInputNotificationResponse)?.userText.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !text.isEmpty else { return done() }
            // A reply to an agent's question goes straight to that agent; anything else is a chat message.
            let path = (content.userInfo["ask"] as? String).map { "/nora/asks/\($0)/answer" } ?? "/nora/messages"
            Task { await Shared.send(path, body: ["text": text]); done() }
        default:
            // A tap on a session alert opens that session (app/work/index.js handleLink), not Nora.
            if !isCall, let url = work?["url"] as? String, url.hasPrefix("agenticos://") {
                emit("notificationAction", ["action": "link", "url": url])
                return done()
            }
            emit("notificationAction", ["action": isCall ? "answer" : "open", "incomingId": incomingId ?? ""])
            done()
        }
    }
}

/// The day on the lock screen and in the Dynamic Island: what's on now, how long is left, and what's next.
/// The app starts or updates it while open; the PC pushes the next block when the current one ends.
final class LiveDay {
    static let shared = LiveDay()
    private var current: Activity<DayActivityAttributes>?
    private var watchers: [Task<Void, Never>] = []
    private var activityToken: String?
    private var startToken: String?
    private var lastPlan: Data?

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    private var today: String { LiveDay.dayFormat.string(from: Date()) }
    // Swiped away today: leave it off until tomorrow.
    private var offToday: Bool { UserDefaults.standard.string(forKey: "liveday.off") == today }

    func observe() {
        for a in Activity<DayActivityAttributes>.activities { adopt(a) }
        Task { for await a in Activity<DayActivityAttributes>.activityUpdates { DispatchQueue.main.async { self.adopt(a) } } }
        if #available(iOS 17.2, *) {
            Task {
                for await t in Activity<DayActivityAttributes>.pushToStartTokenUpdates {
                    let hex = t.hex
                    DispatchQueue.main.async { self.startToken = hex }
                    NativeHub.shared.postDevice("start", hex)
                }
            }
        }
    }

    func repost() {
        if let t = startToken { NativeHub.shared.postDevice("start", t) }
        if let t = activityToken { NativeHub.shared.postDevice("activity", t) }
        lastPlan = nil
        if let snap = Shared.snapshot { update(snap) }
    }

    private func adopt(_ a: Activity<DayActivityAttributes>) {
        if let old = current {
            if old.id == a.id { return }
            Task { await old.end(nil, dismissalPolicy: .immediate) }
        }
        current = a
        watchers.forEach { $0.cancel() }
        watchers = [
            Task {
                for await t in a.pushTokenUpdates {
                    let hex = t.hex
                    DispatchQueue.main.async { self.activityToken = hex }
                    NativeHub.shared.postDevice("activity", hex)
                }
            },
            Task {
                for await s in a.activityStateUpdates where s == .dismissed || s == .ended {
                    let dismissed = s == .dismissed
                    DispatchQueue.main.async {
                        if dismissed { UserDefaults.standard.set(self.today, forKey: "liveday.off") }
                        if let t = self.activityToken { NativeHub.shared.postDevice("activity", t, extra: ["end": true, "dismissed": dismissed]) }
                        if self.current?.id == a.id { self.current = nil; self.activityToken = nil }
                    }
                }
            },
        ]
    }

    /// New plan from the app: send it to the PC and bring the activity up to date.
    func update(_ snap: Snapshot) {
        if let plan = try? JSONEncoder().encode(snap.blocks), plan != lastPlan,
           let blocks = try? JSONSerialization.jsonObject(with: plan) {
            lastPlan = plan
            NativeHub.shared.postDevice("plan", "", extra: ["plan": blocks])
        }
        let state = Snapshot.nowNext(snap.blocks, at: Date().timeIntervalSince1970)
        if let live = current, live.activityState == .active {
            Task {
                if let state { await live.update(ActivityContent(state: state, staleDate: state.end.addingTimeInterval(120))) }
                else { await live.end(nil, dismissalPolicy: .default) }
            }
        } else if let state, state.kind != "free", !offToday, ActivityAuthorizationInfo().areActivitiesEnabled {
            if let a = try? Activity.request(attributes: DayActivityAttributes(day: today),
                                             content: ActivityContent(state: state, staleDate: state.end.addingTimeInterval(120)),
                                             pushType: .token) {
                adopt(a)
            }
        }
    }
}
