import Capacitor
import Contacts
import ContactsUI
import CoreLocation
import EventKit
import UIKit
import UserNotifications

/// Device calendars and reminders (read), the Contacts picker, and geofences.
/// JS: AosPersonal.calendarAuthorize({ reminders? }), events({ from, to }), reminders({ done? }), pickContact(),
/// geoAuthorize(), geoAdd({ id, lat, lng, radius, title, onEnter?, onExit? }), geoRemove({ id }), geoList(), geoHere().
/// onEnter / onExit: { notify?: { title, body }, url?, post?: { path, body } }. Event (on Native): "geofence" { id, event, at }.
@objc(AosPersonalPlugin)
public class AosPersonalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosPersonalPlugin"
    public let jsName = "AosPersonal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "calendarAuthorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "events", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickContact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geoAuthorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geoAdd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geoRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geoList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geoHere", returnType: CAPPluginReturnPromise),
    ]
    private let store = EKEventStore()
    private var picker: ContactDelegate?

    // MARK: Calendar and reminders

    static func access(_ s: EKAuthorizationStatus) -> String {
        switch s {
        case .fullAccess: return "granted"
        case .writeOnly: return "writeOnly"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "prompt"
        }
    }

    @objc func calendarAuthorize(_ call: CAPPluginCall) {
        let wantReminders = call.flag("reminders", true)
        Task {
            let events = (try? await store.requestFullAccessToEvents()) ?? false
            let reminders = wantReminders ? ((try? await store.requestFullAccessToReminders()) ?? false) : false
            call.ok(["events": events, "reminders": reminders,
                     "eventsStatus": AosPersonalPlugin.access(EKEventStore.authorizationStatus(for: .event)),
                     "remindersStatus": AosPersonalPlugin.access(EKEventStore.authorizationStatus(for: .reminder))])
        }
    }

    @objc func events(_ call: CAPPluginCall) {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { return call.off("denied", ["error": "Calendar access is off."]) }
        let from = call.date("from") ?? Calendar.current.startOfDay(for: Date())
        let to = call.date("to") ?? from.addingTimeInterval(7 * 86400)
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
        let list = store.events(matching: predicate).prefix(1000).map { e -> [String: Any] in
            var out: [String: Any] = ["id": e.calendarItemIdentifier, "title": e.title ?? "", "start": Dates.ms(e.startDate),
                                      "end": Dates.ms(e.endDate), "allDay": e.isAllDay, "calendar": e.calendar?.title ?? ""]
            if let cg = e.calendar?.cgColor, let hex = AosPersonalPlugin.hex(cg) { out["color"] = hex }
            if let loc = e.location, !loc.isEmpty { out["location"] = loc }
            return out
        }
        call.ok(["events": Array(list)])
    }

    @objc func reminders(_ call: CAPPluginCall) {
        guard EKEventStore.authorizationStatus(for: .reminder) == .fullAccess else { return call.off("denied", ["error": "Reminders access is off."]) }
        let done = call.flag("done", false)
        let predicate = done ? store.predicateForCompletedReminders(withCompletionDateStarting: Date().addingTimeInterval(-30 * 86400), ending: Date(), calendars: nil)
                             : store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
        store.fetchReminders(matching: predicate) { rows in
            let list = (rows ?? []).prefix(500).map { r -> [String: Any] in
                var out: [String: Any] = ["id": r.calendarItemIdentifier, "title": r.title ?? "", "done": r.isCompleted,
                                          "list": r.calendar?.title ?? "", "priority": r.priority]
                if let due = r.dueDateComponents?.date ?? r.dueDateComponents.flatMap({ Calendar.current.date(from: $0) }) { out["due"] = Dates.ms(due) }
                if let notes = r.notes, !notes.isEmpty { out["notes"] = notes }
                return out
            }
            call.ok(["reminders": Array(list)])
        }
    }

    static func hex(_ c: CGColor) -> String? {
        guard let comps = c.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components,
              comps.count >= 3 else { return nil }
        return String(format: "#%02X%02X%02X", Int(comps[0] * 255), Int(comps[1] * 255), Int(comps[2] * 255))
    }

    // MARK: Contacts (the picker needs no permission)

    @objc func pickContact(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let vc = CNContactPickerViewController()
            let d = ContactDelegate { [weak self] contact in
                self?.picker = nil
                guard let c = contact else { return call.fail("Nobody picked.", cancelled: true) }
                call.ok(["contact": AosPersonalPlugin.json(c)])
            }
            vc.delegate = d
            self.picker = d
            if !Presenter.present(vc) { call.fail("The app isn't ready to show contacts.") }
        }
    }

    static func json(_ c: CNContact) -> [String: Any] {
        var out: [String: Any] = ["id": c.identifier]
        func has(_ key: String) -> Bool { c.isKeyAvailable(key) }
        let given = has(CNContactGivenNameKey) ? c.givenName : ""
        let family = has(CNContactFamilyNameKey) ? c.familyName : ""
        out["given"] = given
        out["family"] = family
        out["name"] = [given, family].filter { !$0.isEmpty }.joined(separator: " ")
        if has(CNContactNicknameKey), !c.nickname.isEmpty { out["nickname"] = c.nickname }
        if has(CNContactOrganizationNameKey), !c.organizationName.isEmpty { out["org"] = c.organizationName }
        if has(CNContactPhoneNumbersKey) { out["phones"] = c.phoneNumbers.map { $0.value.stringValue } }
        if has(CNContactEmailAddressesKey) { out["emails"] = c.emailAddresses.map { String($0.value) } }
        if has(CNContactBirthdayKey), let b = c.birthday {
            var bd: [String: Any] = [:]
            if let d = b.day { bd["day"] = d }
            if let m = b.month { bd["month"] = m }
            if let y = b.year { bd["year"] = y }
            out["birthday"] = bd
        }
        if has(CNContactThumbnailImageDataKey), let img = c.thumbnailImageData { out["image"] = img.base64EncodedString() }
        if (out["name"] as? String ?? "").isEmpty { out["name"] = out["nickname"] ?? out["org"] ?? "" }
        return out
    }

    // MARK: Geofences

    @objc func geoAuthorize(_ call: CAPPluginCall) {
        Geofences.shared.authorize { status in call.ok(["status": status]) }
    }

    @objc func geoAdd(_ call: CAPPluginCall) {
        guard let id = call.text("id"), let lat = call.number("lat"), let lng = call.number("lng") else {
            return call.fail("A geofence needs id, lat and lng.")
        }
        let fence = Geofences.Fence(id: id, lat: lat, lng: lng, radius: min(max(call.number("radius") ?? 150, 50), 2000),
                                    title: call.text("title") ?? id, onEnter: call.object("onEnter"), onExit: call.object("onExit"))
        DispatchQueue.main.async {
            if let error = Geofences.shared.add(fence) { call.fail(error) } else { call.ok(["id": id]) }
        }
    }

    @objc func geoRemove(_ call: CAPPluginCall) {
        guard let id = call.text("id") else { return call.fail("Say which: { id }.") }
        DispatchQueue.main.async {
            Geofences.shared.remove(id)
            call.ok(["id": id])
        }
    }

    @objc func geoList(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.ok(["fences": Geofences.shared.list(), "status": Geofences.shared.statusName]) }
    }

    @objc func geoHere(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            Geofences.shared.here { loc, error in
                if let loc {
                    call.ok(["lat": loc.coordinate.latitude, "lng": loc.coordinate.longitude,
                             "accuracy": loc.horizontalAccuracy, "at": Dates.ms(loc.timestamp)])
                } else {
                    call.fail(error ?? "No location.")
                }
            }
        }
    }
}

