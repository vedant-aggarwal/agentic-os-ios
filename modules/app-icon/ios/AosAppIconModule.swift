import ExpoModulesCore
import UIKit

/// The app's home screen icon (src/lib/appIcon.ts): the primary one (AppIcon, light with a dark appearance, so it
/// follows the phone's look) or an alternate the config plugin compiles in (AppIconLight, AppIconDark).
public final class AosAppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AosAppIcon")

    /// The alternate icon's name, or null for the primary one.
    AsyncFunction("get") { () -> String? in
      UIApplication.shared.alternateIconName
    }.runOnQueue(.main)

    /// Switches to that alternate icon, or back to the primary one with null. iOS shows its own notice.
    AsyncFunction("set") { (name: String?, promise: Promise) in
      let app = UIApplication.shared
      guard app.supportsAlternateIcons else {
        promise.reject("ERR_APP_ICON", "This phone can't change the app icon.")
        return
      }
      if app.alternateIconName == name {
        promise.resolve()
        return
      }
      app.setAlternateIconName(name) { error in
        if let error { promise.reject("ERR_APP_ICON", error.localizedDescription) } else { promise.resolve() }
      }
    }.runOnQueue(.main)
  }
}
