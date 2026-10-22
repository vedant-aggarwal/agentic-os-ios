import AppIntents
import Foundation
import WidgetKit

/// Siri, Shortcuts and Back Tap: "Save an idea in Agentic OS" asks for the idea, saves it at once (so walking away
/// keeps it), then offers the projects. "Add a task in Agentic OS" does the same into the task inbox.
/// Offline, the save waits in the shared keychain and goes out the next time the app opens.

struct ProjectEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Project"
    static var defaultQuery = ProjectQuery()

    var id: String          // the slug; "" means no project
    var name: String
    var icon: String?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(icon.map { "\($0) " } ?? "")\(name)")
    }

    static let none = ProjectEntity(id: "", name: "No project", icon: nil)
}

struct ProjectQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ProjectEntity] {
        let all = [ProjectEntity.none] + (await ProjectEntity.load())
        return all.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [ProjectEntity] {
        [ProjectEntity.none] + (await ProjectEntity.load())
    }
}

extension ProjectEntity {
    /// Active projects from the PC, most recently touched first. Empty when the PC can't be reached.
    static func load() async -> [ProjectEntity] {
        let (_, data) = await Shared.request("/projects", timeout: 8)
        let list = (Shared.json(data)?["projects"] as? [[String: Any]]) ?? []
        return list
            .filter { ["active", nil].contains($0["status"] as? String) }
            .sorted { ($0["updatedAt"] as? String ?? "") > ($1["updatedAt"] as? String ?? "") }
            .compactMap { p in
                guard let slug = p["slug"] as? String, !slug.isEmpty else { return nil }
                let icon = (p["icon"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                return ProjectEntity(id: slug, name: p["name"] as? String ?? slug, icon: icon)
            }
    }
}

/// Saves first, then asks for the project. Shared by both intents.
enum QuickSave {
    enum Outcome { case saved(id: String?), queued, signedOut }

    static func save(_ path: String, _ body: [String: Any]) async -> Outcome {
        guard Shared.token != nil else { return .signedOut }
        let (code, data) = await Shared.send(path, body: body)
        if (200..<300).contains(code) {
            let json = Shared.json(data)
            let item = (json?["idea"] as? [String: Any]) ?? (json?["task"] as? [String: Any]) ?? json
            return .saved(id: item?["id"] as? String)
        }
        if code == 401 { return .signedOut }
        Shared.enqueue(path, body: body)
        return .queued
    }

    /// Offers the projects; nil when he skips, cancels, or there are none.
    static func pickProject(_ param: IntentParameter<ProjectEntity?>, _ prompt: String) async -> ProjectEntity? {
        let projects = await ProjectEntity.load()
        guard !projects.isEmpty else { return nil }
        do {
            let pick = try await param.requestDisambiguation(among: [ProjectEntity.none] + projects, dialog: IntentDialog("\(prompt)"))
            let chosen: ProjectEntity? = pick
            guard let chosen, !chosen.id.isEmpty else { return nil }
            return chosen
        } catch {
            return nil
        }
    }
}

struct SaveIdeaIntent: AppIntent {
    static var title: LocalizedStringResource = "Save an idea"
    static var description = IntentDescription("Saves an idea to Agentic OS right away, then lets you put it in a project.")
    static var openAppWhenRun = false

    @Parameter(title: "Idea", requestValueDialog: IntentDialog("What's the idea?"))
    var text: String

    @Parameter(title: "Project")
    var project: ProjectEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Save \(\.$text) as an idea") { \.$project }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let title = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return .result(dialog: "There was nothing to save.") }
        var body: [String: Any] = ["title": title, "source": "siri"]
        let given = project.flatMap { $0.id.isEmpty ? nil : $0 }
        if let given { body["project"] = given.id }
        switch await QuickSave.save("/ideas", body) {
        case .signedOut:
            return .result(dialog: "Open Agentic OS and sign in first.")
        case .queued:
            return .result(dialog: "Saved on the phone. It goes to Agentic OS when your PC is reachable and you open the app.")
        case .saved(let id):
            if let given { return .result(dialog: "Saved to \(given.name).") }
            guard let id, let pick = await QuickSave.pickProject($project, "Saved. Which project is it for?") else {
                return .result(dialog: "Saved to your Ideas inbox.")
            }
            let (code, _) = await Shared.send("/ideas/\(id)", method: "PATCH", body: ["project": pick.id])
            return .result(dialog: (200..<300).contains(code) ? "Saved to \(pick.name)." : "Saved to your Ideas inbox. Moving it to \(pick.name) failed.")
        }
    }
}

struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a task"
    static var description = IntentDescription("Adds a task to the Agentic OS inbox right away, then lets you put it in a project.")
    static var openAppWhenRun = false

