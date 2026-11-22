import Foundation
import SwiftUI
import WidgetKit

// Home and lock screen widgets for the day. They read GET /today (and /life for each area's aspect) from the PC with
// the sign-in the app shares through the keychain group (modules/shared-auth, PCLink in PCCommand.swift), keep the
// last good answer for when the PC can't be reached, and redraw at every block start and end until the next fetch.
// Small: the Now card. Medium: the Now card and the next three tasks. Lock screen: the next task.
// The Now and next rule is the app's own (src/lib/today.ts deriveToday). Times and days are India time, like the PC.

// MARK: What the PC sends

struct TodayPayload: Decodable {
  struct Span: Decodable { let start: String; let end: String }
  struct Event: Decodable {
    let title: String
    let start: String
    let end: String
    let allDay: Bool?
    let area: String?
    let location: String?
  }
  struct Item: Decodable {
    let id: String
    let title: String
    let status: String
    let area: String?
    let due: String?
    let scheduled: Span?
    let owner: String?
    let parent: String?

    enum CodingKeys: String, CodingKey { case id, title, status, area, due, scheduled, owner, parent }

    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      id = Self.text(c, .id) ?? UUID().uuidString
      title = Self.text(c, .title) ?? ""
      status = Self.text(c, .status) ?? "todo"
      area = Self.text(c, .area)
      due = Self.text(c, .due)
      scheduled = try? c.decodeIfPresent(Span.self, forKey: .scheduled)
      owner = Self.text(c, .owner)
      parent = Self.text(c, .parent)
    }

    /// A string field that may come as a number (ids), or be missing or null.
    private static func text(_ c: KeyedDecodingContainer<CodingKeys>, _ k: CodingKeys) -> String? {
      if let s = try? c.decodeIfPresent(String.self, forKey: k) { return s }
      if let n = try? c.decodeIfPresent(Int.self, forKey: k) { return String(n) }
      return nil
    }
  }

  let date: String
  let events: [Event]
  let tasks: [Item]
}

struct LifePayload: Decodable {
  let areaAspects: [String: [String]]?
}

// MARK: Reading it

enum DayLoad {
  case ready(Day)
  case signedOut
  case unreachable
  case sample
}

struct Day {
  let today: TodayPayload
  let aspects: [String: [String]]
}

enum DayStore {
  private static let todayKey = "aos.widget.today"
  private static let lifeKey = "aos.widget.life"

  static func cached() -> Day? {
    let d = UserDefaults.standard
    guard let raw = d.data(forKey: todayKey), let today = try? JSONDecoder().decode(TodayPayload.self, from: raw) else { return nil }
    let life = d.data(forKey: lifeKey).flatMap { try? JSONDecoder().decode(LifePayload.self, from: $0) }
    return Day(today: today, aspects: life?.areaAspects ?? [:])
  }

  static func load() async -> DayLoad {
    guard let token = PCLink.read("token"), let api = PCLink.read("api") else { return .signedOut }
    async let todayRaw = fetch(api + "/today", token)
    async let lifeRaw = fetch(api + "/life", token)
    let (t, l) = await (todayRaw, lifeRaw)
    if t.status == 401 { return .signedOut }
    let d = UserDefaults.standard
    if let raw = t.data, (try? JSONDecoder().decode(TodayPayload.self, from: raw)) != nil { d.set(raw, forKey: todayKey) }
    if let raw = l.data, (try? JSONDecoder().decode(LifePayload.self, from: raw)) != nil { d.set(raw, forKey: lifeKey) }
    if let day = cached() { return .ready(day) }
    return .unreachable
  }

  private static func fetch(_ address: String, _ token: String) async -> (data: Data?, status: Int) {
    guard let url = URL(string: address) else { return (nil, 0) }
    var req = URLRequest(url: url)
    req.timeoutInterval = 12
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    guard let got = try? await URLSession.shared.data(for: req), let http = got.1 as? HTTPURLResponse else { return (nil, 0) }
    return (http.statusCode < 300 ? got.0 : nil, http.statusCode)
  }
}

