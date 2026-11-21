import ExpoModulesCore

public final class VariableBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VariableBlur")

    // JS checks this before asking for a top-edge blur; builds without it fall back to a masked material.
    Constant("supportsEdge") { true }

    View(VariableBlurView.self) {
      Prop("radius") { (view, radius: Double) in
        view.setRadius(CGFloat(radius))
      }

      Prop("curve") { (view, curve: Double) in
        view.setCurve(CGFloat(curve))
      }

      Prop("edge") { (view, edge: String) in
        view.setFromTop(edge == "top")
      }
    }
  }
}
