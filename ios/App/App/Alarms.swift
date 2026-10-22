import ActivityKit
import AppIntents
import Capacitor
import CryptoKit
import SwiftUI
import UserNotifications
#if canImport(AlarmKit)
import AlarmKit
#endif

/// Real alarms for the agent's streak savers and wake calls: AlarmKit on iOS 26 (rings through silent mode and
/// Focus, full screen on the lock screen), else a time-sensitive notification that repeats twice a minute apart.
/// JS: AosAlarm.authorize(), schedule({ id?, at, title, body?, snoozeMinutes = 9, url?, weekdays? }), cancel({ id }), list().
/// weekdays: 1 = Monday ... 7 = Sunday, with at giving the time of day. Event (on Native): "alarm" { id, action }.
@objc(AosAlarmPlugin)
public class AosAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosAlarmPlugin"
    public let jsName = "AosAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
    ]

    @objc func authorize(_ call: CAPPluginCall) {
        Task { call.ok(await Alarms.shared.authorize()) }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        guard let at = call.date("at") else { return call.fail("An alarm needs at (a time).") }
        let days = (call.value("weekdays") as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue }.filter { (1...7).contains($0) }
        let m = Alarms.Meta(id: call.text("id") ?? Shared.newId(), uuid: "", at: at.timeIntervalSince1970,
                            title: call.text("title") ?? "Alarm", body: call.text("body"), url: call.text("url"),
                            kit: "", weekdays: (days?.isEmpty ?? true) ? nil : days,
                            snooze: min(max(call.number("snoozeMinutes") ?? 9, 1), 60))
        Task {
            let r = await Alarms.shared.schedule(m)
            if let error = r["error"] as? String { call.fail(error) } else { call.ok(r) }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let id = call.text("id") else { return call.fail("Say which: { id }.") }
        Alarms.shared.cancel(id)
        call.ok(["id": id])
    }

    @objc func list(_ call: CAPPluginCall) {
        call.ok(["items": Alarms.shared.list()])
    }
}

final class Alarms {
    static let shared = Alarms()

    struct Meta: Codable {
        var id: String
        var uuid: String
        var at: Double
        var title: String
        var body: String?
        var url: String?
        var kit: String           // alarmkit or notification
        var weekdays: [Int]?
        var snooze: Double
    }