// MARK: The day at a moment

enum India {
  static let zone = TimeZone(identifier: "Asia/Kolkata") ?? .current
  private static func formatter(_ format: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.timeZone = zone
    f.dateFormat = format
    return f
  }
  static let day = formatter("yyyy-MM-dd")
  static let clock = formatter("HH:mm")
  static let short = formatter("d MMM")

  private static let isoFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()
  private static let iso = ISO8601DateFormatter()

  static func date(_ s: String) -> Date? { isoFrac.date(from: s) ?? iso.date(from: s) }
  static func hhmm(_ d: Date) -> String { clock.string(from: d) }
}

let aspectColors: [String: Color] = [
  "body": Color(hex: 0xFF8A5B), "mind": Color(hex: 0xFFB547), "soul": Color(hex: 0xFFD27A),
  "mission": Color(hex: 0x3DDC97), "money": Color(hex: 0x62D96B), "growth": Color(hex: 0x2EC4B6),
  "family": Color(hex: 0xFF7AB6), "romance": Color(hex: 0xF472D0), "friends": Color(hex: 0xB79CFF),
]

extension Color {
  init(hex: UInt32, alpha: Double = 1) {
    self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
              blue: Double(hex & 0xFF) / 255, opacity: alpha)
  }
  static let scene = Color(hex: 0x11141C)
  static let ink = Color.white
  static let inkSoft = Color.white.opacity(0.62)
  static let inkFaint = Color.white.opacity(0.4)
}

struct Moment {
  let now: Bool
  let title: String
  let when: String
  let then: String?
  let aspect: String?
  let taskId: String?
}

struct TaskLine: Identifiable {
  let id: String
  let title: String
  let right: String
  let aspect: String?

  var link: URL { URL(string: aspect.map { "agenticos://\($0)" } ?? "agenticos://today")! }
}

extension Day {
  private struct Slot { let title: String; let start: Date; let end: Date; let area: String?; let taskId: String? }

  private var mine: [TodayPayload.Item] {
    today.tasks.filter { $0.parent == nil && ($0.owner == nil || $0.owner == "me") }
  }

  private func isOpen(_ t: TodayPayload.Item) -> Bool { t.status == "todo" || t.status == "doing" }

  func aspect(_ area: String?) -> String? { area.flatMap { aspects[$0]?.first } }

  private var slots: [Slot] {
    let events = today.events.compactMap { e -> Slot? in
      guard e.allDay != true, let s = India.date(e.start), let x = India.date(e.end) else { return nil }
      return Slot(title: e.title, start: s, end: x, area: e.area, taskId: nil)
    }
    let tasks = mine.compactMap { t -> Slot? in
      guard isOpen(t), let sc = t.scheduled, let s = India.date(sc.start), let x = India.date(sc.end),
            India.day.string(from: s) == today.date else { return nil }
      return Slot(title: t.title, start: s, end: x, area: t.area, taskId: t.id)
    }
    return (events + tasks).sorted { $0.start < $1.start }
  }

  /// What's on now, else what's next today.
  func moment(at t: Date) -> Moment? {
    let all = slots
    let cur = all.first { $0.start <= t && t < $0.end }
    guard let pick = cur ?? all.first(where: { $0.start > t }) else { return nil }
    let from = cur != nil ? pick.end : pick.start
    let after = all.first { $0.start >= from && !($0.title == pick.title && $0.start == pick.start) }
    return Moment(
      now: cur != nil,
      title: pick.title,
      when: cur != nil ? "Now, until \(India.hhmm(pick.end))" : "Next at \(India.hhmm(pick.start))",
      then: after.map { "Then \($0.title) at \(India.hhmm($0.start))" },
      aspect: aspect(pick.area),
      taskId: pick.taskId)
  }

