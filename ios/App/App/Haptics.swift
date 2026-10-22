import AudioToolbox
import AVFoundation
import Capacitor
import CoreHaptics
import UIKit

/// Haptics for the web layer and the breathing programme the orb starts when he holds it.
/// JS: AosHaptics.play({ name }), breathe({ pattern, cycles, voice, sound, activity, title }), stop(), state().
/// Events (on Native): "breath" { id, phase, label, s, cycle, cycles, endsAt } at each phase, then { phase: "done" }.
@objc(AosHapticsPlugin)
public class AosHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosHapticsPlugin"
    public let jsName = "AosHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "breathe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
    ]

    @objc func play(_ call: CAPPluginCall) {
        let name = call.text("name") ?? "tick"
        DispatchQueue.main.async {
            Haptic.shared.play(name)
            call.ok(["name": name, "engine": Haptic.shared.supported ? "corehaptics" : "system"])
        }
    }

    @objc func breathe(_ call: CAPPluginCall) {
        let programme = BreathProgramme.from(call)
        DispatchQueue.main.async { call.ok(Breath.shared.start(programme)) }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.ok(Breath.shared.stop(reason: "stopped")) }
    }

    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.ok(Breath.shared.state) }
    }
}

// MARK: Named patterns

final class Haptic {
    static let shared = Haptic()
    let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private var engine: CHHapticEngine?
    private var running = false

    private func ready() -> CHHapticEngine? {
        guard supported else { return nil }
        if engine == nil {
            guard let e = try? CHHapticEngine() else { return nil }
            e.playsHapticsOnly = true
            e.isAutoShutdownEnabled = true
            e.stoppedHandler = { [weak self] _ in DispatchQueue.main.async { self?.running = false } }
            e.resetHandler = { [weak self] in DispatchQueue.main.async { self?.running = false } }
            engine = e
        }
        if !running {
            do { try engine?.start(); running = true } catch { return nil }
        }
        return engine
    }

    /// Plays a named pattern. seconds stretches the breathing swells over the phase. Main thread.
    func play(_ name: String, seconds: Double? = nil) {
        let foreground = UIApplication.shared.applicationState == .active
        if foreground, let pat = Haptic.pattern(name, seconds: seconds), let e = ready(),
           let pattern = try? CHHapticPattern(events: pat.0, parameterCurves: pat.1),
           let player = try? e.makePlayer(with: pattern),
           (try? player.start(atTime: CHHapticTimeImmediate)) != nil {
            return
        }
        fallback(name, foreground: foreground)
    }

