import SwiftUI
import WidgetKit

struct DayEntry: TimelineEntry {
    let date: Date
    let snap: Snapshot?
    var now: NowNext? { snap.flatMap { Snapshot.nowNext($0.blocks, at: date.timeIntervalSince1970) } }
}

/// One entry now and one at every block start and end in the next day, so "now" turns over without the app.
struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date(), snap: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        completion(DayEntry(date: Date(), snap: context.isPreview ? .sample : (Shared.snapshot ?? .sample)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let snap = Shared.snapshot
        let now = Date().timeIntervalSince1970
        var times = Set<Double>()
        for b in snap?.blocks ?? [] {
            for t in [b.startAt, b.endAt] where t > now && t < now + 86400 { times.insert(t) }
        }
        let entries = [DayEntry(date: Date(), snap: snap)] + times.sorted().prefix(80).map { DayEntry(date: Date(timeIntervalSince1970: $0), snap: snap) }
        completion(Timeline(entries: entries, policy: .after(Date().addingTimeInterval(3 * 3600))))
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticToday", provider: DayProvider()) { entry in
            TodayView(entry: entry)
                .containerBackground(for: .widget) { Color.surface }
                .widgetURL(URL(string: "agenticos://today"))
        }
        .configurationDisplayName("Today")
        .description("What's on now, time left, and what's next.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct TodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: DayEntry

    var body: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .accessoryInline: inline
        case .systemMedium: medium
        case .systemLarge: large
        default: small
        }
    }

    // MARK: Home screen

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let n = entry.now {
                NowBlock(now: n, titleLines: 3)
            } else {
                EmptyDay(snap: entry.snap)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                if let n = entry.now { NowBlock(now: n, titleLines: 2) } else { EmptyDay(snap: entry.snap) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            VStack(alignment: .leading, spacing: 7) {
                TaskCount(snap: entry.snap)
                ForEach(upcoming(3), id: \.self) { b in AgendaRow(block: b, compact: true) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.date, format: .dateTime.weekday(.wide).day().month())
                    .font(.headline)
                Spacer()
                TaskCount(snap: entry.snap)
            }
            if let n = entry.now { NowBlock(now: n, titleLines: 2) }
            Divider().opacity(0.5)
            VStack(alignment: .leading, spacing: 9) {
                ForEach(upcoming(6), id: \.self) { b in AgendaRow(block: b, compact: false) }
            }
            if let up = entry.snap?.up, !up.isEmpty {
                Text("To do").font(.caption2.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
                ForEach(up.prefix(3), id: \.self) { t in
                    Label(t, systemImage: "circle").font(.footnote).lineLimit(1).labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func upcoming(_ n: Int) -> [Snapshot.Block] {
        let now = entry.date.timeIntervalSince1970
        let cur = entry.now
        return entry.snap?.ahead(from: now, limit: n + 1).filter { !($0.title == cur?.title && $0.startAt == cur?.startAt) }.prefix(n).map { $0 } ?? []
    }

    // MARK: Lock screen

    @ViewBuilder private var circular: some View {
        if let n = entry.now {
            ProgressView(timerInterval: n.start...n.end, countsDown: false) {
                Image(systemName: Look.glyph(n.kind))
            } currentValueLabel: {
                Image(systemName: Look.glyph(n.kind))
            }
            .progressViewStyle(.circular)
            .widgetAccentable()
        } else {
            Image(systemName: "calendar").font(.title3)
        }
    }

    @ViewBuilder private var rectangular: some View {
        if let n = entry.now {
            VStack(alignment: .leading, spacing: 2) {
                Text(n.title).font(.headline).lineLimit(1).widgetAccentable()
                Text("until \(Look.clock(n.end))\(n.next.map { " · \($0)" } ?? "")").font(.caption).lineLimit(1)
                ProgressView(timerInterval: n.start...n.end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.linear)
            }
        } else {
            Text("Nothing planned").font(.headline)
        }
    }

    @ViewBuilder private var inline: some View {
        if let n = entry.now {
            Text("\(n.title) · until \(Look.clock(n.end))")
        } else {
            Text("Nothing planned")
        }
    }
}

/// The block on now: area, title, a live countdown and a live progress bar, then what's next.
struct NowBlock: View {
    let now: NowNext
    let titleLines: Int

    var body: some View {
        let tint = Color(hex: now.color)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Circle().fill(tint).frame(width: 7, height: 7)
                Text(now.kind == "free" ? "FREE" : (now.area.isEmpty ? "NOW" : now.area.uppercased()))
                    .font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
            }
            Text(now.title)
                .font(.system(.headline, design: .rounded).weight(.semibold))
                .lineLimit(titleLines)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 2)
            Text(timerInterval: now.start...now.end, countsDown: true)
                .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                .foregroundStyle(tint)
                .lineLimit(1)
            ProgressView(timerInterval: now.start...now.end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear)
                .tint(tint)
            if let next = now.next, let at = now.nextDate {
                Text("\(Look.clock(at)) \(next)")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}

struct AgendaRow: View {
    let block: Snapshot.Block
    let compact: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            RoundedRectangle(cornerRadius: 1.5).fill(Color(hex: block.color)).frame(width: 3, height: compact ? 26 : 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(block.title).font(compact ? .caption.weight(.medium) : .subheadline.weight(.medium)).lineLimit(1)
                Text("\(Look.clock(block.startAt))–\(Look.clock(block.endAt))")
                    .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
    }
}

struct TaskCount: View {
    let snap: Snapshot?
    var body: some View {
        if let s = snap, s.total > 0 {
            HStack(spacing: 5) {
                Gauge(value: Double(s.done), in: 0...Double(max(s.total, 1))) { EmptyView() }
                    .gaugeStyle(.accessoryCircularCapacity)
                    .scaleEffect(0.42)
                    .frame(width: 20, height: 20)
                    .tint(Color.ink)
                Text("\(s.done) of \(s.total) done").font(.caption2.weight(.medium)).foregroundStyle(.secondary)
            }
        }
    }
}

struct EmptyDay: View {
    let snap: Snapshot?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "calendar").font(.title3).foregroundStyle(.secondary)
            Text(snap == nil ? "Open Agentic OS once to show your day here." : "Nothing planned right now.")
                .font(.footnote).foregroundStyle(.secondary)
            if let first = snap?.up.first {
                Text(first).font(.subheadline.weight(.semibold)).lineLimit(2)
            }
        }
    }
}