  /// Open tasks for today: scheduled ones by time, then the rest of today, then what's carried over, oldest first.
  func nextTasks(skip: String?, limit: Int) -> [TaskLine] {
    let date = today.date
    let open = mine.filter { isOpen($0) && $0.id != skip && ($0.due.map { $0 <= date } ?? false) }
    func rank(_ t: TodayPayload.Item) -> (Int, String) {
      if let due = t.due, due < date { return (2, due) }
      if let s = t.scheduled.flatMap({ India.date($0.start) }) { return (0, India.hhmm(s)) }
      return (1, t.title)
    }
    return open.sorted { rank($0) < rank($1) }.prefix(limit).map { t -> TaskLine in
      let r = rank(t)
      let right: String
      switch r.0 {
      case 0: right = r.1
      case 2: right = "Since " + (India.day.date(from: r.1).map { India.short.string(from: $0) } ?? r.1)
      default: right = "Today"
      }
      return TaskLine(id: t.id, title: t.title, right: right, aspect: aspect(t.area))
    }
  }

  var openCount: Int {
    let date = today.date
    return mine.filter { isOpen($0) && ($0.due.map { $0 <= date } ?? false) }.count
  }

  /// Times in the next hours when the Now card changes.
  func boundaries(after t: Date, within: TimeInterval) -> [Date] {
    var out = Set<Date>()
    for s in slots {
      for d in [s.start, s.end] where d > t && d < t.addingTimeInterval(within) { out.insert(d) }
    }
    return out.sorted()
  }
}

// MARK: Timeline

struct DayEntry: TimelineEntry {
  let date: Date
  let load: DayLoad
}

struct DayProvider: TimelineProvider {
  func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date(), load: .sample) }

  func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
    if context.isPreview {
      completion(DayEntry(date: Date(), load: DayStore.cached().map { .ready($0) } ?? .sample))
      return
    }
    Task {
      let load = await DayStore.load()
      completion(DayEntry(date: Date(), load: load))
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
    Task {
      let load = await DayStore.load()
      let now = Date()
      var dates = [now]
      if case .ready(let day) = load { dates += day.boundaries(after: now, within: 8 * 3600).prefix(40) }
      // The app also asks for a redraw when it goes to the background (src/lib/widgets.ts).
      let next = now.addingTimeInterval(load.isReady ? 20 * 60 : 10 * 60)
      completion(Timeline(entries: dates.map { DayEntry(date: $0, load: load) }, policy: .after(next)))
    }
  }
}

extension DayLoad {
  var isReady: Bool { if case .ready = self { return true } else { return false } }
}

// MARK: Widgets

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.norrita.agenticos.today", provider: DayProvider()) { entry in
      TodayWidgetView(entry: entry)
        .containerBackground(for: .widget) { Color.scene }
        .widgetURL(URL(string: "agenticos://today"))
    }
    .configurationDisplayName("Today")
    .description("What's on now, and your next tasks.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct NextTaskWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.norrita.agenticos.next-task", provider: DayProvider()) { entry in
      NextTaskView(entry: entry)
        .containerBackground(for: .widget) { Color.clear }
        .widgetURL(entry.nextLink)
    }
    .configurationDisplayName("Next task")
    .description("Your next task for today.")
    .supportedFamilies([.accessoryRectangular, .accessoryInline])
  }
}

extension DayEntry {
  var day: Day? { if case .ready(let d) = load { return d } else { return nil } }
  var nextTask: TaskLine? { day?.nextTasks(skip: nil, limit: 1).first }
  var nextLink: URL { nextTask?.link ?? URL(string: "agenticos://today")! }
}

