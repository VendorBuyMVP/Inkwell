import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowControllers: [InkwellWindowController] = []
    private var pendingOpenURLs: [URL] = []
    private let runtimeOptions = AppRuntimeOptions.parse(arguments: CommandLine.arguments)
    private var didFinishLaunching = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureMainMenu()
        didFinishLaunching = true

        pendingOpenURLs.append(contentsOf: runtimeOptions.documentURLs)

        if !pendingOpenURLs.isEmpty {
            openDocuments(pendingOpenURLs)
            pendingOpenURLs.removeAll()
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if self.windowControllers.isEmpty && self.pendingOpenURLs.isEmpty {
                self.newWindow(diagnosticsURL: self.runtimeOptions.diagnosticsURL)
            }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard didFinishLaunching else {
            pendingOpenURLs.append(contentsOf: urls)
            return
        }

        openDocuments(urls)
    }

    func application(_ sender: NSApplication, openFile filename: String) -> Bool {
        handleDocumentOpenURLs([URL(fileURLWithPath: filename).standardizedFileURL])
        return true
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        handleDocumentOpenURLs(
            filenames.map { URL(fileURLWithPath: $0).standardizedFileURL }
        )
        sender.reply(toOpenOrPrint: .success)
    }

    func applicationShouldHandleReopen(
        _ sender: NSApplication,
        hasVisibleWindows flag: Bool
    ) -> Bool {
        if !flag {
            newWindow()
        }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func newWindow(initialDocumentURL: URL? = nil, diagnosticsURL: URL? = nil) {
        let controller = InkwellWindowController(
            initialDocumentURL: initialDocumentURL,
            diagnosticsURL: diagnosticsURL
        )
        windowControllers.append(controller)
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        controller.loadFrontendIfNeeded()
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowControllerDidClose(_ controller: InkwellWindowController) {
        windowControllers.removeAll { $0 === controller }
    }

    private func openDocuments(_ urls: [URL]) {
        for (index, url) in urls.enumerated() {
            newWindow(
                initialDocumentURL: url,
                diagnosticsURL: index == 0 ? runtimeOptions.diagnosticsURL : nil
            )
        }
    }

    private func handleDocumentOpenURLs(_ urls: [URL]) {
        guard didFinishLaunching else {
            pendingOpenURLs.append(contentsOf: urls)
            return
        }

        openDocuments(urls)
    }

    private var focusedWindowController: InkwellWindowController? {
        if let controller = NSApp.keyWindow?.windowController as? InkwellWindowController {
            return controller
        }
        return windowControllers.last
    }

    @objc private func newDocumentFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("new") ?? newWindow()
    }

    @objc private func newWindowFromMenu(_ sender: Any?) {
        newWindow()
    }

    @objc private func openDocumentFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("open") ?? newWindow()
    }

    @objc private func saveDocumentFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("save")
    }

    @objc private func saveDocumentAsFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("saveAs")
    }

    @objc private func closeWindowFromMenu(_ sender: Any?) {
        focusedWindowController?.window?.performClose(sender)
    }

    @objc private func undoFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("undo")
    }

    @objc private func redoFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("redo")
    }

    @objc private func findFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("find")
    }

    @objc private func selectAllFromMenu(_ sender: Any?) {
        focusedWindowController?.invokeFrontendCommand("selectAll")
    }

    private func configureMainMenu() {
        let mainMenu = NSMenu()
        NSApp.mainMenu = mainMenu

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(
            withTitle: "About Inkwell",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Quit Inkwell",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu
        addTargetedItem(
            to: fileMenu,
            withTitle: "New",
            action: #selector(newDocumentFromMenu(_:)),
            keyEquivalent: "n"
        )
        let newWindowItem = addTargetedItem(
            to: fileMenu,
            withTitle: "New Window",
            action: #selector(newWindowFromMenu(_:)),
            keyEquivalent: "n"
        )
        newWindowItem.keyEquivalentModifierMask = [.command, .shift]
        addTargetedItem(
            to: fileMenu,
            withTitle: "Open...",
            action: #selector(openDocumentFromMenu(_:)),
            keyEquivalent: "o"
        )
        fileMenu.addItem(.separator())
        addTargetedItem(
            to: fileMenu,
            withTitle: "Save",
            action: #selector(saveDocumentFromMenu(_:)),
            keyEquivalent: "s"
        )
        let saveAsItem = addTargetedItem(
            to: fileMenu,
            withTitle: "Save As...",
            action: #selector(saveDocumentAsFromMenu(_:)),
            keyEquivalent: "s"
        )
        saveAsItem.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(.separator())
        addTargetedItem(
            to: fileMenu,
            withTitle: "Close Window",
            action: #selector(closeWindowFromMenu(_:)),
            keyEquivalent: "w"
        )

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        addTargetedItem(
            to: editMenu,
            withTitle: "Undo",
            action: #selector(undoFromMenu(_:)),
            keyEquivalent: "z"
        )
        let redoItem = addTargetedItem(
            to: editMenu,
            withTitle: "Redo",
            action: #selector(redoFromMenu(_:)),
            keyEquivalent: "z"
        )
        redoItem.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        addTargetedItem(
            to: editMenu,
            withTitle: "Find",
            action: #selector(findFromMenu(_:)),
            keyEquivalent: "f"
        )
        editMenu.addItem(.separator())
        addTargetedItem(
            to: editMenu,
            withTitle: "Select All",
            action: #selector(selectAllFromMenu(_:)),
            keyEquivalent: "a"
        )
    }

    @discardableResult
    private func addTargetedItem(
        to menu: NSMenu,
        withTitle title: String,
        action: Selector,
        keyEquivalent: String
    ) -> NSMenuItem {
        let item = menu.addItem(withTitle: title, action: action, keyEquivalent: keyEquivalent)
        item.target = self
        return item
    }
}
