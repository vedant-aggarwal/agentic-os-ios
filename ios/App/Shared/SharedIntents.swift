import AppIntents
import Foundation
import WidgetKit

// Intents the widget extension and the app both compile. Widget buttons run the ones here in the widget's process;
// LiveActivityIntent ones always run in the app's process (iOS launches it in the background), so their app-only
// work sits behind #if !AOS_WIDGET (add_targets.rb sets AOS_WIDGET for the widget target).

enum IntentSource {
    #if AOS_WIDGET
    static let name = "widget"
    #else
    static let name = "siri"
    #endif
}

// MARK: The agent's open question

/// Yes or No on her question, from the widget. Takes the question off the widget at once; the answer goes now or
/// waits in the queue.
struct AnswerAskIntent: AppIntent {
    static var title: LocalizedStringResource = "Answer the agent"
    static var description = IntentDescription("Answers the agent's open question.")
    static var isDiscoverable: Bool = false

    @Parameter(title: "Question") var askId: String
    @Parameter(title: "Answer") var text: String
    @Parameter(title: "Choice") var choice: String

    init() {}

    init(askId: String, text: String, choice: String) {
        self.askId = askId
        self.text = text
        self.choice = choice
    }

    func perform() async throws -> some IntentResult {
        let id = askId
        Shared.updateSnapshot { s in
            if s.agent?.ask?.id == id { s.agent?.ask = nil }
        }
        let path = "/nora/asks/\(id)/answer"
        let body: [String: Any] = ["text": text, "choice": choice]
        let (code, _) = await Shared.send(path, body: body, timeout: 12)
        if code == 0 || code >= 500 { Shared.enqueue(path, body: body) }
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: Habits and streaks

struct HabitEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Habit"
    static var defaultQuery = HabitQuery()

    var id: String
    var label: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(label)") }

    /// The streaks and habits the app last shared. Private ones stay out of suggestions but still resolve by id.
    static func all(includeHidden: Bool) -> [HabitEntity] {
        (Shared.snapshot?.streaks ?? [])
            .filter { includeHidden || $0.hidden != true }
            .map { HabitEntity(id: $0.id, label: $0.label) }
    }
}

struct HabitQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [HabitEntity] {
        HabitEntity.all(includeHidden: true).filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [HabitEntity] {
        HabitEntity.all(includeHidden: false)
    }
}

/// Marks a habit or streak done today: from Shortcuts, Siri, or a widget's check button.
struct CheckHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Check a habit"
    static var description = IntentDescription("Marks a habit or streak done for today in Agentic OS.")

    @Parameter(title: "Habit") var habit: HabitEntity

    init() {}

    init(id: String, label: String) {
        self.habit = HabitEntity(id: id, label: label)
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Check \(\.$habit)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let h = habit
        Shared.updateSnapshot { s in
            guard var list = s.streaks, let i = list.firstIndex(where: { $0.id == h.id }) else { return }
            if list[i].today != true { list[i].n += 1 }
            list[i].today = true
            list[i].atRisk = false
            s.streaks = list
        }
        let now = Shared.isoNow()
        let body: [String: Any] = ["id": Shared.newId(), "habit": h.id, "at": now, "updated_at": now, "done": true, "source": IntentSource.name]
        let result = await Shared.deliver(Shared.route(.habit), body: body, say: "I did \(h.label) today.")
        WidgetCenter.shared.reloadAllTimelines()
        let line = result.say("\(h.label) is done for today.")
        return .result(dialog: IntentDialog("\(line)"))
    }
}

// MARK: Live Activity buttons

/// A button on a 2.0.0 Live Activity: kind is workout, focus or breathing; action is next, rest, skip, add5, end or stop.
/// The app updates the activity and tells the web layer (event "live").
struct LiveActionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Live Activity button"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Kind") var kind: String
    @Parameter(title: "Action") var action: String

    init() {}

    init(kind: String, action: String) {
        self.kind = kind
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        #if !AOS_WIDGET
        let k = kind, a = action
        await MainActor.run { LiveKit.shared.handle(kind: k, action: a) }
        #endif
        return .result()
    }
}
