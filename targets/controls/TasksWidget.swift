import AppIntents
import Foundation
import SwiftUI
import WidgetKit

// "My tasks" on the home screen: his open tasks in Home's order (Today, Tomorrow, Later, No date; his drag order
// inside each), a plus that opens the app's create sheet, and a ring per row that ticks the task without opening the
// app (Toggle with an App Intent). The intent PATCHes the PC; when the PC can't be reached the tick waits in this
// extension's defaults and goes out on the next reload. Reads GET /today, /life and the Tag Nora list with the
// sign-in the app shares through the keychain group (PCLink in PCCommand.swift). Never shows habits, the clean
// streak, Nora's text or photos.

// MARK: What the PC sends

struct TaskLite: Decodable {
  let id: String
  let title: String
  let status: String
  let area: String?
  let due: String?
  let owner: String?
  let parent: String?
  let position: Double

  enum K: String, CodingKey { case id, title, status, area, due, owner, parent, position }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: K.self)
    func text(_ k: K) -> String? {
      if let s = try? c.decodeIfPresent(String.self, forKey: k) { return s }
      if let n = try? c.decodeIfPresent(Int.self, forKey: k) { return String(n) }
      return nil
    }
    id = text(.id) ?? UUID().uuidString
    title = text(.title) ?? ""
    status = text(.status) ?? "todo"
    area = text(.area)
    due = text(.due).map { String($0.prefix(10)) }
    owner = text(.owner)
    parent = text(.parent)
    position = (try? c.decodeIfPresent(Double.self, forKey: .position)) ?? 0
  }
}

struct TasksPayload: Decodable {
  let date: String
  let tasks: [TaskLite]
}

struct TagsPayload: Decodable {
  struct Tag: Decodable { let state: String? }
  let tags: [String: Tag]
}

// MARK: Store: last good answer, ticks waiting for the PC

enum TasksStore {
  private static let todayKey = "aos.tasks.today"
  private static let lifeKey = "aos.tasks.life"
  private static let tagsKey = "aos.tasks.tags"
  private static let syncedKey = "aos.tasks.synced"
  private static let pendingKey = "aos.tasks.pending"
  private static var d: UserDefaults { .standard }

  static var pending: [String: Bool] {
    get { (d.dictionary(forKey: pendingKey) as? [String: Bool]) ?? [:] }
    set { d.set(newValue, forKey: pendingKey) }
  }

  static func cached() -> (today: TasksPayload, aspects: [String: [String]], nora: Set<String>, synced: Date?)? {
    guard let raw = d.data(forKey: todayKey), let today = try? JSONDecoder().decode(TasksPayload.self, from: raw) else { return nil }
    let life = d.data(forKey: lifeKey).flatMap { try? JSONDecoder().decode(LifePayload.self, from: $0) }
    let tags = d.data(forKey: tagsKey).flatMap { try? JSONDecoder().decode(TagsPayload.self, from: $0) }
    let nora = Set((tags?.tags ?? [:]).filter { $0.value.state != "found" }.keys)
    let synced = d.object(forKey: syncedKey) as? Date
    return (today, life?.areaAspects ?? [:], nora, synced)
  }

  /// Sends the waiting ticks, then reads the PC. Returns false when signed out.
  static func refresh() async -> Bool {
    guard let token = PCLink.read("token"), let api = PCLink.read("api") else { return false }
    for (id, done) in pending {
      if await patch(api: api, token: token, id: id, done: done) { pending.removeValue(forKey: id) }
    }
    async let t = get(api + "/today", token)
    async let l = get(api + "/life", token)
    async let g = get(api + "/mod/tasknora/tags", token)
    let (today, life, tags) = await (t, l, g)
    if today.status == 401 { return false }
    if let raw = today.data, (try? JSONDecoder().decode(TasksPayload.self, from: raw)) != nil {
      d.set(raw, forKey: todayKey)
      d.set(Date(), forKey: syncedKey)
    }
    if let raw = life.data, (try? JSONDecoder().decode(LifePayload.self, from: raw)) != nil { d.set(raw, forKey: lifeKey) }
    if let raw = tags.data, (try? JSONDecoder().decode(TagsPayload.self, from: raw)) != nil { d.set(raw, forKey: tagsKey) }
    return true
  }

  static func patch(api: String, token: String, id: String, done: Bool) async -> Bool {
    guard let url = URL(string: api + "/tasks/" + id) else { return false }
    var req = URLRequest(url: url)
    req.httpMethod = "PATCH"
    req.timeoutInterval = 8
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["status": done ? "done" : "todo"])
    guard let got = try? await URLSession.shared.data(for: req), let http = got.1 as? HTTPURLResponse else { return false }
    return http.statusCode < 300 || http.statusCode == 404 // a task deleted on the PC has nothing left to tick
  }

  private static func get(_ address: String, _ token: String) async -> (data: Data?, status: Int) {
    guard let url = URL(string: address) else { return (nil, 0) }
    var req = URLRequest(url: url)
    req.timeoutInterval = 12
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    guard let got = try? await URLSession.shared.data(for: req), let http = got.1 as? HTTPURLResponse else { return (nil, 0) }
    return (http.statusCode < 300 ? got.0 : nil, http.statusCode)
  }
}

