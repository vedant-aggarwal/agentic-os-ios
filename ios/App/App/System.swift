import ActivityKit
import Capacitor
import CoreHaptics
import CoreSpotlight
import HealthKit
import LocalAuthentication
import UIKit
import UniformTypeIdentifiers
import VisionKit
import WidgetKit

/// What this phone can do, widgets, Spotlight and the app icon.
/// JS: AosSystem.caps(), reloadWidgets(), spotlightIndex({ items }), spotlightRemove({ ids, kind? }),
/// spotlightClear({ kind? }), iconGet(), iconSet({ name: obsidian | matte | null }).
@objc(AosSystemPlugin)
public class AosSystemPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosSystemPlugin"
    public let jsName = "AosSystem"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "caps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadWidgets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spotlightIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spotlightRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "spotlightClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iconGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iconSet", returnType: CAPPluginReturnPromise),
    ]

    @objc func caps(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let la = LAContext()
            _ = la.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
            var ios26 = false
            if #available(iOS 26.0, *) { ios26 = true }
            var ios18 = false
            if #available(iOS 18.0, *) { ios18 = true }
            call.ok([
                "ios": Device.ios,
                "haptics": CHHapticEngine.capabilitiesForHardware().supportsHaptics,
                "biometry": AosAuthPlugin.biometry(la),
                "camera": UIImagePickerController.isSourceTypeAvailable(.camera),
                "docScan": VNDocumentCameraViewController.isSupported,
                "liveText": DataScannerViewController.isSupported,
                "alarmKit": ios26,
                "foundationModels": OnDevice.status()["available"] as? Bool ?? false,
                "speechAnalyzer": ios26,
                "health": HKHealthStore.isHealthDataAvailable(),
                "liveActivities": ActivityAuthorizationInfo().areActivitiesEnabled,
                "interactiveWidgets": true,
                "controls": ios18,
                "familyControls": ScreenTime.enabled,
                "icons": UIApplication.shared.supportsAlternateIcons,
            ])
        }
    }

    @objc func reloadWidgets(_ call: CAPPluginCall) {
        WidgetCenter.shared.reloadAllTimelines()
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadAllControls() }
        call.ok()
    }

    // MARK: Spotlight

    /// An item's identifier is its link, so a tap on a result opens it directly.
    static func link(_ o: [String: Any]) -> String? {
        if let url = o["url"] as? String, url.hasPrefix("agenticos://") { return url }
        guard let id = (o["id"] as? String) ?? (o["id"] as? NSNumber)?.stringValue else { return nil }
        if id.hasPrefix("agenticos://") { return id }
        return "agenticos://\((o["kind"] as? String) ?? "note")/\(id)"
    }

    @objc func spotlightIndex(_ call: CAPPluginCall) {
        let items: [CSSearchableItem] = call.objects("items").compactMap { o in
            guard let title = o["title"] as? String, !title.isEmpty, let link = AosSystemPlugin.link(o) else { return nil }
            let kind = (o["kind"] as? String) ?? "note"
            let attrs = CSSearchableItemAttributeSet(contentType: .text)
            attrs.title = title
            attrs.displayName = title
            attrs.contentDescription = o["subtitle"] as? String
            attrs.keywords = ((o["keywords"] as? [Any]) ?? []).compactMap { $0 as? String } + [kind]
            let item = CSSearchableItem(uniqueIdentifier: link, domainIdentifier: "aos.\(kind)", attributeSet: attrs)
            item.expirationDate = .distantFuture
            return item
        }
        guard !items.isEmpty else { return call.fail("Nothing to index: each item needs a title and an id or url.") }
        CSSearchableIndex.default().indexSearchableItems(items) { error in
            if let error { call.fail(error.localizedDescription) } else { call.ok(["indexed": items.count]) }
        }
    }

    @objc func spotlightRemove(_ call: CAPPluginCall) {
        let kind = call.text("kind")
        let ids = call.strings("ids").compactMap { AosSystemPlugin.link(["id": $0, "kind": kind ?? "note"]) }
        guard !ids.isEmpty else { return call.fail("Say which: { ids }.") }
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: ids) { error in
            if let error { call.fail(error.localizedDescription) } else { call.ok(["removed": ids.count]) }
        }
    }

    @objc func spotlightClear(_ call: CAPPluginCall) {
        let done: (Error?) -> Void = { error in
            if let error { call.fail(error.localizedDescription) } else { call.ok() }
        }
        if let kind = call.text("kind") {
            CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: ["aos.\(kind)"], completionHandler: done)
        } else {
            CSSearchableIndex.default().deleteAllSearchableItems(completionHandler: done)
        }
    }

    // MARK: App icon

    static let icons = ["obsidian": "AppIcon-Obsidian", "matte": "AppIcon-Matte"]

    @objc func iconGet(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let current = UIApplication.shared.alternateIconName
            let name = AosSystemPlugin.icons.first { $0.value == current }?.key
            call.ok(["name": name ?? NSNull(), "supported": UIApplication.shared.supportsAlternateIcons,
                     "names": Array(AosSystemPlugin.icons.keys).sorted()])
        }
    }

    @objc func iconSet(_ call: CAPPluginCall) {
        let wanted = call.text("name")
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else { return call.off("device") }
            let icon = wanted.flatMap { AosSystemPlugin.icons[$0] }
            if wanted != nil, wanted != "default", icon == nil { return call.fail("Icons: obsidian, matte, or null for the default.") }
            guard UIApplication.shared.alternateIconName != icon else { return call.ok(["name": wanted ?? NSNull()]) }
            UIApplication.shared.setAlternateIconName(icon) { error in
                if let error { call.fail(error.localizedDescription) } else { call.ok(["name": wanted ?? NSNull()]) }
            }
        }
    }
}
