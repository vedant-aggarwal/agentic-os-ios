import Foundation
#if canImport(FamilyControls) && canImport(ManagedSettings)
import FamilyControls
import ManagedSettings

/// Screen Time state the app and its three Screen Time extensions share (the monitor, the shield's look and the
/// shield's buttons), kept in the shared keychain group like the rest of Shared. Only used when the build has
/// family_controls on (ios.yml input; App/ScreenTime.swift checks the flag before touching any of it).
enum BlockStore {
    static let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("aos"))

    /// What he picked to pause (opaque tokens; the app never learns which apps they are).
    static var selection: FamilyActivitySelection? {
        get { Shared.read("st.selection").flatMap { try? JSONDecoder().decode(FamilyActivitySelection.self, from: $0) } }
        set { Shared.write("st.selection", newValue.flatMap { try? JSONEncoder().encode($0) }) }
    }

    /// The agent's line on the shield.
    static var line: String? {
        get { Shared.read("st.line").flatMap { String(data: $0, encoding: .utf8) } }
        set { Shared.write("st.line", newValue?.data(using: .utf8)) }
    }

    static var agentName: String { Shared.snapshot?.agentName ?? "Wyn" }

    /// When he last tapped "Ask" on the shield (Unix seconds); the app picks it up when it opens.
    static var unlockAsked: Double? {
        get { Shared.read("st.unlock").flatMap { String(data: $0, encoding: .utf8) }.flatMap(Double.init) }
        set { Shared.write("st.unlock", newValue.map { String($0) }?.data(using: .utf8)) }
    }

    static func shield() {
        guard let s = selection else { return }
        store.shield.applications = s.applicationTokens.isEmpty ? nil : s.applicationTokens
        store.shield.applicationCategories = s.categoryTokens.isEmpty ? nil : .specific(s.categoryTokens)
        store.shield.webDomains = s.webDomainTokens.isEmpty ? nil : s.webDomainTokens
        store.shield.webDomainCategories = s.categoryTokens.isEmpty ? nil : .specific(s.categoryTokens)
    }

    static func unshield() {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        store.shield.webDomainCategories = nil
    }

    static var shielding: Bool {
        store.shield.applications != nil || store.shield.applicationCategories != nil || store.shield.webDomains != nil
    }
}
#endif
