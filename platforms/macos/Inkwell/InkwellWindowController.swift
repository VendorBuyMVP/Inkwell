import AppKit
import AVFoundation
import UniformTypeIdentifiers
import WebKit

final class InkwellWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate {
    private let bridge = InkwellBridge()
    private var webView: WKWebView!
    private var currentDocumentURL: URL?
    private var initialDocumentURL: URL?
    private var diagnosticsURL: URL?
    private var frontendReady = false
    private var frontendLoadStarted = false
    private var allowWindowClose = false
    private var printInfo = NSPrintInfo.shared.copy() as? NSPrintInfo ?? NSPrintInfo()
    private let speechSynthesizer = AVSpeechSynthesizer()

    convenience init(initialDocumentURL: URL? = nil, diagnosticsURL: URL? = nil) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        self.init(window: window)
        self.initialDocumentURL = initialDocumentURL
        self.diagnosticsURL = diagnosticsURL
        configureWindow()
        configureWebView()
    }

    func newFile() -> [String: JSONValue] {
        currentDocumentURL = nil
        window?.title = "Inkwell"
        return ["name": .string("Untitled.md")]
    }

    func newWindow() {
        (NSApp.delegate as? AppDelegate)?.newWindow()
    }

    func openFile() throws -> [String: JSONValue] {
        let panel = NSOpenPanel()
        panel.title = "Open Markdown"
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = DocumentAccess.allowedContentTypes

        guard panel.runModal() == .OK, let url = panel.url else {
            throw InkwellError.cancelled
        }

        return try openDocument(at: url)
    }

    func openDocument(at url: URL) throws -> [String: JSONValue] {
        let document = try DocumentAccess.readDocument(at: url)
        currentDocumentURL = url
        window?.representedURL = url
        window?.title = document.name
        return [
            "name": .string(document.name),
            "content": .string(document.content)
        ]
    }

    func saveFile(payload: [String: JSONValue]?, forceDialog: Bool) throws -> [String: JSONValue] {
        let content = payload?["content"]?.stringValue ?? ""
        let suggestedName = payload?["name"]?.stringValue ?? "Untitled.md"

        let url: URL
        if forceDialog || currentDocumentURL == nil {
            url = try chooseSaveURL(suggestedName: suggestedName)
        } else {
            url = currentDocumentURL!
        }

        try DocumentAccess.writeDocument(content: content, to: url)
        currentDocumentURL = url
        window?.representedURL = url
        window?.title = url.lastPathComponent
        return ["name": .string(url.lastPathComponent)]
    }

    func readPlainTextClipboard() -> [String: JSONValue] {
        let text = NSPasteboard.general.string(forType: .string) ?? ""
        return ["text": .string(text)]
    }

    func pageSetup(payload: [String: JSONValue]?) throws -> [String: JSONValue] {
        applyPrintPayload(payload)
        let pageLayout = NSPageLayout()
        let response = pageLayout.runModal(with: printInfo)
        guard response == NSApplication.ModalResponse.OK.rawValue else {
            throw InkwellError.cancelled
        }
        return currentPrintSettings()
    }

    func printDocument(payload: [String: JSONValue]?) throws {
        applyPrintPayload(payload)
        let operation = webView.printOperation(with: printInfo)
        operation.run()
    }

    func exportFile(payload: [String: JSONValue]?) throws -> [String: JSONValue] {
        let format = payload?["format"]?.stringValue ?? "markdown"
        let content = payload?["content"]?.stringValue ?? ""
        let suggestedName = payload?["name"]?.stringValue ?? (format == "html" ? "Untitled.html" : "Untitled.md")
        let url = try chooseExportURL(format: format, suggestedName: suggestedName)

        guard let data = content.data(using: .utf8) else {
            throw InkwellError.invalidPayload("Export content must be UTF-8 text.")
        }
        try data.write(to: url, options: .atomic)
        return ["name": .string(url.lastPathComponent)]
    }

    func startSpeaking(payload: [String: JSONValue]?) throws {
        let text = payload?["text"]?.stringValue ?? ""
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw InkwellError.invalidPayload("No text to speak.")
        }
        speechSynthesizer.stopSpeaking(at: .immediate)
        speechSynthesizer.speak(AVSpeechUtterance(string: text))
    }

    func stopSpeaking() {
        speechSynthesizer.stopSpeaking(at: .immediate)
    }

    func spellingSuggestions(payload: [String: JSONValue]?) throws -> [String: JSONValue] {
        let rawWord = payload?["word"]?.stringValue ?? ""
        let word = rawWord.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !word.isEmpty else {
            return ["word": .string(""), "misspelled": .bool(false), "suggestions": .array([])]
        }
        guard word.count <= 120 else {
            throw InkwellError.invalidPayload("Spelling word is too long.")
        }

        let checker = NSSpellChecker.shared
        let text = word as NSString
        let fullRange = NSRange(location: 0, length: text.length)
        let misspelledRange = checker.checkSpelling(of: word, startingAt: 0)
        let misspelled = misspelledRange.location != NSNotFound
        let guesses = misspelled
            ? Array((checker.guesses(
                forWordRange: fullRange,
                in: word,
                language: nil,
                inSpellDocumentWithTag: 0
            ) ?? []).prefix(8))
            : []

        return [
            "word": .string(word),
            "misspelled": .bool(misspelled),
            "suggestions": .array(guesses.map { .string($0) })
        ]
    }

    func grammarCheck(payload: [String: JSONValue]?) throws -> [String: JSONValue] {
        let text = payload?["text"]?.stringValue ?? ""
        guard text.count <= 200_000 else {
            throw InkwellError.invalidPayload("Document is too long for a grammar check.")
        }

        var details: NSArray?
        let issueRange = NSSpellChecker.shared.checkGrammar(
            of: text,
            startingAt: 0,
            language: "en",
            wrap: false,
            inSpellDocumentWithTag: 0,
            details: &details
        )
        let hasIssue = issueRange.location != NSNotFound
        let issueDetails = (details as? [[String: Any]])?.first
        let description = issueDetails?[NSGrammarUserDescription] as? String ?? ""

        return [
            "hasIssue": .bool(hasIssue),
            "location": .number(hasIssue ? Double(issueRange.location) : -1),
            "length": .number(hasIssue ? Double(issueRange.length) : 0),
            "description": .string(description)
        ]
    }

    func closeFromFrontend() {
        allowWindowClose = true
        window?.close()
    }

    func invokeFrontendCommand(_ commandID: String) {
        guard let encoded = try? JSONEncoder().encode(commandID),
              let json = String(data: encoded, encoding: .utf8) else {
            return
        }

        webView.evaluateJavaScript(
            "window.InkwellInvokeCommand && window.InkwellInvokeCommand(\(json));",
            completionHandler: nil
        )
    }

    func loadFrontendIfNeeded() {
        guard !frontendLoadStarted else {
            return
        }
        frontendLoadStarted = true

        do {
            let frontendDir = try frontendDirectoryURL()
            let html = try bundledFrontendHTML(in: frontendDir)
            webView.loadHTMLString(html, baseURL: nil)
            scheduleTimedDiagnostics()
        } catch {
            showStartupError(error.localizedDescription)
        }
    }

    func emitEvent(_ type: String, _ data: [String: JSONValue]) {
        let event: [String: JSONValue] = [
            "type": .string(type),
            "data": .object(data)
        ]

        guard let encoded = try? JSONEncoder().encode(JSONValue.object(event)),
              let json = String(data: encoded, encoding: .utf8) else {
            return
        }

        webView.evaluateJavaScript(
            "window.InkwellBridgeEvent && window.InkwellBridgeEvent(\(json));",
            completionHandler: nil
        )
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if allowWindowClose || !frontendReady {
            return true
        }

        emitEvent("closeRequest", [:])
        return false
    }

    func windowWillClose(_ notification: Notification) {
        (NSApp.delegate as? AppDelegate)?.windowControllerDidClose(self)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        frontendReady = true
        window?.makeFirstResponder(webView)
        loadInitialDocument()
        runDiagnosticsIfNeeded()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        writeDiagnostics([
            "loadFailed": .string(error.localizedDescription)
        ])
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        writeDiagnostics([
            "provisionalLoadFailed": .string(error.localizedDescription)
        ])
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if isAllowedFrontendURL(url) || url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }

        emitEvent("security", [
            "message": .string("Blocked navigation outside the local app."),
            "uri": .string(url.absoluteString)
        ])
        decisionHandler(.cancel)
    }

    private func configureWindow() {
        window?.title = "Inkwell"
        window?.minSize = NSSize(width: 820, height: 560)
        window?.center()
        window?.delegate = self
    }

    private func configureWebView() {
        let userContentController = WKUserContentController()
        userContentController.addUserScript(
            WKUserScript(
                source: """
                window.InkwellDiagnostics = { errors: [] };
                window.addEventListener('error', function(event) {
                  window.InkwellDiagnostics.errors.push({
                    message: String(event.message || ''),
                    source: String(event.filename || ''),
                    line: Number(event.lineno || 0),
                    column: Number(event.colno || 0)
                  });
                });
                window.addEventListener('unhandledrejection', function(event) {
                  window.InkwellDiagnostics.errors.push({
                    message: String(event.reason && event.reason.message ? event.reason.message : event.reason || ''),
                    source: 'unhandledrejection',
                    line: 0,
                    column: 0
                  });
                });
                """,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        userContentController.add(bridge, name: "inkwell")

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController = userContentController
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        window?.contentView = webView
        window?.initialFirstResponder = webView
        webView.frame = window?.contentView?.bounds ?? .zero
        bridge.attach(webView: webView, windowController: self)

        window?.contentView?.needsLayout = true
    }

    private func loadInitialDocument() {
        guard let url = initialDocumentURL else {
            return
        }

        initialDocumentURL = nil
        do {
            let result = try openDocument(at: url)
            emitEvent("documentLoaded", result)
        } catch {
            emitEvent("security", [
                "message": .string("Could not open \(url.lastPathComponent): \(error.localizedDescription)"),
                "uri": .string(url.path)
            ])
        }
    }

    private func runDiagnosticsIfNeeded() {
        guard diagnosticsURL != nil else {
            return
        }

        let script = """
        (function() {
          const shell = document.querySelector('.app-shell');
          const topbar = document.querySelector('.topbar');
          const zoomState = document.getElementById('zoomState');
          const editor = document.getElementById('editor');
          const bodyStyle = window.getComputedStyle(document.body);
          const shellStyle = shell ? window.getComputedStyle(shell) : null;
          const topbarStyle = topbar ? window.getComputedStyle(topbar) : null;
          const rect = shell ? shell.getBoundingClientRect() : null;
          return JSON.stringify({
            location: String(window.location.href),
            readyState: String(document.readyState),
            title: String(document.title),
            bodyChildCount: document.body ? document.body.children.length : -1,
            bodyTextLength: document.body ? (document.body.innerText || '').length : -1,
            bodyBackground: bodyStyle ? String(bodyStyle.backgroundColor) : '',
            shellExists: Boolean(shell),
            shellDisplay: shellStyle ? String(shellStyle.display) : '',
            shellWidth: rect ? rect.width : 0,
            shellHeight: rect ? rect.height : 0,
            nativeShellClass: document.body.classList.contains('native-shell'),
            topbarDisplay: topbarStyle ? String(topbarStyle.display) : '',
            editorExists: Boolean(editor),
            editorEditable: editor ? String(editor.getAttribute('contenteditable')) : '',
            bodyTheme: String(document.body.dataset.theme || ''),
            zoomStateExists: Boolean(zoomState),
            zoomStateHiddenAtDefault: zoomState ? Boolean(zoomState.hidden) : false,
            zoomStateText: zoomState ? String(zoomState.textContent || '') : '',
            markdownExists: Boolean(window.InkwellMarkdown),
            invokeCommandExists: typeof window.InkwellInvokeCommand === 'function',
            bridgeResponseExists: typeof window.InkwellBridgeResponse === 'function',
            saveMenuShortcut: (document.querySelector('[data-command="save"] .menu-shortcut') || {}).textContent || '',
            diagnosticErrors: window.InkwellDiagnostics ? window.InkwellDiagnostics.errors : []
          });
        })();
        """

        webView.evaluateJavaScript(script) { [weak self] result, error in
            guard let self else { return }
            if let error {
                self.writeDiagnostics(self.nativeDiagnostics(extra: [
                    "diagnosticsFailed": .string(error.localizedDescription)
                ]))
            } else if let result = result as? String,
                      let data = result.data(using: .utf8),
                      let decoded = try? JSONDecoder().decode(JSONValue.self, from: data),
                      let object = decoded.objectValue {
                self.writeDiagnostics(self.nativeDiagnostics(extra: object))
            } else {
                self.writeDiagnostics(self.nativeDiagnostics(extra: [
                    "diagnosticsFailed": .string("Unexpected diagnostics result.")
                ]))
            }
        }
    }

    private func scheduleTimedDiagnostics() {
        guard diagnosticsURL != nil else {
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self, self.diagnosticsURL != nil else {
                return
            }
            self.runDiagnosticsIfNeeded()
        }
    }

    private func nativeDiagnostics(extra: [String: JSONValue]) -> [String: JSONValue] {
        var data = extra
        let windowFrame = window?.frame ?? .zero
        let webViewFrame = webView?.frame ?? .zero
        data["nativeWindowWidth"] = .number(windowFrame.width)
        data["nativeWindowHeight"] = .number(windowFrame.height)
        data["nativeWebViewWidth"] = .number(webViewFrame.width)
        data["nativeWebViewHeight"] = .number(webViewFrame.height)
        data["nativeWebViewIsLoading"] = .bool(webView?.isLoading ?? false)
        data["nativeWebViewURL"] = .string(webView?.url?.absoluteString ?? "")
        data["nativeEditMenuItems"] = nativeEditMenuItems()
        data["nativeMenuItems"] = nativeMenuItems()
        data["nativeMenuItemTree"] = nativeMenuItemTree()
        return data
    }

    private func nativeEditMenuItems() -> JSONValue {
        guard let editMenu = NSApp.mainMenu?.items.compactMap({ $0.submenu }).first(where: { $0.title == "Edit" }) else {
            return .array([])
        }

        return .array(editMenu.items.filter { !$0.isSeparatorItem }.map { item in
            .object([
                "title": .string(item.title),
                "action": .string(item.action.map { NSStringFromSelector($0) } ?? ""),
                "keyEquivalent": .string(item.keyEquivalent),
                "targeted": .bool(item.target != nil)
            ])
        })
    }

    private func nativeMenuItems() -> JSONValue {
        guard let mainMenu = NSApp.mainMenu else {
            return .array([])
        }

        return .array(mainMenu.items.compactMap { $0.submenu }.flatMap { menu in
            menu.items.filter { !$0.isSeparatorItem }.map { item in
                .object([
                    "menu": .string(menu.title),
                    "title": .string(item.title),
                    "action": .string(item.action.map { NSStringFromSelector($0) } ?? ""),
                    "keyEquivalent": .string(item.keyEquivalent),
                    "modifiers": .array(modifierNames(item.keyEquivalentModifierMask).map { .string($0) }),
                    "targeted": .bool(item.target != nil)
                ])
            }
        })
    }

    private func nativeMenuItemTree() -> JSONValue {
        guard let mainMenu = NSApp.mainMenu else {
            return .array([])
        }

        return .array(mainMenu.items.compactMap { rootItem in
            guard let submenu = rootItem.submenu else {
                return nil
            }
            return nativeMenuJSON(menu: submenu, path: submenu.title)
        })
    }

    private func nativeMenuJSON(menu: NSMenu, path: String) -> JSONValue {
        .object([
            "title": .string(menu.title),
            "path": .string(path),
            "items": .array(menu.items.filter { !$0.isSeparatorItem }.map { item in
                var fields: [String: JSONValue] = [
                    "title": .string(item.title),
                    "path": .string(path + "/" + item.title),
                    "action": .string(item.action.map { NSStringFromSelector($0) } ?? ""),
                    "keyEquivalent": .string(item.keyEquivalent),
                    "modifiers": .array(modifierNames(item.keyEquivalentModifierMask).map { .string($0) }),
                    "targeted": .bool(item.target != nil)
                ]
                if let submenu = item.submenu {
                    fields["submenu"] = nativeMenuJSON(menu: submenu, path: path + "/" + submenu.title)
                }
                return .object(fields)
            })
        ])
    }

    private func modifierNames(_ modifiers: NSEvent.ModifierFlags) -> [String] {
        var names: [String] = []
        if modifiers.contains(.command) {
            names.append("command")
        }
        if modifiers.contains(.option) {
            names.append("option")
        }
        if modifiers.contains(.shift) {
            names.append("shift")
        }
        if modifiers.contains(.control) {
            names.append("control")
        }
        return names
    }

    private func writeDiagnostics(_ data: [String: JSONValue]) {
        guard let diagnosticsURL else {
            return
        }

        do {
            let encoded = try JSONEncoder().encode(JSONValue.object(data))
            if let json = String(data: encoded, encoding: .utf8) {
                fputs(json + "\n", stdout)
                fflush(stdout)
            }
            try encoded.write(to: diagnosticsURL)
        } catch {
            fputs("Inkwell diagnostics failed: \(error.localizedDescription)\n", stderr)
        }

        self.diagnosticsURL = nil
        DispatchQueue.main.async {
            NSApp.terminate(nil)
        }
    }

    private func chooseSaveURL(suggestedName: String) throws -> URL {
        let panel = NSSavePanel()
        panel.title = "Save Markdown"
        panel.nameFieldStringValue = suggestedName
        panel.canCreateDirectories = true
        panel.allowedContentTypes = [
            UTType(filenameExtension: "md") ?? .plainText,
            .plainText
        ]

        guard panel.runModal() == .OK, let url = panel.url else {
            throw InkwellError.cancelled
        }

        return url
    }

    private func chooseExportURL(format: String, suggestedName: String) throws -> URL {
        let panel = NSSavePanel()
        panel.title = format == "html" ? "Export HTML" : "Export Markdown"
        panel.nameFieldStringValue = suggestedName
        panel.canCreateDirectories = true
        if format == "html" {
            panel.allowedContentTypes = [.html]
        } else {
            panel.allowedContentTypes = [
                UTType(filenameExtension: "md") ?? .plainText,
                .plainText
            ]
        }

        guard panel.runModal() == .OK, let url = panel.url else {
            throw InkwellError.cancelled
        }
        return url
    }

    private func applyPrintPayload(_ payload: [String: JSONValue]?) {
        if let width = payload?["pageWidthIn"]?.numberValue,
           let height = payload?["pageHeightIn"]?.numberValue,
           width > 0,
           height > 0 {
            printInfo.paperSize = NSSize(width: width * 72.0, height: height * 72.0)
        }
        if let margin = payload?["marginLeftIn"]?.numberValue, margin >= 0 {
            printInfo.leftMargin = margin * 72.0
        }
        if let margin = payload?["marginRightIn"]?.numberValue, margin >= 0 {
            printInfo.rightMargin = margin * 72.0
        }
    }

    private func currentPrintSettings() -> [String: JSONValue] {
        [
            "pageWidthIn": .number(printInfo.paperSize.width / 72.0),
            "pageHeightIn": .number(printInfo.paperSize.height / 72.0),
            "marginLeftIn": .number(printInfo.leftMargin / 72.0),
            "marginRightIn": .number(printInfo.rightMargin / 72.0)
        ]
    }

    private func frontendDirectoryURL() throws -> URL {
        guard let resourceURL = Bundle.main.resourceURL else {
            throw InkwellError.invalidPayload("Missing app resources.")
        }

        let frontendDir = resourceURL.appendingPathComponent("frontend", isDirectory: true)
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: frontendDir.path, isDirectory: &isDirectory),
           isDirectory.boolValue {
            return frontendDir
        }

        throw InkwellError.invalidPayload("Missing frontend resources.")
    }

    private func bundledFrontendHTML(in frontendDir: URL) throws -> String {
        let indexURL = frontendDir.appendingPathComponent("index.html")
        let stylesURL = frontendDir.appendingPathComponent("styles.css")
        let markdownURL = frontendDir.appendingPathComponent("markdown.js")
        let appURL = frontendDir.appendingPathComponent("app.js")

        var html = try String(contentsOf: indexURL, encoding: .utf8)
        let styles = try String(contentsOf: stylesURL, encoding: .utf8)
        let markdownScript = try String(contentsOf: markdownURL, encoding: .utf8)
        let appScript = try String(contentsOf: appURL, encoding: .utf8)
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let csp = [
            "default-src 'none'",
            "script-src 'nonce-\(nonce)'",
            "style-src 'nonce-\(nonce)'",
            "img-src 'none'",
            "connect-src 'none'",
            "font-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'"
        ].joined(separator: "; ")

        html = html.replacingOccurrences(
            of: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            with: csp
        )
        html = html.replacingOccurrences(
            of: #"<link rel="stylesheet" href="./styles.css">"#,
            with: "<style nonce=\"\(nonce)\">\n\(styles)\n</style>"
        )
        html = html.replacingOccurrences(
            of: #"<script src="./markdown.js" defer></script>"#,
            with: ""
        )
        html = html.replacingOccurrences(
            of: #"<script src="./app.js" defer></script>"#,
            with: ""
        )
        html = html.replacingOccurrences(
            of: "</body>",
            with: """
                <script nonce="\(nonce)">
                \(escapeInlineScript(markdownScript))
                </script>
                <script nonce="\(nonce)">
                \(escapeInlineScript(appScript))
                </script>
              </body>
            """
        )

        return html
    }

    private func escapeInlineScript(_ script: String) -> String {
        script.replacingOccurrences(of: "</script", with: "<\\/script")
    }

    private func isAllowedFrontendURL(_ url: URL) -> Bool {
        guard url.isFileURL, let frontendDir = try? frontendDirectoryURL() else {
            return false
        }

        let frontendPath = frontendDir.resolvingSymlinksInPath().standardizedFileURL.path
        let requestedPath = url.resolvingSymlinksInPath().standardizedFileURL.path
        return requestedPath == frontendPath || requestedPath.hasPrefix(frontendPath + "/")
    }

    private func showStartupError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Inkwell could not start"
        alert.informativeText = message
        alert.addButton(withTitle: "Close")
        alert.runModal()
        NSApp.terminate(nil)
    }
}