    @Parameter(title: "Task", requestValueDialog: IntentDialog("What's the task?"))
    var text: String

    @Parameter(title: "Project")
    var project: ProjectEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$text) as a task") { \.$project }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let title = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return .result(dialog: "There was nothing to add.") }
        var body: [String: Any] = ["title": title, "source": "siri"]
        let given = project.flatMap { $0.id.isEmpty ? nil : $0 }
        if let given { body["project"] = given.id } else { body["status"] = "inbox" }
        switch await QuickSave.save("/tasks", body) {
        case .signedOut:
            return .result(dialog: "Open Agentic OS and sign in first.")
        case .queued:
            return .result(dialog: "Saved on the phone. It goes to Agentic OS when your PC is reachable and you open the app.")
        case .saved(let id):
            if let given { return .result(dialog: "Added to \(given.name).") }
            guard let id, let pick = await QuickSave.pickProject($project, "Added. Which project is it for?") else {
                return .result(dialog: "Added to your task inbox.")
            }
            let (code, _) = await Shared.send("/tasks/\(id)", method: "PATCH", body: ["project": pick.id])
            return .result(dialog: (200..<300).contains(code) ? "Added to \(pick.name)." : "Added to your inbox. Moving it to \(pick.name) failed.")
        }
    }
}

// MARK: 2.0.0 quick writes (offline through Shared.deliver: straight to the PC, queued, or said to the agent)

struct LogExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Log an expense"
    static var description = IntentDescription("Logs money you spent in Agentic OS. Works offline.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Amount", requestValueDialog: IntentDialog("How much was it?"))
    var amount: Double

    @Parameter(title: "What for", requestValueDialog: IntentDialog("What was it for?"))
    var note: String

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$amount) for \(\.$note)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let spent = amount
        guard spent > 0 else { return .result(dialog: "How much was it? Say a number.") }
        let what = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let rupees = spent.rounded() == spent && spent < 1e15 ? String(Int(spent)) : String(format: "%.2f", spent)
        let now = Shared.isoNow()
        let body: [String: Any] = ["id": Shared.newId(), "amount": spent, "currency": "INR", "note": what,
                                   "at": now, "updated_at": now, "source": IntentSource.name]
        Shared.updateSnapshot { s in
            guard var m = s.money else { return }
            m.left -= spent
            m.spent = (m.spent ?? 0) + spent
            s.money = m
        }
        WidgetCenter.shared.reloadAllTimelines()
        let say = "Log this expense: ₹\(rupees) for \(what.isEmpty ? "something" : what)."
        let result = await Shared.deliver(Shared.route(.expense), body: body, say: say)
        let line = result.say("Logged ₹\(rupees)\(what.isEmpty ? "" : " for \(what)").")
        return .result(dialog: IntentDialog("\(line)"))
    }
}

struct LogMealIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a meal"
    static var description = IntentDescription("Logs what you ate in Agentic OS. Works offline.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Meal", requestValueDialog: IntentDialog("What did you eat?"))
    var name: String

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$name)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let meal = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !meal.isEmpty else { return .result(dialog: "Tell me what you ate.") }
        let hour = Calendar.current.component(.hour, from: Date())
        let slot = hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 19 ? "snack" : "dinner"
        let now = Shared.isoNow()
        let body: [String: Any] = ["id": Shared.newId(), "name": meal, "slot": slot, "at": now, "updated_at": now, "source": IntentSource.name]
        let result = await Shared.deliver(Shared.route(.meal), body: body, say: "Log my \(slot): \(meal).")
        let line = result.say("Logged \(meal) for \(slot).")
        return .result(dialog: IntentDialog("\(line)"))
    }
}

