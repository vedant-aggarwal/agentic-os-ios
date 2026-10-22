import Foundation
import Security
#if canImport(ActivityKit)
import ActivityKit
#endif

/// What the app, the widgets and the share sheet have in common: the PC's address, the sign-in token and today's
/// plan. They live in a keychain group the three targets share, so no App Group has to be set up in the portal.
enum Shared {
    static let base = "https://agentic.norrita.com"
    private static let service = "com.norrita.agenticos.shared"

    /// "TEAMID." + group, from the AppIdentifierPrefix Info.plist key (filled in when the build is signed).
    private static var accessGroup: String? {
        guard let prefix = Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String,
              !prefix.isEmpty, !prefix.hasPrefix("$") else { return nil }
        return prefix + service
    }

    private static func query(_ key: String) -> [String: Any] {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: key]
        if let group = accessGroup { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    static func read(_ key: String) -> Data? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    static func write(_ key: String, _ data: Data?) {
        let q = query(key)
        guard let data else { SecItemDelete(q as CFDictionary); return }
        // Widgets refresh while the phone is locked, so the items stay readable after the first unlock.
        let attrs: [String: Any] = [kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        if SecItemUpdate(q as CFDictionary, attrs as CFDictionary) == errSecItemNotFound {
            SecItemAdd(q.merging(attrs) { $1 } as CFDictionary, nil)
        }
    }

    static var token: String? {
        get { read("token").flatMap { String(data: $0, encoding: .utf8) } }
        set { write("token", newValue?.data(using: .utf8)) }
    }

    static var snapshot: Snapshot? {
        get { read("snapshot").flatMap { try? JSONDecoder().decode(Snapshot.self, from: $0) } }
        set { write("snapshot", newValue.flatMap { try? JSONEncoder().encode($0) }) }
    }

    /// A call to the PC's API (/api/v1 + path) with the saved token. Returns the status (0 when unreachable) and body.
    @discardableResult
    static func send(_ path: String, method: String = "POST", body: [String: Any]? = nil,
                     timeout: TimeInterval = 20) async -> (Int, Data?) {
        let data = body.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        return await request(path, method: method, data: data, type: data == nil ? nil : "application/json", timeout: timeout)
    }

    /// The same call with a raw body (audio chunks, images) or none (GET).
    @discardableResult
    static func request(_ path: String, method: String = "GET", data: Data? = nil, type: String? = nil,
                        timeout: TimeInterval = 20) async -> (Int, Data?) {
        guard let token, let url = URL(string: base + "/api/v1" + path) else { return (0, nil) }
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

    /// json[key] when the response wraps the object ({ recording: {...} }), else the object itself.
    static func item(_ data: Data?, _ key: String) -> [String: Any]? {
        guard let j = json(data) else { return nil }
        return (j[key] as? [String: Any]) ?? j
    }

    // MARK: Offline queue (Siri, Shortcuts, widget buttons and controls while the PC is unreachable)

    struct Queued: Codable {
        var path: String
        var method: String
        var body: Data
        var at: Double
        /// Said to the agent instead when the route doesn't exist on the PC yet (404), so nothing is lost.
        var fallback: String?
    }

    static var queue: [Queued] {
        get { read("queue").flatMap { try? JSONDecoder().decode([Queued].self, from: $0) } ?? [] }
        set { write("queue", newValue.isEmpty ? nil : try? JSONEncoder().encode(newValue)) }
    }

    static func enqueue(_ path: String, method: String = "POST", body: [String: Any], fallback: String? = nil) {
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        var items = queue
        // Keep the queue small: a phone offline for days shouldn't grow the keychain without bound.
        if items.count >= 200 { items.removeFirst(items.count - 199) }
        items.append(Queued(path: path, method: method, body: data, at: Date().timeIntervalSince1970, fallback: fallback))
        queue = items
    }

    /// Sends what was queued, oldest first; keeps what still can't reach the PC. Client errors (4xx) are dropped,
    /// except a missing route (404) with a fallback line, which goes to the agent as a message instead.
    static func flushQueue() async {
        let items = queue
        guard !items.isEmpty, token != nil else { return }
        var left: [Queued] = []
        for (i, q) in items.enumerated() {
            let (code, _) = await request(q.path, method: q.method, data: q.body, type: "application/json")
            if code == 0 || code >= 500 { left = Array(items[i...]); break }
            if code == 404 || code == 405, let say = q.fallback { _ = await sayInstead(say) }
        }
        queue = left
    }

    // MARK: Writes from intents, widget buttons and controls

    /// Where each quick write goes on the PC (/api/v1 + path). The app can move one with snapshot.routes.
    enum Route: String {
        case expense, meal, journal, habit, workout
        var fallbackPath: String {
            switch self {
            case .expense: return "/mod/money/expenses"
            case .meal: return "/mod/body/meals"
            case .journal: return "/mod/growth/journal"
            case .habit: return "/mod/soul/checks"
            case .workout: return "/mod/body/workouts"
            }
        }
    }

    static func route(_ r: Route) -> String {
        if let custom = snapshot?.routes?[r.rawValue], custom.hasPrefix("/") { return custom }
        return r.fallbackPath
    }

    enum Delivery {
        case saved, queued, viaAgent, viaInbox, signedOut, failed(String)

        /// What Siri says back.
        func say(_ saved: String) -> String {
            switch self {
            case .saved: return saved
            case .queued: return "Saved on the phone. It goes to Agentic OS when your PC is reachable."
            case .viaAgent: return "Sent to the agent to file."
            case .viaInbox: return "Saved to your inbox."
            case .signedOut: return "Open Agentic OS and sign in first."
            case .failed(let why): return why
            }
        }
        var ok: Bool {
            switch self {
            case .saved, .queued, .viaAgent, .viaInbox: return true
            default: return false
            }
        }
    }

    /// One quick write: straight to the PC, queued when it can't be reached, or said to the agent (then the inbox)
    /// when the route isn't on the PC yet. The body's "id" makes a retry safe.
    static func deliver(_ path: String, body: [String: Any], say: String) async -> Delivery {
        guard token != nil else { return .signedOut }
        let (code, _) = await send(path, body: body, timeout: 12)
        if (200..<300).contains(code) { return .saved }
        if code == 401 { return .signedOut }
        if code == 0 || code >= 500 {
            enqueue(path, body: body, fallback: say)
            return .queued
        }
        if code == 404 || code == 405 { return await sayInstead(say) }
        return .failed("The PC didn't take it (\(code)).")
    }

    /// The agent files it from a plain sentence; accounts without the agent get an inbox task.
    static func sayInstead(_ text: String) async -> Delivery {
        let (c1, _) = await send("/nora/messages", body: ["text": text], timeout: 12)
        if (200..<300).contains(c1) { return .viaAgent }
        let (c2, _) = await send("/inbox", body: ["text": text], timeout: 12)
        if (200..<300).contains(c2) { return .viaInbox }
        if c1 == 0 && c2 == 0 {
            enqueue("/inbox", body: ["text": text])
            return .queued
        }
        return .failed("Couldn't save it. Open Agentic OS and try there.")
    }

    /// Changes the saved snapshot in place (a widget button ticking a habit before the PC confirms).
    static func updateSnapshot(_ change: (inout Snapshot) -> Void) {
        guard var s = snapshot else { return }
        change(&s)
        snapshot = s
    }

    static func newId() -> String { UUID().uuidString.lowercased() }

    static func isoNow() -> String { isoFormat.string(from: Date()) }

    private static let isoFormat: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// When the keyboard last opened with Full Access (it can only write here with Full Access on). The app's
    /// Settings sheet reads it to show whether the keyboard is set up.
    static var keyboardSeen: Double? {
        get { read("keyboard.seen").flatMap { String(data: $0, encoding: .utf8) }.flatMap(Double.init) }
        set { write("keyboard.seen", newValue.map { String($0) }?.data(using: .utf8)) }
    }

    // MARK: Dictation hand-off between the keyboard and the app

    /// The current dictation, written by the app and read by the keyboard (and the keyboard's start request).
    static var flow: FlowState? {
        get { read("flow").flatMap { try? JSONDecoder().decode(FlowState.self, from: $0) } }
        set { write("flow", newValue.flatMap { try? JSONEncoder().encode($0) }) }
    }

    /// A new dictation the keyboard asks the (already listening) app to start: the flow id.
    static var flowRequest: String? {
        get { read("flow.request").flatMap { String(data: $0, encoding: .utf8) } }
        set { write("flow.request", newValue?.data(using: .utf8)) }
    }
}

/// One dictation from the keyboard. state: starting, recording, finishing, done, failed.
struct FlowState: Codable, Equatable {
    var id: String
    var recordingId: String?
    var state: String
    var text: String?
    var error: String?
    var startedAt: Double
    var updatedAt: Double
    /// The app keeps the microphone open until then, so the keyboard can start the next one without switching apps.
    var warmUntil: Double

    var live: Bool { state == "starting" || state == "recording" || state == "finishing" }
    var warm: Bool { warmUntil > Date().timeIntervalSince1970 }
}

/// Darwin notifications between the keyboard and the app. They carry no data; the state lives in Shared.flow.
enum FlowSignal: String, CaseIterable {
    case start = "com.norrita.agenticos.flow.start"      // keyboard -> app: start Shared.flowRequest
    case stop = "com.norrita.agenticos.flow.stop"        // keyboard -> app: stop and transcribe
    case cancel = "com.norrita.agenticos.flow.cancel"    // keyboard -> app: stop and throw away
    case changed = "com.norrita.agenticos.flow.changed"  // app -> keyboard: Shared.flow changed

    func post() {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                                             CFNotificationName(rawValue as CFString), nil, nil, true)
    }
}

/// Listens for FlowSignals while it is alive; the handler runs on the main queue.
final class FlowListener {
    private let handler: (FlowSignal) -> Void

    init(_ signals: [FlowSignal], _ handler: @escaping (FlowSignal) -> Void) {
        self.handler = handler
        let me = Unmanaged.passUnretained(self).toOpaque()
        for s in signals {
            CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), me, { _, observer, name, _, _ in
                guard let observer, let name, let signal = FlowSignal(rawValue: name.rawValue as String) else { return }
                let listener = Unmanaged<FlowListener>.fromOpaque(observer).takeUnretainedValue()
                DispatchQueue.main.async { listener.handler(signal) }
            }, s.rawValue as CFString, nil, .deliverImmediately)
        }
    }