final class ContactDelegate: NSObject, CNContactPickerDelegate {
    private var done: ((CNContact?) -> Void)?
    init(_ done: @escaping (CNContact?) -> Void) { self.done = done }

    func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        done?(contact)
        done = nil
    }

    func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        done?(nil)
        done = nil
    }
}

/// Region monitoring: arriving at the gym can start the workout, the shop a family moment. iOS wakes the app for a
/// crossing even when it isn't running, as long as the manager exists from launch (NativeHub.launch -> observe).
final class Geofences: NSObject, CLLocationManagerDelegate {
    static let shared = Geofences()

    struct Fence: Codable {
        var id: String
        var lat: Double
        var lng: Double
        var radius: Double
        var title: String
        var onEnter: [String: AnyCodable]?
        var onExit: [String: AnyCodable]?

        init(id: String, lat: Double, lng: Double, radius: Double, title: String, onEnter: [String: Any]?, onExit: [String: Any]?) {
            self.id = id
            self.lat = lat
            self.lng = lng
            self.radius = radius
            self.title = title
            self.onEnter = onEnter.map { $0.mapValues(AnyCodable.init) }
            self.onExit = onExit.map { $0.mapValues(AnyCodable.init) }
        }
    }

    private let manager = CLLocationManager()
    private var authWaiters: [(String) -> Void] = []
    private var locationWaiters: [(CLLocation?, String?) -> Void] = []
    private let key = "aos.fences"
    private var fences: [String: Fence] {
        get { UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode([String: Fence].self, from: $0) } ?? [:] }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: key) }
    }

    func observe() {
        manager.delegate = self
    }

    var statusName: String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "prompt"
        }
    }

    /// When in use first, then always (iOS asks for the second only after the first).
    func authorize(_ done: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            switch self.manager.authorizationStatus {
            case .notDetermined:
                self.authWaiters.append(done)
                self.manager.requestWhenInUseAuthorization()
            case .authorizedWhenInUse:
                self.authWaiters.append(done)
                self.manager.requestAlwaysAuthorization()
                DispatchQueue.main.asyncAfter(deadline: .now() + 8) { self.flushAuth() }
            default:
                done(self.statusName)
            }
        }
    }

    private func flushAuth() {
        let waiters = authWaiters
        authWaiters.removeAll()
        for w in waiters { w(statusName) }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse, !authWaiters.isEmpty {
            manager.requestAlwaysAuthorization()
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { self.flushAuth() }
            return
        }
        if manager.authorizationStatus != .notDetermined { flushAuth() }
    }

    func add(_ f: Fence) -> String? {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return "This phone can't watch places." }
        let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: f.lat, longitude: f.lng),
                                      radius: min(f.radius, manager.maximumRegionMonitoringDistance), identifier: "aos.\(f.id)")
        region.notifyOnEntry = true
        region.notifyOnExit = f.onExit != nil
        var all = fences
        all[f.id] = f
        fences = all
        manager.startMonitoring(for: region)
        return nil
    }

    func remove(_ id: String) {
        for r in manager.monitoredRegions where r.identifier == "aos.\(id)" { manager.stopMonitoring(for: r) }
        var all = fences
        all.removeValue(forKey: id)
        fences = all
    }

    func list() -> [[String: Any]] {
        let watching = Set(manager.monitoredRegions.map(\.identifier))
        return fences.values.sorted { $0.id < $1.id }.map { f in
            ["id": f.id, "lat": f.lat, "lng": f.lng, "radius": f.radius, "title": f.title, "watching": watching.contains("aos.\(f.id)")]
        }
    }

    func here(_ done: @escaping (CLLocation?, String?) -> Void) {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        locationWaiters.append(done)
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let waiters = locationWaiters
        locationWaiters.removeAll()
        for w in waiters { w(locations.last, nil) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let waiters = locationWaiters
        locationWaiters.removeAll()
        for w in waiters { w(nil, error.localizedDescription) }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { crossed(region, "enter") }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) { crossed(region, "exit") }

    private func crossed(_ region: CLRegion, _ event: String) {
        guard region.identifier.hasPrefix("aos.") else { return }
        let id = String(region.identifier.dropFirst(4))
        guard let f = fences[id] else { return }
        NativeHub.shared.emit("geofence", ["id": id, "event": event, "title": f.title, "at": Dates.ms(Date())])
        guard let raw = event == "enter" ? f.onEnter : f.onExit else { return }
        let rule = raw.mapValues(\.value)
        let url = rule["url"] as? String
        if let n = rule["notify"] as? [String: Any] {
            let c = UNMutableNotificationContent()
            c.title = (n["title"] as? String) ?? f.title
            c.body = (n["body"] as? String) ?? ""
            c.sound = .default
            c.categoryIdentifier = "AOS_NUDGE"
            c.threadIdentifier = "aos-place"
            var aos: [String: Any] = ["id": "geo-\(id)-\(event)", "category": "nudge"]
            if let url { aos["url"] = url }
            c.userInfo = ["aos": aos]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "geo-\(id)-\(event)", content: c, trigger: nil))
        }
        if let post = rule["post"] as? [String: Any], let path = post["path"] as? String {
            var body = post["body"] as? [String: Any] ?? [:]
            body["fence"] = id
            body["event"] = event
            let now = Shared.isoNow()
            body["at"] = now
            body["updated_at"] = now
            if body["id"] == nil { body["id"] = Shared.newId() }
            let payload = body
            let task = UIApplication.shared.beginBackgroundTask(withName: "geofence")
            Task { @MainActor in
                let (code, _) = await Shared.send(path, body: payload)
                if code == 0 || code >= 500 { Shared.enqueue(path, body: payload) }
                UIApplication.shared.endBackgroundTask(task)
            }
        }
    }
}

/// A JSON value kept as Codable (a geofence's rule survives a relaunch).
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = NSNull() }
        else if let b = try? c.decode(Bool.self) { value = b }
        else if let n = try? c.decode(Double.self) { value = n }
        else if let s = try? c.decode(String.self) { value = s }
        else if let a = try? c.decode([AnyCodable].self) { value = a.map(\.value) }
        else if let d = try? c.decode([String: AnyCodable].self) { value = d.mapValues(\.value) }
        else { value = NSNull() }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case let b as Bool: try c.encode(b)
        case let n as NSNumber: try c.encode(n.doubleValue)
        case let n as Double: try c.encode(n)
        case let n as Int: try c.encode(n)
        case let s as String: try c.encode(s)
        case let a as [Any]: try c.encode(a.map(AnyCodable.init))
        case let d as [String: Any]: try c.encode(d.mapValues(AnyCodable.init))
        default: try c.encodeNil()
        }
    }
}