    /// Phones without Core Haptics use the feedback generators; in the background (screen off) only the
    /// system buzz reaches him.
    private func fallback(_ name: String, foreground: Bool) {
        guard foreground else {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            return
        }
        switch name {
        case "success", "ring-close", "done": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "selection", "tick": UISelectionFeedbackGenerator().selectionChanged()
        case "heavy", "heartbeat", "breathe-in": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "medium", "breathe-hold", "breathe-out": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    static let names = ["breathe-in", "breathe-hold", "breathe-out", "breathe-rest", "ring-close", "success", "warning",
                        "tick", "heartbeat", "light", "medium", "heavy", "selection", "error", "done"]

    private static func tap(_ t: Double, _ i: Float, _ s: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticTransient,
                      parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: i),
                                   CHHapticEventParameter(parameterID: .hapticSharpness, value: s)],
                      relativeTime: t)
    }

    private static func hum(_ t: Double, _ d: Double, _ i: Float, _ s: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticContinuous,
                      parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: i),
                                   CHHapticEventParameter(parameterID: .hapticSharpness, value: s)],
                      relativeTime: t, duration: d)
    }

    private static func curve(_ id: CHHapticDynamicParameter.ID, _ points: [(Double, Float)]) -> CHHapticParameterCurve {
        CHHapticParameterCurve(parameterID: id,
                               controlPoints: points.map { CHHapticParameterCurve.ControlPoint(relativeTime: $0.0, value: $0.1) },
                               relativeTime: 0)
    }

    /// The patterns. Breathing: a swell marks the start of a breath in (rising) and out (falling) and fades into
    /// a faint texture through the phase; a hold is two soft taps.
    static func pattern(_ name: String, seconds: Double?) -> ([CHHapticEvent], [CHHapticParameterCurve])? {
        switch name {
        case "breathe-in":
            let d = min(max(seconds ?? 1.4, 0.8), 10)
            return ([hum(0, d, 1, 0.3)],
                    [curve(.hapticIntensityControl, [(0, 0.15), (min(0.55, d * 0.35), 0.62), (min(1.2, d * 0.6), 0.2), (d, 0.12)]),
                     curve(.hapticSharpnessControl, [(0, 0.1), (d, 0.5)])])
        case "breathe-out":
            let d = min(max(seconds ?? 1.4, 0.8), 12)
            return ([hum(0, d, 1, 0.3)],
                    [curve(.hapticIntensityControl, [(0, 0.6), (min(0.6, d * 0.35), 0.28), (d, 0.05)]),
                     curve(.hapticSharpnessControl, [(0, 0.45), (d, 0.08)])])
        case "breathe-hold":
            return ([tap(0, 0.5, 0.3), tap(0.14, 0.4, 0.25)], [])
        case "breathe-rest":
            return ([tap(0, 0.35, 0.2)], [])
        case "ring-close":
            return ([tap(0, 1.0, 0.75), hum(0.02, 0.2, 0.4, 0.15)],
                    [curve(.hapticIntensityControl, [(0.02, 1), (0.22, 0)])])
        case "success", "done":
            return ([tap(0, 0.5, 0.45), tap(0.11, 0.75, 0.6), tap(0.22, 1.0, 0.7)], [])
        case "warning":
            return ([tap(0, 0.8, 0.6), tap(0.16, 0.8, 0.6), tap(0.32, 0.8, 0.6)], [])
        case "error":
            return ([tap(0, 1.0, 0.9), tap(0.1, 0.55, 0.3), tap(0.2, 1.0, 0.9)], [])
        case "tick":
            return ([tap(0, 0.45, 0.9)], [])
        case "selection":
            return ([tap(0, 0.35, 0.8)], [])
        case "heartbeat":
            return ([tap(0, 0.9, 0.15), tap(0.16, 0.55, 0.1), tap(0.9, 0.9, 0.15), tap(1.06, 0.55, 0.1)], [])
        case "light":
            return ([tap(0, 0.4, 0.4)], [])
        case "medium":
            return ([tap(0, 0.65, 0.5)], [])
        case "heavy":
            return ([tap(0, 1.0, 0.6)], [])
        default:
            return nil
        }
    }
}

// MARK: The breathing programme

struct BreathPhase {
    var phase: String            // in, hold, out, rest
    var seconds: Double

    var label: String {
        switch phase {
        case "in": return "Breathe in"
        case "out": return "Breathe out"
        case "rest": return "Hold"
        default: return "Hold"
        }
    }
    var haptic: String {
        switch phase {
        case "in": return "breathe-in"
        case "out": return "breathe-out"
        case "rest": return "breathe-rest"
        default: return "breathe-hold"
        }
    }
}

struct BreathProgramme {
    var phases: [BreathPhase]
    var cycles: Int
    var pattern: String
    var title: String
    var voice: Bool
    var sound: Bool
    var activity: Bool

    static func preset(_ name: String) -> [BreathPhase] {
        switch name {
        case "box": return [BreathPhase(phase: "in", seconds: 4), BreathPhase(phase: "hold", seconds: 4),
                            BreathPhase(phase: "out", seconds: 4), BreathPhase(phase: "rest", seconds: 4)]
        case "478": return [BreathPhase(phase: "in", seconds: 4), BreathPhase(phase: "hold", seconds: 7),
                            BreathPhase(phase: "out", seconds: 8)]
        default: return [BreathPhase(phase: "in", seconds: 4), BreathPhase(phase: "hold", seconds: 4),
                         BreathPhase(phase: "out", seconds: 6)]
        }
    }

