import ExpoModulesCore

public final class VariableBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VariableBlur")

    View(VariableBlurView.self) {
      Prop("radius") { (view, radius: Double) in
        view.setRadius(CGFloat(radius))
      }

      Prop("curve") { (view, curve: Double) in
        view.setCurve(CGFloat(curve))
      }
    }
  }
}
