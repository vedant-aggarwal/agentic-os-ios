import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// A call on Nora's phone line, on the lock screen and in the Dynamic Island (line calls v2 contract §4). The PC starts
// it by push when a call reaches Nora, updates it as the call goes, and ends it two minutes after the call with the
// headline. Listen plays the call without opening the app; Take over opens the call's screen with the call his.

/// Same name and fields as LineCallAttributes in modules/calls/ios/LineNative.swift: ActivityKit matches the two by
/// name, so keep them in step. `listening` is set by the app while this phone plays the call; the PC leaves it out.
struct LineCallAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var phase: String       // ringing | nora | you | ended
    var name: String
    var category: String
    var action: String      // Nora's step; the headline once ended
    var startedAt: Double   // Unix seconds
    var needsYou: Bool
    var listening: Bool?
  }

  var callId: String
}

/// The buttons' intents. They run in the app (modules/calls/app/AosLineIntents.swift has identical structs that do
/// the work); these only make the buttons.
struct LineListenIntent: LiveActivityIntent, AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Listen to the call"
  static let isDiscoverable = false

  @Parameter(title: "Call") var callId: String
  @Parameter(title: "On") var on: Bool

  init() {}

  init(callId: String, on: Bool) {
    self.callId = callId
    self.on = on
  }

  func perform() async throws -> some IntentResult { .result() }
}

struct LineTakeOverIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Take over the call"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  @Parameter(title: "Call") var callId: String

  init() {}

  init(callId: String) {
    self.callId = callId
  }

  func perform() async throws -> some IntentResult { .result() }
}

enum LineLive {
  static let nora = Color(hex: 0xF0457A)
  static let noraText = Color(hex: 0xFF7AA2)
  static let onCall = Color(hex: 0x30D158)

  static func url(_ callId: String) -> URL? {
    URL(string: "agenticos://line/\(callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? callId)")
  }

  /// The category's symbol, as on the app's call log.
  static func symbol(_ category: String) -> String {
    switch category {
    case "delivery": return "shippingbox.fill"
    case "cab": return "car.fill"
    case "bank": return "building.columns.fill"
    case "sales": return "megaphone.fill"
    case "spam": return "exclamationmark.shield.fill"
    case "personal": return "person.fill"
    case "business": return "briefcase.fill"
    default: return "phone.fill"
    }
  }

  static func tint(_ s: LineCallAttributes.ContentState) -> Color {
    switch s.phase {
    case "you": return onCall
    case "ended": return .white.opacity(0.55)
    case "ringing": return .white.opacity(0.75)
    default: return s.needsYou ? nora : noraText
    }
  }

  /// What's happening, in one line.
  static func status(_ s: LineCallAttributes.ContentState) -> String {
    switch s.phase {
    case "ended": return s.action.isEmpty ? "Call ended" : s.action
    case "you": return "You're on the call"
    case "ringing": return "Ringing Nora"
    default:
      if s.needsYou { return "Nora wants you on this call" }
      return s.action.isEmpty ? "Nora is on the call" : s.action
    }
  }

  /// Listen and Take over while Nora has the call.
  static func hasButtons(_ s: LineCallAttributes.ContentState) -> Bool { s.phase == "ringing" || s.phase == "nora" }
}

struct LineLiveWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LineCallAttributes.self) { ctx in
      LineLockScreen(callId: ctx.attributes.callId, state: ctx.state)
        .activityBackgroundTint(Color.scene.opacity(0.92))
        .activitySystemActionForegroundColor(.white)
        .widgetURL(LineLive.url(ctx.attributes.callId))
    } dynamicIsland: { ctx in
      let s = ctx.state
      let tint = LineLive.tint(s)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          LineCategoryMark(category: s.category, tint: tint, size: 44).padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          LineTimer(state: s)
            .font(.system(.title3, design: .rounded).weight(.semibold).monospacedDigit())
            .foregroundStyle(tint).frame(maxWidth: 76, alignment: .trailing).padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(s.name).font(.headline).lineLimit(1)
            Text(LineLive.status(s)).font(.subheadline).foregroundStyle(s.needsYou && s.phase == "nora" ? tint : Color.secondary).lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if LineLive.hasButtons(s) {
            LineButtons(callId: ctx.attributes.callId, state: s).padding(.top, 8)
          }
        }
      } compactLeading: {
        Image(systemName: LineLive.symbol(s.category)).foregroundStyle(tint)
      } compactTrailing: {
        LineTimer(state: s).monospacedDigit().foregroundStyle(tint).frame(maxWidth: 46)
      } minimal: {
        Image(systemName: LineLive.symbol(s.category)).foregroundStyle(tint)
      }
      .keylineTint(tint)
      .widgetURL(LineLive.url(ctx.attributes.callId))
    }
  }
}

struct LineLockScreen: View {
  let callId: String
  let state: LineCallAttributes.ContentState

  var body: some View {
    let tint = LineLive.tint(state)
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        LineCategoryMark(category: state.category, tint: tint, size: 40)
        VStack(alignment: .leading, spacing: 2) {
          Text(state.name).font(.headline).foregroundStyle(.white).lineLimit(1)
          Text(LineLive.status(state)).font(.subheadline)
            .foregroundStyle(state.needsYou && state.phase == "nora" ? tint : .white.opacity(0.65)).lineLimit(2)
        }
        Spacer(minLength: 8)
        LineTimer(state: state)
          .font(.system(.title3, design: .rounded).weight(.semibold).monospacedDigit())
          .foregroundStyle(tint).frame(maxWidth: 80, alignment: .trailing)
      }
      if LineLive.hasButtons(state) { LineButtons(callId: callId, state: state) }
    }
    .padding(16)
  }
}

/// The category's symbol in a tinted circle.
struct LineCategoryMark: View {
  let category: String
  let tint: Color
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle().fill(tint.opacity(0.2))
      Image(systemName: LineLive.symbol(category)).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(tint)
    }
    .frame(width: size, height: size)
  }
}

/// How long the call has gone on; "Ended" once it has.
struct LineTimer: View {
  let state: LineCallAttributes.ContentState

  var body: some View {
    if state.phase == "ended" {
      Text("Ended")
    } else {
      Text(Date(timeIntervalSince1970: state.startedAt), style: .timer).multilineTextAlignment(.trailing)
    }
  }
}

/// Listen (Stop while this phone plays the call) and Take over.
struct LineButtons: View {
  let callId: String
  let state: LineCallAttributes.ContentState

  var body: some View {
    let listening = state.listening == true
    HStack(spacing: 8) {
      Button(intent: LineListenIntent(callId: callId, on: !listening)) {
        Label(listening ? "Stop" : "Listen", systemImage: listening ? "stop.fill" : "headphones")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(Color.white.opacity(0.14), in: Capsule())
      }
      .buttonStyle(.plain)
      Button(intent: LineTakeOverIntent(callId: callId)) {
        Label("Take over", systemImage: "phone.fill")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(LineLive.onCall, in: Capsule())
      }
      .buttonStyle(.plain)
    }
  }
}