struct TodayWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: DayEntry

  var body: some View {
    switch entry.load {
    case .signedOut: Notice(title: "Sign in", text: "Open Agentic OS and sign in to see your day.")
    case .unreachable: Notice(title: "Can't reach your PC", text: "Your day shows here once it's online.")
    case .sample: content(sample: true)
    case .ready: content(sample: false)
    }
  }

  @ViewBuilder
  private func content(sample: Bool) -> some View {
    let day = entry.day
    let moment = sample ? Moment(now: true, title: "Deep work", when: "Now, until 12:30", then: "Then Lunch at 13:00", aspect: "mission", taskId: nil)
                        : day?.moment(at: entry.date)
    if family == .systemMedium {
      HStack(alignment: .top, spacing: 16) {
        NowCard(moment: moment, open: day?.openCount ?? 0, titleLines: 3)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        TaskList(tasks: sample ? Self.sampleTasks : day?.nextTasks(skip: moment?.taskId, limit: 3) ?? [])
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
      .redacted(reason: sample ? .placeholder : [])
    } else {
      NowCard(moment: moment, open: day?.openCount ?? 0, titleLines: 3)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .redacted(reason: sample ? .placeholder : [])
    }
  }

  static let sampleTasks = [
    TaskLine(id: "1", title: "Call the bank", right: "15:00", aspect: "money"),
    TaskLine(id: "2", title: "Gym", right: "Today", aspect: "body"),
    TaskLine(id: "3", title: "Read a chapter", right: "Today", aspect: "growth"),
  ]
}

struct NowCard: View {
  let moment: Moment?
  let open: Int
  let titleLines: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let m = moment {
        let tint = m.aspect.flatMap { aspectColors[$0] } ?? .inkSoft
        HStack(spacing: 6) {
          Circle().fill(tint).frame(width: 7, height: 7)
          Text(m.now ? "Now" : "Next").font(.system(size: 12, weight: .semibold)).foregroundStyle(tint)
        }
        Text(m.title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(titleLines)
          .minimumScaleFactor(0.85)
        Text(m.when).font(.system(size: 13, weight: .medium)).foregroundStyle(Color.inkSoft).lineLimit(1)
        Spacer(minLength: 0)
        if let then = m.then {
          Text(then).font(.system(size: 12)).foregroundStyle(Color.inkFaint).lineLimit(2)
        }
      } else {
        Text("Today").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.inkSoft)
        Text("Nothing on the clock").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(2)
        Spacer(minLength: 0)
        Text(open == 0 ? "No tasks left today" : open == 1 ? "1 task left today" : "\(open) tasks left today")
          .font(.system(size: 12)).foregroundStyle(Color.inkFaint).lineLimit(1)
      }
    }
  }
}

struct TaskList: View {
  let tasks: [TaskLine]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Next up").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.inkSoft)
      if tasks.isEmpty {
        Text("Nothing left for today").font(.system(size: 13)).foregroundStyle(Color.inkFaint)
      }
      ForEach(tasks) { t in
        Link(destination: t.link) {
          HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 1.5).fill(t.aspect.flatMap { aspectColors[$0] } ?? Color.inkFaint).frame(width: 3, height: 16)
            Text(t.title).font(.system(size: 13, weight: .medium)).foregroundStyle(Color.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text(t.right).font(.system(size: 12).monospacedDigit()).foregroundStyle(Color.inkSoft).lineLimit(1)
          }
        }
      }
      Spacer(minLength: 0)
    }
  }
}

struct Notice: View {
  let title: String
  let text: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink)
      Text(text).font(.system(size: 13)).foregroundStyle(Color.inkSoft)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct NextTaskView: View {
  @Environment(\.widgetFamily) private var family
  let entry: DayEntry

  var body: some View {
    let task = entry.nextTask
    let line: String = {
      switch entry.load {
      case .signedOut: return "Sign in to Agentic OS"
      case .unreachable: return "Can't reach your PC"
      case .sample: return "Call the bank"
      case .ready: return task?.title ?? "Nothing left today"
      }
    }()
    if family == .accessoryInline {
      Text(task.map { "\($0.right): \($0.title)" } ?? line)
    } else {
      VStack(alignment: .leading, spacing: 1) {
        Text("Next task").font(.system(size: 12, weight: .semibold)).widgetAccentable()
        Text(line).font(.system(size: 15, weight: .semibold)).lineLimit(2)
        if let t = task { Text(t.right).font(.system(size: 12)).foregroundStyle(.secondary) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
