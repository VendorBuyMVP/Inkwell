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

    @objc private func frontendCommandFromMenu(_ sender: NSMenuItem) {
        guard let commandID = sender.representedObject as? String else {
            return
        }
        focusedWindowController?.invokeFrontendCommand(commandID)
    }

    private func configureMainMenu() {
        let mainMenu = NSMenu()
        NSApp.mainMenu = mainMenu

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Inkwell")
        appMenuItem.submenu = appMenu
        appMenu.addItem(
            withTitle: "About Inkwell",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        addFrontendCommandItem(
            to: appMenu,
            withTitle: "Keyboard Shortcuts...",
            commandID: "keyboardShortcuts",
            keyEquivalent: ","
        )
        appMenu.addItem(.separator())
        let servicesMenu = NSMenu(title: "Services")
        let servicesItem = appMenu.addItem(withTitle: "Services", action: nil, keyEquivalent: "")
        servicesItem.submenu = servicesMenu
        NSApp.servicesMenu = servicesMenu
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Hide Inkwell",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )
        let hideOthersItem = appMenu.addItem(
            withTitle: "Hide Others",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            keyEquivalent: "h"
        )
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(
            withTitle: "Show All",
            action: #selector(NSApplication.unhideAllApplications(_:)),
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
        addResponderItem(
            to: editMenu,
            withTitle: "Cut",
            action: #selector(NSText.cut(_:)),
            keyEquivalent: "x"
        )
        addResponderItem(
            to: editMenu,
            withTitle: "Copy",
            action: #selector(NSText.copy(_:)),
            keyEquivalent: "c"
        )
        addResponderItem(
            to: editMenu,
            withTitle: "Paste",
            action: #selector(NSText.paste(_:)),
            keyEquivalent: "v"
        )
        editMenu.addItem(.separator())
        addTargetedItem(
            to: editMenu,
            withTitle: "Find",
            action: #selector(findFromMenu(_:)),
            keyEquivalent: "f"
        )
        addFrontendCommandItem(
            to: editMenu,
            withTitle: "Find Next",
            commandID: "findNext",
            keyEquivalent: "g"
        )
        addFrontendCommandItem(
            to: editMenu,
            withTitle: "Find Previous",
            commandID: "findPrevious",
            keyEquivalent: "g",
            modifiers: [.command, .shift]
        )
        editMenu.addItem(.separator())
        addTargetedItem(
            to: editMenu,
            withTitle: "Select All",
            action: #selector(selectAllFromMenu(_:)),
            keyEquivalent: "a"
        )

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu
        addFrontendCommandItem(
            to: viewMenu,
            withTitle: "Zoom In",
            commandID: "zoomIn",
            keyEquivalent: "="
        )
        addFrontendCommandItem(
            to: viewMenu,
            withTitle: "Zoom Out",
            commandID: "zoomOut",
            keyEquivalent: "-"
        )
        addFrontendCommandItem(
            to: viewMenu,
            withTitle: "Actual Size",
            commandID: "resetZoom",
            keyEquivalent: "0"
        )
        addFrontendCommandItem(
            to: viewMenu,
            withTitle: "Fit Width",
            commandID: "fitWidth",
            keyEquivalent: "w",
            modifiers: [.command, .option]
        )

        let formatMenuItem = NSMenuItem()
        mainMenu.addItem(formatMenuItem)
        let formatMenu = NSMenu(title: "Format")
        formatMenuItem.submenu = formatMenu
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Bold",
            commandID: "bold",
            keyEquivalent: "b"
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Italic",
            commandID: "italic",
            keyEquivalent: "i"
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Strikethrough",
            commandID: "strikethrough",
            keyEquivalent: "x",
            modifiers: [.command, .shift]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Inline Code",
            commandID: "inlineCode",
            keyEquivalent: "`",
            modifiers: [.command, .option]
        )
        formatMenu.addItem(.separator())
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Normal Text",
            commandID: "paragraph",
            keyEquivalent: "p",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Heading 1",
            commandID: "heading1",
            keyEquivalent: "1",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Heading 2",
            commandID: "heading2",
            keyEquivalent: "2",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Heading 3",
            commandID: "heading3",
            keyEquivalent: "3",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Block Quote",
            commandID: "blockquote",
            keyEquivalent: "q",
            modifiers: [.command, .option]
        )
        formatMenu.addItem(.separator())
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Bulleted List",
            commandID: "bulletList",
            keyEquivalent: "b",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Numbered List",
            commandID: "numberedList",
            keyEquivalent: "n",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Task List",
            commandID: "taskList",
            keyEquivalent: "k",
            modifiers: [.command, .option]
        )
        formatMenu.addItem(.separator())
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Code Block",
            commandID: "codeBlock",
            keyEquivalent: "c",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Table",
            commandID: "table",
            keyEquivalent: "t",
            modifiers: [.command, .option]
        )
        addFrontendCommandItem(
            to: formatMenu,
            withTitle: "Horizontal Rule",
            commandID: "horizontalRule",
            keyEquivalent: "r",
            modifiers: [.command, .option]
        )

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu
        addResponderItem(
            to: windowMenu,
            withTitle: "Minimize",
            action: #selector(NSWindow.performMiniaturize(_:)),
            keyEquivalent: "m"
        )
        addResponderItem(
            to: windowMenu,
            withTitle: "Zoom",
            action: #selector(NSWindow.performZoom(_:)),
            keyEquivalent: ""
        )
        windowMenu.addItem(.separator())
        let bringAllToFrontItem = windowMenu.addItem(
            withTitle: "Bring All to Front",
            action: #selector(NSApplication.arrangeInFront(_:)),
            keyEquivalent: ""
        )
        bringAllToFrontItem.target = NSApp
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

    @discardableResult
    private func addResponderItem(
        to menu: NSMenu,
        withTitle title: String,
        action: Selector,
        keyEquivalent: String
    ) -> NSMenuItem {
        let item = menu.addItem(withTitle: title, action: action, keyEquivalent: keyEquivalent)
        item.target = nil
        return item
    }

    @discardableResult
    private func addFrontendCommandItem(
        to menu: NSMenu,
        withTitle title: String,
        commandID: String,
        keyEquivalent: String,
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = menu.addItem(
            withTitle: title,
            action: #selector(frontendCommandFromMenu(_:)),
            keyEquivalent: keyEquivalent
        )
        item.target = self
        item.representedObject = commandID
        item.keyEquivalentModifierMask = modifiers
        return item
    }
}
