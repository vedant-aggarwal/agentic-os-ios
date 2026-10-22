import AppIntents
import SwiftUI
import WidgetKit

// MARK: Her open question, answered from the Home Screen

struct AskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticAsk", provider: SnapProvider(refresh: 900)) { entry in
            AskView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(hex: "#15132B"), Color(hex: "#0B0C12")], startPoint: .top, endPoint: .bottom)
                }
        }
        .configurationDisplayName("Agent")
        .description("Her open question with Yes and No, or her latest line.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct AskView: View {
    @Environment(\.widgetFamily) var family
    let entry: SnapEntry

    var body: some View {
        let snap = entry.snap
        let agent = snap?.agent
        let name = snap?.agentName ?? "Wyn"
        let ask = agent?.ask
        let lastLine: String = agent?.last ?? snap?.nora ?? "Here when you need me."
        let askLink: URL? = URL(string: ask.map { "agenticos://ask/\($0.id)" } ?? "agenticos://nora")
        let heading: String = ask == nil ? name : "\(name) asks"
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(heading).font(.headline).widgetAccentable()
                Text(ask?.title ?? lastLine).font(.caption).lineLimit(2)
            }
            .widgetURL(askLink)
        case .systemMedium:
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    MoodOrb(size: 44, stress: agent?.stress)
                    Spacer(minLength: 0)
                    Text(name).font(.system(.headline, design: .rounded)).foregroundStyle(.white)
                    if let mood = agent?.mood { Text(mood).font(.caption2).foregroundStyle(.white.opacity(0.6)) }
                }
                .frame(width: 70, alignment: .leading)
                VStack(alignment: .leading, spacing: 8) {
                    if let ask {
                        Text(ask.title).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(3)
                        Spacer(minLength: 0)
                        AnswerButtons(ask: ask)
                    } else {
                        Text(lastLine)
                            .font(.subheadline).foregroundStyle(.white.opacity(0.85)).lineLimit(4)
                        Spacer(minLength: 0)
                        HStack(spacing: 8) {
                            Link(destination: URL(string: "agenticos://nora/call")!) { Pill(title: "Call", icon: "phone.fill", tint: .green) }
                            Link(destination: URL(string: "agenticos://nora")!) { Pill(title: "Chat", icon: "bubble.left.fill", tint: Color.nora) }
                        }
                    }
                }
            }
        default:
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    MoodOrb(size: 30, stress: agent?.stress)
                    Spacer()
                    Text(heading).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.65))
                }
                if let ask {
                    Text(ask.title).font(.footnote.weight(.semibold)).foregroundStyle(.white).lineLimit(3).minimumScaleFactor(0.85)
                    Spacer(minLength: 0)
                    AnswerButtons(ask: ask, compact: true)
                } else {
                    Spacer(minLength: 0)
                    Text(lastLine).font(.caption).foregroundStyle(.white.opacity(0.85)).lineLimit(4)
                }
            }
            .widgetURL(askLink)
        }
    }
}

struct AnswerButtons: View {
    let ask: Snapshot.Ask
    var compact = false

    var body: some View {
        let yes = ask.yes ?? "Yes"
        let no = ask.no ?? "No"
        HStack(spacing: compact ? 6 : 8) {
            Button(intent: AnswerAskIntent(askId: ask.id, text: yes, choice: "yes")) {
                Pill(title: yes, icon: compact ? nil : "checkmark", tint: Color.nora)
            }
            .buttonStyle(.plain)
            Button(intent: AnswerAskIntent(askId: ask.id, text: no, choice: "no")) {
                Pill(title: no, icon: nil, tint: .white, filled: false)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: Jobs that need him

struct JobsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticJobs", provider: SnapProvider(refresh: 600)) { entry in
            JobsView(entry: entry)
                .containerBackground(for: .widget) { Palette.ground(entry.snap?.skin) }
                .widgetURL(URL(string: JobsView.link(entry.snap?.jobs)))
        }
        .configurationDisplayName("Jobs")
        .description("Claude and Codex sessions that need you, and how many are working.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct JobsView: View {
    @Environment(\.widgetFamily) var family
    let entry: SnapEntry

    /// One job needs him: open it; otherwise the board.
    static func link(_ jobs: Snapshot.Jobs?) -> String {
        let needing = (jobs?.items ?? []).filter { $0.state == "needs" }
        if needing.count == 1, let url = needing[0].url { return url }
        return "agenticos://jobs"
    }

    var body: some View {
        let skin = entry.snap?.skin
        let jobs = entry.snap?.jobs
        let needs = jobs?.needs ?? 0
        let working = jobs?.working ?? 0
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: -1) {
                    Image(systemName: needs > 0 ? "hand.raised.fill" : "sparkles").font(.caption2.weight(.bold))
                    Text("\(needs > 0 ? needs : working)").font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit())
                }
            }
            .widgetAccentable()
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(needs > 0 ? (needs == 1 ? "1 job needs you" : "\(needs) jobs need you") : "No job needs you").font(.headline).widgetAccentable()
                Text(working == 1 ? "1 working" : "\(working) working").font(.caption)
                if let first = jobs?.items?.first(where: { $0.state == "needs" }) {
                    Text(first.title).font(.caption).lineLimit(1)
                }
            }
        case .systemMedium:
            HStack(alignment: .top, spacing: 14) {
                counts(needs: needs, working: working, skin: skin).frame(width: 90, alignment: .leading)
                VStack(alignment: .leading, spacing: 7) {
                    let items = Array((jobs?.items ?? []).prefix(3))
                    if items.isEmpty {
                        Text(jobs == nil ? "Open Agentic OS once to show your jobs." : "All quiet.").font(.footnote).foregroundStyle(Palette.ink2(skin))
                    }
                    ForEach(items, id: \.id) { j in
                        Link(destination: URL(string: j.url ?? "agenticos://jobs") ?? URL(string: "agenticos://jobs")!) {
                            HStack(spacing: 7) {
                                Image(systemName: j.state == "needs" ? "hand.raised.fill" : j.state == "done" ? "checkmark.circle.fill" : "circle.dotted")
                                    .font(.caption).foregroundStyle(j.state == "needs" ? Palette.warn : j.state == "done" ? Palette.ok : Palette.ink2(skin))
                                    .frame(width: 14)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(j.title).font(.caption.weight(.medium)).foregroundStyle(Palette.ink(skin)).lineLimit(1)
                                    if let d = j.detail, j.state == "needs" {
                                        Text(d).font(.caption2).foregroundStyle(Palette.warn).lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        default:
            counts(needs: needs, working: working, skin: skin)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func counts(needs: Int, working: Int, skin: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Image(systemName: needs > 0 ? "hand.raised.fill" : "sparkles").font(.headline)
                .foregroundStyle(needs > 0 ? Palette.warn : Palette.ink2(skin))
            Spacer(minLength: 2)
            Text("\(needs)").font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(needs > 0 ? Palette.warn : Palette.ink(skin))
            Text(needs == 1 ? "needs you" : "need you").font(.caption).foregroundStyle(Palette.ink2(skin))
            Text("\(working) working").font(.caption2.weight(.medium)).foregroundStyle(Palette.ink2(skin))
        }
    }
}
