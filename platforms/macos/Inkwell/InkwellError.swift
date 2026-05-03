import Foundation

enum InkwellError: LocalizedError {
    case cancelled
    case documentTooLarge(Int)
    case fileTooLarge(Int)
    case invalidPayload(String)
    case invalidPreferences(String)
    case nativeWindowUnavailable
    case preferencesTooLarge
    case unknownBridgeAction(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "cancelled"
        case .documentTooLarge(let size):
            return "Document is too large to save (\(size) bytes, limit \(DocumentAccess.maxDocumentBytes) bytes)."
        case .fileTooLarge(let size):
            return "File is too large for Inkwell v0 (\(size) bytes, limit \(DocumentAccess.maxDocumentBytes) bytes)."
        case .invalidPayload(let message):
            return message
        case .invalidPreferences(let message):
            return message
        case .nativeWindowUnavailable:
            return "Native window is not available."
        case .preferencesTooLarge:
            return "Preferences payload is too large."
        case .unknownBridgeAction(let action):
            return "Unknown bridge action: \(action)"
        }
    }
}
