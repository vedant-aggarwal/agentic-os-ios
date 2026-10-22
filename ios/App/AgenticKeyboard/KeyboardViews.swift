import SwiftUI
import UIKit

// MARK: Look

enum Kb {
    static func dyn(_ light: UIColor, _ dark: UIColor) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
    static func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> UIColor { UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1) }
    static let bg = dyn(rgb(210, 213, 219), rgb(28, 28, 30))
    static let key = dyn(.white, rgb(80, 80, 84))
    static let key2 = dyn(rgb(172, 177, 187), rgb(52, 52, 55))
    static let card = dyn(.white, rgb(44, 44, 46))
    static let ink = dyn(rgb(22, 24, 30), rgb(244, 245, 248))
    static let soft = dyn(rgb(98, 102, 112), rgb(160, 162, 170))
    static let accent = Color(UIColor(red: 0x76 / 255, green: 0x6B / 255, blue: 0xE6 / 255, alpha: 1))
    static let rec = Color(UIColor.systemRed)
}

struct KeyCap: ViewModifier {
    var fill: Color = Kb.key
    func body(content: Content) -> some View {
        content
            .foregroundStyle(Kb.ink)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(fill)
                .shadow(color: .black.opacity(0.28), radius: 0, x: 0, y: 1))
    }
}

extension View {
    func keyCap(_ fill: Color = Kb.key) -> some View { modifier(KeyCap(fill: fill)) }
}

// MARK: Root

struct KeyboardRoot: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                switch model.screen {
                case .home: HomeScreen(model: model)
                case .rewrite: RewriteScreen(model: model)
                case .reply: ReplyScreen(model: model)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if let flash = model.flash {
                Label(flash, systemImage: "checkmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(Capsule().fill(Color.black.opacity(0.78)))
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .background(Kb.bg)
        .animation(.easeOut(duration: 0.18), value: model.flash)
    }
}

// MARK: Home: big mic, Rewrite, Reply, minimal keys

struct HomeScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                ToolChip(title: "Rewrite", icon: "wand.and.stars") { model.openRewrite() }
                ToolChip(title: "Reply", icon: "bubble.left.and.bubble.right") { model.openReply() }
                Spacer()
            }
            Spacer(minLength: 0)
            MicPanel(model: model)
            Spacer(minLength: 0)
            if !model.fullAccess {
                Text(KeyboardModel.needAccess)
                    .font(.caption2).foregroundStyle(Kb.soft).multilineTextAlignment(.center)
            }
            BottomKeys(model: model)
        }
        .padding(.horizontal, 6)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

struct ToolChip: View {
    let title: String
    let icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .frame(height: 38)
                .keyCap()
        }
        .buttonStyle(.plain)
    }
}