    deinit {
        CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    }
}

extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}

/// Today on the phone, as the widgets draw it. Written by the app on every change; times are Unix seconds.
/// v2 (2.0.0) adds the life wheel, money, streaks, the agent and jobs (v2\notes\native.md has the JSON). Every v2 field
/// is optional and a bad row in a list drops only that row, so an old or partial snapshot still draws.
struct Snapshot: Codable {
    struct Block: Codable, Hashable {
        var title: String
        var area: String
        var color: String
        var kind: String          // event, task, sleep
        var startAt: Double
        var endAt: Double
    }
    /// One of the nine aspects on the wheel. score 0-10; p is the ring fill (0-1), else score / 10.
    struct Aspect: Codable, Hashable {
        var id: String
        var name: String
        var score: Double
        var p: Double?
        var color: String?
        var delta: Double?
        var fill: Double { min(max(p ?? score / 10, 0), 1) }
    }
    /// Today's allowance. left can go below zero.
    struct Money: Codable, Hashable {
        var left: Double
        var budget: Double
        var spent: Double?
        var currency: String?
        var monthLeft: Double?
        var monthBudget: Double?
        var symbol: String { (currency ?? "").isEmpty ? "₹" : currency! }
        var fraction: Double { budget > 0 ? min(max(left / budget, 0), 1) : 0 }
    }
    /// A streak or a habit. hidden ("private" in JSON) never shows on the lock screen or in StandBy.
    struct Streak: Codable, Hashable {
        var id: String
        var label: String
        var n: Int
        var today: Bool?
        var atRisk: Bool?
        var due: Double?
        var aspect: String?
        var hidden: Bool?
        enum CodingKeys: String, CodingKey { case id, label, n, today, atRisk, due, aspect, hidden = "private" }
    }
    struct Ask: Codable, Hashable {
        var id: String
        var title: String
        var yes: String?
        var no: String?
    }
    /// The agent: her name, how he seems to her (stress 0-1 colours the orb) and her open question.
    struct Agent: Codable, Hashable {
        var name: String?
        var product: String?
        var mood: String?
        var stress: Double?
        var energy: Double?
        var valence: Double?
        var last: String?
        var ask: Ask?
    }
    struct Job: Codable, Hashable {
        var id: String
        var title: String
        var state: String         // working, needs, done
        var url: String?
        var engine: String?
        var detail: String?
        var since: Double?
    }
    struct Jobs: Codable, Hashable {
        var needs: Int
        var working: Int
        var done: Int?
        var items: [Job]?
    }

