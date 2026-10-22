import SwiftUI
import WidgetKit

/// What's left of today's allowance, on the Home Screen and the lock screen.
struct MoneyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticMoney", provider: SnapProvider(refresh: 1800)) { entry in
            MoneyView(entry: entry)
                .containerBackground(for: .widget) { Palette.ground(entry.snap?.skin) }
                .widgetURL(URL(string: "agenticos://money"))
        }
        .configurationDisplayName("Money left today")
        .description("Today's allowance, and what's left of it.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct MoneyView: View {
    @Environment(\.widgetFamily) var family
    let entry: SnapEntry

    var body: some View {
        let skin = entry.snap?.skin
        if let m = entry.snap?.money {
            let over = m.left < 0
            let tint = over ? Palette.warn : Palette.aspect("money")
            switch family {
            case .accessoryCircular:
                Gauge(value: m.fraction) {
                    Image(systemName: "indianrupeesign")
                } currentValueLabel: {
                    Text(Palette.money(m.left, m.symbol, short: true)).monospacedDigit().minimumScaleFactor(0.5)
                }
                .gaugeStyle(.accessoryCircularCapacity)
                .widgetAccentable()
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 3) {
                    Text(over ? "\(Palette.money(-m.left, m.symbol)) over" : "\(Palette.money(m.left, m.symbol)) left")
                        .font(.headline).widgetAccentable()
                    Text("of \(Palette.money(m.budget, m.symbol)) today").font(.caption)
                    Gauge(value: m.fraction) { EmptyView() }.gaugeStyle(.accessoryLinearCapacity)
                }
            case .accessoryInline:
                Text(over ? "\(Palette.money(-m.left, m.symbol)) over today" : "\(Palette.money(m.left, m.symbol)) left today")
            default:
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 5) {
                        Circle().fill(Palette.aspect("money")).frame(width: 7, height: 7)
                        Text("LEFT TODAY").font(.caption2.weight(.semibold)).foregroundStyle(Palette.ink2(skin))
                    }
                    Spacer(minLength: 2)
                    Text(over ? "-\(Palette.money(-m.left, m.symbol))" : Palette.money(m.left, m.symbol))
                        .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(over ? Palette.warn : Palette.ink(skin))
                        .minimumScaleFactor(0.5).lineLimit(1)
                    Text(over ? "over today's \(Palette.money(m.budget, m.symbol))" : "of \(Palette.money(m.budget, m.symbol))")
                        .font(.caption).foregroundStyle(Palette.ink2(skin)).lineLimit(1)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Palette.track(skin))
                            Capsule().fill(tint).frame(width: max(6, g.size.width * m.fraction))
                        }
                    }
                    .frame(height: 6)
                    if let ml = m.monthLeft {
                        Text("\(Palette.money(ml, m.symbol, short: true)) left this month").font(.caption2).foregroundStyle(Palette.ink2(skin)).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        } else {
            switch family {
            case .accessoryCircular, .accessoryRectangular, .accessoryInline:
                Label("No budget yet", systemImage: "indianrupeesign")
            default:
                EmptyNote(icon: "indianrupeesign.circle", text: entry.snap == nil ? "Open Agentic OS once to show money here." : "Set a monthly budget in Money to see what's left today.", skin: skin)
            }
        }
    }
}
