import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AlarmKit)
import AlarmKit
#endif

// The 2.0.0 Live Activities. The app starts and updates them (App/Live.swift); the widget extension draws them
// (AgenticWidgets/LiveV2.swift). Compiled into both targets, so keep the field names in step on both sides.

#if canImport(ActivityKit)
/// A workout in progress: the exercise, the set, and the rest timer between sets.
struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var exercise: String
        var setIndex: Int          // the set he's on, from 1
        var setCount: Int
        var reps: Int?
        var weight: Double?
        var unit: String?          // kg
        var phase: String          // work, rest, done
        var restEnds: Double?      // Unix seconds, while resting
        var restSeconds: Int?      // the planned rest after a set
        var next: String?          // the next exercise

        var restEndDate: Date? { restEnds.map { Date(timeIntervalSince1970: $0) } }
    }
    var title: String
    var startedAt: Double

    var startDate: Date { Date(timeIntervalSince1970: startedAt) }
}

/// A breathing session: the phase now, its end, and the cycle.
struct BreathActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var phase: String          // in, hold, out, rest, done
        var label: String          // "Breathe in"
        var phaseStart: Double
        var phaseEnd: Double
        var cycle: Int
        var cycles: Int
        var endsAt: Double

        var start: Date { Date(timeIntervalSince1970: phaseStart) }
        var end: Date { Date(timeIntervalSince1970: max(phaseEnd, phaseStart + 1)) }
    }
    var title: String
    var pattern: String
}

/// A focus block counting down.
struct FocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var endsAt: Double
        var paused: Bool
        var remaining: Double?     // seconds left while paused
        var label: String?

        var end: Date { Date(timeIntervalSince1970: endsAt) }
    }
    var title: String
    var startedAt: Double
    var minutes: Int

    var start: Date { Date(timeIntervalSince1970: startedAt) }
}
#endif

#if canImport(AlarmKit)
/// What an alarm carries besides AlarmKit's own fields: its title and where a tap goes.
@available(iOS 26.0, *)
struct AosAlarmMeta: AlarmMetadata {
    var title: String
    var body: String?
    var url: String?
}
#endif