struct MicPanel: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            Color.clear.frame(width: 36, height: 36)
            Button { model.mic() } label: { orb }
                .buttonStyle(.plain)
            Group {
                if showCancel {
                    Button { model.cancelDictation() } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .bold))
                            .frame(width: 36, height: 36).keyCap(Kb.key2)
                    }
                    .buttonStyle(.plain)
                } else {
                    Color.clear
                }
            }
            .frame(width: 36, height: 36)
        }
        .overlay(alignment: .bottom) {
            status.offset(y: 26)
        }
        .padding(.bottom, 22)
    }

    private var showCancel: Bool {
        switch model.dictation {
        case .opening, .starting, .recording: return true
        default: return false
        }
    }

    private var recording: Bool {
        if case .recording = model.dictation { return true }
        return false
    }

    private var orb: some View {
        ZStack {
            Circle().fill(recording ? Kb.rec : Kb.accent)
                .shadow(color: (recording ? Kb.rec : Kb.accent).opacity(0.45), radius: 10)
            switch model.dictation {
            case .recording:
                RoundedRectangle(cornerRadius: 5).fill(.white).frame(width: 24, height: 24)
            case .opening, .starting, .transcribing:
                ProgressView().tint(.white).scaleEffect(1.3)
            default:
                Image(systemName: "mic.fill").font(.system(size: 34, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: 92, height: 92)
    }

    @ViewBuilder private var status: some View {
        switch model.dictation {
        case .idle:
            Text("Tap to talk").font(.footnote).foregroundStyle(Kb.soft)
        case .opening:
            Text("Opening Agentic OS… then swipe back").font(.footnote).foregroundStyle(Kb.soft)
        case .starting:
            Text("Starting…").font(.footnote).foregroundStyle(Kb.soft)
        case .recording(let since):
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let s = max(0, Int(ctx.date.timeIntervalSince1970 - since))
                Text(String(format: "Recording %d:%02d  ·  tap to finish", s / 60, s % 60))
                    .font(.footnote.monospacedDigit()).foregroundStyle(Kb.rec)
            }
        case .transcribing:
            Text("Writing it out…").font(.footnote).foregroundStyle(Kb.soft)
        case .failed(let why):
            Text(why).font(.caption).foregroundStyle(Kb.rec).lineLimit(2).multilineTextAlignment(.center)
                .frame(maxWidth: 300)
        }
    }
}

struct BottomKeys: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        HStack(spacing: 6) {
            if model.showsGlobe {
                Button { model.nextKeyboard() } label: {
                    Image(systemName: "globe").font(.system(size: 18)).frame(width: 46, height: 44).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
            Button { model.insert(" ") } label: {
                Text("space").font(.system(size: 16)).frame(maxWidth: .infinity).frame(height: 44).keyCap()
            }
            .buttonStyle(.plain)
            RepeatKey { model.backspace() } label: {
                Image(systemName: "delete.left").font(.system(size: 18)).frame(width: 52, height: 44).keyCap(Kb.key2)
            }
            Button { model.insert("\n") } label: {
                Image(systemName: "return").font(.system(size: 18)).frame(width: 64, height: 44).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
        }
    }
}

/// A key that repeats while held (backspace).
struct RepeatKey<Label: View>: View {
    let action: () -> Void
    @ViewBuilder let label: () -> Label
    @State private var timer: Timer?
    @State private var down = false

    var body: some View {
        label()
            .opacity(down ? 0.6 : 1)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !down else { return }
                    down = true
                    action()
                    timer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) { _ in
                        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in action() }
                    }
                }
                .onEnded { _ in
                    down = false
                    timer?.invalidate()
                    timer = nil
                })
    }
}

// MARK: Shared pieces for Rewrite and Reply