// MARK: The tick

struct TickTaskIntent: SetValueIntent {
  static let title: LocalizedStringResource = "Tick a task"
  static let isDiscoverable = false

  @Parameter(title: "Task") var taskId: String
  @Parameter(title: "Done") var value: Bool

  init() {}
  init(taskId: String) { self.taskId = taskId }

  func perform() async throws -> some IntentResult {
    var p = TasksStore.pending
    p[taskId] = value
    TasksStore.pending = p
    if let token = PCLink.read("token"), let api = PCLink.read("api"),
       await TasksStore.patch(api: api, token: token, id: taskId, done: value) {
      var q = TasksStore.pending
      q.removeValue(forKey: taskId)
      TasksStore.pending = q
    }
    return .result()
  }
}

// MARK: Rows

struct TaskRowLine: Identifiable {
  let id: String
  let title: String
  let due: String?
  let dueSoft: Bool
  let color: Color
  let nora: Bool
  let done: Bool
}

struct TasksEntry: TimelineEntry {
  enum State { case ready, signedOut, unreachable, sample }
  let date: Date
  let state: State
  let rows: [TaskRowLine]
  let open: Int
  let synced: Date?
}

enum TasksBuild {
  static func entry(signedIn: Bool) -> TasksEntry {
    guard signedIn else { return TasksEntry(date: Date(), state: .signedOut, rows: [], open: 0, synced: nil) }
    guard let c = TasksStore.cached() else { return TasksEntry(date: Date(), state: .unreachable, rows: [], open: 0, synced: nil) }
    let pending = TasksStore.pending
    let today = c.today.date
    let tomorrow = India.day.date(from: today).map { India.day.string(from: $0.addingTimeInterval(86_400)) } ?? today
    let mine = c.today.tasks.filter { $0.parent == nil && ($0.owner == nil || $0.owner == "me") }
    // open on the PC, or ticked here and still waiting for it (shown ticked until it goes out)
    let open = mine.filter { t in
      let isOpen = ["inbox", "todo", "doing"].contains(t.status)
      return isOpen || (pending[t.id] == true)
    }
    func bucket(_ t: TaskLite) -> Int {
      guard let due = t.due else { return 3 }
      return due <= today ? 0 : due == tomorrow ? 1 : 2
    }
    let sorted = open.sorted { a, b in
      let ba = bucket(a), bb = bucket(b)
      if ba != bb { return ba < bb }
      if ba == 2, a.due != b.due { return (a.due ?? "") < (b.due ?? "") }
      if a.position != b.position { return a.position < b.position }
      return (Int(a.id.dropFirst()) ?? 0) > (Int(b.id.dropFirst()) ?? 0)
    }
    let rows = sorted.map { t -> TaskRowLine in
      let aspect = t.area.flatMap { c.aspects[$0]?.first }
      return TaskRowLine(
        id: t.id, title: t.title, due: dueLabel(t.due, today: today, tomorrow: tomorrow), dueSoft: t.due.map { $0 <= today } ?? false,
        color: aspect.flatMap { aspectColors[$0] } ?? Color.inkFaint, nora: c.nora.contains(t.id),
        done: pending[t.id] ?? !["inbox", "todo", "doing"].contains(t.status))
    }
    return TasksEntry(date: Date(), state: .ready, rows: rows, open: rows.filter { !$0.done }.count, synced: c.synced)
  }

  static func dueLabel(_ due: String?, today: String, tomorrow: String) -> String? {
    guard let due else { return nil }
    if due <= today { return "Today" }
    if due == tomorrow { return "Tomorrow" }
    guard let d = India.day.date(from: due) else { return due }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.timeZone = India.zone
    f.dateFormat = "EEE d"
    return f.string(from: d)
  }

  static let sample = TasksEntry(date: Date(), state: .sample, rows: [
    TaskRowLine(id: "s1", title: "Call the bank about the card", due: "Today", dueSoft: true, color: Color(hex: 0x62D96B), nora: false, done: false),
    TaskRowLine(id: "s2", title: "Send the invoice", due: "Tomorrow", dueSoft: false, color: Color(hex: 0x3DDC97), nora: true, done: false),
    TaskRowLine(id: "s3", title: "Book the dentist", due: "Sat 28", dueSoft: false, color: Color(hex: 0xFF8A5B), nora: false, done: false),
    TaskRowLine(id: "s4", title: "Read a chapter", due: nil, dueSoft: false, color: Color(hex: 0x2EC4B6), nora: false, done: false),
  ], open: 4, synced: nil)
}

struct TasksProvider: TimelineProvider {
  func placeholder(in context: Context) -> TasksEntry { TasksBuild.sample }

