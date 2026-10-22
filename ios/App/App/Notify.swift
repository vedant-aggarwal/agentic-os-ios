import Capacitor
import UIKit
import UserNotifications

/// Local notifications with buttons, and the handling of those buttons for local and pushed ones alike.
/// JS: AosNotify.authorize(), schedule({ id?, at? | in?, title, body, subtitle?, category, timeSensitive?, thread?, url?,
/// data?, actions?, snoozeMinutes? }), cancel({ id | ids }), list(), badge({ n }).
/// Event (on Native): "notify" { id, action: do | later | snooze | done | stop | open | dismiss, category, data, url }.
///
/// A notification belongs here when its category starts with AOS_ or its payload has an "aos" object:
/// { id, category, url?, data?, snoozeMinutes?, actions?: { do | later | snooze | done | stop: { path, method?, body? } | { url } } }.
/// A button's path is called on the PC with the shared token (no app UI needed); a url opens in the app.
@objc(AosNotifyPlugin)
public class AosNotifyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosNotifyPlugin"
    public let jsName = "AosNotify"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "badge", returnType: CAPPluginReturnPromise),
    ]

    @objc func authorize(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            center.getNotificationSettings { s in
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
                call.ok(["granted": granted, "status": Notify.status(s.authorizationStatus),
                         "timeSensitive": s.timeSensitiveSetting == .enabled])
            }
        }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        guard let title = call.text("title") else { return call.fail("A notification needs a title.") }
        let id = call.text("id") ?? Shared.newId()
        var when: Date?
        if let at = call.date("at") { when = at }
        if let secs = call.number("in") { when = Date().addingTimeInterval(secs) }
        let spec = Notify.Spec(id: id, title: title, body: call.text("body") ?? "", subtitle: call.text("subtitle"),
                               category: call.text("category") ?? "plain", timeSensitive: call.flag("timeSensitive", false),
                               thread: call.text("thread"), url: call.text("url"), data: call.object("data"),
                               actions: call.object("actions"), snoozeMinutes: call.number("snoozeMinutes"),
                               sound: call.flag("sound", true), at: when)
        Notify.add(spec) { error in
            if let error { call.fail(error) } else { call.ok(["id": id, "at": when.map { Dates.ms($0) } ?? NSNull()]) }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        var ids = call.strings("ids")
        if let one = call.text("id") { ids.append(one) }
        guard !ids.isEmpty else { return call.fail("Say which: { id } or { ids }.") }
        Notify.cancel(ids)
        call.ok(["cancelled": ids])
    }

    @objc func list(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            center.getDeliveredNotifications { delivered in
                func row(_ r: UNNotificationRequest, _ date: Date?) -> [String: Any] {
                    var out: [String: Any] = ["id": r.identifier, "title": r.content.title, "body": r.content.body,
                                              "category": r.content.categoryIdentifier]
                    if let t = r.trigger as? UNCalendarNotificationTrigger, let d = t.nextTriggerDate() { out["at"] = Dates.ms(d) }
                    if let t = r.trigger as? UNTimeIntervalNotificationTrigger, let d = t.nextTriggerDate() { out["at"] = Dates.ms(d) }
                    if let date { out["delivered"] = Dates.ms(date) }
                    return out
                }
                call.ok(["pending": pending.map { row($0, nil) }, "delivered": delivered.map { row($0.request, $0.date) }])
            }
        }
    }

    @objc func badge(_ call: CAPPluginCall) {
        let n = call.integer("n", 0, 0...99_999)
        UNUserNotificationCenter.current().setBadgeCount(n) { error in
            if let error { call.fail(error.localizedDescription) } else { call.ok(["n": n]) }
        }
    }
}

enum Notify {
    struct Spec {
        var id: String
        var title: String
        var body: String
        var subtitle: String?
        var category: String
        var timeSensitive: Bool
        var thread: String?
        var url: String?
        var data: [String: Any]?
        var actions: [String: Any]?
        var snoozeMinutes: Double?
        var sound: Bool
        var at: Date?
        var soundName: String? = nil
    }

