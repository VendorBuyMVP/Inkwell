import Foundation

final class PreferencesStore {
    private let maxPreferencesBytes = 16 * 1024

    func loadPreferences() throws -> [String: JSONValue] {
        let url = try preferencesURL(createDirectory: false)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return ["preferences": .object(defaultPreferences())]
        }

        let data = try Data(contentsOf: url)
        if data.count > maxPreferencesBytes {
            throw InkwellError.preferencesTooLarge
        }

        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        return ["preferences": .object(try sanitizePreferences(decoded))]
    }

    func savePreferences(payload: [String: JSONValue]?) throws -> [String: JSONValue] {
        guard let preferences = payload?["preferences"] else {
            throw InkwellError.invalidPreferences("Preferences must be an object.")
        }

        let sanitized = try sanitizePreferences(preferences)
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

        let allowedKeys = Set(["version", "shortcuts"])
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

        return [
            "version": .number(1),
            "shortcuts": .object(sanitizedShortcuts)
        ]
    }

    private func defaultPreferences() -> [String: JSONValue] {
        [
            "version": .number(1),
            "shortcuts": .object([:])
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
