import Capacitor
import Speech
import AVFoundation

/// On-device speech to text for the Ask bar. Hold + (or tap the mic), talk, let go.
/// JS: Capacitor.Plugins.Speech.start({ locale }), listener "partial" { text }, stop() -> { text }.
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var text = ""

    @objc func start(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.reject("Speech recognition is off for Agentic OS. Turn it on in Settings.")
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async {
                    guard granted else {
                        call.reject("The microphone is off for Agentic OS. Turn it on in Settings.")
                        return
                    }
                    self.begin(call)
                }
            }
        }
    }

    private func begin(_ call: CAPPluginCall) {
        FlowRecorder.shared.release()
        finish()
        let locale = Locale(identifier: call.getString("locale") ?? "en-IN")
        guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(), recognizer.isAvailable else {
            call.reject("Speech isn't available right now.")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            // Stays on the phone when the device supports it.
            if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
            request = req
            text = ""

            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                req.append(buffer)
            }
            engine.prepare()
            try engine.start()

            task = recognizer.recognitionTask(with: req) { [weak self] result, error in
                guard let self = self else { return }
                if let result = result {
                    self.text = result.bestTranscription.formattedString
                    self.notifyListeners("partial", data: ["text": self.text, "final": result.isFinal])
                }
                if error != nil || (result?.isFinal ?? false) {
                    self.stopAudio()
                }
            }
            call.resolve()
        } catch {
            finish()
            call.reject("The microphone didn't start.")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        let said = text
        finish()
        call.resolve(["text": said])
    }

    private func stopAudio() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
    }

    private func finish() {
        stopAudio()
        task?.cancel()
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// The app's bridge: registers plugins that live in the app target.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(NativePlugin())
        for plugin in AosPlugins.all() { bridge?.registerPluginInstance(plugin) }
    }
}