  func getSnapshot(in context: Context, completion: @escaping (TasksEntry) -> Void) {
    if context.isPreview {
      let e = TasksBuild.entry(signedIn: true)
      completion(e.state == .ready ? e : TasksBuild.sample)
      return
    }
    Task { completion(TasksBuild.entry(signedIn: await TasksStore.refresh())) }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TasksEntry>) -> Void) {
    Task {
      let e = TasksBuild.entry(signedIn: await TasksStore.refresh())
      let next = Date().addingTimeInterval(TasksStore.pending.isEmpty ? 20 * 60 : 5 * 60)
      completion(Timeline(entries: [e], policy: .after(next)))
    }
  }
}

// MARK: Widget

struct TasksWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.norrita.agenticos.tasks", provider: TasksProvider()) { entry in
      TasksWidgetView(entry: entry)
        .containerBackground(for: .widget) {
          ZStack {
            Color.scene
            RadialGradient(colors: [Color(hex: 0xBA623A, alpha: 0.28), Color(hex: 0xBA623A, alpha: 0)],
                           center: .bottom, startRadius: 0, endRadius: 220)
          }
        }
        .widgetURL(URL(string: "agenticos://nora/home"))
    }
    .configurationDisplayName("My tasks")
    .description("Your open tasks. Tick one without opening the app.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct TasksWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: TasksEntry

  private var small: Bool { family == .systemSmall }
  private var shown: Int { small ? 3 : 4 }

  var body: some View {
    VStack(alignment: .leading, spacing: small ? 6 : 4) {
      header
      switch entry.state {
      case .signedOut: notice("Sign in", "Open Agentic OS and sign in.")
      case .unreachable: notice("Can't reach your PC", "Your tasks show here once it's online.")
      case .sample, .ready:
        if entry.rows.isEmpty { empty } else { rows }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .redacted(reason: entry.state == .sample ? .placeholder : [])
  }

  private var header: some View {
    HStack(spacing: 8) {
      Text("My tasks").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.inkSoft)
      Spacer(minLength: 4)
      if let s = entry.synced, Date().timeIntervalSince(s) > 15 * 60, entry.state == .ready {
        Text("Synced \(India.hhmm(s))").font(.system(size: 12)).foregroundStyle(Color.inkFaint).lineLimit(1)
      }
      Link(destination: URL(string: "agenticos://nora/home?create=1")!) {
        Image(systemName: "plus").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
          .frame(width: 24, height: 24).background(Circle().fill(Color.white.opacity(0.12)))
      }
    }
    .frame(height: 24)
    .padding(.bottom, small ? 2 : 4)
  }

  private var rows: some View {
    VStack(alignment: .leading, spacing: small ? 6 : 4) {
      ForEach(entry.rows.prefix(shown)) { r in
        HStack(spacing: 8) {
          Toggle(isOn: r.done, intent: TickTaskIntent(taskId: r.id)) { EmptyView() }
            .toggleStyle(RingToggle(color: r.color))
          Text(r.title).font(.system(size: 13, weight: .medium))
            .foregroundStyle(r.done ? Color.inkFaint : Color.ink).strikethrough(r.done).lineLimit(1)
          if !small {
            Spacer(minLength: 4)
            if r.nora { Circle().fill(Color(hex: 0xF0457A)).frame(width: 5, height: 5) }
            if let due = r.due {
              Text(due).font(.system(size: 12).monospacedDigit()).foregroundStyle(r.dueSoft ? Color.inkSoft : Color.inkFaint).lineLimit(1)
            }
          }
        }
        .frame(height: 22)
      }
      if small && entry.rows.count > shown {
        Text("\(entry.rows.count - shown) more").font(.system(size: 12)).foregroundStyle(Color.inkFaint)
      }
    }
  }

  private var empty: some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
        .frame(width: 30, height: 30).background(Circle().fill(Color.white.opacity(0.10)))
      Text("Nothing open").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink)
      Text("Tap + to add one").font(.system(size: 12)).foregroundStyle(Color.inkFaint)
    }
  }

  private func notice(_ title: String, _ text: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink)
      Text(text).font(.system(size: 12)).foregroundStyle(Color.inkSoft)
    }
  }
}

/// The ring: 16 pt, the area's colour at 0.6; ticked, it fills with Nora's pink and shows a check.
struct RingToggle: ToggleStyle {
  let color: Color
  func makeBody(configuration: Configuration) -> some View {
    Button(action: { configuration.isOn.toggle() }) {
      ZStack {
        if configuration.isOn {
          Circle().fill(Color(hex: 0xF0457A))
          Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(Color.white)
        } else {
          Circle().strokeBorder(color.opacity(0.6), lineWidth: 1.5)
        }
      }
      .frame(width: 16, height: 16)
      .contentShape(Circle().inset(by: -6))
    }
    .buttonStyle(.plain)
  }
}
