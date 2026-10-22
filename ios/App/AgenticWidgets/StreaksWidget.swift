import AppIntents
import SwiftUI
import WidgetKit

/// His streaks (journal, AM and PM protocol...) with a check button for today. A streak the app marks private never
/// shows on the lock screen or in StandBy; the app leaves Clean out entirely unless he turns it on.
struct StreaksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticStreaks", provider: SnapProvider(refresh: 1800)) { entry in
            StreaksView(entry: entry)
                .containerBackground(for: .widget) { Palette.ground(entry.snap?.skin) }
                .widgetURL(URL(string: "agenticos://growth/journal"))
        }
        .configurationDisplayName("Streaks")
        .description("Keep your streaks going, and tick today off.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct StreaksView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.showsWidgetContainerBackground) var hasBackground
    let entry: SnapEntry

    /// Private streaks only where nobody else can see them: the Home Screen with its background.
    private var streaks: [Snapshot.Streak] {
        let all = entry.snap?.streaks ?? []
        let accessory = family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline
        return all.filter { $0.hidden != true || (!accessory && hasBackground) }
    }

    private var journal: Snapshot.Streak? { streaks.first { $0.id == "journal" } ?? streaks.first }

    var body: some View {
        let skin = entry.snap?.skin
        if streaks.isEmpty {
            switch family {
            case .accessoryCircular, .accessoryRectangular, .accessoryInline:
                Label("No streaks", systemImage: "flame")
            default:
                EmptyNote(icon: "flame", text: entry.snap == nil ? "Open Agentic OS once to show your streaks." : "Start a streak in the app.", skin: skin)
            }
        } else {
            switch family {
            case .accessoryCircular:
                if let s = journal {
                    ZStack {
                        AccessoryWidgetBackground()
                        VStack(spacing: -1) {
                            Image(systemName: s.today == true ? "checkmark" : "flame.fill").font(.caption2.weight(.bold))
                            Text("\(s.n)").font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit())
                        }
                    }
                    .widgetAccentable()
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(streaks.prefix(3), id: \.id) { s in
                        HStack(spacing: 5) {
                            Image(systemName: s.today == true ? "checkmark.circle.fill" : (s.atRisk == true ? "exclamationmark.circle" : "circle"))
                                .font(.caption2)
                            Text(s.label).font(.caption.weight(.medium)).lineLimit(1)
                            Spacer(minLength: 2)
                            Text("\(s.n)").font(.caption.monospacedDigit().weight(.semibold))
                        }
                    }
                }
                .widgetAccentable()
            case .accessoryInline:
                if let s = journal {
                    Label("\(s.n)-day \(s.label.lowercased())\(s.today == true ? " · done" : "")", systemImage: "flame.fill")
                }
            case .systemMedium:
                VStack(alignment: .leading, spacing: 8) {
                    Text("STREAKS").font(.caption2.weight(.semibold)).foregroundStyle(Palette.ink2(skin))
                    ForEach(streaks.prefix(3), id: \.id) { s in StreakRow(streak: s, skin: skin) }
                    Spacer(minLength: 0)
                }
            default:
                if let s = journal { StreakTile(streak: s, skin: skin) }
            }
        }
    }
}

struct StreakRow: View {
    let streak: Snapshot.Streak
    let skin: String?

    var body: some View {
        let tint = streak.atRisk == true && streak.today != true ? Palette.warn : Palette.aspect(streak.aspect)
        HStack(spacing: 10) {
            ZStack {
                Circle().stroke(Palette.track(skin), lineWidth: 3)
                Circle().trim(from: 0, to: streak.today == true ? 1 : 0.0001).stroke(tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(streak.n)").font(.caption2.monospacedDigit().weight(.bold)).foregroundStyle(Palette.ink(skin))
            }
            .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(streak.label).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink(skin)).lineLimit(1)
                Text(streak.today == true ? "Done today" : (streak.atRisk == true ? "At risk" : "\(streak.n) days"))
                    .font(.caption2).foregroundStyle(streak.atRisk == true && streak.today != true ? Palette.warn : Palette.ink2(skin))
            }
            Spacer(minLength: 4)
            if streak.today != true {
                if streak.writes {
                    Link(destination: streak.link) {
                        Image(systemName: "square.and.pencil").font(.caption.weight(.bold)).foregroundStyle(.white)
                            .frame(width: 30, height: 30).background(Circle().fill(tint))
                    }
                } else {
                    Button(intent: CheckHabitIntent(id: streak.id, label: streak.label)) {
                        Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(.white)
                            .frame(width: 30, height: 30).background(Circle().fill(tint))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Image(systemName: "checkmark.circle.fill").font(.title3).foregroundStyle(tint)
            }
        }
    }
}

struct StreakTile: View {
    let streak: Snapshot.Streak
    let skin: String?

    var body: some View {
        let tint = streak.atRisk == true && streak.today != true ? Palette.warn : Palette.aspect(streak.aspect)
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "flame.fill").font(.headline).foregroundStyle(tint)
                Spacer()
                if streak.today == true {
                    Image(systemName: "checkmark.circle.fill").font(.title3).foregroundStyle(tint)
                }
            }
            Spacer(minLength: 2)
            Text("\(streak.n)").font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit()).foregroundStyle(Palette.ink(skin))
            Text("day \(streak.label.lowercased())").font(.caption).foregroundStyle(Palette.ink2(skin)).lineLimit(1)
            if streak.today != true {
                if streak.writes {
                    Link(destination: streak.link) {
                        Pill(title: streak.atRisk == true ? "Save it" : "Write", icon: "square.and.pencil", tint: tint)
                    }
                } else {
                    Button(intent: CheckHabitIntent(id: streak.id, label: streak.label)) {
                        Pill(title: streak.atRisk == true ? "Save it" : "Done today", icon: "checkmark", tint: tint)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

extension Snapshot.Streak {
    /// The journal is kept by writing, so its button opens the journal instead of ticking a box.
    var writes: Bool { id == "journal" }
    var link: URL {
        let safe = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "x"
        return URL(string: id == "journal" ? "agenticos://growth/journal" : "agenticos://soul/habit/\(safe)")
            ?? URL(string: "agenticos://life")!
    }
}