    /// pattern: "calm" (in 4, hold 4, out 6), "box" (4-4-4-4), "478", or [{ phase, s }].
    static func from(_ call: CAPPluginCall) -> BreathProgramme {
        var phases: [BreathPhase] = []
        var name = call.text("pattern") ?? "calm"
        for p in call.objects("pattern") {
            let phase = (p["phase"] as? String) ?? "hold"
            let s = (p["s"] as? NSNumber)?.doubleValue ?? (p["seconds"] as? NSNumber)?.doubleValue ?? 4
            if ["in", "hold", "out", "rest"].contains(phase), s > 0 { phases.append(BreathPhase(phase: phase, seconds: min(s, 30))) }
        }
        if phases.isEmpty { phases = preset(name) } else { name = "custom" }
        let cycles = call.integer("cycles", 4, 1...40)
        return BreathProgramme(phases: phases, cycles: min(max(cycles, 1), 40), pattern: name,
                               title: call.text("title") ?? "Breathe", voice: call.flag("voice", false),
                               sound: call.flag("sound", true), activity: call.flag("activity", true))
    }
}

/// Runs a breathing session on a timer the screen can't stop: the phases are fixed offsets from the start (no drift),
/// a soft breath sound keeps the app awake with the screen off, each phase change is a haptic (Core Haptics in the
/// foreground, the system buzz when the screen is off), and the lock screen shows the phase (Live Activity).
final class Breath {
    static let shared = Breath()
    private var programme: BreathProgramme?
    private var id = ""
    private var started = Date()
    private var plan: [(phase: BreathPhase, cycle: Int, at: Double)] = []
    private var step = 0
    private var timer: DispatchSourceTimer?
    private let audio = BreathAudio()
    private let speech = AVSpeechSynthesizer()
    private var interruption: NSObjectProtocol?

    var running: Bool { programme != nil }
    private var total: Double { plan.last.map { $0.at + $0.phase.seconds } ?? 0 }
    private var endsAt: Double { started.timeIntervalSince1970 + total }

    var state: [String: Any] {
        guard let p = programme, step > 0, step <= plan.count else { return ["running": false] }
        let cur = plan[step - 1]
        return ["running": true, "id": id, "phase": cur.phase.phase, "label": cur.phase.label, "cycle": cur.cycle,
                "cycles": p.cycles, "pattern": p.pattern, "endsAt": Dates.ms(endsAt),
                "phaseEndsAt": Dates.ms(started.timeIntervalSince1970 + cur.at + cur.phase.seconds)]
    }

    /// Main thread.
    func start(_ p: BreathProgramme) -> [String: Any] {
        if running { _ = stop(reason: "replaced") }
        programme = p
        id = Shared.newId()
        started = Date()
        plan = []
        var t = 0.0
        for c in 1...p.cycles {
            for ph in p.phases {
                plan.append((ph, c, t))
                t += ph.seconds
            }
        }
        step = 0
        FlowRecorder.shared.release()
        audio.start(audible: p.sound)
        interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            let type = (n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap { AVAudioSession.InterruptionType(rawValue: $0) }
            if type == .began { _ = self?.stop(reason: "interrupted") }
        }
        if p.activity { LiveKit.shared.startBreath(title: p.title, pattern: p.pattern) }
        advance()
        return ["id": id, "endsAt": Dates.ms(endsAt), "cycles": p.cycles, "pattern": p.pattern,
                "seconds": total, "phases": p.phases.map { ["phase": $0.phase, "s": $0.seconds] as [String: Any] }]
    }

    @discardableResult
    func stop(reason: String) -> [String: Any] {
        guard let p = programme else { return ["running": false] }
        timer?.cancel()
        timer = nil
        let elapsed = Date().timeIntervalSince(started)
        let cyclesDone = step > 0 ? plan[min(step, plan.count) - 1].cycle - (reason == "complete" ? 0 : 1) : 0
        programme = nil
        audio.stop()
        if let o = interruption { NotificationCenter.default.removeObserver(o) }
        interruption = nil
        speech.stopSpeaking(at: .immediate)
        LiveKit.shared.endBreath(complete: reason == "complete")
        let out: [String: Any] = ["id": id, "phase": "done", "reason": reason, "cycles": max(cyclesDone, 0),
                                  "planned": p.cycles, "seconds": (elapsed * 10).rounded() / 10]
        NativeHub.shared.emit("breath", out, retain: false)
        return out
    }

