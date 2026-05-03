import Foundation

struct AppRuntimeOptions {
    let documentURLs: [URL]
    let diagnosticsURL: URL?

    static func parse(arguments: [String]) -> AppRuntimeOptions {
        var documentURLs: [URL] = []
        var diagnosticsURL: URL?
        var index = 1

        while index < arguments.count {
            let argument = arguments[index]
            if argument == "--diagnostics", index + 1 < arguments.count {
                diagnosticsURL = URL(fileURLWithPath: arguments[index + 1]).standardizedFileURL
                index += 2
            } else if argument.hasPrefix("-") {
                index += 1
            } else {
                documentURLs.append(URL(fileURLWithPath: argument).standardizedFileURL)
                index += 1
            }
        }

        return AppRuntimeOptions(documentURLs: documentURLs, diagnosticsURL: diagnosticsURL)
    }
}