    var v: Int? = nil
    var at: Double
    var name: String?
    var skin: String? = nil
    var blocks: [Block]
    var done: Int
    var total: Int
    var up: [String]              // the next open tasks
    var nora: String?             // Nora's latest line
    var noraName: String?
    var life: [Aspect]? = nil
    var money: Money? = nil
    var streaks: [Streak]? = nil
    var agent: Agent? = nil
    var jobs: Jobs? = nil
    var routes: [String: String]? = nil

    enum CodingKeys: String, CodingKey {
        case v, at, name, skin, blocks, done, total, up, nora, noraName, life, money, streaks, agent, jobs, routes
    }

    /// The agent's display name: hers, else the product's.
    var agentName: String { agent?.name ?? noraName ?? agent?.product ?? "Wyn" }

    /// What's on now and what's next. The shortest block covering now wins (a task inside a deep-work block);
    /// between blocks it's "Free" until the next one. server/nora.ts uses the same rule for the Live Activity.
    static func nowNext(_ blocks: [Block], at now: Double) -> NowNext? {
        let cur = blocks.filter { $0.startAt <= now && now < $0.endAt }.min { ($0.endAt - $0.startAt) < ($1.endAt - $1.startAt) }
        let next = blocks.filter { $0 != cur && $0.startAt > now }.min { $0.startAt < $1.startAt }
        if let cur {
            return NowNext(title: cur.title, area: cur.area, color: cur.color, kind: cur.kind,
                           startAt: cur.startAt, endAt: cur.endAt, next: next?.title, nextAt: next?.startAt)
        }
        guard let next else { return nil }
        let prev = max(now - 3 * 3600, blocks.filter { $0.endAt <= now }.map(\.endAt).max() ?? 0)
        return NowNext(title: "Free", area: "", color: "#8E8E93", kind: "free",
                       startAt: prev, endAt: next.startAt, next: next.title, nextAt: next.startAt)
    }

