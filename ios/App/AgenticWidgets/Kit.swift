import SwiftUI
import WidgetKit

// Shared pieces for the 2.0.0 widgets: the approved palette (app/css/skins: Obsidian and Matte), the agent's orb
// coloured by how he seems to her, and a provider over the shared snapshot. Home-screen timelines only ever show
// the real snapshot (or an empty state); the sample is for the widget gallery.

enum Palette {
    /// The nine aspects in wheel order, with the skins' dark and light hues.
    static let order = ["body", "mind", "soul", "mission", "money", "growth", "family", "romance", "friends"]
    private static let hues: [String: (dark: String, light: String)] = [
        "body": ("#FF6B3D", "#E2481A"), "mind": ("#45B3FF", "#0A84D6"), "soul": ("#33DCC0", "#00A88A"),
        "mission": ("#7B86FF", "#4D58E8"), "money": ("#34D27B", "#16A34A"), "growth": ("#B884FF", "#8F4DE6"),
        "family": ("#FFB340", "#C77800"), "romance": ("#FF4F8E", "#E01E63"), "friends": ("#DFE64A", "#8A9400"),
    ]

    static func aspect(_ id: String?, _ given: String? = nil) -> Color {
        if let given, given.hasPrefix("#") { return Color(hex: given) }
        guard let id, let h = hues[id] else { return Color.nora }
        return Color.dynamic(h.light, h.dark)
    }

    static func matte(_ skin: String?) -> Bool { skin == "matte" }

    /// The ground behind a widget: Obsidian is near-black glass, Matte warm uncoated card (paper in light mode).
    static func ground(_ skin: String?) -> Color {
        matte(skin) ? Color.dynamic("#F8F4EE", "#1C1916") : Color.dynamic("#FDFDFF", "#101013")
    }

    static func ink(_ skin: String?) -> Color {
        matte(skin) ? Color.dynamic("#2A2520", "#EEE8DF") : Color.dynamic("#16181E", "#F5F5F7")
    }

    static func ink2(_ skin: String?) -> Color {
        matte(skin) ? Color.dynamic("#6E655B", "#B5AEA5") : Color.dynamic("#5E6370", "#A8A8B0")
    }

    static func track(_ skin: String?) -> Color {
        matte(skin) ? Color.dynamic("#E6DDD1", "#2C2723") : Color.dynamic("#E8E9EE", "#1E1E23")
    }

    static let warn = Color(hex: "#E3923A")
    static let ok = Color(hex: "#3A9A5A")

    /// Calm is violet and blue; stress warms through amber to red (MOTION's orb uses the same ramp).
    static func mood(_ stress: Double?) -> (Color, Color) {
        let s = min(max(stress ?? 0, 0), 1)
        func mix(_ a: (Double, Double, Double), _ b: (Double, Double, Double), _ t: Double) -> Color {
            Color(red: a.0 + (b.0 - a.0) * t, green: a.1 + (b.1 - a.1) * t, blue: a.2 + (b.2 - a.2) * t)
        }
        let violet = (0.46, 0.42, 0.90), blue = (0.35, 0.65, 0.89), amber = (0.89, 0.57, 0.23), red = (0.90, 0.28, 0.30), rose = (0.95, 0.45, 0.35)
        if s < 0.5 {
            let t = s / 0.5
            return (mix(violet, amber, t * t), mix(blue, rose, t))
        }
        let t = (s - 0.5) / 0.5
        return (mix(amber, red, t), mix(rose, red, t))
    }

    /// ₹412, ₹1.2k, ₹3.4L: short enough for a lock-screen circle.
    static func money(_ v: Double, _ symbol: String, short: Bool = false) -> String {
        let sign = v < 0 ? "-" : ""
        let a = abs(v)
        if short {
            if a >= 100_000 { return "\(sign)\(symbol)\(String(format: "%.1f", a / 100_000))L" }
            if a >= 1000 { return "\(sign)\(symbol)\(String(format: "%.1f", a / 1000))k" }
        }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_IN")
        f.maximumFractionDigits = 0
        return "\(sign)\(symbol)\(f.string(from: NSNumber(value: a.rounded())) ?? String(Int(a)))"
    }
}

/// The agent's orb, coloured by his stress (0-1).
struct MoodOrb: View {
    var size: CGFloat
    var stress: Double?

    var body: some View {
        let (core, glow) = Palette.mood(stress)
        ZStack {
            Circle().fill(core)
            Circle().fill(RadialGradient(colors: [glow, .clear], center: UnitPoint(x: 0.65, y: 0.75), startRadius: 0, endRadius: size * 0.6))
            Circle().fill(RadialGradient(colors: [Color.white.opacity(0.75), .clear], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: size * 0.42))
        }
        .frame(width: size, height: size)
        .shadow(color: core.opacity(0.45), radius: size * 0.18)
    }
}

struct SnapEntry: TimelineEntry {
    let date: Date
    let snap: Snapshot?
}

/// The shared snapshot, refreshed when the app shares a new one (it reloads every timeline) and on a slow tick.
struct SnapProvider: TimelineProvider {
    var refresh: TimeInterval = 1800

    func placeholder(in context: Context) -> SnapEntry { SnapEntry(date: Date(), snap: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (SnapEntry) -> Void) {
        completion(SnapEntry(date: Date(), snap: context.isPreview ? .sample : (Shared.snapshot ?? .sample)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapEntry>) -> Void) {
        completion(Timeline(entries: [SnapEntry(date: Date(), snap: Shared.snapshot)], policy: .after(Date().addingTimeInterval(refresh))))
    }
}

/// "Open Agentic OS once" when there's no snapshot, else what's missing.
struct EmptyNote: View {
    let icon: String
    let text: String
    var skin: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon).font(.title3).foregroundStyle(Palette.ink2(skin))
            Text(text).font(.footnote).foregroundStyle(Palette.ink2(skin)).lineLimit(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// A small round button for widget actions (an App Intent) or links.
struct Pill: View {
    let title: String
    let icon: String?
    let tint: Color
    var filled = true

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).font(.caption.weight(.bold)) }
            Text(title).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundStyle(filled ? Color.white : tint)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 30)
        .background(Capsule().fill(filled ? tint : tint.opacity(0.14)))
    }
}

/// A date range that can't be backwards: a Live Activity drawn after its end time would otherwise crash.
func span(_ a: Date, _ b: Date) -> ClosedRange<Date> { a <= b ? a...b : b...a }
