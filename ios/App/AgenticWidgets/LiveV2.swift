import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// The 2.0.0 Live Activities (the app starts them: App/Live.swift). Buttons are LiveActionIntent, which iOS runs in
// the app's process; the app updates the activity and tells the web layer.

private let bodyTint = Color(hex: "#FF6B3D")
private let breathTint = Color(hex: "#33DCC0")
private let focusTint = Color(hex: "#7B86FF")

// MARK: Workout

struct WorkoutActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { ctx in
            WorkoutLock(attrs: ctx.attributes, s: ctx.state)
                .activityBackgroundTint(Color.surface.opacity(0.92))
                .activitySystemActionForegroundColor(Color.ink)
                .widgetURL(URL(string: "agenticos://body/workout"))
        } dynamicIsland: { ctx in
            let s = ctx.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label { Text("Set \(s.setIndex)/\(s.setCount)").font(.caption.weight(.semibold)) } icon: {
                        Image(systemName: "dumbbell.fill").foregroundStyle(bodyTint)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkoutClock(attrs: ctx.attributes, s: s)
                        .font(.system(.body, design: .rounded).weight(.semibold).monospacedDigit())
                        .frame(maxWidth: 80, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.exercise).font(.system(.headline, design: .rounded)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    WorkoutButtons(s: s).padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill").foregroundStyle(bodyTint)
            } compactTrailing: {
                WorkoutClock(attrs: ctx.attributes, s: s).monospacedDigit().foregroundStyle(bodyTint).frame(maxWidth: 46)
            } minimal: {
                Image(systemName: s.phase == "rest" ? "timer" : "dumbbell.fill").foregroundStyle(bodyTint)
            }
            .keylineTint(bodyTint)
            .widgetURL(URL(string: "agenticos://body/workout"))
        }
    }
}

/// Resting: the rest counting down; working: the time since the workout started.
struct WorkoutClock: View {
    let attrs: WorkoutActivityAttributes
    let s: WorkoutActivityAttributes.ContentState

    var body: some View {
        if s.phase == "rest", let end = s.restEndDate, end > Date() {
            Text(timerInterval: span(Date(), end), countsDown: true)
        } else if s.phase == "done" {
            Text("Done")
        } else {
            Text(attrs.startDate, style: .timer)
        }
    }
}

struct WorkoutButtons: View {
    let s: WorkoutActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 8) {
            if s.phase == "done" {
                Button(intent: LiveActionIntent(kind: "workout", action: "end")) { Pill(title: "Finish", icon: "flag.checkered", tint: bodyTint) }
                    .buttonStyle(.plain)
            } else {
                Button(intent: LiveActionIntent(kind: "workout", action: "next")) {
                    Pill(title: s.setIndex >= s.setCount ? "Last set done" : "Set done", icon: "checkmark", tint: bodyTint)
                }
                .buttonStyle(.plain)
                Button(intent: LiveActionIntent(kind: "workout", action: s.phase == "rest" ? "skip" : "rest")) {
                    Pill(title: s.phase == "rest" ? "Skip rest" : "Rest", icon: s.phase == "rest" ? "forward.fill" : "timer", tint: bodyTint, filled: false)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct WorkoutLock: View {
    let attrs: WorkoutActivityAttributes
    let s: WorkoutActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle().fill(bodyTint.opacity(0.18))
                    Image(systemName: s.phase == "rest" ? "timer" : "dumbbell.fill").font(.headline).foregroundStyle(bodyTint)
                }
                .frame(width: 38, height: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.exercise).font(.system(.headline, design: .rounded)).lineLimit(1)
                    Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                WorkoutClock(attrs: attrs, s: s)
                    .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                    .foregroundStyle(bodyTint)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            HStack(spacing: 4) {
                ForEach(1...min(max(s.setCount, 1), 12), id: \.self) { i in
                    Capsule().fill(setColor(i)).frame(height: 5)
                }
            }
            WorkoutButtons(s: s)
        }
        .padding(16)
    }

    private func setColor(_ i: Int) -> Color {
        if i < s.setIndex || s.phase == "done" { return bodyTint }
        if i == s.setIndex { return bodyTint.opacity(0.55) }
        return Color.secondary.opacity(0.25)
    }

    private var detail: String {
        var parts = ["Set \(s.setIndex) of \(s.setCount)"]
        if let r = s.reps, let w = s.weight { parts.append("\(r) × \(w.formatted()) \(s.unit ?? "kg")") }
        else if let r = s.reps { parts.append("\(r) reps") }
        if s.phase == "rest" { parts.append("Rest") }
        if let next = s.next, s.phase != "done" { parts.append("next \(next)") }
        return parts.joined(separator: " · ")
    }
}