    /// The blocks still ahead today and tomorrow, for agenda rows.
    func ahead(from now: Double, limit: Int) -> [Block] {
        Array(blocks.filter { $0.endAt > now && $0.kind != "sleep" }.sorted { $0.startAt < $1.startAt }.prefix(limit))
    }

    /// The next block that hasn't started yet (the lock screen's "Next" widget).
    func next(after now: Double) -> Block? {
        blocks.filter { $0.startAt > now && $0.kind != "sleep" }.min { $0.startAt < $1.startAt }
    }
}

/// Decodes field by field: a missing or malformed field falls back to its default instead of failing the snapshot.
/// In an extension, so the memberwise initializer stays for previews.
extension Snapshot {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func int(_ k: CodingKeys) -> Int? {
            if let i = try? c.decode(Int.self, forKey: k) { return i }
            return (try? c.decode(Double.self, forKey: k)).flatMap { $0.isFinite && abs($0) < 1e12 ? Int($0.rounded()) : nil }
        }
        v = int(.v)
        at = (try? c.decode(Double.self, forKey: .at)) ?? Date().timeIntervalSince1970
        name = try? c.decode(String.self, forKey: .name)
        skin = try? c.decode(String.self, forKey: .skin)
        blocks = (try? c.decode(Lossy<Block>.self, forKey: .blocks))?.items ?? []
        done = int(.done) ?? 0
        total = int(.total) ?? 0
        up = (try? c.decode(Lossy<String>.self, forKey: .up))?.items ?? []
        nora = try? c.decode(String.self, forKey: .nora)
        noraName = try? c.decode(String.self, forKey: .noraName)
        life = (try? c.decode(Lossy<Aspect>.self, forKey: .life))?.items
        money = try? c.decode(Money.self, forKey: .money)
        streaks = (try? c.decode(Lossy<Streak>.self, forKey: .streaks))?.items
        agent = try? c.decode(Agent.self, forKey: .agent)
        jobs = try? c.decode(Jobs.self, forKey: .jobs)
        routes = try? c.decode([String: String].self, forKey: .routes)
    }
}

