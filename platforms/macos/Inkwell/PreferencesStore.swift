import Foundation

final class PreferencesStore {
    private let maxPreferencesBytes = 16 * 1024
    private let maxRecentDocuments = 10

    func loadPreferences() throws -> [String: JSONValue] {
        ["preferences": .object(try loadStoredPreferences())]
    }

    func savePreferences(payload: [String: JSONValue]?) throws -> [String: JSONValue] {
        guard let preferences = payload?["preferences"]?.objectValue else {
            throw InkwellError.invalidPreferences("Preferences must be an object.")
        }

        var merged = (try? loadStoredPreferences()) ?? defaultPreferences()
        for (key, value) in preferences {
            merged[key] = value
        }

        return try writePreferences(merged)
    }

    func recentDocumentPaths() throws -> [String] {
        let preferences = try loadStoredPreferences()
        return preferences["recentDocuments"]?.arrayValue?
            .compactMap { $0.stringValue } ?? []
    }

    func noteRecentDocument(_ url: URL) throws -> [String: JSONValue] {
        guard url.isFileURL else {
            return ["preferences": .object(try loadStoredPreferences())]
        }

        let path = url.standardizedFileURL.path
        var preferences = try loadStoredPreferences()
        var recentDocuments = preferences["recentDocuments"]?.arrayValue?
            .compactMap { $0.stringValue } ?? []
        recentDocuments.removeAll { $0 == path }
        recentDocuments.insert(path, at: 0)
        if recentDocuments.count > maxRecentDocuments {
            recentDocuments = Array(recentDocuments.prefix(maxRecentDocuments))
        }
        preferences["recentDocuments"] = .array(recentDocuments.map { .string($0) })
        return try writePreferences(preferences)
    }

    func removeRecentDocument(_ url: URL) throws -> [String: JSONValue] {
        let path = url.standardizedFileURL.path
        var preferences = try loadStoredPreferences()
        let recentDocuments = preferences["recentDocuments"]?.arrayValue?
            .compactMap { $0.stringValue }
            .filter { $0 != path } ?? []
        preferences["recentDocuments"] = .array(recentDocuments.map { .string($0) })
        return try writePreferences(preferences)
    }

    func clearRecentDocuments() throws -> [String: JSONValue] {
        var preferences = try loadStoredPreferences()
        preferences["recentDocuments"] = .array([])
        return try writePreferences(preferences)
    }

    private func loadStoredPreferences() throws -> [String: JSONValue] {
        let url = try preferencesURL(createDirectory: false)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return defaultPreferences()
        }

        let data = try Data(contentsOf: url)
        if data.count > maxPreferencesBytes {
            throw InkwellError.preferencesTooLarge
        }

        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        return try sanitizePreferences(decoded)
    }

    private func writePreferences(_ preferences: [String: JSONValue]) throws -> [String: JSONValue] {
        let sanitized = try sanitizePreferences(.object(preferences))
        let encodedValue = JSONValue.object(sanitized)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(encodedValue)

        if data.count > maxPreferencesBytes {
            throw InkwellError.preferencesTooLarge
        }

        let url = try preferencesURL(createDirectory: true)
        let tempURL = url.deletingLastPathComponent().appendingPathComponent("preferences.json.tmp")
        try data.write(to: tempURL, options: [.atomic])
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        try FileManager.default.moveItem(at: tempURL, to: url)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: url.path
        )

        return ["preferences": .object(sanitized)]
    }

    private func sanitizePreferences(_ preferences: JSONValue) throws -> [String: JSONValue] {
        guard let object = preferences.objectValue else {
            throw InkwellError.invalidPreferences("Preferences must be an object.")
        }

        let allowedKeys = Set(["version", "shortcuts", "markdownDefaultPromptChoice", "recentDocuments"])
        if object.keys.contains(where: { !allowedKeys.contains($0) }) {
            throw InkwellError.invalidPreferences("Preferences contain unsupported fields.")
        }

        let version = object["version"]?.intValue ?? 1
        guard version == 1 else {
            throw InkwellError.invalidPreferences("Unsupported preferences version.")
        }

        let shortcuts = object["shortcuts"]?.objectValue ?? [:]
        if shortcuts.count > 80 {
            throw InkwellError.invalidPreferences("Too many shortcut preferences.")
        }

        var sanitizedShortcuts: [String: JSONValue] = [:]
        for (command, shortcutValue) in shortcuts {
            guard !command.isEmpty,
                  command.count <= 64,
                  command.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }) else {
                throw InkwellError.invalidPreferences("Shortcut command names are invalid.")
            }

            guard let shortcut = shortcutValue.stringValue else {
                throw InkwellError.invalidPreferences("Shortcut values must be text.")
            }
            if shortcut.count > 64 {
                throw InkwellError.invalidPreferences("Shortcut preference value is too long.")
            }

            sanitizedShortcuts[command] = .string(shortcut)
        }

        var sanitized: [String: JSONValue] = [
            "version": .number(1),
            "shortcuts": .object(sanitizedShortcuts)
        ]

        if let choice = object["markdownDefaultPromptChoice"]?.stringValue {
            guard ["accepted", "dismissed"].contains(choice) else {
                throw InkwellError.invalidPreferences("Markdown default prompt preference is invalid.")
            }
            sanitized["markdownDefaultPromptChoice"] = .string(choice)
        }

        let recentDocuments = object["recentDocuments"]?.arrayValue ?? []
        if recentDocuments.count > maxRecentDocuments {
            throw InkwellError.invalidPreferences("Too many recent documents.")
        }

        var sanitizedRecentDocuments: [JSONValue] = []
        var seenRecentDocuments: Set<String> = []
        for recentDocument in recentDocuments {
            guard let path = recentDocument.stringValue else {
                throw InkwellError.invalidPreferences("Recent document paths must be text.")
            }
            if path.count > 4096 {
                throw InkwellError.invalidPreferences("Recent document path is too long.")
            }
            guard path.hasPrefix("/") else {
                throw InkwellError.invalidPreferences("Recent document paths must be absolute.")
            }
            if seenRecentDocuments.insert(path).inserted {
                sanitizedRecentDocuments.append(.string(path))
            }
        }
        sanitized["recentDocuments"] = .array(sanitizedRecentDocuments)

        return sanitized
    }

    private func defaultPreferences() -> [String: JSONValue] {
        [
            "version": .number(1),
            "shortcuts": .object([:]),
            "recentDocuments": .array([])
        ]
    }

    private func preferencesURL(createDirectory: Bool) throws -> URL {
        let supportURL = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: createDirectory
        )
        let appSupportURL = supportURL.appendingPathComponent("Inkwell", isDirectory: true)
        if createDirectory {
            try FileManager.default.createDirectory(
                at: appSupportURL,
                withIntermediateDirectories: true
            )
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o700],
                ofItemAtPath: appSupportURL.path
            )
        }
        return appSupportURL.appendingPathComponent("preferences.json")
    }
}