struct JournalLineIntent: AppIntent {
    static var title: LocalizedStringResource = "Write a journal line"
    static var description = IntentDescription("Adds a line to today's journal in Agentic OS. Keeps the streak.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Line", requestValueDialog: IntentDialog("What's on your mind?"))
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Write \(\.$text) in the journal")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !line.isEmpty else { return .result(dialog: "Say a line for today.") }
        Shared.updateSnapshot { s in
            guard var list = s.streaks, let i = list.firstIndex(where: { $0.id == "journal" }) else { return }
            if list[i].today != true { list[i].n += 1 }
            list[i].today = true
            list[i].atRisk = false
            s.streaks = list
        }
        WidgetCenter.shared.reloadAllTimelines()
        let now = Shared.isoNow()
        let body: [String: Any] = ["id": Shared.newId(), "text": line, "at": now, "updated_at": now, "source": IntentSource.name]
        let result = await Shared.deliver(Shared.route(.journal), body: body, say: "Add to my journal: \(line)")
        let said = result.say("Written. The streak is safe.")
        return .result(dialog: IntentDialog("\(said)"))
    }
}

/// Asks her something and reads her reply when it comes back quickly; otherwise she answers in the app.
struct AskAgentIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask the agent"
    static var description = IntentDescription("Asks your agent something and reads her answer.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Question", requestValueDialog: IntentDialog("What should I ask?"))
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask \(\.$text)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return .result(dialog: "Ask me something.") }
        guard Shared.token != nil else { return .result(dialog: "Open Agentic OS and sign in first.") }
        let (code, data) = await Shared.send("/nora/messages", body: ["text": q], timeout: 12)
        if code == 403 { return .result(dialog: "The agent isn't on for this account yet.") }
        guard (200..<300).contains(code), let id = (Shared.json(data)?["id"] as? NSNumber)?.intValue else {
            if code == 0 || code >= 500 {
                Shared.enqueue("/nora/messages", body: ["text": q])
                return .result(dialog: "Saved. She gets it when your PC is reachable.")
            }
            return .result(dialog: "That didn't go through.")
        }
        for _ in 0..<2 {
            let (c, d) = await Shared.request("/nora?after=\(id)&wait=8", timeout: 12)
            guard c == 200, let messages = Shared.json(d)?["messages"] as? [[String: Any]] else { break }
            let replies = messages.filter { ($0["role"] as? String) == "nora" }.compactMap { $0["text"] as? String }
            if !replies.isEmpty {
                let said = replies.joined(separator: " ")
                return .result(dialog: IntentDialog("\(said)"))
            }
        }
        return .result(dialog: "Sent. She'll answer in the app.")
    }
}

// MARK: 2.0.0 intents that open the app

enum ScanMode: String, AppEnum {
    case photo, receipt, document, food, book
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "What to scan"
    static var caseDisplayRepresentations: [ScanMode: DisplayRepresentation] = [
        .photo: "Anything", .receipt: "A receipt", .document: "A document", .food: "Food", .book: "A book",
    ]
}

struct ScanIntent: AppIntent {
    static var title: LocalizedStringResource = "Scan"
    static var description = IntentDescription("Opens Scan in Agentic OS: receipts, documents, food, books.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "What", default: .photo)
    var mode: ScanMode

    func perform() async throws -> some IntentResult {
        NativeHub.shared.openLink("agenticos://scan?mode=\(mode.rawValue)")
        return .result()
    }
}

struct StartWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a workout"
    static var description = IntentDescription("Opens today's workout in Agentic OS and starts it.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        NativeHub.shared.openLink("agenticos://body/workout?start=1")
        return .result()
    }
}

enum BreathPattern: String, AppEnum {
    case calm, box, relax
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Breathing"
    static var caseDisplayRepresentations: [BreathPattern: DisplayRepresentation] = [
        .calm: "Calm (in 4, hold 4, out 6)", .box: "Box (4, 4, 4, 4)", .relax: "Relax (4, 7, 8)",
    ]
    var preset: String { self == .relax ? "478" : rawValue }
}

/// Starts the native breathing programme at once (so it keeps time even before the web layer is up) and opens the orb.
struct StartBreathingIntent: AppIntent {
    static var title: LocalizedStringResource = "Start breathing"
    static var description = IntentDescription("Starts a guided breathing session with haptics.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Pattern", default: .calm)
    var pattern: BreathPattern

    @Parameter(title: "Cycles", default: 4)
    var cycles: Int

