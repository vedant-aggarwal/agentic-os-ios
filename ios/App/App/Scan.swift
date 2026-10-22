import AVFoundation
import Capacitor
import PhotosUI
import UIKit
import Vision
import VisionKit

/// The camera and scanning for Scan (receipts, statements, food, handwritten pages, books).
/// JS: AosScan.photo({ source: camera | library, maxSize = 1600, quality = 0.8, ocr = false, barcodes = false }),
/// document({ ocr = true, maxSize = 2000, quality = 0.8 }), text({ image }), barcode({ types }), classify({ image }).
/// photo({ classify: true }) adds the same first guess (receipt, document, book, food, face, screenshot, photo).
/// Images come back as JPEG base64 (no data: prefix). Text lines carry boxes (0-1, top-left origin).
@objc(AosScanPlugin)
public class AosScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosScanPlugin"
    public let jsName = "AosScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "photo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "document", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "text", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "barcode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "classify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]
    private var session: AnyObject?   // the delegate of the sheet that's up

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.ok(["camera": UIImagePickerController.isSourceTypeAvailable(.camera),
                     "cameraPermission": AosScanPlugin.cameraPermission(),
                     "document": VNDocumentCameraViewController.isSupported,
                     "liveScanner": DataScannerViewController.isSupported])
        }
    }

    static func cameraPermission() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "prompt"
        }
    }

    /// Asks for the camera once; false when he said no (the result says so, and Settings is the way back).
    static func withCamera(_ then: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: then(true)
        case .notDetermined: AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { then(ok) } }
        default: then(false)
        }
    }

    @objc func photo(_ call: CAPPluginCall) {
        let opts = ImageOptions(call, maxSize: 1600)
        let library = call.text("source") == "library"
        DispatchQueue.main.async {
            if library {
                var cfg = PHPickerConfiguration()
                cfg.filter = .images
                cfg.selectionLimit = 1
                let picker = PHPickerViewController(configuration: cfg)
                let d = LibraryDelegate { [weak self] image in
                    self?.session = nil
                    guard let image else { return call.fail("Nothing picked.", cancelled: true) }
                    Self.finish(image, opts, call)
                }
                picker.delegate = d
                self.session = d
                if !Presenter.present(picker) { call.fail("The app isn't ready to show the library.") }
                return
            }
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return call.off("device", ["error": "No camera."]) }
            Self.withCamera { ok in
                guard ok else { return call.off("denied", ["error": "The camera is off for Agentic OS. Turn it on in Settings."]) }
                let picker = UIImagePickerController()
                picker.sourceType = .camera
                picker.cameraCaptureMode = .photo
                let d = CameraDelegate { [weak self] image in
                    self?.session = nil
                    guard let image else { return call.fail("No photo taken.", cancelled: true) }
                    Self.finish(image, opts, call)
                }
                picker.delegate = d
                self.session = d
                if !Presenter.present(picker) { call.fail("The app isn't ready to show the camera.") }
            }
        }
    }

    @objc func document(_ call: CAPPluginCall) {
        let opts = ImageOptions(call, maxSize: 2000, ocrDefault: true)
        DispatchQueue.main.async {
            guard VNDocumentCameraViewController.isSupported else { return call.off("device", ["error": "Document scanning needs a newer iPhone."]) }
            Self.withCamera { ok in
                guard ok else { return call.off("denied", ["error": "The camera is off for Agentic OS. Turn it on in Settings."]) }
                let vc = VNDocumentCameraViewController()
                let d = DocumentDelegate { [weak self] images in
                    self?.session = nil
                    guard !images.isEmpty else { return call.fail("Nothing scanned.", cancelled: true) }
                    DispatchQueue.global(qos: .userInitiated).async {
                        var pages: [[String: Any]] = []
                        var all: [String] = []
                        for img in images {
                            var page = Self.encode(img, opts)
                            if opts.ocr, let cg = img.cgImage {
                                let read = OCR.read(cg, orientation: CGImagePropertyOrientation(img.imageOrientation))
                                page["text"] = read.text
                                page["lines"] = read.lines
                                all.append(read.text)
                            }
                            pages.append(page)
                        }
                        call.ok(["pages": pages, "text": all.joined(separator: "\n\n"), "count": pages.count])
                    }
                }
                vc.delegate = d
                self.session = d
                if !Presenter.present(vc) { call.fail("The app isn't ready to show the scanner.") }
            }
        }
    }

    @objc func text(_ call: CAPPluginCall) {
        guard let b64 = call.text("image"), let image = Self.image(fromBase64: b64), let cg = image.cgImage else {
            return call.fail("Send { image } as JPEG or PNG base64.")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let read = OCR.read(cg, orientation: CGImagePropertyOrientation(image.imageOrientation))
            var out: [String: Any] = ["text": read.text, "lines": read.lines]
            if call.flag("barcodes", false) { out["barcodes"] = OCR.barcodes(cg, orientation: CGImagePropertyOrientation(image.imageOrientation)) }
            call.ok(out)
        }
    }

    /// What a photo probably is, offline: { guess, labels, faces, text, textLines, barcodes }.
    @objc func classify(_ call: CAPPluginCall) {
        guard let b64 = call.text("image"), let image = Self.image(fromBase64: b64), let cg = image.cgImage else {
            return call.fail("Send { image } as JPEG or PNG base64.")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            call.ok(OCR.classify(cg, orientation: CGImagePropertyOrientation(image.imageOrientation)))
        }
    }

    /// The live barcode scanner (a book's ISBN is ean13); without it, a photo read for barcodes.
    @objc func barcode(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            Self.withCamera { ok in
                guard ok else { return call.off("denied", ["error": "The camera is off for Agentic OS. Turn it on in Settings."]) }
                guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
                    return self.barcodeFromPhoto(call)
                }
                let scanner = DataScannerViewController(recognizedDataTypes: [.barcode()], qualityLevel: .balanced,
                                                        recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
                                                        isPinchToZoomEnabled: true, isGuidanceEnabled: true, isHighlightingEnabled: true)
                let nav = UINavigationController(rootViewController: scanner)
                let d = ScannerDelegate { [weak self] value, type in
                    self?.session = nil
                    nav.dismiss(animated: true)
                    guard let value else { return call.fail("Nothing scanned.", cancelled: true) }
                    call.ok(["value": value, "type": type ?? "unknown"])
                }
                scanner.delegate = d
                scanner.navigationItem.title = "Scan a barcode"
                scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .cancel, primaryAction: UIAction { _ in d.finish(nil, nil) })
                nav.presentationController?.delegate = d
                self.session = d
                guard Presenter.present(nav) else { return call.fail("The app isn't ready to show the scanner.") }
                try? scanner.startScanning()
            }
        }
    }

    private func barcodeFromPhoto(_ call: CAPPluginCall) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return call.off("device", ["error": "No camera."]) }
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        let d = CameraDelegate { [weak self] image in
            self?.session = nil
            guard let image, let cg = image.cgImage else { return call.fail("No photo taken.", cancelled: true) }
            let codes = OCR.barcodes(cg, orientation: CGImagePropertyOrientation(image.imageOrientation))
            guard let first = codes.first else { return call.fail("No barcode in that photo.") }
            call.ok(["value": first["value"] ?? "", "type": first["type"] ?? "unknown", "all": codes])
        }
        picker.delegate = d
        session = d
        if !Presenter.present(picker) { call.fail("The app isn't ready to show the camera.") }
    }

    // MARK: Images

    struct ImageOptions {
        var maxSize: CGFloat
        var quality: CGFloat
        var ocr: Bool
        var barcodes: Bool
        var classify: Bool
        init(_ call: CAPPluginCall, maxSize: CGFloat, ocrDefault: Bool = false) {
            self.maxSize = CGFloat(min(max(call.number("maxSize") ?? Double(maxSize), 320), 4096))
            self.quality = CGFloat(min(max(call.number("quality") ?? 0.8, 0.3), 1))
            self.ocr = call.flag("ocr", ocrDefault)
            self.barcodes = call.flag("barcodes", false)
            self.classify = call.flag("classify", false)
        }
    }

    static func finish(_ image: UIImage, _ o: ImageOptions, _ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            var out = encode(image, o)
            if let cg = image.cgImage {
                let orient = CGImagePropertyOrientation(image.imageOrientation)
                if o.ocr {
                    let read = OCR.read(cg, orientation: orient)
                    out["text"] = read.text
                    out["lines"] = read.lines
                }
                if o.barcodes { out["barcodes"] = OCR.barcodes(cg, orientation: orient) }
                if o.classify { out["classify"] = OCR.classify(cg, orientation: orient) }
            }
            call.ok(out)
        }
    }

    /// Scaled to fit maxSize, upright, as JPEG base64.
    static func encode(_ image: UIImage, _ o: ImageOptions) -> [String: Any] {
        let size = image.size
        let scale = min(1, o.maxSize / max(size.width, size.height, 1))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let scaled = UIGraphicsImageRenderer(size: target, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
        let data = scaled.jpegData(compressionQuality: o.quality) ?? Data()
        return ["image": data.base64EncodedString(), "width": Int(target.width), "height": Int(target.height),
                "bytes": data.count, "mime": "image/jpeg"]
    }

    static func image(fromBase64 s: String) -> UIImage? {
        let raw = s.range(of: "base64,").map { String(s[$0.upperBound...]) } ?? s
        return Data(base64Encoded: raw, options: .ignoreUnknownCharacters).flatMap(UIImage.init(data:))
    }
}