    /// The next phase begins now: haptic, word, sound, lock screen, event; then the timer for the one after.
    private func advance() {
        guard let p = programme else { return }
        guard step < plan.count else {
            Haptic.shared.play("done")
            if p.voice { say("Well done.") }
            _ = stop(reason: "complete")
            return
        }
        let cur = plan[step]
        step += 1
        let begin = started.timeIntervalSince1970 + cur.at
        let end = begin + cur.phase.seconds
        Haptic.shared.play(cur.phase.haptic, seconds: cur.phase.seconds)
        if p.voice { say(cur.phase.label) }
        audio.phase(cur.phase.phase, seconds: cur.phase.seconds)
        LiveKit.shared.updateBreath(phase: cur.phase.phase, label: cur.phase.label, start: begin, end: end,
                                    cycle: cur.cycle, cycles: p.cycles, endsAt: endsAt)
        NativeHub.shared.emit("breath", ["id": id, "phase": cur.phase.phase, "label": cur.phase.label, "s": cur.phase.seconds,
                                         "cycle": cur.cycle, "cycles": p.cycles, "at": Dates.ms(begin),
                                         "phaseEndsAt": Dates.ms(end), "endsAt": Dates.ms(endsAt)], retain: false)
        let t = DispatchSource.makeTimerSource(queue: .main)
        t.schedule(deadline: .now() + max(0.05, end - Date().timeIntervalSince1970), leeway: .milliseconds(15))
        t.setEventHandler { [weak self] in self?.advance() }
        timer?.cancel()
        timer = t
        t.resume()
    }

    private func say(_ text: String) {
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "en-IN") ?? AVSpeechSynthesisVoice(language: "en-US")
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        u.volume = 0.8
        speech.speak(u)
    }
}

/// A soft breath sound (filtered noise that swells on the breath in and falls on the breath out). It is also what
/// keeps the app running with the screen off (the audio background mode), so with sound off it plays near silence.
final class BreathAudio {
    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private let env = Envelope()
    private var active = false          // only a session this started is ever stopped here

    final class Envelope {
        var level: Float = 0
        var target: Float = 0
        var step: Float = 0
        var gain: Float = 1
        var noise: Float = 0
        var low: Float = 0
    }

    func start(audible: Bool) {
        let session = AVAudioSession.sharedInstance()
        // A call has the audio (Nora's, or the in-app voice loop): breathe on haptics alone, leave the session be.
        if session.mode == .voiceChat || session.mode == .videoChat { return }
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch { return }
        active = true
        env.gain = audible ? 1 : 0.002
        env.level = 0
        env.target = 0.02
        let rate = session.sampleRate > 0 ? session.sampleRate : 44100
        guard let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else { return }
        let e = env
        let node = AVAudioSourceNode { _, _, frameCount, audioBufferList -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            for frame in 0..<Int(frameCount) {
                if abs(e.target - e.level) > abs(e.step) { e.level += e.step } else { e.level = e.target }
                // Brown-ish noise: white noise through two gentle low-passes.
                let white = Float.random(in: -1...1)
                e.noise += 0.02 * (white - e.noise)
                e.low += 0.08 * (e.noise - e.low)
                let v = e.low * 3.2 * e.level * e.gain
                for buffer in buffers {
                    let ptr = UnsafeMutableBufferPointer<Float>(buffer)
                    if frame < ptr.count { ptr[frame] = v }
                }
            }
            return noErr
        }
        source = node
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.9
        do { try engine.start() } catch { stop() }
    }

    /// Ramp the sound over the phase: up on the breath in, down on the breath out, quiet on a hold.
    func phase(_ phase: String, seconds: Double) {
        let rate = Float(AVAudioSession.sharedInstance().sampleRate > 0 ? AVAudioSession.sharedInstance().sampleRate : 44100)
        let frames = max(Float(seconds) * rate, 1)
        let to: Float
        switch phase {
        case "in": to = 0.22
        case "out": to = 0.015
        case "hold": to = env.level > 0.1 ? 0.08 : 0.02
        default: to = 0.015
        }
        env.target = to
        env.step = (to - env.level) / frames
    }

    func stop() {
        guard active else { return }
        active = false
        engine.stop()
        if let s = source { engine.detach(s) }
        source = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
