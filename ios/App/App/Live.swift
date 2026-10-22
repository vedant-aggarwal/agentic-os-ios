import ActivityKit
import Capacitor
import UIKit
import UserNotifications

/// The 2.0.0 Live Activities: a workout in progress, a breathing session, a focus block. One of each at a time.
/// JS: AosLive.start({ kind, ... }), update({ id, ... }), end({ id }), list(). Lock-screen buttons come back as the
/// "live" event { id, kind, action, state } (held until the web layer listens).
@objc(AosLivePlugin)
public class AosLivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosLivePlugin"
    public let jsName = "AosLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.off("off", ["error": "Live Activities are off for Agentic OS in Settings."]) }
        let opts = (call.options as? [String: Any]) ?? [:]
        DispatchQueue.main.async {
            switch call.text("kind") {
            case "workout":
                if let id = LiveKit.shared.startWorkout(opts) { call.ok(["id": id, "kind": "workout"]) } else { call.fail("The workout didn't start on the lock screen.") }
            case "focus":
                if let id = LiveKit.shared.startFocus(minutes: call.integer("minutes", 25, 1...600), title: call.text("title") ?? "Focus") {
                    call.ok(["id": id, "kind": "focus"])
                } else { call.fail("The focus block didn't start on the lock screen.") }
            case "breathing":
                if let id = LiveKit.shared.startBreath(title: call.text("title") ?? "Breathe", pattern: call.text("pattern") ?? "calm") {
                    call.ok(["id": id, "kind": "breathing"])
                } else { call.fail("The breathing session didn't start on the lock screen.") }
            default:
                call.fail("kind is workout, focus or breathing.")
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        let opts = (call.options as? [String: Any]) ?? [:]
        DispatchQueue.main.async {
            if LiveKit.shared.update(id: call.text("id"), kind: call.text("kind"), opts) { call.ok() } else { call.fail("No such Live Activity.") }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LiveKit.shared.end(id: call.text("id"), kind: call.text("kind"))
            call.ok()
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.ok(["items": LiveKit.shared.list()]) }
    }
}

final class LiveKit {
    static let shared = LiveKit()
    private var workout: Activity<WorkoutActivityAttributes>?
    private var breath: Activity<BreathActivityAttributes>?
    private var focus: Activity<FocusActivityAttributes>?
    private static let focusNote = "aos.focus.end"

