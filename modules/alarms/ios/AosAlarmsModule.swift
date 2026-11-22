import ExpoModulesCore
import UIKit

/// JS side of alarms (src/lib/alarms.ts). Events: onOpen { id, url } when an alarm's Open button opened the app,
/// onScheduled { id, at, title, kit, from, url? } when the PC's silent push set one.
public final class AosAlarmsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AosAlarms")
    Events("onOpen", "onScheduled")

    OnCreate {
      DispatchQueue.main.async {
        AlarmStore.shared.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      }
    }

    OnDestroy {
      DispatchQueue.main.async { AlarmStore.shared.emit = nil }
    }

    /// True on iOS 26, where alarms ring through silent mode.
    Function("isAvailable") { () -> Bool in
      AlarmStore.shared.kitAvailable
    }

    AsyncFunction("authorize") { () async -> [String: Any] in
      await AlarmStore.shared.authorize()
    }

    /// { id?, at (Unix ms), title, url? } -> { id, at, title, kit, url? } or { error }.
    AsyncFunction("schedule") { (opts: [String: Any]) async -> [String: Any] in
      guard let at = (opts["at"] as? NSNumber)?.doubleValue else { return ["error": "An alarm needs a time."] }
      let title = (opts["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Alarm"
      let id = (opts["id"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "app-\(UUID().uuidString.prefix(8).lowercased())"
      let url = (opts["url"] as? String).flatMap { $0.hasPrefix("agenticos://") ? $0 : nil }
      let meta = AlarmStore.Meta(id: id, at: at / 1000, title: String(title.prefix(80)), url: url, kit: "", from: "app")
      return await AlarmStore.shared.schedule(meta, prompt: true)
    }

    AsyncFunction("cancel") { (id: String) in
      AlarmStore.shared.cancel(id)
    }.runOnQueue(.main)

    AsyncFunction("list") { () -> [[String: Any]] in
      AlarmStore.shared.list()
    }.runOnQueue(.main)

    /// Links opened from an alarm's Open button that JS hasn't handled yet, once.
    AsyncFunction("takeOpened") { () -> [[String: Any]] in
      AlarmStore.shared.takeOpened()
    }.runOnQueue(.main)
  }
}

/// Silent pushes from the PC (server/phone-alarm.ts) are scheduled here, natively: JS may not be running.
public final class AosAlarmsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    AlarmStore.shared.prune()
    return true
  }

  public func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                          fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    let handled = AlarmStore.shared.handlePush(userInfo) { ok in completionHandler(ok ? .newData : .failed) }
    if !handled { completionHandler(.noData) }
  }
}
