import AppIntents
import SwiftUI
import WidgetKit

/// One tap opens idea capture with the microphone already recording.
let quickIdeaURL = URL(string: "agenticos://capture?type=idea&voice=1")!

struct QuickIdeaEntry: TimelineEntry {
    let date: Date
}

struct QuickIdeaProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickIdeaEntry { QuickIdeaEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (QuickIdeaEntry) -> Void) { completion(QuickIdeaEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickIdeaEntry>) -> Void) {
        completion(Timeline(entries: [QuickIdeaEntry(date: Date())], policy: .never))
    }
}

struct QuickIdeaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticQuickIdea", provider: QuickIdeaProvider()) { _ in
            QuickIdeaView()
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(hex: "#1B1A2E"), Color(hex: "#0B0C12")], startPoint: .top, endPoint: .bottom)
                }
                .widgetURL(quickIdeaURL)
        }
        .configurationDisplayName("Quick idea")
        .description("Tap and talk: saves an idea.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

struct QuickIdeaView: View {
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "lightbulb.max.fill").font(.title3)
            }
            .widgetAccentable()
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "mic.fill").font(.title3)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Quick idea").font(.headline)
                    Text("Tap and talk").font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetAccentable()
        default:
            VStack(alignment: .leading, spacing: 0) {
                ZStack {
                    Circle().fill(Color.nora)
                    Image(systemName: "mic.fill").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                }
                .frame(width: 52, height: 52)
                .shadow(color: Color.nora.opacity(0.5), radius: 10)
                Spacer(minLength: 6)
                Text("Quick idea").font(.system(.headline, design: .rounded)).foregroundStyle(.white)
                Text("Tap and talk").font(.caption).foregroundStyle(.white.opacity(0.65))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

/// Control Center, the lock screen's control slots and the Action button (iOS 18).
@available(iOS 18.0, *)
struct QuickIdeaControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.norrita.agenticos.quickidea") {
            ControlWidgetButton(action: OpenURLIntent(quickIdeaURL)) {
                Label("Quick idea", systemImage: "lightbulb.max.fill")
            }
        }
        .displayName("Quick idea")
        .description("Opens idea capture and starts recording.")
    }
}
