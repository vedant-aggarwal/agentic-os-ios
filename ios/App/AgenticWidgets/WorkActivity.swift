import ActivityKit
import SwiftUI
import WidgetKit

/// The agents on the PC, on the lock screen and in the Dynamic Island: how many are working, how many need you
/// and how many just finished, each in its own colour, plus the top sessions (tap one to open it).
/// The app starts it while open; the PC starts it by push and pushes every change (server/work-activity.ts).
struct WorkActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkActivityAttributes.self) { ctx in
            LockScreenWork(state: ctx.state, stale: ctx.isStale)
                .activityBackgroundTint(Color.surface.opacity(0.92))
                .activitySystemActionForegroundColor(Color.ink)
                .widgetURL(URL(string: WorkLook.link(ctx.state)))
        } dynamicIsland: { ctx in
            let s = ctx.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    WorkCount(n: s.working, label: "working", tint: WorkLook.working(dark: true))
                        .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkCount(n: s.needs, label: s.needs == 1 ? "needs you" : "need you", tint: s.needs > 0 ? WorkLook.needs : .secondary)
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 6) {
                        Text(WorkLook.headline(s)).font(.system(.subheadline, design: .rounded).weight(.semibold)).lineLimit(1)
                        WorkBar(state: s, dark: true).frame(height: 6)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(s.items.prefix(3)), id: \.id) { item in
                            Link(destination: URL(string: item.url) ?? URL(string: "agenticos://code")!) {
                                WorkRow(item: item, dark: true)
                            }
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.top, 2)
                }
            } compactLeading: {
                HStack(spacing: 3) {
                    Image(systemName: "sparkles").font(.caption2.weight(.bold))
                    Text("\(s.working)").monospacedDigit().font(.caption.weight(.semibold))
                }
                .foregroundStyle(WorkLook.working(dark: true))
            } compactTrailing: {
                if s.needs > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "hand.raised.fill").font(.caption2)
                        Text("\(s.needs)").monospacedDigit().font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(WorkLook.needs)
                } else if s.done > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "checkmark").font(.caption2.weight(.bold))
                        Text("\(s.done)").monospacedDigit().font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(WorkLook.done)
                } else {
                    Image(systemName: "ellipsis").foregroundStyle(WorkLook.working(dark: true))
                }
            } minimal: {
                if s.needs > 0 {
                    Text("\(s.needs)").monospacedDigit().font(.caption.weight(.bold)).foregroundStyle(WorkLook.needs)
                } else {
                    Text("\(s.working)").monospacedDigit().font(.caption.weight(.bold)).foregroundStyle(WorkLook.working(dark: true))
                }
            }
            .keylineTint(s.needs > 0 ? WorkLook.needs : WorkLook.done)
            .widgetURL(URL(string: WorkLook.link(s)))
        }
    }
}

enum WorkLook {
    /// The app's colours (app/styles.css): running is ink, waiting is --defer, done is --done.
    static let needs = Color(hex: "#E3923A")
    static let done = Color(hex: "#3A9A5A")
    static func working(dark: Bool) -> Color { dark ? .white : .ink }

    static func tint(_ state: String, dark: Bool) -> Color {
        switch state {
        case "needs": return needs
        case "done": return done
        default: return working(dark: dark)
        }
    }

    static func headline(_ s: WorkState) -> String {
        if !s.active { return s.done > 0 ? "All done · \(s.done) finished" : "All quiet" }
        if s.needs > 0 { return s.needs == 1 ? "1 session needs you" : "\(s.needs) sessions need you" }
        return s.working == 1 ? "1 session working" : "\(s.working) sessions working"
    }

    /// A tap opens the session that needs him; with several, the Code page.
    static func link(_ s: WorkState) -> String {
        let needing = s.items.filter { $0.state == "needs" }
        if needing.count == 1 { return needing[0].url }
        if s.needs == 0 && s.items.count == 1 { return s.items[0].url }
        return "agenticos://code"
    }
}

struct WorkCount: View {
    let n: Int
    let label: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(n)").font(.system(.title2, design: .rounded).weight(.bold).monospacedDigit()).foregroundStyle(tint)
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

/// One bar split by state: working, needs you, done, in proportion.
struct WorkBar: View {
    let state: WorkState
    let dark: Bool

    var body: some View {
        GeometryReader { geo in
            let total = max(state.total, 1)
            let parts: [(Int, Color)] = [(state.working, WorkLook.working(dark: dark).opacity(0.85)), (state.needs, WorkLook.needs), (state.done, WorkLook.done)]
                .filter { $0.0 > 0 }
            let gaps = CGFloat(max(parts.count - 1, 0)) * 3
            HStack(spacing: 3) {
                if parts.isEmpty {
                    Capsule().fill(Color.secondary.opacity(0.3))
                } else {
                    ForEach(Array(parts.enumerated()), id: \.offset) { _, p in
                        Capsule().fill(p.1).frame(width: max(6, (geo.size.width - gaps) * CGFloat(p.0) / CGFloat(total)))
                    }
                }
            }
        }
    }
}

struct WorkRow: View {
    let item: WorkItem
    let dark: Bool

    var body: some View {
        let tint = WorkLook.tint(item.state, dark: dark)
        HStack(spacing: 8) {
            Image(systemName: item.state == "needs" ? "hand.raised.fill" : item.state == "done" ? "checkmark.circle.fill" : "circle.dotted")
                .font(.caption).foregroundStyle(tint).frame(width: 14)
            Text(item.title).font(.caption.weight(.medium)).lineLimit(1)
            Spacer(minLength: 6)
            Group {
                if item.state == "needs" {
                    Text(item.detail ?? "Needs you").lineLimit(1)
                } else if item.state == "done" {
                    Text("Done")
                } else {
                    Text(item.sinceDate, style: .timer).monospacedDigit().multilineTextAlignment(.trailing)
                }
            }
            .font(.caption2)
            .foregroundStyle(item.state == "needs" ? WorkLook.needs : .secondary)
            .frame(maxWidth: item.state == "needs" ? 150 : 60, alignment: .trailing)
        }
    }
}

struct LockScreenWork: View {
    let state: WorkState
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                pill(state.working, "working", WorkLook.working(dark: false))
                pill(state.needs, state.needs == 1 ? "needs you" : "need you", state.needs > 0 ? WorkLook.needs : .secondary)
                pill(state.done, "done", state.done > 0 ? WorkLook.done : .secondary)
                Spacer(minLength: 0)
                if stale { Text("Updating…").font(.caption2).foregroundStyle(.secondary) }
            }
            WorkBar(state: state, dark: false).frame(height: 6)
            if !state.items.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(state.items.prefix(4)), id: \.id) { item in
                        Link(destination: URL(string: item.url) ?? URL(string: "agenticos://code")!) {
                            WorkRow(item: item, dark: false)
                        }
                    }
                }
            } else {
                Text(WorkLook.headline(state)).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(16)
    }

    private func pill(_ n: Int, _ label: String, _ tint: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(n)").font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit()).foregroundStyle(tint)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
}