    private var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    /// From launch: pick up activities still on the lock screen, and end a focus block whose time is up.
    func observe() {
        workout = Activity<WorkoutActivityAttributes>.activities.first { $0.activityState == .active }
        focus = Activity<FocusActivityAttributes>.activities.first { $0.activityState == .active }
        // A breathing session never survives the app: its timer lived in the process that ended.
        for a in Activity<BreathActivityAttributes>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } }
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.settleFocus()
        }
    }

    // MARK: Workout

    func startWorkout(_ o: [String: Any]) -> String? {
        guard enabled else { return nil }
        if let old = workout { Task { await old.end(nil, dismissalPolicy: .immediate) } }
        let attrs = WorkoutActivityAttributes(title: (o["title"] as? String) ?? "Workout",
                                              startedAt: Dates.parse(o["startedAt"])?.timeIntervalSince1970 ?? Date().timeIntervalSince1970)
        let state = workoutState(o, base: nil)
        guard let a = try? Activity.request(attributes: attrs, content: ActivityContent(state: state, staleDate: nil), pushType: nil) else { return nil }
        workout = a
        return a.id
    }

    private func workoutState(_ o: [String: Any], base: WorkoutActivityAttributes.ContentState?) -> WorkoutActivityAttributes.ContentState {
        func int(_ k: String) -> Int? { (o[k] as? NSNumber)?.intValue }
        func dbl(_ k: String) -> Double? { (o[k] as? NSNumber)?.doubleValue }
        var s = base ?? WorkoutActivityAttributes.ContentState(exercise: "Workout", setIndex: 1, setCount: 1, reps: nil, weight: nil,
                                                               unit: "kg", phase: "work", restEnds: nil, restSeconds: 90, next: nil)
        if let v = o["exercise"] as? String { s.exercise = v }
        if let v = int("set") { s.setIndex = max(v, 1) }
        if let v = int("sets") { s.setCount = max(v, 1) }
        if let v = int("reps") { s.reps = v }
        if let v = dbl("weight") { s.weight = v }
        if let v = o["unit"] as? String { s.unit = v }
        if let v = o["next"] as? String { s.next = v }
        if let v = int("restSeconds") { s.restSeconds = v }
        if let v = o["phase"] as? String, ["work", "rest", "done"].contains(v) {
            s.phase = v
            if v == "rest" {
                let secs = Double(int("restSeconds") ?? s.restSeconds ?? 90)
                s.restEnds = Dates.parse(o["restEnds"])?.timeIntervalSince1970 ?? Date().timeIntervalSince1970 + secs
            } else { s.restEnds = nil }
        }
        return s
    }

    // MARK: Focus

    func startFocus(minutes: Int, title: String) -> String? {
        guard enabled else { return nil }
        if let old = focus { Task { await old.end(nil, dismissalPolicy: .immediate) } }
        let m = min(max(minutes, 1), 600)
        let now = Date().timeIntervalSince1970
        let end = now + Double(m) * 60
        let attrs = FocusActivityAttributes(title: title, startedAt: now, minutes: m)
        let state = FocusActivityAttributes.ContentState(endsAt: end, paused: false, remaining: nil, label: nil)
        guard let a = try? Activity.request(attributes: attrs, content: ActivityContent(state: state, staleDate: Date(timeIntervalSince1970: end)), pushType: nil) else { return nil }
        focus = a
        noteFocusEnd(at: end, title: title)
        return a.id
    }

    /// "Focus done" at the end, as a time-sensitive notification, so it reaches him through a Focus mode.
    private func noteFocusEnd(at end: Double, title: String) {
        let c = UNMutableNotificationContent()
        c.title = "\(title) done"
        c.body = "Take a breath. What's next?"
        c.sound = .default
        c.threadIdentifier = "focus"
        c.categoryIdentifier = "AOS_PLAIN"
        c.interruptionLevel = .timeSensitive
        c.userInfo = ["aos": ["id": LiveKit.focusNote, "category": "plain", "url": "agenticos://today"]]
        let wait = max(1, end - Date().timeIntervalSince1970)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [LiveKit.focusNote])
        center.add(UNNotificationRequest(identifier: LiveKit.focusNote, content: c,
                                         trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)))
    }

    private func settleFocus() {
        guard let f = focus, f.activityState == .active else { return }
        let s = f.content.state
        if !s.paused, s.endsAt <= Date().timeIntervalSince1970 {
            Task { await f.end(ActivityContent(state: s, staleDate: nil), dismissalPolicy: .after(Date().addingTimeInterval(15 * 60))) }
            focus = nil
            NativeHub.shared.emit("live", ["id": f.id, "kind": "focus", "action": "finished"])
        }
    }

    // MARK: Breathing (Breath drives these)

    @discardableResult
    func startBreath(title: String, pattern: String) -> String? {
        guard enabled else { return nil }
        if let old = breath { Task { await old.end(nil, dismissalPolicy: .immediate) } }
        let now = Date().timeIntervalSince1970
        let state = BreathActivityAttributes.ContentState(phase: "in", label: "Get ready", phaseStart: now, phaseEnd: now + 1,
                                                          cycle: 1, cycles: 1, endsAt: now + 60)
        guard let a = try? Activity.request(attributes: BreathActivityAttributes(title: title, pattern: pattern),
                                            content: ActivityContent(state: state, staleDate: nil), pushType: nil) else { return nil }
        breath = a
        return a.id
    }

    func updateBreath(phase: String, label: String, start: Double, end: Double, cycle: Int, cycles: Int, endsAt: Double) {
        guard let a = breath else { return }
        let s = BreathActivityAttributes.ContentState(phase: phase, label: label, phaseStart: start, phaseEnd: end,
                                                      cycle: cycle, cycles: cycles, endsAt: endsAt)
        Task { await a.update(ActivityContent(state: s, staleDate: Date(timeIntervalSince1970: endsAt + 30))) }
    }

    func endBreath(complete: Bool) {
        guard let a = breath else { return }
        breath = nil
        var s = a.content.state
        s.phase = "done"
        s.label = complete ? "Well done" : "Stopped"
        let content = ActivityContent(state: s, staleDate: nil)
        Task { await a.end(content, dismissalPolicy: .after(Date().addingTimeInterval(complete ? 120 : 5))) }
    }

    // MARK: Updates from the web layer

    func update(id: String?, kind: String?, _ o: [String: Any]) -> Bool {
        if let w = workout, id == w.id || kind == "workout" {
            let s = workoutState(o, base: w.content.state)
            Task { await w.update(ActivityContent(state: s, staleDate: nil)) }
            return true
        }
        if let f = focus, id == f.id || kind == "focus" {
            var s = f.content.state
            if let m = (o["minutes"] as? NSNumber)?.doubleValue { s.endsAt = Date().timeIntervalSince1970 + m * 60 }
            if let end = Dates.parse(o["endsAt"]) { s.endsAt = end.timeIntervalSince1970 }
            if let label = o["label"] as? String { s.label = label }
            if let paused = (o["paused"] as? NSNumber)?.boolValue { setPaused(&s, paused) }
            Task { [s] in await f.update(ActivityContent(state: s, staleDate: Date(timeIntervalSince1970: s.endsAt))) }
            if !s.paused { noteFocusEnd(at: s.endsAt, title: f.attributes.title) }
            return true
        }
        return false
    }

    private func setPaused(_ s: inout FocusActivityAttributes.ContentState, _ paused: Bool) {
        let now = Date().timeIntervalSince1970
        if paused, !s.paused {
            s.remaining = max(0, s.endsAt - now)
            s.paused = true
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [LiveKit.focusNote])
        } else if !paused, s.paused {
            s.endsAt = now + (s.remaining ?? 0)
            s.remaining = nil
            s.paused = false
        }
    }

    func end(id: String?, kind: String?) {
        if let w = workout, id == nil && kind == nil || id == w.id || kind == "workout" {
            var s = w.content.state
            s.phase = "done"
            Task { [s] in await w.end(ActivityContent(state: s, staleDate: nil), dismissalPolicy: .after(Date().addingTimeInterval(10 * 60))) }
            workout = nil
        }
        if let f = focus, id == nil && kind == nil || id == f.id || kind == "focus" {
            Task { await f.end(nil, dismissalPolicy: .immediate) }
            focus = nil
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [LiveKit.focusNote])
        }
        if let b = breath, id == b.id || kind == "breathing" {
            _ = b
            Breath.shared.stop(reason: "stopped")
        }
    }

    func list() -> [[String: Any]] {
        var out: [[String: Any]] = []
        if let w = workout {
            let s = w.content.state
            out.append(["id": w.id, "kind": "workout", "title": w.attributes.title, "exercise": s.exercise, "set": s.setIndex,
                        "sets": s.setCount, "phase": s.phase, "restEnds": s.restEnds.map { Dates.ms($0) } ?? NSNull()])
        }
        if let f = focus {
            let s = f.content.state
            out.append(["id": f.id, "kind": "focus", "title": f.attributes.title, "endsAt": Dates.ms(s.endsAt), "paused": s.paused])
        }
        if let b = breath {
            out.append(["id": b.id, "kind": "breathing", "title": b.attributes.title, "phase": b.content.state.phase])
        }
        return out
    }

    // MARK: Lock-screen buttons (LiveActionIntent runs these in the app's process)

    func handle(kind: String, action: String) {
        switch kind {
        case "workout":
            guard let w = workout else { return }
            var s = w.content.state
            switch action {
            case "next":
                if s.setIndex >= s.setCount {
                    s.phase = "done"
                    s.restEnds = nil
                } else {
                    s.setIndex += 1
                    let rest = s.restSeconds ?? 0
                    s.phase = rest > 0 ? "rest" : "work"
                    s.restEnds = rest > 0 ? Date().timeIntervalSince1970 + Double(rest) : nil
                }
            case "rest":
                s.phase = "rest"
                s.restEnds = Date().timeIntervalSince1970 + Double(s.restSeconds ?? 90)
            case "skip":
                s.phase = "work"
                s.restEnds = nil
            case "end":
                end(id: w.id, kind: nil)
                NativeHub.shared.emit("live", ["id": w.id, "kind": "workout", "action": "end", "state": workoutJSON(s)])
                return
            default:
                return
            }
            Task { [s] in await w.update(ActivityContent(state: s, staleDate: nil)) }
            Haptic.shared.play(action == "next" ? "success" : "tick")
            NativeHub.shared.emit("live", ["id": w.id, "kind": "workout", "action": action, "state": workoutJSON(s)])
        case "focus":
            guard let f = focus else { return }
            var s = f.content.state
            switch action {
            case "add5":
                if s.paused { s.remaining = (s.remaining ?? 0) + 300 }
                else { s.endsAt = max(s.endsAt, Date().timeIntervalSince1970) + 300 }
                Task { [s] in await f.update(ActivityContent(state: s, staleDate: Date(timeIntervalSince1970: s.endsAt))) }
                if !s.paused { noteFocusEnd(at: s.endsAt, title: f.attributes.title) }
            case "pause", "resume":
                setPaused(&s, action == "pause")
                Task { [s] in await f.update(ActivityContent(state: s, staleDate: Date(timeIntervalSince1970: s.endsAt))) }
                if !s.paused { noteFocusEnd(at: s.endsAt, title: f.attributes.title) }
            case "end":
                end(id: f.id, kind: nil)
            default:
                return
            }
            NativeHub.shared.emit("live", ["id": f.id, "kind": "focus", "action": action,
                                           "state": ["endsAt": Dates.ms(s.endsAt), "paused": s.paused]])
        case "breathing":
            if action == "stop" || action == "end" { Breath.shared.stop(reason: "lock screen") }
        default:
            break
        }
    }

    private func workoutJSON(_ s: WorkoutActivityAttributes.ContentState) -> [String: Any] {
        ["exercise": s.exercise, "set": s.setIndex, "sets": s.setCount, "phase": s.phase,
         "reps": s.reps ?? NSNull(), "weight": s.weight ?? NSNull(), "restEnds": s.restEnds.map { Dates.ms($0) } ?? NSNull()]
    }
}
