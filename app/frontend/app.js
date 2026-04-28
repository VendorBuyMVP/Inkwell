(function startInkwell() {
  "use strict";

  const DEFAULT_DOCUMENT = "# Untitled\n\nStart writing with **Markdown**.";
  const BRIDGE_TIMEOUT_MS = 60000;
  const PX_PER_INCH = 96;
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 200;
  const ZOOM_STEP = 10;
  const MIN_MARGIN_IN = 0.25;
  const MIN_CONTENT_IN = 2;
  const MAX_PREFERENCES_SHORTCUTS = 80;

  const COMMANDS = [
    { id: "new", label: "New", shortcut: "Ctrl+N", run: () => newDocument() },
    { id: "newWindow", label: "New Window", shortcut: "Ctrl+Shift+N", run: () => newWindow() },
    { id: "open", label: "Open", shortcut: "Ctrl+O", run: () => openFile() },
    { id: "save", label: "Save", shortcut: "Ctrl+S", run: () => saveFile(false) },
    { id: "saveAs", label: "Save As", shortcut: "Ctrl+Shift+S", run: () => saveFile(true) },
    { id: "undo", label: "Undo", shortcut: "Ctrl+Z", action: "undo", scope: "editor" },
    { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", action: "redo", scope: "editor" },
    { id: "selectAll", label: "Select All", shortcut: "Ctrl+A", action: "selectAll", scope: "editor" },
    { id: "zoomIn", label: "Zoom In", shortcut: "Ctrl+=", action: "zoomIn" },
    { id: "zoomOut", label: "Zoom Out", shortcut: "Ctrl+-", action: "zoomOut" },
    { id: "resetZoom", label: "Reset Zoom", shortcut: "Ctrl+0", action: "resetZoom" },
    { id: "fitWidth", label: "Fit Width", shortcut: "Ctrl+Alt+W", action: "fitWidth" },
    { id: "toggleRuler", label: "Hide Ruler", action: "toggleRuler", editable: false },
    { id: "bold", label: "Bold", shortcut: "Ctrl+B", action: "bold", scope: "editor" },
    { id: "italic", label: "Italic", shortcut: "Ctrl+I", action: "italic", scope: "editor" },
    { id: "strikethrough", label: "Strikethrough", shortcut: "Ctrl+Shift+X", action: "strikethrough", scope: "editor" },
    { id: "inlineCode", label: "Inline Code", shortcut: "Ctrl+Backtick", action: "inlineCode", scope: "editor" },
    { id: "paragraph", label: "Normal Text", shortcut: "Ctrl+Alt+P", action: "paragraph", scope: "editor" },
    { id: "heading1", label: "Heading 1", shortcut: "Ctrl+Alt+1", action: "heading1", scope: "editor" },
    { id: "heading2", label: "Heading 2", shortcut: "Ctrl+Alt+2", action: "heading2", scope: "editor" },
    { id: "heading3", label: "Heading 3", shortcut: "Ctrl+Alt+3", action: "heading3", scope: "editor" },
    { id: "blockquote", label: "Block Quote", shortcut: "Ctrl+Alt+Q", action: "blockquote", scope: "editor" },
    { id: "bulletList", label: "Bulleted List", shortcut: "Ctrl+Alt+B", action: "bulletList", scope: "editor" },
    { id: "numberedList", label: "Numbered List", shortcut: "Ctrl+Alt+N", action: "numberedList", scope: "editor" },
    { id: "taskList", label: "Task List", shortcut: "Ctrl+Alt+K", action: "taskList", scope: "editor" },
    { id: "codeBlock", label: "Code Block", shortcut: "Ctrl+Alt+C", action: "codeBlock", scope: "editor" },
    { id: "table", label: "Table", shortcut: "Ctrl+Alt+T", action: "table", scope: "editor" },
    { id: "horizontalRule", label: "Horizontal Rule", shortcut: "Ctrl+Alt+R", action: "horizontalRule", scope: "editor" },
    { id: "themeDark", label: "Dark Theme", action: "themeDark", editable: false },
    { id: "themeLight", label: "Light Theme", action: "themeLight", editable: false },
    { id: "letterPage", label: "Letter Page", action: "letterPage", editable: false },
    { id: "a4Page", label: "A4 Page", action: "a4Page", editable: false },
    { id: "resetMargins", label: "Reset Margins", action: "resetMargins", editable: false },
    { id: "keyboardShortcuts", label: "Keyboard Shortcuts", shortcut: "Ctrl+,", run: () => openShortcutDialog() },
  ];

  const commandById = new Map(COMMANDS.map((command) => [command.id, command]));
  const editableShortcutCommands = COMMANDS.filter((command) => command.editable !== false && command.shortcut);
  const keyAliases = new Map([
    ["backtick", "`"],
    ["grave", "`"],
    ["comma", ","],
    ["period", "."],
    ["dot", "."],
    ["minus", "-"],
    ["dash", "-"],
    ["equal", "="],
    ["equals", "="],
    ["plus", "+"],
    ["space", " "],
    ["spacebar", " "],
    ["esc", "Escape"],
    ["escape", "Escape"],
    ["delete", "Delete"],
    ["backspace", "Backspace"],
    ["enter", "Enter"],
    ["return", "Enter"],
    ["tab", "Tab"],
  ]);
  const keyDisplay = new Map([
    ["`", "Backtick"],
    [",", ","],
    [".", "."],
    ["-", "-"],
    ["=", "="],
    ["+", "+"],
    [" ", "Space"],
  ]);

  const editor = document.getElementById("editor");
  const page = document.getElementById("page");
  const documentScroll = document.getElementById("documentScroll");
  const ruler = document.getElementById("ruler");
  const rulerTrack = document.getElementById("rulerTrack");
  const rulerTicks = document.getElementById("rulerTicks");
  const leftMarginShade = document.getElementById("leftMarginShade");
  const rightMarginShade = document.getElementById("rightMarginShade");
  const leftMarginHandle = document.getElementById("leftMarginHandle");
  const rightMarginHandle = document.getElementById("rightMarginHandle");
  const fileName = document.getElementById("fileName");
  const statusText = document.getElementById("statusText");
  const documentStats = document.getElementById("documentStats");
  const dirtyState = document.getElementById("dirtyState");
  const zoomState = document.getElementById("zoomState");
  const fileInput = document.getElementById("fileInput");
  const confirmModal = document.getElementById("confirmModal");
  const confirmCancelButton = document.getElementById("confirmCancelButton");
  const confirmDiscardButton = document.getElementById("confirmDiscardButton");
  const shortcutModal = document.getElementById("shortcutModal");
  const shortcutList = document.getElementById("shortcutList");
  const shortcutError = document.getElementById("shortcutError");
  const shortcutDefaultsButton = document.getElementById("shortcutDefaultsButton");
  const shortcutCancelButton = document.getElementById("shortcutCancelButton");
  const shortcutSaveButton = document.getElementById("shortcutSaveButton");
  const selectionToolbar = document.getElementById("selectionToolbar");
  const tableContextMenu = document.getElementById("tableContextMenu");
  const menuRoots = Array.from(document.querySelectorAll("[data-menu-root]"));
  const commandButtons = Array.from(document.querySelectorAll("[data-command]"));
  const toolbarButtons = Array.from(document.querySelectorAll("[data-toolbar-action]"));
  const tableMenuButtons = Array.from(document.querySelectorAll("[data-table-action]"));

  const EDITING_ACTIONS = new Set([
    "undo",
    "redo",
    "bold",
    "italic",
    "strikethrough",
    "inlineCode",
    "paragraph",
    "heading1",
    "heading2",
    "heading3",
    "blockquote",
    "bulletList",
    "numberedList",
    "taskList",
    "codeBlock",
    "table",
    "horizontalRule",
  ]);

  const documentSettings = {
    theme: "dark",
    pageWidthIn: 8.5,
    pageHeightIn: 11,
    marginLeftIn: 1,
    marginRightIn: 1,
    zoom: 100,
    rulerVisible: true,
  };

  const state = {
    name: "Untitled.md",
    dirty: false,
    statusTimer: null,
    internalRender: false,
    activeMenu: null,
    marginDrag: null,
    confirmResolve: null,
    savedRange: null,
    toolbarFrame: null,
    tableContext: null,
    tableSelection: null,
    shortcuts: createDefaultShortcutMap(),
    shortcutPreferencesLoaded: false,
  };

  const bridge = createBridge();

  window.InkwellBridgeEvent = (event) => {
    if (event.type === "security" && event.data && event.data.message) {
      setStatus(event.data.message);
    } else if (event.type === "closeRequest") {
      handleCloseRequest();
    } else if (event.type === "documentLoaded" && event.data) {
      loadDocument(event.data.content || "", event.data.name || "Untitled.md", false);
      setStatus("Opened " + (event.data.name || "document"));
    }
  };

  setupMenuItems();
  setupMenus();
  setupRuler();
  refreshShortcutMenuLabels();
  loadPreferences();

  for (const button of commandButtons) {
    button.addEventListener("click", () => withMenusClosed(() => invokeCommand(button.dataset.command)));
  }

  selectionToolbar.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  for (const button of toolbarButtons) {
    button.addEventListener("click", () => {
      restoreSavedSelection();
      runMenuAction(button.dataset.toolbarAction);
      scheduleSelectionToolbarUpdate();
    });
  }

  tableContextMenu.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  for (const button of tableMenuButtons) {
    button.addEventListener("click", () => {
      runTableAction(button.dataset.tableAction);
    });
  }

  editor.addEventListener("input", () => {
    if (state.internalRender) {
      return;
    }
    normalizeLooseText();
    transformActiveBlock();
    state.dirty = true;
    updateChrome();
    updateStats();
    scheduleSelectionToolbarUpdate();
  });

  editor.addEventListener("paste", (event) => {
    const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
    if (!text) {
      return;
    }

    if (hasTableSelection()) {
      event.preventDefault();
      pasteTextIntoTableSelection(text);
      return;
    }

    event.preventDefault();
    if (looksLikeMarkdown(text)) {
      insertMarkdownAtSelection(text);
    } else {
      insertPlainTextAtSelection(text);
    }
    state.dirty = true;
    updateChrome();
    updateStats();
    scheduleSelectionToolbarUpdate();
  });

  editor.addEventListener("copy", handleEditorCopy);
  editor.addEventListener("cut", handleEditorCut);
  editor.addEventListener("pointerdown", handleEditorPointerDown);
  editor.addEventListener("pointermove", handleEditorPointerMove);
  editor.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      event.preventDefault();
    }
  });

  editor.addEventListener("contextmenu", handleEditorContextMenu);

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-menu-root]")) {
      closeAllMenus();
    }
    if (!editor.contains(event.target) && !selectionToolbar.contains(event.target)) {
      hideSelectionToolbar();
    }
    if (!tableContextMenu.contains(event.target)) {
      hideTableContextMenu();
    }
    if (!editor.contains(event.target) && !tableContextMenu.contains(event.target)) {
      clearTableSelection();
    }
  });

  document.addEventListener("selectionchange", () => {
    scheduleSelectionToolbarUpdate();
    updateSelectedTableCells();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!shortcutModal.hidden) {
        closeShortcutDialog();
        return;
      }
      if (!confirmModal.hidden) {
        closeConfirm(false);
        return;
      }
      hideSelectionToolbar();
      hideTableContextMenu();
      clearTableSelection();
      closeAllMenus();
      return;
    }

    if (!shortcutModal.hidden) {
      return;
    }

    if (handleTableNavigationKey(event)) {
      return;
    }

    const command = getCommandForKeyboardEvent(event);
    if (command && commandIsAvailable(command)) {
      event.preventDefault();
      invokeCommand(command.id);
    }
  });

  window.addEventListener("pointermove", (event) => {
    if (state.marginDrag) {
      updateMarginDrag(event);
    }
  });

  window.addEventListener("pointerup", () => {
    state.marginDrag = null;
    finishTableDragSelection();
  });

  window.addEventListener("resize", () => {
    updateLayout();
    scheduleSelectionToolbarUpdate();
    hideTableContextMenu();
  });

  documentScroll.addEventListener("scroll", () => {
    scheduleSelectionToolbarUpdate();
    hideTableContextMenu();
  });

  if (!bridge.native) {
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    });
  }

  loadDocument(DEFAULT_DOCUMENT, "Untitled.md", false);
  updateLayout();
  editor.focus();

  confirmCancelButton.addEventListener("click", () => closeConfirm(false));
  confirmDiscardButton.addEventListener("click", () => closeConfirm(true));
  confirmModal.addEventListener("click", (event) => {
    if (event.target === confirmModal) {
      closeConfirm(false);
    }
  });
  shortcutDefaultsButton.addEventListener("click", restoreDefaultShortcutFields);
  shortcutCancelButton.addEventListener("click", closeShortcutDialog);
  shortcutSaveButton.addEventListener("click", saveShortcutDialog);
  shortcutModal.addEventListener("click", (event) => {
    if (event.target === shortcutModal) {
      closeShortcutDialog();
    }
  });

  function setupMenuItems() {
    for (const button of commandButtons) {
      const command = commandById.get(button.dataset.command);
      if (!command) {
        continue;
      }

      button.replaceChildren(
        createSpan("menu-item-label", command.label),
        createSpan("menu-shortcut", "")
      );
    }
  }

  function setupMenus() {
    for (const root of menuRoots) {
      const title = root.querySelector(".menu-title");

      root.addEventListener("mouseenter", () => openMenu(root));
      root.addEventListener("mouseleave", () => closeMenu(root));
      root.addEventListener("focusin", () => openMenu(root));
      title.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.activeMenu === root) {
          closeMenu(root);
        } else {
          openMenu(root);
        }
      });
    }
  }

  function openMenu(root) {
    for (const menu of menuRoots) {
      if (menu !== root) {
        closeMenu(menu);
      }
    }

    const title = root.querySelector(".menu-title");
    const panel = root.querySelector(".menu-panel");
    panel.hidden = false;
    title.setAttribute("aria-expanded", "true");
    state.activeMenu = root;
  }

  function closeMenu(root) {
    const title = root.querySelector(".menu-title");
    const panel = root.querySelector(".menu-panel");
    panel.hidden = true;
    title.setAttribute("aria-expanded", "false");
    if (state.activeMenu === root) {
      state.activeMenu = null;
    }
  }

  function closeAllMenus() {
    for (const root of menuRoots) {
      closeMenu(root);
    }
  }

  function withMenusClosed(action) {
    closeAllMenus();
    action();
  }

  function invokeCommand(commandId) {
    const command = commandById.get(commandId);
    if (!command) {
      return false;
    }

    if (command.action) {
      runMenuAction(command.action);
    } else if (command.run) {
      command.run();
    }
    return true;
  }

  function commandIsAvailable(command) {
    return command.scope !== "editor" || selectionIsInsideEditor();
  }

  function createDefaultShortcutMap() {
    const shortcuts = new Map();
    for (const command of editableShortcutCommands) {
      shortcuts.set(command.id, normalizeShortcutText(command.shortcut));
    }
    return shortcuts;
  }

  function refreshShortcutMenuLabels() {
    for (const button of commandButtons) {
      const command = commandById.get(button.dataset.command);
      const shortcut = command ? getShortcutText(command.id) : "";
      const shortcutEl = button.querySelector(".menu-shortcut");
      if (shortcutEl) {
        shortcutEl.textContent = shortcut === "None" ? "" : shortcut;
      }
    }
  }

  function setMenuCommandLabel(commandId, label) {
    const button = document.querySelector('[data-command="' + commandId + '"]');
    const labelEl = button ? button.querySelector(".menu-item-label") : null;
    if (labelEl) {
      labelEl.textContent = label;
    }
  }

  function getShortcutText(commandId) {
    return state.shortcuts.get(commandId) || "None";
  }

  function getCommandForKeyboardEvent(event) {
    for (const command of editableShortcutCommands) {
      const shortcut = parseShortcutText(getShortcutText(command.id));
      if (shortcut && eventMatchesShortcut(event, shortcut)) {
        return command;
      }
    }
    return null;
  }

  function eventMatchesShortcut(event, shortcut) {
    return (
      Boolean(event.ctrlKey) === shortcut.ctrl &&
      Boolean(event.shiftKey) === shortcut.shift &&
      Boolean(event.altKey) === shortcut.alt &&
      Boolean(event.metaKey) === shortcut.meta &&
      shortcutKeysMatch(shortcut.key, normalizeEventKey(event.key))
    );
  }

  function shortcutKeysMatch(shortcutKey, eventKey) {
    return shortcutKey === eventKey || (shortcutKey === "=" && eventKey === "+");
  }

  function normalizeEventKey(key) {
    return normalizeKeyToken(key);
  }

  function normalizeShortcutText(text) {
    const parsed = parseShortcutText(text);
    return parsed ? shortcutToText(parsed) : "None";
  }

  function parseShortcutText(text) {
    const raw = String(text || "").trim();
    if (!raw || raw.toLowerCase() === "none") {
      return null;
    }

    const parts = raw.split("+").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) {
      return null;
    }

    const shortcut = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
    for (let index = 0; index < parts.length; index += 1) {
      const token = parts[index].toLowerCase();
      const isLast = index === parts.length - 1;
      if (!isLast && (token === "ctrl" || token === "control")) {
        shortcut.ctrl = true;
      } else if (!isLast && token === "shift") {
        shortcut.shift = true;
      } else if (!isLast && (token === "alt" || token === "option")) {
        shortcut.alt = true;
      } else if (!isLast && (token === "meta" || token === "super" || token === "cmd" || token === "command")) {
        shortcut.meta = true;
      } else if (isLast) {
        shortcut.key = normalizeKeyToken(parts[index]);
      } else {
        return null;
      }
    }

    if (!shortcut.key || (!shortcut.ctrl && !shortcut.shift && !shortcut.alt && !shortcut.meta)) {
      return null;
    }

    return shortcut;
  }

  function normalizeKeyToken(token) {
    const raw = String(token || "").trim();
    const lower = raw.toLowerCase();
    if (keyAliases.has(lower)) {
      return keyAliases.get(lower);
    }
    if (/^f\d{1,2}$/i.test(raw)) {
      return raw.toUpperCase();
    }
    if (raw.length === 1) {
      return /[a-z]/i.test(raw) ? raw.toLowerCase() : raw;
    }
    if (raw === "ArrowLeft" || raw === "ArrowRight" || raw === "ArrowUp" || raw === "ArrowDown") {
      return raw;
    }
    return raw.length > 1 ? raw[0].toUpperCase() + raw.slice(1) : raw;
  }

  function shortcutToText(shortcut) {
    const parts = [];
    if (shortcut.ctrl) {
      parts.push("Ctrl");
    }
    if (shortcut.shift) {
      parts.push("Shift");
    }
    if (shortcut.alt) {
      parts.push("Alt");
    }
    if (shortcut.meta) {
      parts.push("Meta");
    }
    parts.push(keyDisplay.get(shortcut.key) || (/^[a-z]$/.test(shortcut.key) ? shortcut.key.toUpperCase() : shortcut.key));
    return parts.join("+");
  }

  function shortcutIdentity(shortcut) {
    return [shortcut.ctrl, shortcut.shift, shortcut.alt, shortcut.meta, shortcut.key].join("|");
  }

  async function loadPreferences() {
    if (!bridge.native) {
      state.shortcutPreferencesLoaded = true;
      return;
    }

    try {
      const result = await bridge.send("loadPreferences");
      applyPreferences(result.preferences || {});
      state.shortcutPreferencesLoaded = true;
      refreshShortcutMenuLabels();
    } catch (error) {
      state.shortcutPreferencesLoaded = true;
      setStatus("Using default shortcuts");
    }
  }

  function applyPreferences(preferences) {
    if (!preferences || typeof preferences !== "object") {
      return;
    }

    const shortcuts = preferences.shortcuts;
    if (!shortcuts || typeof shortcuts !== "object" || Array.isArray(shortcuts)) {
      return;
    }

    let applied = 0;
    for (const [commandId, value] of Object.entries(shortcuts)) {
      if (applied >= MAX_PREFERENCES_SHORTCUTS) {
        break;
      }
      if (!commandById.has(commandId)) {
        continue;
      }
      const command = commandById.get(commandId);
      if (!command || command.editable === false || !command.shortcut) {
        continue;
      }
      state.shortcuts.set(commandId, String(value || "").trim() || "None");
      applied += 1;
    }
    const validation = validateShortcutMap(state.shortcuts);
    if (!validation.ok) {
      state.shortcuts = createDefaultShortcutMap();
      setStatus("Invalid saved shortcuts; defaults restored");
    } else {
      state.shortcuts = normalizeShortcutMap(state.shortcuts);
    }
  }

  async function persistPreferences() {
    if (!bridge.native) {
      return;
    }

    const shortcuts = {};
    for (const command of editableShortcutCommands) {
      shortcuts[command.id] = getShortcutText(command.id);
    }
    await bridge.send("savePreferences", {
      preferences: {
        version: 1,
        shortcuts,
      },
    });
  }

  function openShortcutDialog() {
    closeAllMenus();
    hideSelectionToolbar();
    hideTableContextMenu();
    renderShortcutFields(state.shortcuts);
    clearShortcutError();
    shortcutModal.hidden = false;
    const firstInput = shortcutList.querySelector(".shortcut-input");
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }
  }

  function renderShortcutFields(shortcuts) {
    shortcutList.replaceChildren();
    for (const command of editableShortcutCommands) {
      const row = document.createElement("label");
      row.className = "shortcut-row";
      const name = createSpan("shortcut-name", command.label);
      const input = document.createElement("input");
      input.className = "shortcut-input";
      input.type = "text";
      input.spellcheck = false;
      input.value = shortcuts.get(command.id) || "None";
      input.dataset.shortcutCommand = command.id;
      input.setAttribute("aria-label", command.label + " shortcut");
      row.append(name, input);
      shortcutList.append(row);
    }
  }

  function restoreDefaultShortcutFields() {
    renderShortcutFields(createDefaultShortcutMap());
    clearShortcutError();
    const firstInput = shortcutList.querySelector(".shortcut-input");
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }
  }

  async function saveShortcutDialog() {
    const rawShortcuts = new Map();
    for (const input of shortcutList.querySelectorAll("[data-shortcut-command]")) {
      rawShortcuts.set(input.dataset.shortcutCommand, input.value.trim() || "None");
    }

    const validation = validateShortcutMap(rawShortcuts);
    if (!validation.ok) {
      showShortcutError(validation.message);
      return;
    }

    state.shortcuts = normalizeShortcutMap(rawShortcuts);
    refreshShortcutMenuLabels();
    try {
      await persistPreferences();
      closeShortcutDialog();
      setStatus("Keyboard shortcuts updated");
    } catch (error) {
      showShortcutError("Could not save shortcuts.");
    }
  }

  function validateShortcutMap(shortcuts) {
    const used = new Map();
    for (const command of editableShortcutCommands) {
      const text = shortcuts.get(command.id) || "None";
      const parsed = parseShortcutText(text);
      if (text !== "None" && !parsed) {
        return { ok: false, message: "Invalid shortcut: " + command.label };
      }
      if (!parsed) {
        continue;
      }
      const identity = shortcutIdentity(parsed);
      if (used.has(identity)) {
        return {
          ok: false,
          message: "Shortcut already used: " + used.get(identity).label + " and " + command.label,
        };
      }
      used.set(identity, command);
    }
    return { ok: true };
  }

  function normalizeShortcutMap(shortcuts) {
    const normalized = new Map();
    for (const command of editableShortcutCommands) {
      normalized.set(command.id, normalizeShortcutText(shortcuts.get(command.id) || "None"));
    }
    return normalized;
  }

  function showShortcutError(message) {
    shortcutError.textContent = message;
    shortcutError.hidden = false;
  }

  function clearShortcutError() {
    shortcutError.textContent = "";
    shortcutError.hidden = true;
  }

  function closeShortcutDialog() {
    shortcutModal.hidden = true;
    clearShortcutError();
    editor.focus();
  }

  function runMenuAction(action) {
    ensureEditorFocus();
    let edited = EDITING_ACTIONS.has(action);

    if (action === "undo" || action === "redo") {
      document.execCommand(action, false);
    } else if (action === "selectAll") {
      edited = false;
      selectEditorContents();
    } else if (action === "bold") {
      document.execCommand("bold", false);
    } else if (action === "italic") {
      document.execCommand("italic", false);
    } else if (action === "strikethrough") {
      document.execCommand("strikeThrough", false);
    } else if (action === "inlineCode") {
      applyInlineCode();
    } else if (action === "paragraph") {
      document.execCommand("formatBlock", false, "p");
    } else if (action === "heading1") {
      document.execCommand("formatBlock", false, "h1");
    } else if (action === "heading2") {
      document.execCommand("formatBlock", false, "h2");
    } else if (action === "heading3") {
      document.execCommand("formatBlock", false, "h3");
    } else if (action === "blockquote") {
      document.execCommand("formatBlock", false, "blockquote");
    } else if (action === "bulletList") {
      document.execCommand("insertUnorderedList", false);
    } else if (action === "numberedList") {
      document.execCommand("insertOrderedList", false);
    } else if (action === "taskList") {
      insertTaskList();
    } else if (action === "codeBlock") {
      insertCodeBlock();
    } else if (action === "table") {
      insertTable();
    } else if (action === "horizontalRule") {
      insertHorizontalRule();
    } else if (action === "zoomIn") {
      edited = false;
      zoomBy(ZOOM_STEP);
    } else if (action === "zoomOut") {
      edited = false;
      zoomBy(-ZOOM_STEP);
    } else if (action === "resetZoom") {
      edited = false;
      setZoom(100);
    } else if (action === "fitWidth") {
      edited = false;
      fitPageWidth();
    } else if (action === "toggleRuler") {
      edited = false;
      documentSettings.rulerVisible = !documentSettings.rulerVisible;
      updateLayout();
    } else if (action === "themeDark") {
      edited = false;
      setTheme("dark");
    } else if (action === "themeLight") {
      edited = false;
      setTheme("light");
    } else if (action === "letterPage") {
      edited = false;
      setPageSize(8.5, 11);
    } else if (action === "a4Page") {
      edited = false;
      setPageSize(8.27, 11.69);
    } else if (action === "resetMargins") {
      edited = false;
      resetMargins();
    } else {
      edited = false;
    }

    if (edited) {
      state.dirty = true;
    }

    updateChrome();
    updateStats();
    scheduleSelectionToolbarUpdate();
  }

  function setupRuler() {
    leftMarginHandle.addEventListener("pointerdown", (event) => beginMarginDrag(event, "left"));
    rightMarginHandle.addEventListener("pointerdown", (event) => beginMarginDrag(event, "right"));
  }

  function beginMarginDrag(event, side) {
    event.preventDefault();
    state.marginDrag = side;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateMarginDrag(event) {
    const rect = rulerTrack.getBoundingClientRect();
    const zoom = documentSettings.zoom / 100;
    const pageWidthIn = documentSettings.pageWidthIn;
    const maxLeft = pageWidthIn - documentSettings.marginRightIn - MIN_CONTENT_IN;
    const maxRight = pageWidthIn - documentSettings.marginLeftIn - MIN_CONTENT_IN;

    if (state.marginDrag === "left") {
      const offset = clamp(event.clientX - rect.left, 0, rect.width);
      documentSettings.marginLeftIn = clamp(offset / (PX_PER_INCH * zoom), MIN_MARGIN_IN, maxLeft);
    } else if (state.marginDrag === "right") {
      const offset = clamp(rect.right - event.clientX, 0, rect.width);
      documentSettings.marginRightIn = clamp(offset / (PX_PER_INCH * zoom), MIN_MARGIN_IN, maxRight);
    }

    updateLayout();
  }

  async function newDocument() {
    if (!(await confirmDiscardChanges())) {
      return;
    }

    try {
      if (bridge.native) {
        await bridge.send("newFile");
      }
      loadDocument("", "Untitled.md", false);
      setStatus("New document");
    } catch (error) {
      handleBridgeError(error, "New document failed.");
    }
  }

  async function newWindow() {
    try {
      if (bridge.native) {
        await bridge.send("newWindow");
        setStatus("New window opened");
      } else {
        window.open(window.location.href, "_blank", "noopener");
      }
    } catch (error) {
      handleBridgeError(error, "New window failed.");
    }
  }

  async function openFile() {
    if (!(await confirmDiscardChanges())) {
      return;
    }

    try {
      if (bridge.native) {
        const result = await bridge.send("openFile");
        loadDocument(result.content, result.name, false);
        setStatus("Opened " + result.name);
      } else {
        fileInput.click();
      }
    } catch (error) {
      handleBridgeError(error, "Open failed.");
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) {
      return;
    }

    const content = await file.text();
    loadDocument(content, file.name, false);
    setStatus("Opened " + file.name);
  });

  async function saveFile(saveAs) {
    const content = getMarkdownContent();

    try {
      if (bridge.native) {
        const result = await bridge.send(saveAs ? "saveFileAs" : "saveFile", {
          content,
          name: state.name,
        });
        state.name = result.name;
        state.dirty = false;
        updateChrome();
        setStatus("Saved " + result.name);
      } else {
        downloadMarkdown(content);
        state.dirty = false;
        updateChrome();
        setStatus("Downloaded " + state.name);
      }
    } catch (error) {
      handleBridgeError(error, "Save failed.");
    }
  }

  function loadDocument(content, name, markDirty) {
    renderMarkdown(content || "");
    state.name = name || "Untitled.md";
    state.dirty = Boolean(markDirty);
    updateChrome();
    updateStats();
  }

  function renderMarkdown(markdown) {
    state.internalRender = true;
    window.InkwellMarkdown.renderMarkdown(markdown, editor, document);
    state.internalRender = false;
  }

  function getMarkdownContent() {
    return serializeBlocks(Array.from(editor.childNodes)).replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  function serializeBlocks(nodes) {
    return nodes
      .map((node) => serializeBlock(node))
      .filter((block) => block !== null)
      .join("\n\n");
  }

  function serializeBlock(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim();
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const text = serializeInline(node).trim();
      return "#".repeat(Number(tag[1])) + (text ? " " + text : "");
    }

    if (tag === "p" || tag === "div") {
      return serializeInline(node).trim();
    }

    if (tag === "ul" || tag === "ol") {
      return Array.from(node.children)
        .filter((child) => child.tagName && child.tagName.toLowerCase() === "li")
        .map((item, index) => {
          const marker = tag === "ol" ? index + 1 + ". " : "- ";
          return marker + serializeInline(item).trim();
        })
        .join("\n");
    }

    if (tag === "blockquote") {
      const quote = serializeBlocks(Array.from(node.childNodes)) || serializeInline(node);
      return quote
        .split("\n")
        .map((line) => "> " + line)
        .join("\n");
    }

    if (tag === "pre") {
      const code = node.querySelector("code") || node;
      const language = code.dataset && code.dataset.language ? code.dataset.language : "";
      return "```" + language + "\n" + code.textContent.replace(/\n$/, "") + "\n```";
    }

    if (tag === "table") {
      return serializeTable(node);
    }

    if (tag === "hr") {
      return "---";
    }

    if (tag === "br") {
      return "";
    }

    return serializeInline(node).trim();
  }

  function serializeInline(parent) {
    return Array.from(parent.childNodes)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const tag = node.tagName.toLowerCase();
        if (tag === "strong" || tag === "b") {
          return "**" + serializeInline(node) + "**";
        }
        if (tag === "em" || tag === "i") {
          return "*" + serializeInline(node) + "*";
        }
        if (tag === "s" || tag === "strike" || tag === "del") {
          return "~~" + serializeInline(node) + "~~";
        }
        if (tag === "code") {
          return "`" + node.textContent.replace(/`/g, "\\`") + "`";
        }
        if (tag === "a") {
          const label = serializeInline(node) || node.textContent;
          const href = window.InkwellMarkdown.sanitizeHref(node.getAttribute("href"));
          return href ? "[" + label + "](" + href + ")" : label;
        }
        if (tag === "br") {
          return "\n";
        }
        if (tag === "input" && node.type === "checkbox") {
          return node.checked ? "[x] " : "[ ] ";
        }

        return serializeInline(node);
      })
      .join("");
  }

  function serializeTable(table) {
    const headCells = Array.from(table.querySelectorAll("thead tr:first-child th"));
    const firstBodyRow = table.querySelector("tbody tr");
    const fallbackCells = firstBodyRow ? Array.from(firstBodyRow.children) : [];
    const headers = (headCells.length ? headCells : fallbackCells).map((cell, index) => {
      const text = serializeInline(cell).trim();
      return escapeTableCell(text || "Column " + (index + 1));
    });
    const aligns = (headCells.length ? headCells : fallbackCells).map((cell) => cell.dataset.align || "");
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.children).map((cell) => escapeTableCell(serializeInline(cell).trim()))
    );

    if (!headers.length) {
      return "";
    }

    const delimiter = aligns.map((align) => {
      if (align === "center") {
        return ":---:";
      }
      if (align === "right") {
        return "---:";
      }
      if (align === "left") {
        return ":---";
      }
      return "---";
    });
    const width = headers.length;
    const body = rows.map((row) => "| " + padCells(row, width).join(" | ") + " |");

    return ["| " + headers.join(" | ") + " |", "| " + delimiter.join(" | ") + " |", ...body].join("\n");
  }

  function escapeTableCell(text) {
    return String(text || "")
      .replace(/\n+/g, " ")
      .replace(/\|/g, "\\|");
  }

  function padCells(cells, length) {
    const padded = cells.slice(0, length);
    while (padded.length < length) {
      padded.push("");
    }
    return padded;
  }

  function normalizeLooseText() {
    const looseNodes = Array.from(editor.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );

    for (const node of looseNodes) {
      const paragraph = document.createElement("p");
      paragraph.textContent = node.textContent;
      node.replaceWith(paragraph);
      placeCaretAtEnd(paragraph);
    }
  }

  function transformActiveBlock() {
    const block = getActiveBlock();
    if (!block || block.closest("pre")) {
      return;
    }

    const tag = block.tagName.toLowerCase();
    if (!["p", "div", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      return;
    }

    const raw = block.textContent || "";
    const heading = raw.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      replaceBlock(block, "h" + heading[1].length, heading[2]);
      return;
    }

    const task = raw.match(/^[-*+]\s+\[( |x|X)\]\s+(.+)$/);
    if (task) {
      const list = document.createElement("ul");
      const item = document.createElement("li");
      const checkbox = document.createElement("input");
      item.className = "task-list-item";
      checkbox.type = "checkbox";
      checkbox.checked = task[1].toLowerCase() === "x";
      checkbox.disabled = true;
      item.append(checkbox, ...renderInlineNodes(task[2]));
      list.append(item);
      block.replaceWith(list);
      placeCaretAtEnd(item);
      return;
    }

    const unordered = raw.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      const list = document.createElement("ul");
      const item = document.createElement("li");
      renderInline(unordered[1], item);
      list.append(item);
      block.replaceWith(list);
      placeCaretAtEnd(item);
      return;
    }

    const ordered = raw.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      const list = document.createElement("ol");
      const item = document.createElement("li");
      renderInline(ordered[1], item);
      list.append(item);
      block.replaceWith(list);
      placeCaretAtEnd(item);
      return;
    }

    if (raw.startsWith("> ")) {
      const quote = document.createElement("blockquote");
      const paragraph = document.createElement("p");
      renderInline(raw.slice(2), paragraph);
      quote.append(paragraph);
      block.replaceWith(quote);
      placeCaretAtEnd(paragraph);
      return;
    }

    if (block.childNodes.length === 1 && block.firstChild.nodeType === Node.TEXT_NODE) {
      const inline = window.InkwellMarkdown.parseInline(raw);
      if (inline.some((node) => node.type !== "text")) {
        renderInline(raw, block);
        placeCaretAtEnd(block);
      }
    }
  }

  function replaceBlock(block, tagName, content) {
    const replacement = document.createElement(tagName);
    renderInline(content, replacement);
    block.replaceWith(replacement);
    placeCaretAtEnd(replacement);
  }

  function renderInline(markdown, parent) {
    parent.replaceChildren();
    window.InkwellMarkdown.renderInline(markdown, parent, document);
    if (!parent.textContent) {
      parent.append(document.createElement("br"));
    }
  }

  function renderInlineNodes(markdown) {
    const container = document.createElement("span");
    window.InkwellMarkdown.renderInline(markdown, container, document);
    return Array.from(container.childNodes);
  }

  function getActiveBlock() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    let node = selection.anchorNode;
    if (!node) {
      return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    while (node && node !== editor && node.parentElement !== editor) {
      node = node.parentElement;
    }

    return node === editor ? null : node;
  }

  function insertMarkdownAtSelection(markdown) {
    const container = document.createElement("div");
    window.InkwellMarkdown.renderMarkdown(markdown, container, document);
    insertNodesAtSelection(Array.from(container.childNodes));
  }

  function insertPlainTextAtSelection(text) {
    insertNodesAtSelection([document.createTextNode(text)]);
  }

  function insertNodesAtSelection(nodes) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editor.append(...nodes);
      placeCaretAtEnd(editor);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      editor.append(...nodes);
      placeCaretAtEnd(editor);
      return;
    }

    range.deleteContents();
    const fragment = document.createDocumentFragment();
    for (const node of nodes) {
      fragment.append(node);
    }
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function applyInlineCode() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selectionIsInsideEditor()) {
      return;
    }

    const range = selection.getRangeAt(0);
    const code = document.createElement("code");
    code.textContent = selection.toString() || "code";
    range.deleteContents();
    range.insertNode(code);
    placeCaretAfterNode(code);
  }

  function insertTaskList() {
    const selected = getSelectedText();
    const lines = selected ? selected.split(/\n+/).map((line) => line.trim()).filter(Boolean) : ["Task item"];
    const list = document.createElement("ul");

    for (const line of lines) {
      const item = document.createElement("li");
      const checkbox = document.createElement("input");
      item.className = "task-list-item";
      checkbox.type = "checkbox";
      checkbox.disabled = true;
      item.append(checkbox, document.createTextNode(line));
      list.append(item);
    }

    insertBlocksAtSelection([list], list.lastElementChild || list, true);
  }

  function insertCodeBlock() {
    const selected = getSelectedText();
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = selected || "code";
    pre.append(code);
    insertBlocksAtSelection([pre], code, Boolean(selected));
  }

  function insertTable() {
    const selected = getSelectedText();
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const tbody = document.createElement("tbody");

    for (let index = 1; index <= 3; index += 1) {
      const header = document.createElement("th");
      header.textContent = "Column " + index;
      headRow.append(header);
    }

    for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
        const cell = document.createElement("td");
        if (rowIndex === 0 && columnIndex === 0 && selected) {
          cell.textContent = selected;
        } else {
          cell.textContent = "Cell";
        }
        row.append(cell);
      }
      tbody.append(row);
    }

    thead.append(headRow);
    table.append(thead, tbody);
    insertBlocksAtSelection([table], tbody.querySelector("td") || table, false);
  }

  function insertHorizontalRule() {
    const rule = document.createElement("hr");
    const paragraph = document.createElement("p");
    paragraph.append(document.createElement("br"));
    insertBlocksAtSelection([rule, paragraph], paragraph, false);
  }

  function handleEditorContextMenu(event) {
    const cell = event.target.closest("th, td");
    if (!cell || !editor.contains(cell)) {
      hideTableContextMenu();
      clearTableSelection();
      return;
    }

    event.preventDefault();
    closeAllMenus();
    hideSelectionToolbar();
    openTableContextMenu(cell, event.clientX, event.clientY);
  }

  function openTableContextMenu(cell, clientX, clientY) {
    const table = cell.closest("table");
    const selectedCells = getSelectedTableCells(table);
    const cells = selectedCells.includes(cell) ? selectedCells : [cell];

    setTableSelectionCells(table, cells);
    state.tableContext = { table, cell, cells };
    markSelectedTableCells(cells);
    updateTableMenuState(state.tableContext);
    tableContextMenu.hidden = false;

    const rect = tableContextMenu.getBoundingClientRect();
    const left = clamp(clientX, 8, window.innerWidth - rect.width - 8);
    const top = clamp(clientY, 8, window.innerHeight - rect.height - 8);
    tableContextMenu.style.left = left + "px";
    tableContextMenu.style.top = top + "px";
  }

  function runTableAction(action) {
    const context = state.tableContext;
    if (!context || !context.table || !context.cell || !context.table.isConnected) {
      hideTableContextMenu();
      return;
    }

    if (action === "insertRowAbove") {
      insertTableRow(context, "above");
    } else if (action === "insertRowBelow") {
      insertTableRow(context, "below");
    } else if (action === "deleteRows") {
      deleteTableRows(context);
    } else if (action === "insertColumnLeft") {
      insertTableColumn(context, "left");
    } else if (action === "insertColumnRight") {
      insertTableColumn(context, "right");
    } else if (action === "deleteColumns") {
      deleteTableColumns(context);
    } else if (action === "alignColumnLeft") {
      setTableColumnAlignment(context, "left");
    } else if (action === "alignColumnCenter") {
      setTableColumnAlignment(context, "center");
    } else if (action === "alignColumnRight") {
      setTableColumnAlignment(context, "right");
    } else if (action === "alignColumnDefault") {
      setTableColumnAlignment(context, "");
    } else if (action === "copyCells") {
      copyTableSelection(context);
      return;
    } else if (action === "cutCells") {
      cutTableSelection(context);
      return;
    } else if (action === "pasteCells") {
      pasteIntoTableSelectionFromMenu(context);
      return;
    } else if (action === "clearCells") {
      clearTableCells(context.cells);
    } else if (action === "clearRows") {
      clearTableRows(context);
    } else if (action === "clearColumns") {
      clearTableColumns(context);
    } else if (action === "normalizeTable") {
      normalizeTable(context.table);
    } else if (action === "deleteTable") {
      deleteTable(context.table);
    }

    hideTableContextMenu();
    clearTableSelection();
    markEdited("Table updated");
  }

  function insertTableRow(context, placement) {
    const row = context.cell.closest("tr");
    const body = ensureTableBody(context.table);
    const newRow = createTableRow(context.table);

    if (row.parentElement && row.parentElement.tagName.toLowerCase() === "thead") {
      body.prepend(newRow);
    } else if (placement === "above") {
      row.before(newRow);
    } else {
      row.after(newRow);
    }

    placeCaretAtEnd(newRow.children[getCellColumnIndex(context.cell)] || newRow.firstElementChild || newRow);
  }

  function deleteTableRows(context) {
    const rows = getContextRows(context).filter((row) => row.parentElement.tagName.toLowerCase() === "tbody");
    const body = ensureTableBody(context.table);

    for (const row of rows) {
      row.remove();
    }

    if (!body.querySelector("tr")) {
      body.append(createTableRow(context.table));
    }

    placeCaretAtEnd(body.querySelector("td") || context.table);
  }

  function insertTableColumn(context, placement) {
    const index = getCellColumnIndex(context.cell);
    const insertIndex = placement === "right" ? index + 1 : index;

    for (const row of getTableRows(context.table)) {
      const newCell = createCellForRow(row, insertIndex);
      const reference = row.children[insertIndex] || null;
      row.insertBefore(newCell, reference);
    }

    normalizeGeneratedHeaders(context.table);
    placeCaretAtEnd(getCellAt(context.table, context.cell.closest("tr"), insertIndex) || context.table);
  }

  function deleteTableColumns(context) {
    const count = getTableColumnCount(context.table);
    const columns = getContextColumnIndexes(context).filter((index) => index >= 0 && index < count);
    const removable = columns.slice(0, Math.max(0, count - 1));

    for (const row of getTableRows(context.table)) {
      for (const index of removable.slice().sort((a, b) => b - a)) {
        const cell = row.children[index];
        if (cell) {
          cell.remove();
        }
      }
    }

    ensureMinimumTableShape(context.table);
    normalizeGeneratedHeaders(context.table);
    placeCaretAtEnd(context.table.querySelector("td, th") || context.table);
  }

  function setTableColumnAlignment(context, align) {
    for (const index of getContextColumnIndexes(context)) {
      for (const row of getTableRows(context.table)) {
        const cell = row.children[index];
        if (cell) {
          applyCellAlignment(cell, align);
        }
      }
    }
  }

  function clearTableCells(cells) {
    for (const cell of cells) {
      resetTableCell(cell);
    }
  }

  function clearTableRows(context) {
    for (const row of getContextRows(context)) {
      Array.from(row.children).forEach(resetTableCell);
    }
  }

  function clearTableColumns(context) {
    for (const index of getContextColumnIndexes(context)) {
      for (const row of getTableRows(context.table)) {
        if (row.children[index]) {
          resetTableCell(row.children[index]);
        }
      }
    }
  }

  function deleteTable(table) {
    const paragraph = document.createElement("p");
    paragraph.append(document.createElement("br"));
    table.replaceWith(paragraph);
    placeCaretAtEnd(paragraph);
  }

  function getContextRows(context) {
    const rows = context.cells
      .map((cell) => cell.closest("tr"))
      .filter(Boolean);
    return uniqueElements(rows.length ? rows : [context.cell.closest("tr")]);
  }

  function getContextColumnIndexes(context) {
    const indexes = context.cells.map(getCellColumnIndex).filter((index) => index >= 0);
    return Array.from(new Set(indexes.length ? indexes : [getCellColumnIndex(context.cell)])).sort((a, b) => a - b);
  }

  function hasTableSelection() {
    return Boolean(
      state.tableSelection &&
        state.tableSelection.table &&
        state.tableSelection.table.isConnected &&
        state.tableSelection.cells &&
        state.tableSelection.cells.length
    );
  }

  function getSelectedTableCells(table) {
    if (hasTableSelection() && state.tableSelection.table === table) {
      return state.tableSelection.cells.slice();
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !table) {
      return [];
    }

    const range = selection.getRangeAt(0);
    if (!table.contains(selection.anchorNode) || !table.contains(selection.focusNode)) {
      return [];
    }

    return Array.from(table.querySelectorAll("th, td")).filter((cell) => range.intersectsNode(cell));
  }

  function updateSelectedTableCells() {
    if (hasTableSelection()) {
      markSelectedTableCells(state.tableSelection.cells);
      return;
    }

    clearSelectedTableCells();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.anchorNode) {
      return;
    }

    const anchorElement =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    const table = anchorElement ? anchorElement.closest("table") : null;
    if (!table) {
      return;
    }

    markSelectedTableCells(getSelectedTableCells(table));
  }

  function handleEditorPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const cell = event.target.closest("th, td");
    if (!cell || !editor.contains(cell)) {
      clearTableSelection();
      return;
    }

    setTableSelectionCells(cell.closest("table"), [cell]);
    state.tableSelection.anchor = cell;
    state.tableSelection.focus = cell;
    state.tableSelection.dragging = true;
  }

  function handleEditorPointerMove(event) {
    if (!state.tableSelection || !state.tableSelection.dragging) {
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target ? target.closest("th, td") : null;
    if (!cell || cell.closest("table") !== state.tableSelection.table) {
      return;
    }

    if (cell !== state.tableSelection.focus) {
      event.preventDefault();
      setTableSelectionRange(state.tableSelection.anchor, cell);
      hideSelectionToolbar();
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    }
  }

  function finishTableDragSelection() {
    if (state.tableSelection) {
      state.tableSelection.dragging = false;
    }
  }

  function setTableSelectionRange(anchor, focus) {
    const table = anchor.closest("table");
    if (!table || focus.closest("table") !== table) {
      return;
    }

    const rows = getTableRows(table);
    const anchorRow = rows.indexOf(anchor.closest("tr"));
    const focusRow = rows.indexOf(focus.closest("tr"));
    const anchorColumn = getCellColumnIndex(anchor);
    const focusColumn = getCellColumnIndex(focus);
    if (anchorRow < 0 || focusRow < 0 || anchorColumn < 0 || focusColumn < 0) {
      return;
    }

    const minRow = Math.min(anchorRow, focusRow);
    const maxRow = Math.max(anchorRow, focusRow);
    const minColumn = Math.min(anchorColumn, focusColumn);
    const maxColumn = Math.max(anchorColumn, focusColumn);
    const cells = [];
    for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
        if (row.children[columnIndex]) {
          cells.push(row.children[columnIndex]);
        }
      }
    }

    state.tableSelection = {
      table,
      anchor,
      focus,
      cells,
      dragging: true,
    };
    markSelectedTableCells(cells);
  }

  function setTableSelectionCells(table, cells) {
    const filtered = uniqueElements(cells).filter((cell) => table && table.contains(cell));
    state.tableSelection = filtered.length
      ? {
          table,
          anchor: filtered[0],
          focus: filtered[filtered.length - 1],
          cells: filtered,
          dragging: false,
        }
      : null;
    markSelectedTableCells(filtered);
  }

  function markSelectedTableCells(cells) {
    clearSelectedTableCells();
    for (const cell of cells) {
      cell.classList.add("is-selected-table-cell");
    }
  }

  function clearSelectedTableCells() {
    for (const cell of editor.querySelectorAll(".is-selected-table-cell")) {
      cell.classList.remove("is-selected-table-cell");
    }
  }

  function hideTableContextMenu() {
    tableContextMenu.hidden = true;
    state.tableContext = null;
  }

  function clearTableSelection() {
    state.tableSelection = null;
    state.tableContext = null;
    clearSelectedTableCells();
  }

  function updateTableMenuState(context) {
    const table = context.table;
    const columnCount = getTableColumnCount(table);
    const canDeleteRows = getContextRows(context).some((row) => row.parentElement.tagName.toLowerCase() === "tbody");
    for (const button of tableMenuButtons) {
      const action = button.dataset.tableAction;
      button.disabled = (action === "deleteColumns" && columnCount <= 1) || (action === "deleteRows" && !canDeleteRows);
    }
  }

  function copyTableSelection(context) {
    setTableSelectionCells(context.table, context.cells);
    hideTableContextMenu();
    editor.focus();
    if (!document.execCommand("copy", false)) {
      setStatus("Copy unavailable here");
    }
  }

  function cutTableSelection(context) {
    setTableSelectionCells(context.table, context.cells);
    hideTableContextMenu();
    editor.focus();
    if (!document.execCommand("cut", false)) {
      setStatus("Cut unavailable here");
    }
  }

  function pasteIntoTableSelectionFromMenu(context) {
    setTableSelectionCells(context.table, context.cells);
    hideTableContextMenu();
    editor.focus();
    if (!document.execCommand("paste", false)) {
      setStatus("Press Ctrl+V to paste into selected cells");
    }
  }

  function handleEditorCopy(event) {
    if (!hasTableSelection() || !event.clipboardData) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", selectedTableCellsToText(state.tableSelection));
    setStatus("Copied table cells");
  }

  function handleEditorCut(event) {
    if (!hasTableSelection() || !event.clipboardData) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", selectedTableCellsToText(state.tableSelection));
    clearTableCells(state.tableSelection.cells);
    markEdited("Cut table cells");
  }

  function pasteTextIntoTableSelection(text) {
    if (!hasTableSelection()) {
      return false;
    }

    pasteTableText(state.tableSelection, text);
    clearTableSelection();
    markEdited("Pasted table cells");
    return true;
  }

  function selectedTableCellsToText(selection) {
    const bounds = getTableSelectionBounds(selection.table, selection.cells);
    if (!bounds) {
      return "";
    }

    const selected = new Set(selection.cells);
    const lines = [];
    for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex += 1) {
      const row = bounds.rows[rowIndex];
      const values = [];
      for (let columnIndex = bounds.minColumn; columnIndex <= bounds.maxColumn; columnIndex += 1) {
        const cell = row.children[columnIndex];
        values.push(cell && selected.has(cell) ? serializeInline(cell).trim() : "");
      }
      lines.push(values.join("\t"));
    }
    return lines.join("\n");
  }

  function pasteTableText(selection, text) {
    const grid = parseTableClipboard(text);
    if (!grid.length || !grid[0].length) {
      return;
    }

    const bounds = getTableSelectionBounds(selection.table, selection.cells);
    if (!bounds) {
      return;
    }

    const width = Math.max(...grid.map((row) => row.length));
    ensureTableDimensions(selection.table, bounds.minRow + grid.length, bounds.minColumn + width);
    const rows = getTableRows(selection.table);

    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      const row = rows[bounds.minRow + rowIndex];
      if (!row) {
        continue;
      }
      for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
        const cell = row.children[bounds.minColumn + columnIndex];
        if (cell) {
          setCellPlainText(cell, grid[rowIndex][columnIndex] || "");
        }
      }
    }

    normalizeGeneratedHeaders(selection.table);
  }

  function parseTableClipboard(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1] === "") {
      lines.pop();
    }
    if (!lines.length) {
      return [];
    }

    if (lines.some((line) => line.includes("|"))) {
      const rows = lines
        .map(splitMarkdownTableRow)
        .filter((row) => row.length && !isMarkdownDelimiterRow(row));
      if (rows.length) {
        return rows;
      }
    }

    return lines.map((line) => line.split("\t"));
  }

  function splitMarkdownTableRow(line) {
    let text = String(line || "").trim();
    if (!text.includes("|")) {
      return [];
    }
    if (text.startsWith("|")) {
      text = text.slice(1);
    }
    if (text.endsWith("|")) {
      text = text.slice(0, -1);
    }

    const cells = [];
    let cell = "";
    let escaped = false;
    for (const char of text) {
      if (escaped) {
        cell += char;
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "|") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  function isMarkdownDelimiterRow(row) {
    return row.every((cell) => /^:?-{3,}:?$/.test(String(cell || "").trim()));
  }

  function getTableSelectionBounds(table, cells) {
    const rows = getTableRows(table);
    const rowIndexes = [];
    const columnIndexes = [];
    for (const cell of cells) {
      const row = cell.closest("tr");
      const rowIndex = rows.indexOf(row);
      const columnIndex = getCellColumnIndex(cell);
      if (rowIndex >= 0 && columnIndex >= 0) {
        rowIndexes.push(rowIndex);
        columnIndexes.push(columnIndex);
      }
    }
    if (!rowIndexes.length || !columnIndexes.length) {
      return null;
    }
    return {
      rows,
      minRow: Math.min(...rowIndexes),
      maxRow: Math.max(...rowIndexes),
      minColumn: Math.min(...columnIndexes),
      maxColumn: Math.max(...columnIndexes),
    };
  }

  function ensureTableDimensions(table, rowCount, columnCount) {
    ensureMinimumTableShape(table);

    while (getTableColumnCount(table) < columnCount) {
      for (const row of getTableRows(table)) {
        row.append(createCellForRow(row, row.children.length));
      }
    }

    const body = ensureTableBody(table);
    while (getTableRows(table).length < rowCount) {
      body.append(createTableRow(table));
    }

    for (const row of getTableRows(table)) {
      while (row.children.length < columnCount) {
        row.append(createCellForRow(row, row.children.length));
      }
    }
  }

  function normalizeTable(table) {
    let thead = table.querySelector("thead");
    if (!thead) {
      thead = document.createElement("thead");
      table.prepend(thead);
    }

    let headerRow = thead.querySelector("tr");
    if (!headerRow) {
      headerRow = document.createElement("tr");
      thead.append(headerRow);
    }

    const body = ensureTableBody(table);
    if (!body.querySelector("tr")) {
      body.append(createTableRow(table));
    }

    const columnCount = getTableColumnCount(table);
    ensureTableDimensions(table, getTableRows(table).length, columnCount);
    normalizeGeneratedHeaders(table);
  }

  function setCellPlainText(cell, text) {
    cell.replaceChildren();
    if (text) {
      cell.textContent = text;
    } else {
      cell.append(document.createElement("br"));
    }
  }

  function handleTableNavigationKey(event) {
    if (event.key !== "Tab") {
      return false;
    }

    const cell = getActiveTableCell();
    if (!cell) {
      return false;
    }

    event.preventDefault();
    moveTableFocus(cell, !event.shiftKey);
    return true;
  }

  function getActiveTableCell() {
    if (hasTableSelection() && state.tableSelection.focus && state.tableSelection.focus.isConnected) {
      return state.tableSelection.focus;
    }

    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) {
      return null;
    }
    const anchor =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    const cell = anchor ? anchor.closest("th, td") : null;
    return cell && editor.contains(cell) ? cell : null;
  }

  function moveTableFocus(cell, forward) {
    const table = cell.closest("table");
    const cells = getTableRows(table).flatMap((row) => Array.from(row.children));
    let index = cells.indexOf(cell);
    if (index < 0) {
      return;
    }

    index += forward ? 1 : -1;
    if (index >= cells.length) {
      const row = createTableRow(table);
      ensureTableBody(table).append(row);
      normalizeGeneratedHeaders(table);
      placeCaretAtEnd(row.firstElementChild || row);
      setTableSelectionCells(table, [row.firstElementChild].filter(Boolean));
      return;
    }
    if (index < 0) {
      return;
    }

    const nextCell = cells[index];
    placeCaretAtEnd(nextCell);
    setTableSelectionCells(table, [nextCell]);
  }

  function getTableRows(table) {
    return Array.from(table.querySelectorAll("thead tr, tbody tr"));
  }

  function ensureTableBody(table) {
    let body = table.querySelector("tbody");
    if (!body) {
      body = document.createElement("tbody");
      table.append(body);
    }
    return body;
  }

  function createTableRow(table) {
    const row = document.createElement("tr");
    const count = getTableColumnCount(table);
    for (let index = 0; index < count; index += 1) {
      row.append(createTableCell("td", ""));
    }
    return row;
  }

  function createCellForRow(row, index) {
    const isHeader = row.parentElement && row.parentElement.tagName.toLowerCase() === "thead";
    return createTableCell(isHeader ? "th" : "td", isHeader ? "Column " + (index + 1) : "");
  }

  function createTableCell(tagName, text) {
    const cell = document.createElement(tagName);
    if (text) {
      cell.textContent = text;
    } else {
      cell.append(document.createElement("br"));
    }
    return cell;
  }

  function resetTableCell(cell) {
    if (cell.tagName.toLowerCase() === "th") {
      cell.textContent = "Column " + (getCellColumnIndex(cell) + 1);
    } else {
      cell.replaceChildren(document.createElement("br"));
    }
  }

  function applyCellAlignment(cell, align) {
    if (align) {
      cell.dataset.align = align;
      cell.style.textAlign = align;
    } else {
      delete cell.dataset.align;
      cell.style.textAlign = "";
    }
  }

  function getCellColumnIndex(cell) {
    return cell && cell.parentElement ? Array.from(cell.parentElement.children).indexOf(cell) : -1;
  }

  function getCellAt(table, row, index) {
    if (!row || !table.contains(row)) {
      return null;
    }
    return row.children[index] || row.lastElementChild;
  }

  function getTableColumnCount(table) {
    return Math.max(1, ...getTableRows(table).map((row) => row.children.length));
  }

  function normalizeGeneratedHeaders(table) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) {
      return;
    }

    Array.from(headerRow.children).forEach((cell, index) => {
      if (!cell.textContent.trim() || /^Column \d+$/.test(cell.textContent.trim())) {
        cell.textContent = "Column " + (index + 1);
      }
    });
  }

  function ensureMinimumTableShape(table) {
    const headerRow = table.querySelector("thead tr");
    if (headerRow && !headerRow.children.length) {
      headerRow.append(createTableCell("th", "Column 1"));
    }

    const body = ensureTableBody(table);
    if (!body.querySelector("tr")) {
      body.append(createTableRow(table));
    }

    for (const row of getTableRows(table)) {
      if (!row.children.length) {
        row.append(createCellForRow(row, 0));
      }
    }
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
  }

  function markEdited(message) {
    state.dirty = true;
    updateChrome();
    updateStats();
    if (message) {
      setStatus(message);
    }
    scheduleSelectionToolbarUpdate();
  }

  function insertBlocksAtSelection(blocks, caretTarget, replaceSelection) {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const activeBlock = getActiveBlock();
    const selectedBlocks = range && replaceSelection ? getSelectedBlocks(range) : [];
    const fragment = document.createDocumentFragment();

    for (const block of blocks) {
      fragment.append(block);
    }

    if (selectedBlocks.length) {
      selectedBlocks[0].before(fragment);
      for (const block of selectedBlocks) {
        block.remove();
      }
    } else if (activeBlock) {
      activeBlock.after(fragment);
    } else {
      editor.append(fragment);
    }

    placeCaretAtEnd(caretTarget || blocks[blocks.length - 1]);
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || !selectionIsInsideEditor()) {
      return "";
    }
    return selection.toString().trim();
  }

  function getSelectedBlocks(range) {
    return Array.from(editor.children).filter((child) => range.intersectsNode(child));
  }

  function placeCaretAtEnd(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placeCaretAfterNode(node) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function looksLikeMarkdown(text) {
    return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~)/.test(text) ||
      /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\)|\|.+\|\n\|[-:| ]+\|)/.test(text);
  }

  function selectionIsInsideEditor() {
    const selection = window.getSelection();
    return Boolean(
      selection &&
        selection.anchorNode &&
        selection.focusNode &&
        editor.contains(selection.anchorNode) &&
        editor.contains(selection.focusNode)
    );
  }

  function scheduleSelectionToolbarUpdate() {
    if (state.toolbarFrame) {
      return;
    }

    state.toolbarFrame = window.requestAnimationFrame(() => {
      state.toolbarFrame = null;
      updateSelectionToolbar();
    });
  }

  function updateSelectionToolbar() {
    const range = getSelectionRangeInEditor();
    if (!range) {
      hideSelectionToolbar();
      return;
    }

    const rect = getRangeRect(range);
    if (!rect) {
      hideSelectionToolbar();
      return;
    }

    state.savedRange = range.cloneRange();
    selectionToolbar.hidden = false;

    const toolbarRect = selectionToolbar.getBoundingClientRect();
    const left = clamp(rect.left + rect.width / 2 - toolbarRect.width / 2, 8, window.innerWidth - toolbarRect.width - 8);
    let top = rect.top - toolbarRect.height - 12;
    if (top < 8) {
      top = rect.bottom + 12;
    }

    selectionToolbar.style.left = left + "px";
    selectionToolbar.style.top = clamp(top, 8, window.innerHeight - toolbarRect.height - 8) + "px";
  }

  function getSelectionRangeInEditor() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selectionIsInsideEditor()) {
      return null;
    }

    return selection.getRangeAt(0);
  }

  function getRangeRect(range) {
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) {
      return rect;
    }

    const rects = range.getClientRects();
    return rects.length ? rects[0] : null;
  }

  function hideSelectionToolbar() {
    selectionToolbar.hidden = true;
    state.savedRange = null;
  }

  function restoreSavedSelection() {
    if (!state.savedRange) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(state.savedRange);
  }

  function selectEditorContents() {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function ensureEditorFocus() {
    if (!selectionIsInsideEditor()) {
      editor.focus();
    }
  }

  function setTheme(theme) {
    documentSettings.theme = theme;
    document.body.dataset.theme = theme;
    setStatus(theme === "light" ? "Light theme" : "Dark theme");
  }

  function setPageSize(widthIn, heightIn) {
    documentSettings.pageWidthIn = widthIn;
    documentSettings.pageHeightIn = heightIn;
    clampMargins();
    updateLayout();
    setStatus(widthIn === 8.5 ? "Letter page" : "A4 page");
  }

  function resetMargins() {
    documentSettings.marginLeftIn = 1;
    documentSettings.marginRightIn = 1;
    clampMargins();
    updateLayout();
    setStatus("Margins reset");
  }

  function zoomBy(delta) {
    setZoom(documentSettings.zoom + delta);
  }

  function setZoom(value) {
    documentSettings.zoom = clamp(Math.round(value), MIN_ZOOM, MAX_ZOOM);
    updateLayout();
  }

  function fitPageWidth() {
    const available = Math.max(documentScroll.clientWidth - 48, 320);
    const zoom = (available / (documentSettings.pageWidthIn * PX_PER_INCH)) * 100;
    setZoom(zoom);
  }

  function updateLayout() {
    const zoom = documentSettings.zoom / 100;
    const pageWidthPx = documentSettings.pageWidthIn * PX_PER_INCH * zoom;
    const pageHeightPx = documentSettings.pageHeightIn * PX_PER_INCH * zoom;
    const marginLeftPx = documentSettings.marginLeftIn * PX_PER_INCH * zoom;
    const marginRightPx = documentSettings.marginRightIn * PX_PER_INCH * zoom;
    const fontSizePx = 16 * zoom;

    document.documentElement.style.setProperty("--page-width-px", pageWidthPx + "px");
    document.documentElement.style.setProperty("--page-min-height-px", pageHeightPx + "px");
    document.documentElement.style.setProperty("--page-margin-left-px", marginLeftPx + "px");
    document.documentElement.style.setProperty("--page-margin-right-px", marginRightPx + "px");
    document.documentElement.style.setProperty("--editor-font-size-px", fontSizePx + "px");
    document.body.dataset.theme = documentSettings.theme;

    ruler.hidden = !documentSettings.rulerVisible;
    document.body.classList.toggle("ruler-hidden", !documentSettings.rulerVisible);
    zoomState.textContent = documentSettings.zoom + "%";
    updateRulerLabels();
    updateRulerGeometry(marginLeftPx, marginRightPx);
  }

  function updateRulerLabels() {
    rulerTicks.replaceChildren();
    const zoom = documentSettings.zoom / 100;
    const eighths = Math.round(documentSettings.pageWidthIn * 8);

    for (let tick = 0; tick <= eighths; tick += 1) {
      const tickEl = document.createElement("span");
      const inch = tick / 8;
      tickEl.className = "ruler-tick";
      if (tick % 8 === 0) {
        tickEl.classList.add("major");
        const label = document.createElement("span");
        label.className = "ruler-label";
        label.textContent = String(Math.round(inch));
        tickEl.append(label);
      } else if (tick % 4 === 0) {
        tickEl.classList.add("mid");
      }
      tickEl.style.left = inch * PX_PER_INCH * zoom + "px";
      rulerTicks.append(tickEl);
    }
  }

  function updateRulerGeometry(marginLeftPx, marginRightPx) {
    leftMarginShade.style.width = marginLeftPx + "px";
    rightMarginShade.style.width = marginRightPx + "px";
    leftMarginHandle.style.left = marginLeftPx + "px";
    rightMarginHandle.style.right = marginRightPx + "px";

    setMenuCommandLabel("toggleRuler", documentSettings.rulerVisible ? "Hide Ruler" : "Show Ruler");
  }

  function clampMargins() {
    const max = Math.max(MIN_MARGIN_IN, documentSettings.pageWidthIn - MIN_CONTENT_IN - MIN_MARGIN_IN);
    documentSettings.marginLeftIn = clamp(documentSettings.marginLeftIn, MIN_MARGIN_IN, max);
    documentSettings.marginRightIn = clamp(
      documentSettings.marginRightIn,
      MIN_MARGIN_IN,
      documentSettings.pageWidthIn - documentSettings.marginLeftIn - MIN_CONTENT_IN
    );
  }

  function updateChrome() {
    document.title = (state.dirty ? "*" : "") + state.name + " - Inkwell";
    fileName.textContent = state.name;
    dirtyState.textContent = state.dirty ? "Unsaved" : "Saved";
    dirtyState.classList.toggle("is-dirty", state.dirty);
  }

  function updateStats() {
    const text = editor.textContent.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = getMarkdownContent().length;
    documentStats.textContent = words + " words / " + chars + " chars";
  }

  function setStatus(message) {
    statusText.textContent = message;
    if (state.statusTimer) {
      window.clearTimeout(state.statusTimer);
    }
    state.statusTimer = window.setTimeout(() => {
      statusText.textContent = "Ready";
    }, 3600);
  }

  function confirmDiscardChanges() {
    if (!state.dirty) {
      return Promise.resolve(true);
    }

    if (!confirmModal.hidden) {
      return Promise.resolve(false);
    }

    confirmModal.hidden = false;
    confirmDiscardButton.focus();

    return new Promise((resolve) => {
      state.confirmResolve = resolve;
    });
  }

  function closeConfirm(result) {
    if (confirmModal.hidden) {
      return;
    }

    confirmModal.hidden = true;
    editor.focus();
    if (state.confirmResolve) {
      state.confirmResolve(result);
      state.confirmResolve = null;
    }
  }

  async function handleCloseRequest() {
    if (!(await confirmDiscardChanges())) {
      return;
    }

    try {
      await bridge.send("closeWindow");
    } catch (error) {
      handleBridgeError(error, "Close failed.");
    }
  }

  function downloadMarkdown(content) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = state.name || "Untitled.md";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleBridgeError(error, fallbackMessage) {
    if (String(error && error.message ? error.message : error) === "cancelled") {
      return;
    }
    setStatus((error && error.message) || fallbackMessage);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function createBridge() {
    const native =
      Boolean(window.webkit) &&
      Boolean(window.webkit.messageHandlers) &&
      Boolean(window.webkit.messageHandlers.inkwell);
    let sequence = 0;
    const pending = new Map();

    window.InkwellBridgeResponse = (message) => {
      const request = pending.get(message.id);
      if (!request) {
        return;
      }

      pending.delete(message.id);
      window.clearTimeout(request.timer);
      if (message.ok) {
        request.resolve(message.data || {});
      } else {
        request.reject(new Error(message.error || "Bridge request failed."));
      }
    };

    return {
      native,
      send(action, payload) {
        if (!native) {
          return Promise.reject(new Error("Native bridge is not available."));
        }

        const id = String(++sequence);
        const message = JSON.stringify({ id, action, payload: payload || {} });
        return new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => {
            pending.delete(id);
            reject(new Error("Native bridge request timed out."));
          }, BRIDGE_TIMEOUT_MS);
          pending.set(id, { resolve, reject, timer });
          window.webkit.messageHandlers.inkwell.postMessage(message);
        });
      },
    };
  }
})();
