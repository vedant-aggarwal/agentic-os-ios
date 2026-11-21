import ExpoModulesCore
import UIKit

/// Progressive gaussian blur: clear at the top edge, `radius` points at the bottom, the radius ramping as
/// t^curve. It puts the system's variable blur filter (the one iOS draws scroll edge effects with) on a
/// visual effect view's backdrop layer and hides the effect's tint, so there is no frost and no edge.
public final class VariableBlurView: ExpoView {
  private let effectView = BackdropEffectView(effect: UIBlurEffect(style: .regular))
  private var radius: CGFloat = 16
  private var curve: CGFloat = 2

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    effectView.isUserInteractionEnabled = false
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)
  }

  func setRadius(_ value: CGFloat) {
    radius = value
    apply()
  }

  func setCurve(_ value: CGFloat) {
    curve = value
    apply()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    apply()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    // render the backdrop at screen scale, or the clear end looks pixelated
    if let window = window, let backdrop = effectView.subviews.first?.layer {
      backdrop.setValue(window.traitCollection.displayScale, forKey: "scale")
    }
    apply()
  }

  private func apply() {
    guard bounds.width > 0, bounds.height > 0,
          let backdrop = effectView.subviews.first?.layer,
          let filter = VariableBlurView.makeFilter(),
          let mask = VariableBlurView.makeMask(curve: curve) else { return }
    filter.setValue(radius, forKey: "inputRadius")
    filter.setValue(mask, forKey: "inputMaskImage")
    filter.setValue(true, forKey: "inputNormalizeEdges")
    // only the variable blur: no stock blur, saturation or tint
    backdrop.filters = [filter]
    for sub in effectView.subviews.dropFirst() {
      sub.alpha = 0
    }
  }

  /// QuartzCore's filter class is not public; look it up at runtime.
  private static func makeFilter() -> NSObject? {
    guard let filterClass = NSClassFromString("CAFilter") as? NSObject.Type else { return nil }
    let made = filterClass.self.perform(NSSelectorFromString("filterWithType:"), with: "variableBlur")
    return made?.takeUnretainedValue() as? NSObject
  }

  /// Clear at the top, opaque at the bottom, alpha = t^curve. Row 0 of the image is the top.
  private static func makeMask(curve: CGFloat) -> CGImage? {
    let width = 8, height = 256
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    for y in 0..<height {
      let t = CGFloat(y) / CGFloat(height - 1)
      let alpha = UInt8(max(0, min(255, (pow(t, curve) * 255).rounded())))
      for x in 0..<width {
        pixels[(y * width + x) * 4 + 3] = alpha // black, premultiplied: colour channels stay 0
      }
    }
    guard let provider = CGDataProvider(data: Data(pixels) as CFData) else { return nil }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
      provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent
    )
  }
}

/// UIVisualEffectView puts its own filters back on trait changes, and calling super once the backdrop's
/// filters are replaced can crash, so the trait callback is left empty. The host re-applies on layout.
final class BackdropEffectView: UIVisualEffectView {
  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {}
}
