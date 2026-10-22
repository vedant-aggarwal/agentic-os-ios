import Capacitor
import HealthKit

/// Apple Health, read only: steps, sleep, workouts, active energy, resting heart rate, HRV, weight.
/// JS: AosHealth.authorize({ types? }), query({ types, from, to, bucket: day | hour }) ->
/// { data: { steps: [{ start, end, value }], sleep: [{ start, end, stage }], workouts: [...], ... }, units }.
/// Times in and out are milliseconds. Health never says whether reading was refused: a refused type comes back empty.
@objc(AosHealthPlugin)
public class AosHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosHealthPlugin"
    public let jsName = "AosHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "query", returnType: CAPPluginReturnPromise),
    ]
    private let store = HKHealthStore()

    static let all = ["steps", "sleep", "workouts", "activeEnergy", "restingHR", "hrv", "weight"]

    /// The quantity types: identifier, unit, and whether a bucket adds up (sum) or averages.
    static func quantity(_ name: String) -> (HKQuantityType, HKUnit, String, Bool)? {
        switch name {
        case "steps": return (HKQuantityType(.stepCount), .count(), "count", true)
        case "activeEnergy": return (HKQuantityType(.activeEnergyBurned), .kilocalorie(), "kcal", true)
        case "restingHR": return (HKQuantityType(.restingHeartRate), HKUnit.count().unitDivided(by: .minute()), "bpm", false)
        case "hrv": return (HKQuantityType(.heartRateVariabilitySDNN), .secondUnit(with: .milli), "ms", false)
        case "weight": return (HKQuantityType(.bodyMass), .gramUnit(with: .kilo), "kg", false)
        default: return nil
        }
    }

    static func objectType(_ name: String) -> HKObjectType? {
        if let q = quantity(name) { return q.0 }
        if name == "sleep" { return HKCategoryType(.sleepAnalysis) }
        if name == "workouts" { return HKObjectType.workoutType() }
        return nil
    }

    private func types(_ call: CAPPluginCall) -> [String] {
        let asked = call.strings("types")
        return (asked.isEmpty ? AosHealthPlugin.all : asked).filter { AosHealthPlugin.all.contains($0) }
    }

    @objc func status(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.off("device") }
        call.ok(["types": AosHealthPlugin.all])
    }

    @objc func authorize(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.off("device", ["error": "Health isn't on this device."]) }
        let read = Set(types(call).compactMap(AosHealthPlugin.objectType))
        Task {
            do {
                try await store.requestAuthorization(toShare: [], read: read)
                call.ok(["asked": read.count])
            } catch {
                call.fail(error.localizedDescription)
            }
        }
    }

    @objc func query(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { return call.off("device") }
        let to = call.date("to") ?? Date()
        let from = call.date("from") ?? Calendar.current.date(byAdding: .day, value: -7, to: to) ?? to.addingTimeInterval(-7 * 86400)
        let bucket = call.text("bucket") ?? "day"
        let wanted = types(call)
        Task {
            var data: [String: Any] = [:]
            var units: [String: String] = [:]
            for name in wanted {
                if let q = AosHealthPlugin.quantity(name) {
                    data[name] = await self.buckets(q.0, unit: q.1, sum: q.3, from: from, to: to, bucket: bucket)
                    units[name] = q.2
                } else if name == "sleep" {
                    data[name] = await self.sleep(from: from, to: to)
                } else if name == "workouts" {
                    data[name] = await self.workouts(from: from, to: to)
                }
            }
            call.ok(["data": data, "units": units, "from": Dates.ms(from), "to": Dates.ms(to)])
        }
    }

    private func buckets(_ type: HKQuantityType, unit: HKUnit, sum: Bool, from: Date, to: Date, bucket: String) async -> [[String: Any]] {
        let cal = Calendar.current
        let anchor = cal.startOfDay(for: from)
        var interval = DateComponents()
        if bucket == "hour" { interval.hour = 1 } else { interval.day = 1 }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: .strictStartDate)
        return await withCheckedContinuation { (cont: CheckedContinuation<[[String: Any]], Never>) in
            let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate,
                                                options: sum ? .cumulativeSum : .discreteAverage,
                                                anchorDate: anchor, intervalComponents: interval)
            q.initialResultsHandler = { _, results, _ in
                var out: [[String: Any]] = []
                results?.enumerateStatistics(from: from, to: to) { s, _ in
                    let quantity = sum ? s.sumQuantity() : s.averageQuantity()
                    guard let quantity else { return }
                    let v = quantity.doubleValue(for: unit)
                    out.append(["start": Dates.ms(s.startDate), "end": Dates.ms(s.endDate), "value": (v * 100).rounded() / 100])
                }
                cont.resume(returning: out)
            }
            self.store.execute(q)
        }
    }

    private func samples(_ type: HKSampleType, from: Date, to: Date, limit: Int) async -> [HKSample] {
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        return await withCheckedContinuation { (cont: CheckedContinuation<[HKSample], Never>) in
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, _ in
                cont.resume(returning: samples ?? [])
            }
            self.store.execute(q)
        }
    }

    private func sleep(from: Date, to: Date) async -> [[String: Any]] {
        let rows = await samples(HKCategoryType(.sleepAnalysis), from: from, to: to, limit: 2000)
        return rows.compactMap { s -> [String: Any]? in
            guard let c = s as? HKCategorySample else { return nil }
            let stage: String
            switch HKCategoryValueSleepAnalysis(rawValue: c.value) ?? .asleepUnspecified {
            case .inBed: stage = "inBed"
            case .awake: stage = "awake"
            case .asleepCore: stage = "core"
            case .asleepDeep: stage = "deep"
            case .asleepREM: stage = "rem"
            default: stage = "asleep"
            }
            return ["start": Dates.ms(c.startDate), "end": Dates.ms(c.endDate), "stage": stage,
                    "source": c.sourceRevision.source.name]
        }
    }

    private func workouts(from: Date, to: Date) async -> [[String: Any]] {
        let rows = await samples(HKObjectType.workoutType(), from: from, to: to, limit: 300)
        return rows.compactMap { s -> [String: Any]? in
            guard let w = s as? HKWorkout else { return nil }
            var out: [String: Any] = ["start": Dates.ms(w.startDate), "end": Dates.ms(w.endDate),
                                      "type": AosHealthPlugin.activity(w.workoutActivityType),
                                      "minutes": (w.duration / 60 * 10).rounded() / 10,
                                      "source": w.sourceRevision.source.name]
            if let kcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                out["kcal"] = kcal.rounded()
            }
            if let m = w.totalDistance?.doubleValue(for: .meter()) { out["km"] = (m / 10).rounded() / 100 }
            return out
        }
    }

    static func activity(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .traditionalStrengthTraining: return "strength"
        case .functionalStrengthTraining: return "functionalStrength"
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .yoga: return "yoga"
        case .highIntensityIntervalTraining: return "hiit"
        case .coreTraining: return "core"
        case .flexibility: return "flexibility"
        case .cricket: return "cricket"
        case .badminton: return "badminton"
        case .soccer: return "football"
        case .basketball: return "basketball"
        case .tennis: return "tennis"
        case .tableTennis: return "tableTennis"
        case .hiking: return "hiking"
        case .dance, .socialDance, .cardioDance: return "dance"
        case .elliptical: return "elliptical"
        case .rowing: return "rowing"
        case .stairClimbing, .stairs: return "stairs"
        case .mindAndBody: return "mindAndBody"
        case .pilates: return "pilates"
        case .boxing, .kickboxing: return "boxing"
        case .martialArts: return "martialArts"
        case .cooldown: return "cooldown"
        default: return "other"
        }
    }
}