struct Header: View {
    @ObservedObject var model: KeyboardModel
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Button { model.back() } label: {
                Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold))
                    .frame(width: 38, height: 32).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
            Text(title).font(.headline).foregroundStyle(Kb.ink)
            Spacer()
            if model.busy { ProgressView().scaleEffect(0.8) }
            Button { model.home() } label: {
                Image(systemName: "mic.fill").font(.system(size: 15, weight: .semibold))
                    .frame(width: 38, height: 32).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
            if model.showsGlobe {
                Button { model.nextKeyboard() } label: {
                    Image(systemName: "globe").font(.system(size: 15)).frame(width: 38, height: 32).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// A one-line field the keyboard fills itself (a keyboard can't type into its own text fields):
/// tap the letters button for our own keys, or the mic to dictate into it.
struct FieldRow: View {
    @ObservedObject var model: KeyboardModel
    let field: KeyboardModel.Field
    let placeholder: String
    var send: (() -> Void)?

    private var text: String { field == .refine ? model.refine : model.custom }
    private var active: Bool { model.typing == field }

    var body: some View {
        HStack(spacing: 6) {
            Button { model.typing = active ? nil : field } label: {
                HStack(spacing: 0) {
                    Text(text.isEmpty ? placeholder : text)
                        .font(.subheadline)
                        .foregroundStyle(text.isEmpty ? Kb.soft : Kb.ink)
                        .lineLimit(1)
                        .truncationMode(.head)
                    if active { Rectangle().fill(Kb.accent).frame(width: 2, height: 18) }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10)
                .frame(height: 38)
                .background(RoundedRectangle(cornerRadius: 10).fill(Kb.card))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(active ? Kb.accent : .clear, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            Button { model.mic(target: field) } label: {
                Image(systemName: micIcon).font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(micBusy ? Kb.rec : Kb.ink)
                    .frame(width: 38, height: 38).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
            if let send {
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(text.isEmpty || model.busy ? Kb.soft : Kb.accent))
                }
                .buttonStyle(.plain)
                .disabled(text.isEmpty || model.busy)
            }
        }
    }

    private var micBusy: Bool {
        switch model.dictation {
        case .recording, .starting, .opening, .transcribing: return true
        default: return false
        }
    }
    private var micIcon: String {
        if case .recording = model.dictation { return "stop.fill" }
        return "mic.fill"
    }
}

/// Our own letter keys, typing into a FieldRow.
struct MiniKeys: View {
    @ObservedObject var model: KeyboardModel
    @State private var shift = false
    private let rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]

    var body: some View {
        VStack(spacing: 6) {
            row(rows[0])
            row(rows[1]).padding(.horizontal, 14)
            HStack(spacing: 5) {
                Button { shift.toggle() } label: {
                    Image(systemName: shift ? "shift.fill" : "shift").frame(width: 40, height: 40).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
                row(rows[2])
                RepeatKey { model.backspace() } label: {
                    Image(systemName: "delete.left").frame(width: 40, height: 40).keyCap(Kb.key2)
                }
            }
            HStack(spacing: 5) {
                key(",")
                key("?")
                Button { model.insert(" ") } label: {
                    Text("space").font(.system(size: 15)).frame(maxWidth: .infinity).frame(height: 40).keyCap()
                }
                .buttonStyle(.plain)
                key(".")
                Button { model.typing = nil } label: {
                    Text("Done").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                        .frame(width: 64, height: 40)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Kb.accent))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func row(_ letters: String) -> some View {
        HStack(spacing: 5) {
            ForEach(Array(letters), id: \.self) { c in key(String(c)) }
        }
    }

    private func key(_ s: String) -> some View {
        Button {
            model.insert(shift ? s.uppercased() : s)
            shift = false
        } label: {
            Text(shift ? s.uppercased() : s).font(.system(size: 20))
                .frame(maxWidth: .infinity).frame(height: 40).keyCap()
        }
        .buttonStyle(.plain)
    }
}

/// The versions: one card at a time, back/forward and swipe, then Insert / Replace / Copy and the refine chat.
struct Results: View {
    @ObservedObject var model: KeyboardModel
    @State private var drag: CGFloat = 0

    var body: some View {
        VStack(spacing: 8) {
            card
            HStack(spacing: 6) {
                action("Insert", "text.insert", primary: true) { model.insertCurrent() }
                action("Replace", "arrow.left.arrow.right") { model.replaceCurrent() }
                action("Copy", "doc.on.doc") { model.copyCurrent() }
            }
            FieldRow(model: model, field: .refine, placeholder: "Tell it what to change…") { model.sendRefine() }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(model.current?.label ?? "").font(.caption.weight(.semibold)).foregroundStyle(Kb.accent).lineLimit(1)
                Spacer()
                Button { model.previous() } label: { Image(systemName: "chevron.left").frame(width: 28, height: 24) }
                    .disabled(model.index == 0)
                Text("\(model.index + 1)/\(model.versions.count)").font(.caption.monospacedDigit()).foregroundStyle(Kb.soft)
                Button { model.next() } label: { Image(systemName: "chevron.right").frame(width: 28, height: 24) }
                    .disabled(model.index >= model.versions.count - 1)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Kb.ink)
            ScrollView {
                Text(model.current?.text ?? "")
                    .font(.system(size: 16))
                    .foregroundStyle(Kb.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
            } else if !model.note.isEmpty {
                Text(model.note).font(.caption).foregroundStyle(Kb.soft).lineLimit(2)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Kb.card))
        .offset(x: drag)
        .opacity(model.busy ? 0.55 : 1)
        .gesture(DragGesture(minimumDistance: 20)
            .onChanged { v in if abs(v.translation.width) > abs(v.translation.height) { drag = v.translation.width / 3 } }
            .onEnded { v in
                if v.translation.width < -50 { model.next() } else if v.translation.width > 50 { model.previous() }
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) { drag = 0 }
            })
        .animation(.easeOut(duration: 0.15), value: model.index)
    }

    private func action(_ title: String, _ icon: String, primary: Bool = false, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(primary ? .white : Kb.ink)
                .frame(maxWidth: .infinity).frame(height: 38)
                .background(RoundedRectangle(cornerRadius: 9).fill(primary ? Kb.accent : Kb.key)
                    .shadow(color: .black.opacity(0.25), radius: 0, x: 0, y: 1))
        }
        .buttonStyle(.plain)
        .disabled(model.current == nil)
    }
}

struct Typing: View {
    @ObservedObject var model: KeyboardModel
    let field: KeyboardModel.Field

    var body: some View {
        VStack(spacing: 8) {
            FieldRow(model: model, field: field,
                     placeholder: field == .refine ? "Tell it what to change…" : "Say what you want",
                     send: field == .refine ? { model.sendRefine() } : nil)
            MiniKeys(model: model)
        }
    }
}

// MARK: Rewrite

struct RewriteScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            Header(model: model, title: "Rewrite")
            if let field = model.typing {
                Typing(model: model, field: field)
            } else if model.versions.isEmpty {
                setup
            } else {
                Results(model: model)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 6) {
                Text(model.source.isEmpty ? "Nothing to rewrite yet. Type in the field, or copy text and tap Clipboard." : model.source)
                    .font(.subheadline)
                    .foregroundStyle(model.source.isEmpty ? Kb.soft : Kb.ink)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { model.useClipboardText() } label: {
                    Label("Clipboard", systemImage: "doc.on.clipboard").font(.caption.weight(.semibold))
                        .padding(.horizontal, 8).frame(height: 30).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 12).fill(Kb.card))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(model.rewriteModes) { m in
                        Button { model.rewrite(m.key) } label: {
                            Text(m.label).font(.subheadline.weight(.medium)).padding(.horizontal, 12).frame(height: 36).keyCap()
                        }
                        .buttonStyle(.plain)
                        .disabled(model.busy)
                    }
                }
                .padding(.vertical, 2)
            }
            FieldRow(model: model, field: .custom, placeholder: "Or say how to change it") { model.rewrite("custom") }
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
            } else if model.busy {
                HStack { ProgressView(); Text("Rewriting…").font(.footnote).foregroundStyle(Kb.soft) }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: Reply

struct ReplyScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            Header(model: model, title: "Draft a reply")
            if let field = model.typing {
                Typing(model: model, field: field)
            } else if model.modePicker {
                modes
            } else if model.versions.isEmpty {
                setup
            } else {
                Results(model: model)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                source("Paste screenshot", "doc.on.clipboard") { model.pasteScreenshot() }
                source("Latest screenshot", "photo") { model.latestPhoto() }
                source("Chat text", "text.quote") { model.useClipboardText() }
            }
            if !model.images.isEmpty || !model.source.isEmpty {
                HStack(spacing: 8) {
                    ForEach(model.images) { img in
                        Image(uiImage: img.thumb).resizable().scaledToFill()
                            .frame(width: 40, height: 52).clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(alignment: .topTrailing) {
                                Button { model.removeImage(img.id) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 14)).foregroundStyle(.white, .black.opacity(0.6))
                                }
                                .buttonStyle(.plain)
                                .offset(x: 5, y: -5)
                            }
                    }
                    if !model.source.isEmpty {
                        Label(model.source, systemImage: "text.quote").font(.caption).foregroundStyle(Kb.soft).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                }
            }
            HStack(spacing: 6) {
                Button { model.modePicker = true } label: {
                    HStack(spacing: 6) {
                        Text(model.styleLabel).font(.subheadline.weight(.semibold))
                        Image(systemName: "chevron.down").font(.caption.weight(.bold))
                    }
                    .padding(.horizontal, 12).frame(height: 38).keyCap()
                }
                .buttonStyle(.plain)
                Spacer()
                Button { model.draftReply() } label: {
                    HStack(spacing: 6) {
                        if model.busy { ProgressView().tint(.white) }
                        Text(model.busy ? "Drafting…" : "Draft").font(.subheadline.weight(.bold))
                    }
                    .foregroundStyle(.white).padding(.horizontal, 18).frame(height: 38)
                    .background(RoundedRectangle(cornerRadius: 9).fill(Kb.accent))
                }
                .buttonStyle(.plain)
                .disabled(model.busy)
            }
            FieldRow(model: model, field: .custom, placeholder: model.style == "custom" ? "Say what you want (required)" : "Custom request (optional)")
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }

    private func source(_ title: String, _ icon: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 17))
                Text(title).font(.caption2.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity).frame(height: 50).keyCap()
        }
        .buttonStyle(.plain)
    }

    private var modes: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                ForEach(model.replyModes + [KbMode(key: "custom", label: "Custom")]) { m in
                    Button { model.pickStyle(m.key) } label: {
                        Text(m.label).font(.subheadline.weight(.semibold))
                            .foregroundStyle(m.key == model.style ? .white : Kb.ink)
                            .frame(maxWidth: .infinity).frame(height: 42)
                            .background(RoundedRectangle(cornerRadius: 9).fill(m.key == model.style ? Kb.accent : Kb.key)
                                .shadow(color: .black.opacity(0.25), radius: 0, x: 0, y: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }
}
