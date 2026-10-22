import SwiftUI
import UIKit

/// The Agentic OS keyboard: our own UI over the whole keyboard area (dictation, Rewrite, Reply).
/// Keyboards can't record audio, so the mic hands off to the app (FlowRecorder) and inserts the text it sends back.
final class KeyboardViewController: UIInputViewController {
    private var model: KeyboardModel!
    private var host: UIHostingController<KeyboardRoot>?
    private var heightConstraint: NSLayoutConstraint?

    override func viewDidLoad() {
        super.viewDidLoad()
        model = KeyboardModel(host: self)
        let root = UIHostingController(rootView: KeyboardRoot(model: model))
        root.view.backgroundColor = .clear
        root.view.translatesAutoresizingMaskIntoConstraints = false
        if #available(iOS 16.4, *) { root.safeAreaRegions = [] }
        addChild(root)
        view.addSubview(root.view)
        NSLayoutConstraint.activate([
            root.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            root.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            root.view.topAnchor.constraint(equalTo: view.topAnchor),
            root.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        root.didMove(toParent: self)
        host = root
        let h = view.heightAnchor.constraint(equalToConstant: 316)
        h.priority = UILayoutPriority(999)
        h.isActive = true
        heightConstraint = h
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if hasFullAccess { Shared.keyboardSeen = Date().timeIntervalSince1970 }
        model.appeared()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        model.disappeared()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        model.textChanged()
    }

    // MARK: What the model needs from the controller

    var proxy: UITextDocumentProxy { textDocumentProxy }
    var fullAccess: Bool { hasFullAccess }
    var showsGlobe: Bool { needsInputModeSwitchKey }
    func nextKeyboard() { advanceToNextInputMode() }

    /// Opens a URL from a keyboard: walk the responder chain to the UIApplication and call
    /// openURL:options:completionHandler: on it (the plain openURL: selector stopped working in iOS 18).
    @discardableResult
    func open(_ url: URL) -> Bool {
        let sel = NSSelectorFromString("openURL:options:completionHandler:")
        guard let appClass = NSClassFromString("UIApplication") else { return false }
        var r: UIResponder? = self
        while let cur = r {
            if cur.isKind(of: appClass), cur.responds(to: sel) {
                typealias Open = @convention(c) (NSObject, Selector, NSURL, NSDictionary, OpaquePointer?) -> Void
                let fn = unsafeBitCast(cur.method(for: sel), to: Open.self)
                fn(cur, sel, url as NSURL, NSDictionary(), nil)
                return true
            }
            r = cur.next
        }
        // Fallback: extensionContext works for some hosts.
        extensionContext?.open(url, completionHandler: nil)
        return false
    }
}
