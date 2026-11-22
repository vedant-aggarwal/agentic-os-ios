import AVFoundation
import ExpoModulesCore
import MediaPlayer
import UIKit

/// Volume button presses, as steps. iOS has no public button events outside camera apps, so this watches the
/// audio session's output volume: every press, and every auto-repeat step while a button is held, moves it.
/// Each step is reported ("up" or "down") and the level is put straight back, so the volume never drifts.
/// A hidden MPVolumeView keeps the system volume HUD from showing and is how the level is put back.
public final class VolumeButtonsModule: Module {
  private var observation: NSKeyValueObservation?
  private var volumeView: MPVolumeView?
  private var baseline: Float = 0.5
  private var original: Float?

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
    // Ambient and mixing: other audio keeps playing, the ring/silent switch is respected. But never while the mic is
    // in use (a GPT take, or the keyboard's warm mic): switching to ambient would cut the recording off.
    if !Self.recording(session) {
      try? session.setCategory(.ambient, options: [.mixWithOthers])
      try? session.setActive(true)
    }

    let view = MPVolumeView(frame: CGRect(x: -200, y: -200, width: 100, height: 40))
    view.alpha = 0.01
    view.isUserInteractionEnabled = false
    keyWindow()?.addSubview(view)
    volumeView = view

    let level = session.outputVolume
    original = level
    // At either end a press in that direction would not move the level, so start from the middle.
    if level <= 0.07 || level >= 0.93 {
      baseline = 0.5
      setLevel(0.5)
    } else {
      baseline = level
    }

    observation = session.observe(\.outputVolume, options: [.new]) { [weak self] _, change in
      guard let value = change.newValue else { return }
      DispatchQueue.main.async { self?.changed(value) }
    }
  }

  private func changed(_ value: Float) {
    guard observation != nil else { return }
    if abs(value - baseline) < 0.001 { return } // our own reset
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
      // leave the session alone while something is recording (it keeps going in the background)
      let session = AVAudioSession.sharedInstance()
      if !Self.recording(session) { try? session.setActive(false, options: [.notifyOthersOnDeactivation]) }
    }
  }

  private static func recording(_ session: AVAudioSession) -> Bool {
    session.category == .playAndRecord || session.category == .record
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
