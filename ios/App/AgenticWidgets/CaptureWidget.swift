import AppIntents
import SwiftUI
import WidgetKit

private let scanURL = URL(string: "agenticos://scan")!
private let talkURL = URL(string: "agenticos://capture?type=idea&voice=1")!
private let expenseURL = URL(string: "agenticos://money/expense")!
private let askURL = URL(string: "agenticos://ask")!
private let breatheURL = URL(string: "agenticos://breathe?pattern=calm")!

// MARK: Scan and voice in one tap

struct CaptureEntry: TimelineEntry { let date: Date }

struct CaptureProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaptureEntry { CaptureEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) { completion(CaptureEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
        completion(Timeline(entries: [CaptureEntry(date: Date())], policy: .never))
    }
}

struct CaptureWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticCapture", provider: CaptureProvider()) { _ in
            CaptureView()
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(hex: "#1B1A2E"), Color(hex: "#0B0C12")], startPoint: .top, endPoint: .bottom)
                }
        }
        .configurationDisplayName("Scan and talk")
        .description("Scan a receipt, a page or food, or talk to save an idea.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

struct CaptureView: View {
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "doc.viewfinder").font(.title3)
            }
            .widgetAccentable()
            .widgetURL(scanURL)
        case .systemMedium:
            HStack(spacing: 10) {
                tile("Scan", "doc.viewfinder", Color(hex: "#45B3FF"), scanURL)
                tile("Talk", "mic.fill", Color.nora, talkURL)
                tile("Spent", "indianrupeesign", Color(hex: "#34D27B"), expenseURL)
                tile("Ask", "bubble.left.fill", Color(hex: "#B884FF"), askURL)
            }
        default:
            VStack(spacing: 10) {
                tile("Scan", "doc.viewfinder", Color(hex: "#45B3FF"), scanURL, wide: true)
                tile("Talk", "mic.fill", Color.nora, talkURL, wide: true)
            }
        }
    }

    private func tile(_ title: String, _ icon: String, _ tint: Color, _ url: URL, wide: Bool = false) -> some View {
        Link(destination: url) {
            Group {
                if wide {
                    HStack(spacing: 8) {
                        Image(systemName: icon).font(.system(size: 17, weight: .semibold))
                        Text(title).font(.system(.subheadline, design: .rounded).weight(.semibold))
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12)
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: icon).font(.system(size: 20, weight: .semibold))
                        Text(title).font(.caption.weight(.semibold))
                    }
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(tint.opacity(0.85)))
        }
    }
}

// MARK: The next block, on the lock screen

struct NextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticNext", provider: DayProvider()) { entry in
            NextView(entry: entry)
                .containerBackground(for: .widget) { Color.surface }
                .widgetURL(URL(string: "agenticos://today"))
        }
        .configurationDisplayName("Next up")
        .description("What's next today and how long until it starts.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

struct NextView: View {
    @Environment(\.widgetFamily) var family
    let entry: DayEntry

    var body: some View {
        let next = entry.snap?.next(after: entry.date.timeIntervalSince1970)
        switch family {
        case .accessoryInline:
            if let n = next { Text("\(Look.clock(n.startAt)) \(n.title)") } else { Text("Nothing next") }
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "arrow.right.circle").font(.caption2)
                    Text(next.map { Look.clock($0.startAt) } ?? "--").font(.system(.caption, design: .rounded).weight(.bold).monospacedDigit())
                }
            }
            .widgetAccentable()
        default:
            if let n = next {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Next · \(Look.clock(n.startAt))").font(.caption.weight(.semibold)).widgetAccentable()
                    Text(n.title).font(.headline).lineLimit(1)
                    Text(Date(timeIntervalSince1970: n.startAt), style: .relative).font(.caption).monospacedDigit()
                }
            } else {
                Text("Nothing next today").font(.headline)
            }
        }
    }
}

// MARK: Control Center, the lock screen's control slots and the Action button (iOS 18)

@available(iOS 18.0, *)
struct ScanControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.norrita.agenticos.scan") {
            ControlWidgetButton(action: OpenURLIntent(scanURL)) { Label("Scan", systemImage: "doc.viewfinder") }
        }
        .displayName("Scan")
        .description("Opens Scan: receipts, documents, food, books.")
    }
}

@available(iOS 18.0, *)
struct AskControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.norrita.agenticos.ask") {
            ControlWidgetButton(action: OpenURLIntent(askURL)) { Label("Ask the agent", systemImage: "bubble.left.and.text.bubble.right") }
        }
        .displayName("Ask the agent")
        .description("Opens a chat with your agent.")
    }
}

@available(iOS 18.0, *)
struct BreatheControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.norrita.agenticos.breathe") {
            ControlWidgetButton(action: OpenURLIntent(breatheURL)) { Label("Breathe", systemImage: "wind") }
        }
        .displayName("Breathe")
        .description("Starts a guided breathing session with haptics.")
    }
}

@available(iOS 18.0, *)
struct ExpenseControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.norrita.agenticos.expense") {
            ControlWidgetButton(action: OpenURLIntent(expenseURL)) { Label("Log expense", systemImage: "indianrupeesign.circle") }
        }
        .displayName("Log expense")
        .description("Opens the expense sheet.")
    }
}
