import ExpoModulesCore
import UIKit

/// JS side of Nora's calls (src/lib/calls.ts). CallCenter does the work; this hands its events to JS.
/// Events: onToken { token }, onRing { id, uuid, reason }, onAnswer { id, uuid, reason, voice }, onEnd { id, uuid },
/// onMute { muted }, onAudio { active }.
public final class AosCallsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AosCalls")
    Events("onToken", "onRing", "onAnswer", "onEnd", "onMute", "onAudio")

    OnCreate {
      DispatchQueue.main.async {
        CallCenter.shared.start()
        CallCenter.shared.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      }
    }

    OnDestroy {
      DispatchQueue.main.async { CallCenter.shared.emit = nil }
    }

    /// The PushKit VoIP token (hex), or null until iOS has given one.
    AsyncFunction("getToken") { () -> String? in
      CallCenter.shared.voipToken
    }.runOnQueue(.main)

    /// The answered call JS hasn't opened yet, once; null when there is none.
    AsyncFunction("takePending") { () -> [String: Any]? in
      CallCenter.shared.takePending()
    }.runOnQueue(.main)

    /// Ends the call on the system call screen (all of them when id is empty).
    AsyncFunction("end") { (id: String?) in
      CallCenter.shared.end(incomingId: id)
    }.runOnQueue(.main)

    AsyncFunction("list") { () -> [[String: Any]] in
      CallCenter.shared.list()
    }.runOnQueue(.main)
  }
}

/// Starts PushKit and CallKit at launch, before JS: a VoIP push that launched the app has to be reported at once.
public final class AosCallsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    CallCenter.shared.start()
    return true
  }
}
