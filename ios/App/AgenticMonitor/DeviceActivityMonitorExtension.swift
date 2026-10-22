import DeviceActivity
import Foundation
import ManagedSettings

/// Runs at the edges of the blocker's intervals (App/ScreenTime.swift starts them): a window or a timed pause
/// starting puts the shield up; its end takes it down, except "aos.relock", whose end puts it back after an unlock.
/// Only in builds with family_controls on.
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        let name = activity.rawValue
        if name == "aos.block" || name.hasPrefix("aos.w.") { BlockStore.shield() }
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        let name = activity.rawValue
        if name == "aos.relock" { BlockStore.shield() }
        else if name == "aos.block" || name.hasPrefix("aos.w.") { BlockStore.unshield() }
    }
}