// MARK: Vision

enum OCR {
    /// Accurate text recognition with language correction; lines top to bottom.
    static func read(_ image: CGImage, orientation: CGImagePropertyOrientation) -> (text: String, lines: [[String: Any]]) {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.automaticallyDetectsLanguage = true
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        do { try handler.perform([request]) } catch { return ("", []) }
        let found = (request.results ?? []).compactMap { obs -> (String, Float, CGRect)? in
            guard let best = obs.topCandidates(1).first else { return nil }
            return (best.string, best.confidence, obs.boundingBox)
        }
        // Vision boxes start at the bottom left; the web layer wants top-left.
        let sorted = found.sorted { a, b in
            abs(a.2.midY - b.2.midY) > 0.01 ? a.2.midY > b.2.midY : a.2.minX < b.2.minX
        }
        let lines: [[String: Any]] = sorted.map { t in
            ["text": t.0, "confidence": (Double(t.1) * 100).rounded() / 100,
             "box": ["x": Double(t.2.minX), "y": Double(1 - t.2.maxY), "w": Double(t.2.width), "h": Double(t.2.height)]]
        }
        return (sorted.map { $0.0 }.joined(separator: "\n"), lines)
    }

    /// A first guess at what a photo is, on the phone and offline, so Scan can route it before the PC sees it:
    /// labels (Vision's classifier), faces, text and barcodes, and a guess of receipt, document, book, food, face,
    /// screenshot or photo. The guess is a heuristic; the labels are there for the app to decide differently.
    static func classify(_ image: CGImage, orientation: CGImagePropertyOrientation) -> [String: Any] {
        let labelsReq = VNClassifyImageRequest()
        let facesReq = VNDetectFaceRectanglesRequest()
        let textReq = VNRecognizeTextRequest()
        textReq.recognitionLevel = .fast
        let codesReq = VNDetectBarcodesRequest()
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        try? handler.perform([labelsReq, facesReq, textReq, codesReq])
        let labels = (labelsReq.results ?? []).filter { $0.confidence >= 0.1 }.prefix(10)
            .map { ["id": $0.identifier, "confidence": (Double($0.confidence) * 100).rounded() / 100] as [String: Any] }
        let faces = facesReq.results?.count ?? 0
        let lines = (textReq.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        let text = lines.joined(separator: "\n")
        let codes = (codesReq.results ?? []).compactMap { b -> [String: Any]? in
            guard let v = b.payloadStringValue else { return nil }
            return ["value": v, "type": symbology(b.symbology)]
        }
        let ids = Set(labels.compactMap { $0["id"] as? String })
        let foodWords: Set<String> = ["food", "dish", "meal", "fruit", "vegetable", "dessert", "bread", "rice", "salad", "drink", "beverage", "snack", "baked_goods", "curry"]
        let money = text.range(of: #"(₹|\bRs\.?|\bINR\b|\bTOTAL\b|\bTotal\b|\bGST\b|\bAmount\b)"#, options: .regularExpression) != nil
        let guess: String
        if codes.contains(where: { ($0["type"] as? String) == "ean13" && (($0["value"] as? String)?.hasPrefix("978") == true || ($0["value"] as? String)?.hasPrefix("979") == true) }) {
            guess = "book"
        } else if lines.count >= 5 && money {
            guess = "receipt"
        } else if !ids.isDisjoint(with: foodWords) && lines.count < 5 {
            guess = "food"
        } else if faces > 0 && lines.count < 4 {
            guess = "face"
        } else if ids.contains("screenshot") {
            guess = "screenshot"
        } else if lines.count >= 5 || ids.contains("document") || ids.contains("paper") {
            guess = "document"
        } else {
            guess = "photo"
        }
        return ["guess": guess, "labels": Array(labels), "faces": faces, "text": text, "textLines": lines.count, "barcodes": codes]
    }

    static func barcodes(_ image: CGImage, orientation: CGImagePropertyOrientation) -> [[String: Any]] {
        let request = VNDetectBarcodesRequest()
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        do { try handler.perform([request]) } catch { return [] }
        return (request.results ?? []).compactMap { b in
            guard let v = b.payloadStringValue else { return nil }
            return ["value": v, "type": symbology(b.symbology)]
        }
    }

    static func symbology(_ s: VNBarcodeSymbology) -> String {
        switch s {
        case .ean13: return "ean13"
        case .ean8: return "ean8"
        case .qr: return "qr"
        case .upce: return "upce"
        case .code128: return "code128"
        case .code39: return "code39"
        case .pdf417: return "pdf417"
        case .aztec: return "aztec"
        case .dataMatrix: return "datamatrix"
        case .itf14: return "itf14"
        default: return s.rawValue.replacingOccurrences(of: "VNBarcodeSymbology", with: "").lowercased()
        }
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

// MARK: Sheet delegates (each answers once)

final class CameraDelegate: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private var done: ((UIImage?) -> Void)?
    init(_ done: @escaping (UIImage?) -> Void) { self.done = done }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let image = info[.originalImage] as? UIImage
        picker.dismiss(animated: true)
        done?(image); done = nil
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        done?(nil); done = nil
    }
}

final class LibraryDelegate: NSObject, PHPickerViewControllerDelegate {
    private var done: ((UIImage?) -> Void)?
    init(_ done: @escaping (UIImage?) -> Void) { self.done = done }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
            done?(nil); done = nil
            return
        }
        let finish = done
        done = nil
        provider.loadObject(ofClass: UIImage.self) { obj, _ in
            DispatchQueue.main.async { finish?(obj as? UIImage) }
        }
    }
}

final class DocumentDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
    private var done: (([UIImage]) -> Void)?
    init(_ done: @escaping ([UIImage]) -> Void) { self.done = done }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
        controller.dismiss(animated: true)
        done?(images); done = nil
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        done?([]); done = nil
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true)
        done?([]); done = nil
    }
}

final class ScannerDelegate: NSObject, DataScannerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private var done: ((String?, String?) -> Void)?
    init(_ done: @escaping (String?, String?) -> Void) { self.done = done }

    func finish(_ value: String?, _ type: String?) {
        done?(value, type)
        done = nil
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case .barcode(let code) = item, let value = code.payloadStringValue {
                dataScanner.stopScanning()
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                finish(value, OCR.symbology(code.observation.symbology))
                return
            }
        }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish(nil, nil)
    }
}