    static func status(_ s: UNAuthorizationStatus) -> String {
        switch s {
        case .authorized: return "granted"
        case .provisional: return "provisional"
        case .ephemeral: return "ephemeral"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    /// The buttons. Identifiers start with AOS_ so they never collide with Nora's and the jobs' (NativePlugin.swift).
    static func categories() -> Set<UNNotificationCategory> {
        let doIt = UNNotificationAction(identifier: "AOS_DO", title: "Do it", options: [.foreground])
        let later = UNNotificationAction(identifier: "AOS_LATER", title: "Later", options: [])
        let snooze = UNNotificationAction(identifier: "AOS_SNOOZE", title: "Snooze 10 min", options: [])
        let done = UNNotificationAction(identifier: "AOS_DONE", title: "Done", options: [])
        let write = UNNotificationAction(identifier: "AOS_DO", title: "Write now", options: [.foreground])
        let stop = UNNotificationAction(identifier: "AOS_STOP", title: "Stop", options: [.destructive])
        let snoozeAlarm = UNNotificationAction(identifier: "AOS_SNOOZE", title: "Snooze", options: [])
        return [
            UNNotificationCategory(identifier: "AOS_TASK", actions: [doIt, later, snooze], intentIdentifiers: [], options: [.customDismissAction]),
            UNNotificationCategory(identifier: "AOS_NUDGE", actions: [doIt, snooze, later], intentIdentifiers: [], options: [.customDismissAction]),
            UNNotificationCategory(identifier: "AOS_STREAK", actions: [write, done, snooze], intentIdentifiers: [], options: [.customDismissAction]),
            UNNotificationCategory(identifier: "AOS_ALARM", actions: [stop, snoozeAlarm], intentIdentifiers: [], options: [.customDismissAction]),
            UNNotificationCategory(identifier: "AOS_PLAIN", actions: [], intentIdentifiers: [], options: []),
        ]
    }

    static func categoryId(_ name: String) -> String {
        switch name.lowercased() {
        case "task": return "AOS_TASK"
        case "nudge": return "AOS_NUDGE"
        case "streak", "habit": return "AOS_STREAK"
        case "alarm": return "AOS_ALARM"
        default: return name.uppercased().hasPrefix("AOS_") ? name.uppercased() : "AOS_PLAIN"
        }
    }

    static func add(_ s: Spec, _ done: @escaping (String?) -> Void) {
        let c = UNMutableNotificationContent()
        c.title = s.title
        c.body = s.body
        if let sub = s.subtitle { c.subtitle = sub }
        c.categoryIdentifier = categoryId(s.category)
        c.threadIdentifier = s.thread ?? "aos-\(s.category)"
        if s.sound { c.sound = s.soundName.map { UNNotificationSound(named: UNNotificationSoundName($0)) } ?? .default }
        if s.timeSensitive { c.interruptionLevel = .timeSensitive }
        var aos: [String: Any] = ["id": s.id, "category": s.category]
        if let url = s.url { aos["url"] = url }
        if let data = s.data { aos["data"] = data }
        if let actions = s.actions { aos["actions"] = actions }
        if let m = s.snoozeMinutes { aos["snoozeMinutes"] = m }
        c.userInfo = ["aos": aos]
        let wait = s.at.map { $0.timeIntervalSinceNow } ?? 0
        let trigger: UNNotificationTrigger? = wait > 1 ? UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false) : nil
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: s.id, content: c, trigger: trigger)) { error in
            done(error?.localizedDescription)
        }
    }

    static func cancel(_ ids: [String]) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    /// A tap or a button on one of ours. True when it was ours (done is called when the work is finished).
    static func handle(_ response: UNNotificationResponse, _ done: @escaping () -> Void) -> Bool {
        let request = response.notification.request
        let content = request.content
        let aos = content.userInfo["aos"] as? [String: Any]
        guard content.categoryIdentifier.hasPrefix("AOS_") || aos != nil else { return false }
        let info = aos ?? [:]
        let id = (info["id"] as? String) ?? request.identifier
        let action: String
        switch response.actionIdentifier {
        case "AOS_DO": action = "do"
        case "AOS_LATER": action = "later"
        case "AOS_SNOOZE": action = "snooze"
        case "AOS_DONE": action = "done"
        case "AOS_STOP": action = "stop"
        case UNNotificationDismissActionIdentifier: action = "dismiss"
        default: action = "open"
        }
        let effect = (info["actions"] as? [String: Any])?[action] as? [String: Any]
        var url = (effect?["url"] as? String) ?? ((action == "do" || action == "open") ? info["url"] as? String : nil)

        if action == "snooze" {
            let minutes = (info["snoozeMinutes"] as? NSNumber)?.doubleValue ?? 10
            snooze(content, minutes: minutes, base: id)
        }
        if info["category"] as? String == "alarm" || content.categoryIdentifier == "AOS_ALARM" {
            Alarms.shared.notificationAction(id: id, action: action)
            if action == "open" && url == nil { url = info["url"] as? String }
        }
        if let url { NativeHub.shared.openLink(url) }
        var event: [String: Any] = ["id": id, "action": action, "category": (info["category"] as? String) ?? content.categoryIdentifier]
        if let data = info["data"] { event["data"] = data }
        if let url { event["url"] = url }
        NativeHub.shared.emit("notify", event)

        guard let path = effect?["path"] as? String else { done(); return true }
        let method = (effect?["method"] as? String) ?? "POST"
        let body = effect?["body"] as? [String: Any] ?? [:]
        Task {
            let (code, _) = await Shared.send(path, method: method, body: body)
            if code == 0 || code >= 500 { Shared.enqueue(path, method: method, body: body) }
            done()
        }
        return true
    }

    /// The same notification again in a few minutes.
    private static func snooze(_ content: UNNotificationContent, minutes: Double, base: String) {
        guard let copy = content.mutableCopy() as? UNMutableNotificationContent else { return }
        let n = ((copy.userInfo["aos"] as? [String: Any])?["snoozes"] as? Int ?? 0) + 1
        if var aos = copy.userInfo["aos"] as? [String: Any] {
            aos["snoozes"] = n
            copy.userInfo["aos"] = aos
        }
        let id = "\(base)-snooze"
        UNUserNotificationCenter.current().add(UNNotificationRequest(
            identifier: id, content: copy,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(60, minutes * 60), repeats: false)))
    }
}
