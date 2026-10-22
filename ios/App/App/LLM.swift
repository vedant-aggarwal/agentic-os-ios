import Capacitor
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Apple's on-device model (iOS 26, Apple Intelligence phones): free and offline, for routing scans and captures
/// and quick parsing when the PC is out of reach.
/// JS: AosLLM.status() -> { available, reason? }, respond({ prompt, instructions?, schema?, temperature?, maxTokens? })
/// -> { text } or, with a JSON schema, { json }. The schema supports object, array, string (enum), number, integer, boolean.
@objc(AosLLMPlugin)
public class AosLLMPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosLLMPlugin"
    public let jsName = "AosLLM"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "respond", returnType: CAPPluginReturnPromise),
    ]

    @objc func status(_ call: CAPPluginCall) {
        let s = OnDevice.status()
        if s["available"] as? Bool == true { call.ok(s) } else { call.off(s["reason"] as? String ?? "ios") }
    }

    @objc func respond(_ call: CAPPluginCall) {
        guard let prompt = call.text("prompt") else { return call.fail("Send { prompt }.") }
        let s = OnDevice.status()
        guard s["available"] as? Bool == true else { return call.off(s["reason"] as? String ?? "ios") }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let instructions = call.text("instructions") ?? "You are a careful assistant inside a personal planning app. Answer briefly."
            let temperature = call.number("temperature")
            let maxTokens: Int? = call.number("maxTokens") == nil ? nil : call.integer("maxTokens", 512, 16...8192)
            let schema = call.object("schema")
            Task {
                do {
                    let out = try await OnDevice.respond(prompt: prompt, instructions: instructions, schema: schema,
                                                         temperature: temperature, maxTokens: maxTokens)
                    call.ok(out)
                } catch {
                    call.fail(error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.off("ios")
    }
}

enum OnDevice {
    static func status() -> [String: Any] {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return ["available": true]
            case .unavailable(let why):
                switch why {
                case .deviceNotEligible: return ["available": false, "reason": "device"]
                case .appleIntelligenceNotEnabled: return ["available": false, "reason": "off"]
                case .modelNotReady: return ["available": false, "reason": "notReady"]
                @unknown default: return ["available": false, "reason": "device"]
                }
            }
        }
        #endif
        return ["available": false, "reason": "ios"]
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    static func respond(prompt: String, instructions: String, schema: [String: Any]?, temperature: Double?, maxTokens: Int?) async throws -> [String: Any] {
        let session = LanguageModelSession(model: .default, tools: [], instructions: instructions)
        let options = GenerationOptions(sampling: nil, temperature: temperature, maximumResponseTokens: maxTokens)
        if let schema {
            var names = 0
            let root = dynamic(schema, name: "Answer", counter: &names)
            let generation = try GenerationSchema(root: root, dependencies: [])
            let r = try await session.respond(to: prompt, schema: generation, includeSchemaInPrompt: true, options: options)
            let json = r.content.jsonString
            let parsed = json.data(using: .utf8).flatMap { try? JSONSerialization.jsonObject(with: $0, options: [.fragmentsAllowed]) }
            return ["json": parsed ?? NSNull(), "text": json]
        }
        let r = try await session.respond(to: prompt, options: options)
        return ["text": r.content]
    }

    /// A JSON schema (the subset the model can follow) as a DynamicGenerationSchema.
    @available(iOS 26.0, *)
    static func dynamic(_ s: [String: Any], name: String, counter: inout Int) -> DynamicGenerationSchema {
        let description = s["description"] as? String
        if let options = s["enum"] as? [Any] {
            counter += 1
            return DynamicGenerationSchema(name: "\(name)\(counter)", description: description,
                                           anyOf: options.map { "\($0)" })
        }
        switch s["type"] as? String {
        case "object":
            let props = s["properties"] as? [String: Any] ?? [:]
            let required = Set((s["required"] as? [Any])?.compactMap { $0 as? String } ?? Array(props.keys))
            let ordered = props.keys.sorted()
            let properties: [DynamicGenerationSchema.Property] = ordered.compactMap { key in
                guard let sub = props[key] as? [String: Any] else { return nil }
                return DynamicGenerationSchema.Property(name: key, description: sub["description"] as? String,
                                                        schema: dynamic(sub, name: key.capitalized, counter: &counter),
                                                        isOptional: !required.contains(key))
            }
            counter += 1
            return DynamicGenerationSchema(name: "\(name)\(counter)", description: description, properties: properties)
        case "array":
            let items = s["items"] as? [String: Any] ?? ["type": "string"]
            let min = (s["minItems"] as? NSNumber)?.intValue
            let max = (s["maxItems"] as? NSNumber)?.intValue
            return DynamicGenerationSchema(arrayOf: dynamic(items, name: "\(name)Item", counter: &counter),
                                           minimumElements: min, maximumElements: max)
        case "integer":
            return DynamicGenerationSchema(type: Int.self)
        case "number":
            return DynamicGenerationSchema(type: Double.self)
        case "boolean":
            return DynamicGenerationSchema(type: Bool.self)
        default:
            return DynamicGenerationSchema(type: String.self)
        }
    }
    #endif
}
