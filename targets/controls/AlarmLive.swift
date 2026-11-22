import ActivityKit
import SwiftUI
import WidgetKit
#if canImport(AlarmKit)
import AlarmKit
#endif

#if canImport(AlarmKit)
/// What an alarm carries besides AlarmKit's own fields. Same name and fields as AosAlarmMeta in
/// modules/alarms/ios/AlarmStore.swift: ActivityKit matches the two by name, so keep them in step.
@available(iOS 26.0, *)
struct AosAlarmMeta: AlarmMetadata {
  var title: String
  var url: String?
}

/// An alarm on the lock screen and in the Dynamic Island while it is snoozed. The ringing alarm itself is drawn by
/// the system. Alarms come from modules/alarms (set in the app, or by the PC through a silent push).
@available(iOS 26.0, *)
struct AlarmLiveWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AlarmAttributes<AosAlarmMeta>.self) { ctx in
      AlarmLock(title: ctx.attributes.metadata?.title ?? "Alarm", tint: ctx.attributes.tintColor, state: ctx.state)
        .activityBackgroundTint(Color.scene.opacity(0.92))
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
          Text(ctx.attributes.metadata?.title ?? "Alarm").font(.headline).lineLimit(1)
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
      Text(timerInterval: c.startDate...max(c.startDate, c.fireDate), countsDown: true)
    default:
      Text("Alarm")
    }
  }
}

@available(iOS 26.0, *)
struct AlarmLock: View {
  let title: String
  let tint: Color
  let state: AlarmPresentationState

  var body: some View {
    HStack(spacing: 14) {
      ZStack {
        Circle().fill(tint.opacity(0.2))
        Image(systemName: "alarm.fill").font(.headline).foregroundStyle(tint)
      }
      .frame(width: 40, height: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.headline).foregroundStyle(.white).lineLimit(1)
        Text("Snoozed").font(.caption).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
      }
      Spacer(minLength: 8)
      AlarmClock(state: state)
        .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
        .foregroundStyle(tint).frame(maxWidth: 100, alignment: .trailing)
    }
    .padding(16)
  }
}
#endif