/// A JSON array where elements that don't decode are skipped rather than failing the whole array.
struct Lossy<T: Decodable>: Decodable {
    var items: [T]
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [T] = []
        while !c.isAtEnd {
            if let v = try? c.decode(T.self) { out.append(v) } else if (try? c.decode(Skip.self)) == nil { break }
        }
        items = out
    }
    /// Decodes anything (it reads nothing), so a bad element is stepped over.
    private struct Skip: Decodable { init(from decoder: Decoder) throws {} }
}

/// The Live Activity's state. Field names match the JSON the PC pushes, so keep them in step with server/nora.ts.
struct NowNext: Codable, Hashable {
    var title: String
    var area: String
    var color: String
    var kind: String              // event, task, sleep, free
    var startAt: Double
    var endAt: Double
    var next: String?
    var nextAt: Double?

    var start: Date { Date(timeIntervalSince1970: startAt) }
    var end: Date { Date(timeIntervalSince1970: max(endAt, startAt + 60)) }
    var nextDate: Date? { nextAt.map { Date(timeIntervalSince1970: $0) } }
}

/// One agent session on the PC: a job from the app or a Claude/Codex terminal. state: working, needs, done.
struct WorkItem: Codable, Hashable {
    var id: String
    var title: String
    var state: String
    var since: Double             // when it entered this state (Unix seconds)
    var url: String               // agenticos://job/<id> or agenticos://term/<id>
    var engine: String            // claude, codex
    var detail: String?           // what it's asking, when it needs him

    var sinceDate: Date { Date(timeIntervalSince1970: since) }
}

/// The sessions Live Activity's state: how many are working, waiting on him and done, and the top few.
/// Field names match the JSON the PC pushes (server/work-activity.ts), so keep them in step.
struct WorkState: Codable, Hashable {
    var working: Int
    var needs: Int
    var done: Int
    var items: [WorkItem]
    var at: Double

    var active: Bool { working + needs > 0 }
    var total: Int { working + needs + done }
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
struct DayActivityAttributes: ActivityAttributes {
    typealias ContentState = NowNext
    var day: String
}

@available(iOS 16.1, *)
struct WorkActivityAttributes: ActivityAttributes {
    typealias ContentState = WorkState
    var started: Double
}
#endif