    private let key = "aos.alarms"
    private var metas: [String: Meta] {
        get { (UserDefaults.standard.data(forKey: key)).flatMap { try? JSONDecoder().decode([String: Meta].self, from: $0) } ?? [:] }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: key) }
    }

    var kitAvailable: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }

    /// From launch: forget alarms that rang and won't again.
    func observe() {
        let now = Date().timeIntervalSince1970
        metas = metas.filter { $0.value.weekdays != nil || $0.value.at > now - 3600 }
    }

    func authorize() async -> [String: Any] {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let mgr = AlarmManager.shared
            var state = mgr.authorizationState
            if state == .notDetermined { state = (try? await mgr.requestAuthorization()) ?? state }
            if state == .authorized { return ["kit": "alarmkit", "status": "granted"] }
            return ["kit": "notification", "status": state == .denied ? "denied" : "prompt", "alarmKit": "off"]
        }
        #endif
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        return ["kit": "notification", "status": granted ? "granted" : "denied"]
    }

    /// A stable UUID for a JS id (AlarmKit wants UUIDs).
    static func uuid(for id: String) -> UUID {
        if let u = UUID(uuidString: id) { return u }
        var bytes = Array(SHA256.hash(data: Data(id.utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }

    func schedule(_ meta: Meta) async -> [String: Any] {
        var m = meta
        m.uuid = Alarms.uuid(for: m.id).uuidString
        cancel(m.id)
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            do {
                try await scheduleKit(m)
                m.kit = "alarmkit"
                metas[m.id] = m
                return ["id": m.id, "kit": "alarmkit", "at": Dates.ms(m.at)]
            } catch {
                // Not allowed (or the limit): fall through to notifications so it still rings.
            }
        }
        #endif
        let error = await scheduleNotes(m)
        if let error { return ["error": error] }
        m.kit = "notification"
        metas[m.id] = m
        return ["id": m.id, "kit": "notification", "at": Dates.ms(m.at)]
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func scheduleKit(_ m: Meta) async throws {
        let mgr = AlarmManager.shared
        if mgr.authorizationState == .notDetermined { _ = try await mgr.requestAuthorization() }
        guard mgr.authorizationState == .authorized else { throw AlarmOff() }
        let title: LocalizedStringResource = "\(m.title)"
        let snoozeButton = AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz")
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: title, secondaryButton: snoozeButton, secondaryButtonBehavior: .countdown)
        } else {
            alert = AlarmPresentation.Alert(title: title, stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
                                            secondaryButton: snoozeButton, secondaryButtonBehavior: .countdown)
        }
        let presentation = AlarmPresentation(alert: alert, countdown: AlarmPresentation.Countdown(title: "Snoozing"), paused: nil)
        let attributes = AlarmAttributes<AosAlarmMeta>(presentation: presentation,
                                                       metadata: AosAlarmMeta(title: m.title, body: m.body, url: m.url),
                                                       tintColor: Color(red: 0.46, green: 0.42, blue: 0.9))
        let schedule: Alarm.Schedule
        if let days = m.weekdays, !days.isEmpty {
            let comps = Calendar.current.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: m.at))
            let time = Alarm.Schedule.Relative.Time(hour: comps.hour ?? 7, minute: comps.minute ?? 0)
            schedule = .relative(Alarm.Schedule.Relative(time: time, repeats: .weekly(days.map(Alarms.weekday))))
        } else {
            schedule = .fixed(Date(timeIntervalSince1970: max(m.at, Date().timeIntervalSince1970 + 5)))
        }
        let config = AlarmManager.AlarmConfiguration<AosAlarmMeta>(
            countdownDuration: Alarm.CountdownDuration(preAlert: nil, postAlert: m.snooze * 60),
            schedule: schedule, attributes: attributes,
            stopIntent: AlarmEventIntent(alarm: m.id, action: "stop"), secondaryIntent: nil, sound: .default)
        guard let id = UUID(uuidString: m.uuid) else { throw AlarmOff() }
        _ = try await mgr.schedule(id: id, configuration: config)
    }

    @available(iOS 26.0, *)
    static func weekday(_ iso: Int) -> Locale.Weekday {
        switch iso {
        case 1: return .monday
        case 2: return .tuesday
        case 3: return .wednesday
        case 4: return .thursday
        case 5: return .friday
        case 6: return .saturday
        default: return .sunday
        }
    }
    #endif

    struct AlarmOff: Error {}

    /// Below iOS 26: the alarm and two follow-ups a minute apart, time-sensitive, with a chime made on the phone.
    private func scheduleNotes(_ m: Meta) async -> String? {
        let center = UNUserNotificationCenter.current()
        let s = await center.notificationSettings()
        if s.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        } else if s.authorizationStatus == .denied {
            return "Notifications are off for Agentic OS, so the alarm can't ring. Turn them on in Settings."
        }
        let sound = Chime.ensure()
        for (n, offset) in [0.0, 60, 120].enumerated() {
            let c = UNMutableNotificationContent()
            c.title = m.title
            c.body = m.body ?? (n == 0 ? "Alarm" : "Still ringing")
            c.categoryIdentifier = "AOS_ALARM"
            c.threadIdentifier = "aos-alarm-\(m.id)"
            c.interruptionLevel = .timeSensitive
            c.sound = sound.map { UNNotificationSound(named: UNNotificationSoundName($0)) } ?? .default
            var aos: [String: Any] = ["id": m.id, "category": "alarm", "snoozeMinutes": m.snooze]
            if let url = m.url { aos["url"] = url }
            c.userInfo = ["aos": aos]
            let trigger: UNNotificationTrigger
            if let days = m.weekdays, !days.isEmpty {
                // Repeating: one request per weekday (no follow-ups).
                guard n == 0 else { break }
                for d in days {
                    var comps = Calendar.current.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: m.at))
                    comps.weekday = d == 7 ? 1 : d + 1
                    let t = UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)
                    try? await center.add(UNNotificationRequest(identifier: "\(m.id)-d\(d)", content: c, trigger: t))
                }
                continue
            } else {
                let wait = max(2, m.at + offset - Date().timeIntervalSince1970)
                trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
            }
            do { try await center.add(UNNotificationRequest(identifier: "\(m.id)-\(n)", content: c, trigger: trigger)) }
            catch { return error.localizedDescription }
        }
        return nil
    }

    private func noteIds(_ id: String) -> [String] {
        ["\(id)-0", "\(id)-1", "\(id)-2", "\(id)-snooze"] + (1...7).map { "\(id)-d\($0)" }
    }

    func cancel(_ id: String) {
        Notify.cancel(noteIds(id))
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            try? AlarmManager.shared.cancel(id: Alarms.uuid(for: id))
        }
        #endif
        var all = metas
        all.removeValue(forKey: id)
        metas = all
    }

    func list() -> [[String: Any]] {
        var states: [String: String] = [:]
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *), let alarms = try? AlarmManager.shared.alarms {
            for a in alarms {
                switch a.state {
                case .scheduled: states[a.id.uuidString] = "scheduled"
                case .countdown: states[a.id.uuidString] = "snoozed"
                case .paused: states[a.id.uuidString] = "paused"
                case .alerting: states[a.id.uuidString] = "ringing"
                @unknown default: states[a.id.uuidString] = "scheduled"
                }
            }
        }
        #endif
        return metas.values.sorted { $0.at < $1.at }.map { m in
            var out: [String: Any] = ["id": m.id, "at": Dates.ms(m.at), "title": m.title, "kit": m.kit, "snoozeMinutes": m.snooze]
            if let d = m.weekdays { out["weekdays"] = d }
            if let u = m.url { out["url"] = u }
            if m.kit == "alarmkit" { out["state"] = states[m.uuid] ?? "done" }
            return out
        }
    }

    /// Stop / snooze on a fallback alarm's notification.
    func notificationAction(id: String, action: String) {
        if action == "stop" || action == "open" || action == "do" || action == "dismiss" {
            Notify.cancel(noteIds(id).filter { !$0.contains("-d") })
        } else if action == "snooze" {
            Notify.cancel(["\(id)-1", "\(id)-2"])
        }
        NativeHub.shared.emit("alarm", ["id": id, "action": action == "dismiss" ? "stop" : action])
    }

    /// AlarmKit's stop button (AlarmEventIntent).
    func kitEvent(id: String, action: String) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *), action == "stop" {
            try? AlarmManager.shared.stop(id: Alarms.uuid(for: id))
        }
        #endif
        let url = metas[id]?.url
        if let m = metas[id], m.weekdays == nil, action == "stop" {
            var all = metas
            all.removeValue(forKey: m.id)
            metas = all
        }
        NativeHub.shared.emit("alarm", ["id": id, "action": action])
        if action == "stop", let url { NativeHub.shared.openLink(url) }
    }
}

