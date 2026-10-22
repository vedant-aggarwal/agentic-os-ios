import ActivityKit
import SwiftUI
import WidgetKit

/// The live block on the lock screen and in the Dynamic Island: time left, progress, and what's next.
/// The app starts it; the PC pushes each new block (server/nora.ts activityTick).
struct DayActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DayActivityAttributes.self) { ctx in
            LockScreenDay(state: ctx.state, stale: ctx.isStale)
                .activityBackgroundTint(Color.surface.opacity(0.92))
                .activitySystemActionForegroundColor(Color.ink)
                .widgetURL(URL(string: "agenticos://today"))
        } dynamicIsland: { ctx in
            let s = ctx.state
            let tint = Color(hex: s.color)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(s.area.isEmpty ? (s.kind == "free" ? "Free" : "Now") : s.area).font(.caption.weight(.semibold))
                    } icon: {
                        Image(systemName: Look.glyph(s.kind)).foregroundStyle(tint)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: s.start...s.end, countsDown: true)
                        .font(.system(.body, design: .rounded).weight(.semibold).monospacedDigit())
                        .foregroundStyle(tint)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 76, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.title).font(.system(.headline, design: .rounded)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        ProgressView(timerInterval: s.start...s.end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                            .progressViewStyle(.linear)
                            .tint(tint)
                        HStack {
                            if let next = s.next, let at = s.nextDate {
                                Text("Next \(Look.clock(at)) · \(next)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            } else {
                                Text("Until \(Look.clock(s.end))").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Link(destination: URL(string: "agenticos://nora/call")!) {
                                Label("Nora", systemImage: "phone.fill")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(Capsule().fill(Color.nora.opacity(0.35)))
                            }
                        }
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: Look.glyph(s.kind)).foregroundStyle(tint)
            } compactTrailing: {
                Text(timerInterval: s.start...s.end, countsDown: true)
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .frame(maxWidth: 46)
            } minimal: {
                ProgressView(timerInterval: s.start...s.end, countsDown: true) { EmptyView() } currentValueLabel: {
                    Image(systemName: Look.glyph(s.kind)).font(.caption2)
                }
                .progressViewStyle(.circular)
                .tint(tint)
            }
            .keylineTint(tint)
            .widgetURL(URL(string: "agenticos://today"))
        }
    }
}

struct LockScreenDay: View {
    let state: NowNext
    let stale: Bool

    var body: some View {
        let tint = Color(hex: state.color)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle().fill(tint.opacity(0.18))
                    Image(systemName: Look.glyph(state.kind)).font(.headline).foregroundStyle(tint)
                }
                .frame(width: 38, height: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title).font(.system(.headline, design: .rounded)).lineLimit(1)
                    Group {
                        if stale {
                            Text("Updating…")
                        } else if let next = state.next, let at = state.nextDate {
                            Text("Next \(Look.clock(at)) · \(next)")
                        } else {
                            Text("Until \(Look.clock(state.end))")
                        }
                    }
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                Text(timerInterval: state.start...state.end, countsDown: true)
                    .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                    .foregroundStyle(tint)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            ProgressView(timerInterval: state.start...state.end, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.linear)
                .tint(tint)
        }
        .padding(16)
    }
}