    func perform() async throws -> some IntentResult {
        let preset = pattern.preset
        let n = min(max(cycles, 1), 40)
        await MainActor.run {
            let p = BreathProgramme(phases: BreathProgramme.preset(preset), cycles: n, pattern: preset, title: "Breathe",
                                    voice: false, sound: true, activity: true)
            _ = Breath.shared.start(p)
            NativeHub.shared.openLink("agenticos://breathe?pattern=\(preset)&running=1")
        }
        return .result()
    }
}

/// A focus countdown on the lock screen. A LiveActivityIntent, so it starts the activity without opening the app.
struct StartFocusIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Start a focus block"
    static var description = IntentDescription("Starts a focus countdown on the lock screen and in the Dynamic Island.")

    @Parameter(title: "Minutes", default: 25)
    var minutes: Int

    @Parameter(title: "Label")
    var label: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Focus for \(\.$minutes) minutes") { \.$label }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let m = min(max(minutes, 1), 600)
        let title = (label ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Focus" : label!
        let id: String? = await MainActor.run { LiveKit.shared.startFocus(minutes: m, title: title) }
        if let id { NativeHub.shared.emit("live", ["id": id, "kind": "focus", "action": "start", "state": ["minutes": m]]) }
        let say = id == nil ? "Live Activities are off for Agentic OS. Turn them on in Settings." : "Focus for \(m) minutes. I'll tell you when it's done."
        return .result(dialog: IntentDialog("\(say)"))
    }
}

/// Ten is Siri's limit. Check a habit is in Shortcuts and on the widgets without a phrase.
struct AgenticShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: SaveIdeaIntent(), phrases: [
            "Save an idea in \(.applicationName)",
            "New idea in \(.applicationName)",
            "Save idea in \(.applicationName)",
        ], shortTitle: "Save an idea", systemImageName: "lightbulb")
        AppShortcut(intent: AddTaskIntent(), phrases: [
            "Add a task in \(.applicationName)",
            "New task in \(.applicationName)",
        ], shortTitle: "Add a task", systemImageName: "checkmark.circle")
        AppShortcut(intent: LogExpenseIntent(), phrases: [
            "Log an expense in \(.applicationName)",
            "Add an expense in \(.applicationName)",
            "Kharcha likho in \(.applicationName)",
            "\(.applicationName) mein kharcha add karo",
        ], shortTitle: "Log an expense", systemImageName: "indianrupeesign.circle")
        AppShortcut(intent: LogMealIntent(), phrases: [
            "Log a meal in \(.applicationName)",
            "Log what I ate in \(.applicationName)",
            "\(.applicationName) mein khana likho",
        ], shortTitle: "Log a meal", systemImageName: "fork.knife")
        AppShortcut(intent: JournalLineIntent(), phrases: [
            "Write in my journal in \(.applicationName)",
            "Add a journal line in \(.applicationName)",
            "\(.applicationName) mein diary likho",
        ], shortTitle: "Journal", systemImageName: "book.closed")
        AppShortcut(intent: StartWorkoutIntent(), phrases: [
            "Start a workout in \(.applicationName)",
            "Start my workout with \(.applicationName)",
            "\(.applicationName) workout shuru karo",
        ], shortTitle: "Start a workout", systemImageName: "figure.strengthtraining.traditional")
        AppShortcut(intent: StartBreathingIntent(), phrases: [
            "Start breathing in \(.applicationName)",
            "Breathe with \(.applicationName)",
            "\(.applicationName) ke saath saans lo",
        ], shortTitle: "Breathe", systemImageName: "wind")
        AppShortcut(intent: ScanIntent(), phrases: [
            "Scan with \(.applicationName)",
            "Scan a receipt in \(.applicationName)",
            "\(.applicationName) se scan karo",
        ], shortTitle: "Scan", systemImageName: "doc.viewfinder")
        AppShortcut(intent: AskAgentIntent(), phrases: [
            "Ask \(.applicationName)",
            "Ask my agent in \(.applicationName)",
            "\(.applicationName) se poocho",
        ], shortTitle: "Ask the agent", systemImageName: "bubble.left.and.text.bubble.right")
        AppShortcut(intent: StartFocusIntent(), phrases: [
            "Start focus in \(.applicationName)",
            "Start a focus block in \(.applicationName)",
            "\(.applicationName) focus shuru karo",
        ], shortTitle: "Focus", systemImageName: "timer")
    }
}
