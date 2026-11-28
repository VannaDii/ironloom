// Service-owned Metal metadata helper. Build and execution require the Mac phase.
// This program never creates a model, pipeline, command queue or inference operation.
import Foundation
import Metal

struct DeviceReport: Encodable {
    let registry_id: String
    let ordinal: String
    let system_default: Bool
    let name: String
    let recommended_bytes: String
}
let defaultRegistry = MTLCreateSystemDefaultDevice()?.registryID
let reports = MTLCopyAllDevices().enumerated().map { index, device in
    DeviceReport(registry_id: String(device.registryID), ordinal: String(index),
                 system_default: device.registryID == defaultRegistry, name: device.name,
                 recommended_bytes: String(device.recommendedMaxWorkingSetSize))
}
do {
    let data = try JSONEncoder().encode(reports)
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data("Device metadata encoding failed\n".utf8))
    exit(1)
}
