import AppKit
import Foundation
import UniformTypeIdentifiers

struct DocumentAccess {
    static let maxDocumentBytes = 25 * 1024 * 1024

    static let allowedContentTypes: [UTType] = [
        UTType(filenameExtension: "md") ?? .plainText,
        UTType(filenameExtension: "markdown") ?? .plainText,
        UTType(filenameExtension: "mdown") ?? .plainText,
        .plainText
    ]

    static func readDocument(at url: URL) throws -> (name: String, content: String) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer {
            if scoped {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let values = try url.resourceValues(forKeys: [.fileSizeKey])
        let fileSize = values.fileSize ?? 0
        if fileSize > maxDocumentBytes {
            throw InkwellError.fileTooLarge(fileSize)
        }

        let content = try String(contentsOf: url, encoding: .utf8)
        return (url.lastPathComponent, content)
    }

    static func writeDocument(content: String, to url: URL) throws {
        guard let data = content.data(using: .utf8) else {
            throw InkwellError.invalidPayload("Document content must be UTF-8 text.")
        }
        if data.count > maxDocumentBytes {
            throw InkwellError.documentTooLarge(data.count)
        }

        let scoped = url.startAccessingSecurityScopedResource()
        defer {
            if scoped {
                url.stopAccessingSecurityScopedResource()
            }
        }

        try content.write(to: url, atomically: true, encoding: .utf8)
    }
}