/// AlarmKit runs this in the app when he taps Stop on the ringing alarm.
struct AlarmEventIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Alarm button"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Alarm") var alarm: String
    @Parameter(title: "Action") var action: String

    init() {}

    init(alarm: String, action: String) {
        self.alarm = alarm
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        let a = alarm, act = action
        await MainActor.run { Alarms.shared.kitEvent(id: a, action: act) }
        return .result()
    }
}

/// A 28-second chime, written once to Library/Sounds (where notification sounds are looked up).
enum Chime {
    static let name = "aos-alarm.wav"

    static func ensure() -> String? {
        let fm = FileManager.default
        guard let lib = fm.urls(for: .libraryDirectory, in: .userDomainMask).first else { return nil }
        let dir = lib.appendingPathComponent("Sounds", isDirectory: true)
        let file = dir.appendingPathComponent(name)
        if fm.fileExists(atPath: file.path) { return name }
        do {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            try wav().write(to: file, options: .atomic)
            return name
        } catch { return nil }
    }

    /// Three rising notes, a pause, again: 16-bit mono at 22.05 kHz.
    private static func wav() -> Data {
        let rate = 22050.0, seconds = 28.0
        let total = Int(rate * seconds)
        var samples = [Int16](repeating: 0, count: total)
        let notes: [Double] = [659.25, 830.61, 987.77]
        var t = 0.0
        while t < seconds - 1 {
            for (i, f) in notes.enumerated() {
                let start = Int((t + Double(i) * 0.22) * rate)
                let len = Int(0.5 * rate)
                for k in 0..<len where start + k < total {
                    let x = Double(k) / rate
                    let env = min(1, x / 0.01) * exp(-x * 5.5)
                    let v = (sin(2 * Double.pi * f * x) + 0.3 * sin(4 * Double.pi * f * x)) * env * 0.45
                    let mixed = Double(samples[start + k]) / 32767 + v
                    samples[start + k] = Int16(max(-1, min(1, mixed)) * 32767)
                }
            }
            t += 1.6
        }
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        let bytes = UInt32(total * 2)
        d.append(contentsOf: Array("RIFF".utf8)); u32(36 + bytes)
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(UInt32(rate)); u32(UInt32(rate) * 2); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(bytes)
        samples.withUnsafeBufferPointer { p in d.append(Data(buffer: p)) }
        return d
    }
}
