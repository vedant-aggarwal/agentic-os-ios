import ActivityKit
import SwiftUI
import WidgetKit
#if canImport(AlarmKit)
import AlarmKit
#endif

#if canImport(AlarmKit)
/// AlarmKit's alarm on the lock screen and in the Dynamic Island while it counts down (a snooze) or is paused.
/// The ringing alert itself is drawn by the system. Alarms come from App/Alarms.swift.
@available(iOS 26.0, *)
struct AlarmLiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<AosAlarmMeta>.self) { ctx in
            AlarmLock(attrs: ctx.attributes, state: ctx.state)
                .activityBackgroundTint(Color(hex: "#0B0C12").opacity(0.9))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: ctx.attributes.metadata?.url ?? "agenticos://today"))
        } dynamicIsland: { ctx in
            let tint = ctx.attributes.tintColor
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "alarm.fill").font(.title3).foregroundStyle(tint).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AlarmClock(state: ctx.state)
                        .font(.system(.title3, design: .rounded).weight(.semibold).monospacedDigit())
                        .foregroundStyle(tint).frame(maxWidth: 80, alignment: .trailing).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(ctx.attributes.metadata?.title ?? "Alarm").font(.system(.headline, design: .rounded)).lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "alarm.fill").foregroundStyle(tint)
            } compactTrailing: {
                AlarmClock(state: ctx.state).monospacedDigit().foregroundStyle(tint).frame(maxWidth: 46)
            } minimal: {
                Image(systemName: "alarm.fill").foregroundStyle(tint)
            }
            .keylineTint(tint)
        }
    }
}

@available(iOS 26.0, *)
struct AlarmClock: View {
    let state: AlarmPresentationState

    var body: some View {
        switch state.mode {
        case .countdown(let c):
            Text(timerInterval: span(c.startDate, c.fireDate), countsDown: true)
        case .paused(let p):
            Text(Duration.seconds(max(0, p.totalCountdownDuration - p.previouslyElapsedDuration)).formatted(.time(pattern: .minuteSecond)))
        case .alert(let a):
            Text(String(format: "%02d:%02d", a.time.hour, a.time.minute))
        @unknown default:
            Text("Alarm")
        }
    }
}

@available(iOS 26.0, *)
struct AlarmLock: View {
    let attrs: AlarmAttributes<AosAlarmMeta>
    let state: AlarmPresentationState

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(attrs.tintColor.opacity(0.2))
                Image(systemName: "alarm.fill").font(.headline).foregroundStyle(attrs.tintColor)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(attrs.metadata?.title ?? "Alarm").font(.system(.headline, design: .rounded)).foregroundStyle(.white).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
            }
            Spacer(minLength: 8)
            AlarmClock(state: state)
                .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                .foregroundStyle(attrs.tintColor).frame(maxWidth: 100, alignment: .trailing)
        }
        .padding(16)
    }

    private var subtitle: String {
        switch state.mode {
        case .countdown: return "Snoozed"
        case .paused: return "Paused"
        default: return attrs.metadata?.body ?? "Alarm"
        }
    }
}
#endif
