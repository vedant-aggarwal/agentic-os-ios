import ActivityKit
import UIKit

/// The agents on the PC as a Live Activity (AgenticWidgets/WorkActivity.swift). The PC pushes every change and can
/// start it by push (iOS 17.2+); when the app comes to the front it also asks the PC (/work/activity) and starts or
/// updates it itself, which covers a phone the PC has no start token for yet.
/// Tokens go to the PC as /devices kinds "workstart" (start by push) and "work" (this activity's updates).
final class LiveWork {
    static let shared = LiveWork()
    private var current: Activity<WorkActivityAttributes>?
    private var watchers: [Task<Void, Never>] = []
    private var activityToken: String?
    private var startToken: String?
    private var refreshing = false
    private var off: Bool {
        get { UserDefaults.standard.bool(forKey: "livework.off") }
        set { UserDefaults.standard.set(newValue, forKey: "livework.off") }
    }

    func observe() {
        for a in Activity<WorkActivityAttributes>.activities { adopt(a) }
        Task { for await a in Activity<WorkActivityAttributes>.activityUpdates { DispatchQueue.main.async { self.adopt(a) } } }
        if #available(iOS 17.2, *) {
            Task {
                for await t in Activity<WorkActivityAttributes>.pushToStartTokenUpdates {
                    let hex = t.hex
                    DispatchQueue.main.async { self.startToken = hex }
                    NativeHub.shared.postDevice("workstart", hex)
                }
            }
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            self.refresh()
        }
    }

    func repost() {
        if let t = startToken { NativeHub.shared.postDevice("workstart", t) }
        if let t = activityToken { NativeHub.shared.postDevice("work", t) }
        refresh()
    }

    private func adopt(_ a: Activity<WorkActivityAttributes>) {
        if let old = current {
            if old.id == a.id { return }
            Task { await old.end(nil, dismissalPolicy: .immediate) }
        }
        current = a
        watchers.forEach { $0.cancel() }
        watchers = [
            Task {
                for await t in a.pushTokenUpdates {
                    let hex = t.hex
                    DispatchQueue.main.async { self.activityToken = hex }
                    NativeHub.shared.postDevice("work", hex)
                }
            },
            Task {
                for await s in a.activityStateUpdates where s == .dismissed || s == .ended {
                    let dismissed = s == .dismissed
                    DispatchQueue.main.async {
                        // Swiped away while agents are busy: stay off until they all settle.
                        if dismissed { self.off = true }
                        if let t = self.activityToken { NativeHub.shared.postDevice("work", t, extra: ["end": true, "dismissed": dismissed]) }
                        if self.current?.id == a.id { self.current = nil; self.activityToken = nil }
                    }
                }
            },
        ]
    }

    /// Ask the PC what the agents are doing and bring the activity in line. Owner only on the PC; others get 403 and nothing shows.
    func refresh() {
        guard !refreshing, Shared.token != nil else { return }
        refreshing = true
        Task {
            let (code, data) = await Shared.request("/work/activity", timeout: 10)
            let state = code == 200 ? data.flatMap { try? JSONDecoder().decode(WorkState.self, from: $0) } : nil
            await MainActor.run {
                self.refreshing = false
                if let state { self.apply(state) }
            }
        }
    }

    private func apply(_ state: WorkState) {
        if !state.active { off = false }
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(6 * 3600), relevanceScore: state.needs > 0 ? 100 : 60)
        if let live = current, live.activityState == .active {
            Task {
                if state.active { await live.update(content) }
                else { await live.end(content, dismissalPolicy: .after(Date().addingTimeInterval(10 * 60))) }
            }
        } else if state.active, !off, ActivityAuthorizationInfo().areActivitiesEnabled {
            if let a = try? Activity.request(attributes: WorkActivityAttributes(started: Date().timeIntervalSince1970), content: content, pushType: .token) {
                adopt(a)
            }
        }
    }
}
