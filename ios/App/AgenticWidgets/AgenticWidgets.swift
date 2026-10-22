import SwiftUI
import UIKit
import WidgetKit

/// Every widget, Live Activity and control. Nested bundles keep each builder block small.
@main
struct AgenticWidgets: WidgetBundle {
    var body: some Widget {
        HomeWidgets().body
        MoreWidgets().body
        LiveWidgets().body
        // Controls sit here directly (not in a nested bundle), so WidgetKit surely lists them.
        if #available(iOS 18.0, *) {
            QuickIdeaControl()
            ScanControl()
            AskControl()
            BreatheControl()
            ExpenseControl()
        }
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            AlarmLiveWidget()
        }
        #endif
    }
}

struct HomeWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        NoraWidget()
        QuickIdeaWidget()
        LifeWidget()
        MoneyWidget()
    }
}

struct MoreWidgets: WidgetBundle {
    var body: some Widget {
        StreaksWidget()
        AskWidget()
        JobsWidget()
        CaptureWidget()
        NextWidget()
    }
}

struct LiveWidgets: WidgetBundle {
    var body: some Widget {
        DayActivityWidget()
        WorkActivityWidget()
        WorkoutActivityWidget()
        BreathActivityWidget()
        FocusActivityWidget()
    }
}

// MARK: Look (app/DESIGN.md: cool neutrals, colour only from areas)

extension Color {
    init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
    static func dynamic(_ light: String, _ dark: String) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(Color(hex: dark)) : UIColor(Color(hex: light)) })
    }
    static let surface = Color.dynamic("#FDFDFF", "#14161A")
    static let ink = Color.dynamic("#16181E", "#F4F5F8")
    static let nora = Color(hex: "#766BE6")
    static let nora2 = Color(hex: "#58A6E3")
}

enum Look {
    static func glyph(_ kind: String) -> String {
        switch kind {
        case "task": return "checkmark.circle"
        case "sleep": return "moon.fill"
        case "free": return "circle.dotted"
        default: return "calendar"
        }
    }
    static let time: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()
    static func clock(_ t: Double) -> String { time.string(from: Date(timeIntervalSince1970: t)) }
    static func clock(_ d: Date) -> String { time.string(from: d) }
}

/// Nora's orb: the same gradient as the app's call screen.
struct NoraOrb: View {
    var size: CGFloat
    var body: some View {
        ZStack {
            Circle().fill(Color.nora)
            Circle().fill(RadialGradient(colors: [Color.nora2, .clear], center: UnitPoint(x: 0.65, y: 0.75), startRadius: 0, endRadius: size * 0.6))
            Circle().fill(RadialGradient(colors: [Color(hex: "#D3E2FB"), .clear], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: size * 0.45))
        }
        .frame(width: size, height: size)
        .shadow(color: Color.nora.opacity(0.45), radius: size * 0.18)
    }
}

/// What the widget gallery shows before the app has shared anything. Never drawn as his data on the Home Screen.
extension Snapshot {
    static let sample: Snapshot = {
        var s = Snapshot(
            at: Date().timeIntervalSince1970, name: "You",
            blocks: [
                Block(title: "Deep work", area: "Work", color: "#5B8DEF", kind: "event",
                      startAt: Date().addingTimeInterval(-40 * 60).timeIntervalSince1970, endAt: Date().addingTimeInterval(50 * 60).timeIntervalSince1970),
                Block(title: "Gym", area: "Body", color: "#34C759", kind: "event",
                      startAt: Date().addingTimeInterval(70 * 60).timeIntervalSince1970, endAt: Date().addingTimeInterval(130 * 60).timeIntervalSince1970),
                Block(title: "Reel edit", area: "Content", color: "#FF9F0A", kind: "task",
                      startAt: Date().addingTimeInterval(150 * 60).timeIntervalSince1970, endAt: Date().addingTimeInterval(195 * 60).timeIntervalSince1970),
            ],
            done: 3, total: 8, up: ["Renew the GST login", "Reel edit"], nora: "Gym is at 6. Want me to move the reel edit to after?", noraName: "Nora")
        s.v = 2
        s.life = zip(Palette.order, [6.5, 5, 4, 7, 6, 5.5, 8, 3, 4.5]).map { id, score in
            Aspect(id: id, name: id.capitalized, score: score, p: nil, color: nil, delta: nil)
        }
        s.money = Money(left: 412, budget: 650, spent: 238, currency: "₹", monthLeft: 14200, monthBudget: 31000)
        s.streaks = [Streak(id: "journal", label: "Journal", n: 6, today: false, atRisk: true, due: nil, aspect: "growth", hidden: nil),
                     Streak(id: "protocol-am", label: "AM protocol", n: 12, today: true, atRisk: false, due: nil, aspect: "body", hidden: nil),
                     Streak(id: "protocol-pm", label: "PM protocol", n: 11, today: false, atRisk: false, due: nil, aspect: "body", hidden: nil)]
        s.agent = Agent(name: "Nora", product: "Wyn", mood: "Steady", stress: 0.25, energy: 0.6, valence: 0.2,
                        last: "Gym is at 6. Want me to move the reel edit to after?",
                        ask: Ask(id: "sample", title: "Move the reel edit to 20:00?", yes: "Move it", no: "Keep it"))
        s.jobs = Jobs(needs: 1, working: 2, done: 0, items: [
            Job(id: "j1", title: "Fix the login screen", state: "needs", url: "agenticos://jobs", engine: "claude", detail: "Allow edit?", since: nil),
            Job(id: "j2", title: "Content pack", state: "working", url: "agenticos://jobs", engine: "codex", detail: nil, since: Date().addingTimeInterval(-600).timeIntervalSince1970),
        ])
        return s
    }()
}
