import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The shield over a paused app: the agent's line, Close, and Ask (which goes to ShieldActionExtension).
/// Only in builds with family_controls on.
final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        make(application.localizedDisplayName)
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        make(application.localizedDisplayName)
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        make(webDomain.domain)
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        make(webDomain.domain)
    }

    private func make(_ name: String?) -> ShieldConfiguration {
        let agent = BlockStore.agentName
        let line = BlockStore.line ?? "This one's paused for now. If you need it, tell me why."
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 0.9),
            icon: UIImage(systemName: "moon.stars.fill"),
            title: ShieldConfiguration.Label(text: name.map { "\($0) is paused" } ?? "Paused", color: .white),
            subtitle: ShieldConfiguration.Label(text: "\(agent): \(line)", color: UIColor.white.withAlphaComponent(0.75)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Close", color: .black),
            primaryButtonBackgroundColor: .white,
            secondaryButtonLabel: ShieldConfiguration.Label(text: "Ask \(agent)", color: .white))
    }
}
