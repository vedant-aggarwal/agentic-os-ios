import SwiftUI
import WidgetKit

// The Capture widget: one tap opens Agentic OS already recording a voice idea, hands free, into the Work inbox
// (agenticos://record, src/work/voice.ts quickCapture). Stop and save files it; a take cut off by closing the app is
// filed on the next launch. Home screen (small) and lock screen (round). Nothing to fetch, so the timeline never ends.

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
    StaticConfiguration(kind: "com.norrita.agenticos.capture", provider: CaptureProvider()) { _ in
      CaptureView()
        .widgetURL(URL(string: "agenticos://record"))
    }
    .configurationDisplayName("Capture")
    .description("Tap and say an idea. It goes to your Work inbox.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

struct CaptureView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    if family == .accessoryCircular {
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "mic.fill").font(.system(size: 22, weight: .semibold)).widgetAccentable()
      }
      .containerBackground(for: .widget) { Color.clear }
      .accessibilityLabel("Capture an idea")
    } else {
      VStack(alignment: .leading, spacing: 0) {
        ZStack {
          Circle().fill(Color(hex: 0xFF5A5F))
          Image(systemName: "mic.fill").font(.system(size: 24, weight: .semibold)).foregroundStyle(Color.white)
        }
        .frame(width: 52, height: 52)
        Spacer(minLength: 0)
        Text("Capture").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink)
        Text("Tap and say an idea").font(.system(size: 13)).foregroundStyle(Color.inkSoft).lineLimit(2)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .containerBackground(for: .widget) { Color.scene }
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Capture an idea")
    }
  }
}