// MARK: Breathing

struct BreathActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BreathActivityAttributes.self) { ctx in
            BreathLock(s: ctx.state, title: ctx.attributes.title)
                .activityBackgroundTint(Color(hex: "#0B0C12").opacity(0.9))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "agenticos://breathe"))
        } dynamicIsland: { ctx in
            let s = ctx.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    BreathRing(s: s).frame(width: 44, height: 44).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if s.phase != "done" {
                        Text(timerInterval: span(s.start, s.end), countsDown: true)
                            .font(.system(.title3, design: .rounded).weight(.semibold).monospacedDigit())
                            .foregroundStyle(breathTint).frame(maxWidth: 60, alignment: .trailing).padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(s.label).font(.system(.headline, design: .rounded))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(s.phase == "done" ? "Session done" : "Cycle \(s.cycle) of \(s.cycles)").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        if s.phase != "done" {
                            Button(intent: LiveActionIntent(kind: "breathing", action: "stop")) {
                                Label("Stop", systemImage: "stop.fill").font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(Capsule().fill(breathTint.opacity(0.3)))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "wind").foregroundStyle(breathTint)
            } compactTrailing: {
                Text(s.phase == "in" ? "In" : s.phase == "out" ? "Out" : s.phase == "done" ? "Done" : "Hold")
                    .font(.caption.weight(.semibold)).foregroundStyle(breathTint)
            } minimal: {
                BreathRing(s: s)
            }
            .keylineTint(breathTint)
        }
    }
}

/// A ring that fills over the breath in, empties over the breath out, and holds still on a hold.
struct BreathRing: View {
    let s: BreathActivityAttributes.ContentState

    var body: some View {
        if s.phase == "in" || s.phase == "out" {
            ProgressView(timerInterval: span(s.start, s.end), countsDown: s.phase == "out") { EmptyView() } currentValueLabel: {
                Image(systemName: s.phase == "in" ? "arrow.up" : "arrow.down").font(.caption2.weight(.bold))
            }
            .progressViewStyle(.circular)
            .tint(breathTint)
        } else {
            ZStack {
                Circle().stroke(breathTint.opacity(s.phase == "done" ? 1 : 0.6), lineWidth: 3)
                Image(systemName: s.phase == "done" ? "checkmark" : "pause.fill").font(.caption2.weight(.bold)).foregroundStyle(breathTint)
            }
        }
    }
}

struct BreathLock: View {
    let s: BreathActivityAttributes.ContentState
    let title: String

