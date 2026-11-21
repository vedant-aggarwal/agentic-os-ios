import AVFoundation
import ExpoModulesCore
import MediaPlayer
import UIKit

/// Volume button presses, as steps. iOS has no public button events outside camera apps, so this watches the
/// audio session's output volume: every press, and every auto-repeat step while a button is held, moves it.
/// Each step is reported ("up" or "down") and the level is put straight back, so the volume never drifts.
/// A hidden MPVolumeView keeps the system volume HUD from showing and is how the level is put back.
/// iOS moves the level in sixteenths, and the slider does not always land exactly where it is set, so a change
/// smaller than half a step is the reset settling, never a press. Counting those
/// as presses made a feedback loop of fake steps every ~40 ms.
public final class VolumeButtonsModule: Module {
  private var observation: NSKeyValueObservation?
  private var volumeView: MPVolumeView?
  private var baseline: Float = 0.5
  private var original: Float?
  private static let step: Float = 1.0 / 16.0

  public func definition() -> ModuleDefinition {
    Name("VolumeButtons")
    Events("onPress")

    Function("start") {
      DispatchQueue.main.async { self.begin() }
    }

    Function("stop") {
      DispatchQueue.main.async { self.end() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.end() }
    }
  }

  private func begin() {
    guard observation == nil else { return }
    let session = AVAudioSession.sharedInstance()
    // Ambient and mixing: other audio keeps playing, the ring/silent switch is respected.
    try? session.setCategory(.ambient, options: [.mixWithOthers])
    try? session.setActive(true)

    let view = MPVolumeView(frame: CGRect(x: -200, y: -200, width: 100, height: 40))
    view.alpha = 0.01
    view.isUserInteractionEnabled = false
    keyWindow()?.addSubview(view)
    volumeView = view

    let level = session.outputVolume
    original = level
    // On the sixteenths grid, and never at either end, where a press in that direction would not move the level.
    let snapped = min(max((level * 16).rounded() / 16, 3 * Self.step), 13 * Self.step)
    baseline = snapped
    if abs(snapped - level) > 0.001 { setLevel(snapped) }

    observation = session.observe(\.outputVolume, options: [.new]) { [weak self] _, change in
      guard let value = change.newValue else { return }
      DispatchQueue.main.async { self?.changed(value) }
    }
  }

  private func changed(_ value: Float) {
    guard observation != nil else { return }
    // Less than half a step from the baseline: our own reset settling, not a press.
    if abs(value - baseline) < Self.step / 2 { return }
    let button = value > baseline ? "up" : "down"
    sendEvent("onPress", ["button": button, "at": Date().timeIntervalSince1970 * 1000])
    setLevel(baseline)
  }

  private func end() {
    observation?.invalidate()
    observation = nil
    if let level = original { setLevel(level) }
    original = nil
    let view = volumeView
    volumeView = nil
    // the slider needs a moment to apply the restored level before its view goes
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
      view?.removeFromSuperview()
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
  }

  private func setLevel(_ level: Float) {
    guard let slider = volumeView?.subviews.compactMap({ $0 as? UISlider }).first else { return }
    DispatchQueue.main.async {
      slider.setValue(level, animated: false)
      slider.sendActions(for: .valueChanged)
    }
  }

  private func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }
}
