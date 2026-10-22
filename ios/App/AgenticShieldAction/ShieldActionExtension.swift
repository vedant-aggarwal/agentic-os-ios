import ManagedSettings
import UserNotifications

/// The shield's buttons. Close closes the app; Ask leaves a note for the app and a notification that opens Soul's
/// blocker, where he tells the agent why he needs it (she decides with him; the app unpauses for a while).
/// Only in builds with family_controls on.
final class ShieldActionExtension: ShieldActionDelegate {
    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(action, completionHandler)
    }

    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(action, completionHandler)
    }

    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        respond(action, completionHandler)
    }

    private func respond(_ action: ShieldAction, _ done: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .secondaryButtonPressed:
            BlockStore.unlockAsked = Date().timeIntervalSince1970
            let agent = BlockStore.agentName
            let c = UNMutableNotificationContent()
            c.title = "Tell \(agent) why"
            c.body = "Tap to ask for a few minutes."
            c.categoryIdentifier = "AOS_PLAIN"
            c.userInfo = ["aos": ["id": "aos.unlock", "category": "plain", "url": "agenticos://soul/blocker?ask=1"]]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "aos.unlock", content: c, trigger: nil)) { _ in
                done(.close)
            }
        default:
            done(.close)
        }
    }
}
