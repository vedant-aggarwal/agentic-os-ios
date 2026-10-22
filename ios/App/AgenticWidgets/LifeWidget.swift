import SwiftUI
import WidgetKit

/// The wheel of life: nine wedges, each as long as its score, in its aspect's colour.
struct LifeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgenticLife", provider: SnapProvider(refresh: 3600)) { entry in
            LifeView(entry: entry)
                .containerBackground(for: .widget) { Palette.ground(entry.snap?.skin) }
                .widgetURL(URL(string: "agenticos://life"))
        }
        .configurationDisplayName("Life wheel")
        .description("Your nine areas at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

extension Snapshot {
    /// The wheel in order; aspects the app didn't send are left out.
    var wheel: [Aspect] {
        let byId = Dictionary((life ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let known = Palette.order.compactMap { byId[$0] }
        let extra = (life ?? []).filter { !Palette.order.contains($0.id) }
        return known + extra
    }

    var lifeAverage: Double? {
        let w = wheel
        guard !w.isEmpty else { return nil }
        return w.map(\.score).reduce(0, +) / Double(w.count)
    }
}

struct Wedge: Shape {
    var index: Int
    var count: Int
    var amount: Double
    var inner: CGFloat

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2
        let r0 = outer * inner
        let r1 = r0 + (outer - r0) * CGFloat(max(amount, 0.05))
        let span = 2 * Double.pi / Double(max(count, 1))
        let gap = 0.045
        let a0 = -Double.pi / 2 + Double(index) * span + gap
        let a1 = a0 + span - 2 * gap
        var p = Path()
        p.addArc(center: c, radius: r1, startAngle: .radians(a0), endAngle: .radians(a1), clockwise: false)
        p.addArc(center: c, radius: r0, startAngle: .radians(a1), endAngle: .radians(a0), clockwise: true)
        p.closeSubpath()
        return p
    }
}

struct Wheel: View {
    let aspects: [Snapshot.Aspect]
    let skin: String?
    var showScore = true

    var body: some View {
        ZStack {
            ForEach(Array(aspects.enumerated()), id: \.offset) { i, a in
                Wedge(index: i, count: aspects.count, amount: 1, inner: 0.34).fill(Palette.aspect(a.id, a.color).opacity(0.16))
                Wedge(index: i, count: aspects.count, amount: a.fill, inner: 0.34).fill(Palette.aspect(a.id, a.color))
            }
            if showScore, !aspects.isEmpty {
                let avg = aspects.map(\.score).reduce(0, +) / Double(aspects.count)
                Text(String(format: "%.1f", avg))
                    .font(.system(.callout, design: .rounded).weight(.bold).monospacedDigit())
                    .foregroundStyle(Palette.ink(skin))
                    .minimumScaleFactor(0.6)
            }
        }
    }
}

struct LifeView: View {
    @Environment(\.widgetFamily) var family
    let entry: SnapEntry

    var body: some View {
        let skin = entry.snap?.skin
        let wheel = entry.snap?.wheel ?? []
        if wheel.isEmpty {
            switch family {
            case .accessoryCircular, .accessoryRectangular:
                Image(systemName: "circle.hexagongrid").font(.title3)
            default:
                EmptyNote(icon: "circle.hexagongrid", text: entry.snap == nil ? "Open Agentic OS once to show your wheel here." : "Score your areas in Life to fill the wheel.", skin: skin)
            }
        } else {
            switch family {
            case .accessoryCircular:
                Gauge(value: (entry.snap?.lifeAverage ?? 0) / 10) {
                    Image(systemName: "circle.hexagongrid")
                } currentValueLabel: {
                    Text(String(format: "%.1f", entry.snap?.lifeAverage ?? 0)).monospacedDigit()
                }
                .gaugeStyle(.accessoryCircular)
                .widgetAccentable()
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    Wheel(aspects: wheel, skin: skin, showScore: false).frame(width: 46, height: 46).widgetAccentable()
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Life \(String(format: "%.1f", entry.snap?.lifeAverage ?? 0))").font(.headline)
                        if let low = wheel.min(by: { $0.score < $1.score }) {
                            Text("Lowest: \(low.name) \(String(format: "%.0f", low.score))").font(.caption).lineLimit(1)
                        }
                    }
                }
            case .systemMedium:
                HStack(spacing: 14) {
                    Wheel(aspects: wheel, skin: skin).frame(maxWidth: 130, maxHeight: .infinity)
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Needs you most").font(.caption2.weight(.semibold)).foregroundStyle(Palette.ink2(skin)).textCase(.uppercase)
                        ForEach(wheel.sorted { $0.score < $1.score }.prefix(3), id: \.id) { a in
                            HStack(spacing: 6) {
                                Circle().fill(Palette.aspect(a.id, a.color)).frame(width: 7, height: 7)
                                Text(a.name).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink(skin)).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(String(format: "%.0f", a.score)).font(.subheadline.monospacedDigit().weight(.semibold)).foregroundStyle(Palette.ink(skin))
                                if let d = a.delta, abs(d) >= 0.5 {
                                    Image(systemName: d > 0 ? "arrow.up" : "arrow.down").font(.caption2.weight(.bold))
                                        .foregroundStyle(d > 0 ? Palette.ok : Palette.warn)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            default:
                Wheel(aspects: wheel, skin: skin)
                    .padding(2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}