    var body: some View {
        HStack(spacing: 16) {
            BreathRing(s: s).frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 3) {
                Text(s.label).font(.system(.title3, design: .rounded).weight(.semibold)).foregroundStyle(.white)
                Text(s.phase == "done" ? title : "\(title) · cycle \(s.cycle) of \(s.cycles)").font(.caption).foregroundStyle(.white.opacity(0.65))
            }
            Spacer(minLength: 8)
            if s.phase != "done" {
                VStack(alignment: .trailing, spacing: 6) {
                    Text(timerInterval: span(s.start, s.end), countsDown: true)
                        .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                        .foregroundStyle(breathTint).frame(maxWidth: 70, alignment: .trailing)
                    Button(intent: LiveActionIntent(kind: "breathing", action: "stop")) {
                        Image(systemName: "stop.fill").font(.caption.weight(.bold)).foregroundStyle(.white)
                            .frame(width: 28, height: 28).background(Circle().fill(Color.white.opacity(0.18)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
    }
}

// MARK: Focus

struct FocusActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { ctx in
            FocusLock(attrs: ctx.attributes, s: ctx.state, stale: ctx.isStale)
                .activityBackgroundTint(Color.surface.opacity(0.92))
                .activitySystemActionForegroundColor(Color.ink)
                .widgetURL(URL(string: "agenticos://focus"))
        } dynamicIsland: { ctx in
            let s = ctx.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label { Text(ctx.attributes.title).font(.caption.weight(.semibold)).lineLimit(1) } icon: {
                        Image(systemName: "timer").foregroundStyle(focusTint)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusClock(s: s, stale: ctx.isStale)
                        .font(.system(.body, design: .rounded).weight(.semibold).monospacedDigit())
                        .foregroundStyle(focusTint).frame(maxWidth: 80, alignment: .trailing).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        if !s.paused && !ctx.isStale {
                            ProgressView(timerInterval: span(ctx.attributes.start, s.end), countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .progressViewStyle(.linear).tint(focusTint)
                        }
                        FocusButtons(s: s, done: ctx.isStale)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(focusTint)
            } compactTrailing: {
                FocusClock(s: s, stale: ctx.isStale).monospacedDigit().foregroundStyle(focusTint).frame(maxWidth: 46)
            } minimal: {
                if s.paused || ctx.isStale {
                    Image(systemName: ctx.isStale ? "checkmark" : "pause.fill").foregroundStyle(focusTint)
                } else {
                    ProgressView(timerInterval: span(ctx.attributes.start, s.end), countsDown: true) { EmptyView() } currentValueLabel: {
                        Image(systemName: "timer").font(.caption2)
                    }
                    .progressViewStyle(.circular).tint(focusTint)
                }
            }
            .keylineTint(focusTint)
            .widgetURL(URL(string: "agenticos://focus"))
        }
    }
}

struct FocusClock: View {
    let s: FocusActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        if stale || (!s.paused && s.end <= Date()) {
            Text("Done")
        } else if s.paused {
            Text(Duration.seconds(s.remaining ?? 0).formatted(.time(pattern: .minuteSecond)))
        } else {
            Text(timerInterval: span(Date(), s.end), countsDown: true)
        }
    }
}

struct FocusButtons: View {
    let s: FocusActivityAttributes.ContentState
    let done: Bool

    var body: some View {
        HStack(spacing: 8) {
            if !done {
                Button(intent: LiveActionIntent(kind: "focus", action: "add5")) { Pill(title: "+5 min", icon: "plus", tint: focusTint, filled: false) }
                    .buttonStyle(.plain)
                Button(intent: LiveActionIntent(kind: "focus", action: s.paused ? "resume" : "pause")) {
                    Pill(title: s.paused ? "Resume" : "Pause", icon: s.paused ? "play.fill" : "pause.fill", tint: focusTint, filled: false)
                }
                .buttonStyle(.plain)
            }
            Button(intent: LiveActionIntent(kind: "focus", action: "end")) { Pill(title: done ? "Close" : "End", icon: "stop.fill", tint: focusTint) }
                .buttonStyle(.plain)
        }
    }
}

struct FocusLock: View {
    let attrs: FocusActivityAttributes
    let s: FocusActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle().fill(focusTint.opacity(0.18))
                    Image(systemName: stale ? "checkmark" : s.paused ? "pause.fill" : "timer").font(.headline).foregroundStyle(focusTint)
                }
                .frame(width: 38, height: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attrs.title).font(.system(.headline, design: .rounded)).lineLimit(1)
                    Text(stale ? "Done. Take a breath." : s.paused ? "Paused" : "\(attrs.minutes) min block · until \(Look.clock(s.end))")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 8)
                FocusClock(s: s, stale: stale)
                    .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                    .foregroundStyle(focusTint).multilineTextAlignment(.trailing).frame(maxWidth: 110, alignment: .trailing)
            }
            if !s.paused && !stale {
                ProgressView(timerInterval: span(attrs.start, s.end), countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.linear).tint(focusTint)
            }
            FocusButtons(s: s, done: stale)
        }
        .padding(16)
    }
}
