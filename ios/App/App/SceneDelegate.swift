import CoreSpotlight
import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // Cold start from the keyboard's mic: start recording now (the web layer also sees agenticos://flow and ignores it).
        for c in connectionOptions.urlContexts where FlowRecorder.shared.handle(c.url) || NativeHub.shared.handleLink(c.url) { break }
        // Opened from Nora in Recents: call her back. Opened from a Spotlight result: open it.
        for activity in connectionOptions.userActivities where CallManager.shared.handle(activity) || SceneDelegate.spotlight(activity) { break }
        // Opened from a quick action on the icon (the link waits until the web view is up).
        if let item = connectionOptions.shortcutItem { _ = SceneDelegate.quickAction(item) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Dictation from the keyboard stays native; every other link goes to the web layer.
        let rest = URLContexts.filter { !FlowRecorder.shared.handle($0.url) && !NativeHub.shared.handleLink($0.url) }
        if !rest.isEmpty { SceneDelegateProxy.shared.scene(scene, openURLContexts: rest) }
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        FlowRecorder.shared.enteredForeground()
        Task { await Shared.flushQueue() }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if CallManager.shared.handle(userActivity) { return }
        if SceneDelegate.spotlight(userActivity) { return }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(SceneDelegate.quickAction(shortcutItem))
    }

    /// Quick actions on the app icon (Info.plist UIApplicationShortcutItems): each carries its link in userInfo,
    /// with the type's last part as the fallback.
    static func quickAction(_ item: UIApplicationShortcutItem) -> Bool {
        let fallback: [String: String] = [
            "scan": "agenticos://scan", "ask": "agenticos://ask", "task": "agenticos://capture?type=task",
            "expense": "agenticos://money/expense",
        ]
        let key = item.type.components(separatedBy: ".").last ?? item.type
        guard let link = (item.userInfo?["url"] as? String) ?? fallback[key] else { return false }
        NativeHub.shared.openLink(link)
        return true
    }

    /// A tap on one of the app's results in Spotlight: the item's identifier is its agenticos:// link.
    static func spotlight(_ activity: NSUserActivity) -> Bool {
        guard activity.activityType == CSSearchableItemActionType,
              let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String, id.hasPrefix("agenticos://") else { return false }
        NativeHub.shared.openLink(id)
        return true
    }
}
