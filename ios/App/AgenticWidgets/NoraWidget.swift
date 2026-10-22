import AppIntents
import SwiftUI
import WidgetKit

enum NoraTap: String, AppEnum {
    case call, chat
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Tap to"
    static var caseDisplayRepresentations: [NoraTap: DisplayRepresentation] = [.call: "Call Nora", .chat: "Chat with Nora"]
}

/// The small widget has one tap target, so it asks which one: call (default) or chat.
struct NoraWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Nora"
    static var description = IntentDescription("Call or chat with Nora.")
    @Parameter(title: "Tap to", default: .call) var tap: NoraTap
}

struct NoraEntry: TimelineEntry {
    let date: Date
    let tap: NoraTap
    let name: String
    let line: String?
    var stress: Double? = nil
}

struct NoraProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> NoraEntry {
        NoraEntry(date: Date(), tap: .call, name: "Nora", line: Snapshot.sample.nora, stress: Snapshot.sample.agent?.stress)
    }
    func snapshot(for configuration: NoraWidgetIntent, in context: Context) async -> NoraEntry {
        entry(configuration, preview: context.isPreview)
    }
    func timeline(for configuration: NoraWidgetIntent, in context: Context) async -> Timeline<NoraEntry> {
        Timeline(entries: [entry(configuration, preview: false)], policy: .after(Date().addingTimeInterval(3600)))
    }
    private func entry(_ c: NoraWidgetIntent, preview: Bool) -> NoraEntry {
        let s: Snapshot? = preview ? Snapshot.sample : Shared.snapshot
        return NoraEntry(date: Date(), tap: c.tap, name: s?.agentName ?? "Nora", line: s?.agent?.last ?? s?.nora, stress: s?.agent?.stress)
    }
}

struct NoraWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "AgenticNora", intent: NoraWidgetIntent.self, provider: NoraProvider()) { entry in
            NoraView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(hex: "#15132B"), Color(hex: "#0B0C12")], startPoint: .top, endPoint: .bottom)
                }
        }
        .configurationDisplayName("Nora")
        .description("Call or chat with Nora in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

private let callURL = URL(string: "agenticos://nora/call")!
private let chatURL = URL(string: "agenticos://nora")!

struct NoraView: View {
    @Environment(\.widgetFamily) var family
    let entry: NoraEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: entry.tap == .call ? "phone.fill" : "bubble.left.fill").font(.title3)
            }
            .widgetURL(entry.tap == .call ? callURL : chatURL)
        case .systemMedium:
            medium
        default:
            small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                MoodOrb(size: 40, stress: entry.stress)
                Spacer()
                Image(systemName: entry.tap == .call ? "phone.fill" : "bubble.left.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(entry.tap == .call ? Color.green : Color.nora))
            }
            Spacer(minLength: 6)
            Text(entry.name).font(.system(.headline, design: .rounded)).foregroundStyle(.white)
            Text(entry.line ?? (entry.tap == .call ? "Tap to talk" : "Tap to chat"))
                .font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(2)
        }
        .widgetURL(entry.tap == .call ? callURL : chatURL)
    }

    private var medium: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                MoodOrb(size: 44, stress: entry.stress)
                Spacer(minLength: 6)
                Text(entry.name).font(.system(.headline, design: .rounded)).foregroundStyle(.white)
                Text(entry.line ?? "Here when you need me.")
                    .font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 10) {
                Link(destination: callURL) { pill("Call", "phone.fill", .green) }
                Link(destination: chatURL) { pill("Chat", "bubble.left.fill", Color.nora) }
            }
            .frame(width: 104)
        }
    }

    private func pill(_ title: String, _ icon: String, _ tint: Color) -> some View {
        Label(title, systemImage: icon)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Capsule().fill(tint))
    }
}
