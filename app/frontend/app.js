(function startInkwell() {
  "use strict";

  const DEFAULT_DOCUMENT = "# Untitled\n\nStart writing with **Markdown**.";
  const BRIDGE_TIMEOUT_MS = 60000;
  const PX_PER_INCH = 96;
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 200;
  const ZOOM_STEP = 10;
  const MIN_MARGIN_IN = 0;
  const MIN_CONTENT_IN = 2;
  const MIN_PAGE_WIDTH_IN = 4;
  const MAX_PAGE_WIDTH_IN = 17;
  const PAGE_EXPANSION_MARGIN_IN = 0.5;
  const MAX_PREFERENCES_SHORTCUTS = 80;
  const STATS_UPDATE_DELAY_MS = 200;
  const ENTER_REPEAT_STALE_MS = 120;
  const FIND_RENDER_DELAY_MS = 50;
  const MAX_FIND_RECTS = 2000;
  const HISTORY_MAX_ENTRIES = 100;
  const HISTORY_MAX_BYTES = 16 * 1024 * 1024;
  const HISTORY_GROUP_DELAY_MS = 500;
  const PARAGRAPH_INPUT_TYPES = new Set(["insertParagraph", "insertLineBreak"]);
  const HISTORY_TYPING_INPUT_TYPES = new Set([
    "deleteByCut",
    "deleteContentBackward",
    "deleteContentForward",
    "deleteWordBackward",
    "deleteWordForward",
    "insertCompositionText",
    "insertLineBreak",
    "insertParagraph",
    "insertText",
  ]);
  const HISTORY_CONTENT_INPUT_TYPES = new Set([
    ...HISTORY_TYPING_INPUT_TYPES,
    "deleteContent",
    "deleteHardLineBackward",
    "deleteHardLineForward",
    "deleteSoftLineBackward",
    "deleteSoftLineForward",
    "formatBold",
    "formatItalic",
    "formatStrikeThrough",
    "formatUnderline",
    "insertFromDrop",
    "insertFromPaste",
    "insertFromYank",
    "insertReplacementText",
    "insertTranspose",
  ]);
  const STATS_BLOCK_TAGS = new Set([
    "blockquote",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ol",
    "p",
    "pre",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
  ]);
  const FIND_BOUNDARY_TAGS = new Set([
    "blockquote",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "p",
    "pre",
    "td",
    "th",
  ]);
  const SERIALIZED_BLOCK_TAGS = new Set([
    "blockquote",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "ol",
    "p",
    "pre",
    "table",
    "ul",
  ]);

  const COMMANDS = [
    { id: "new", label: "New", shortcut: "Ctrl+N", run: () => newDocument() },
    { id: "newWindow", label: "New Window", shortcut: "Ctrl+Shift+N", run: () => newWindow() },
    { id: "open", label: "Open", shortcut: "Ctrl+O", run: () => openFile() },
    { id: "save", label: "Save", shortcut: "Ctrl+S", run: () => saveFile(false) },
    { id: "saveAs", label: "Save As", shortcut: "Ctrl+Shift+S", run: () => saveFile(true) },
    { id: "exportMarkdown", label: "Export Markdown", run: () => exportMarkdown() },
    { id: "exportHTML", label: "Export HTML", run: () => exportHTML() },
    { id: "pageSetup", label: "Page Setup", shortcut: "Ctrl+Shift+P", run: () => pageSetup() },
    { id: "print", label: "Print", shortcut: "Ctrl+P", run: () => printDocument() },
    { id: "undo", label: "Undo", shortcut: "Ctrl+Z", action: "undo", scope: "editor" },
    { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", action: "redo", scope: "editor" },
    { id: "pastePlainText", label: "Paste as Plain Text", shortcut: "Ctrl+Shift+V", run: () => pastePlainTextFromCommand() },
    { id: "find", label: "Find", shortcut: "Ctrl+F", run: () => openFindBar() },
    { id: "findReplace", label: "Find and Replace", shortcut: "Ctrl+Alt+F", run: () => openFindBar({ replace: true }) },
    { id: "useSelectionForFind", label: "Use Selection for Find", shortcut: "Ctrl+E", run: () => useSelectionForFind() },
    { id: "findNext", label: "Find Next", shortcut: "Ctrl+G", run: () => goToFindMatch(1) },
    { id: "findPrevious", label: "Find Previous", shortcut: "Ctrl+Shift+G", run: () => goToFindMatch(-1) },
    { id: "selectAll", label: "Select All", shortcut: "Ctrl+A", action: "selectAll", scope: "editor" },
    { id: "showSpellingSuggestions", label: "Show Spelling and Grammar", shortcut: "Ctrl+:", run: () => showSpellingSuggestionsForCurrentWord() },
    { id: "checkDocumentSpelling", label: "Check Document Now", shortcut: "Ctrl+;", run: () => checkDocumentSpelling() },
    { id: "toggleContinuousSpellcheck", label: "Check Spelling While Typing", run: () => toggleContinuousSpellcheck() },
    { id: "checkDocumentGrammar", label: "Check Grammar With Spelling", run: () => checkDocumentGrammar() },
    { id: "startSpeaking", label: "Start Speaking", run: () => startSpeaking() },
    { id: "stopSpeaking", label: "Stop Speaking", run: () => stopSpeaking() },
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
    { id: "heading4", label: "Heading 4", shortcut: "Ctrl+Alt+4", action: "heading4", scope: "editor" },
    { id: "heading5", label: "Heading 5", shortcut: "Ctrl+Alt+5", action: "heading5", scope: "editor" },
    { id: "heading6", label: "Heading 6", shortcut: "Ctrl+Alt+6", action: "heading6", scope: "editor" },
    { id: "blockquote", label: "Block Quote", shortcut: "Ctrl+Alt+Q", action: "blockquote", scope: "editor" },
    { id: "bulletList", label: "Bulleted List", shortcut: "Ctrl+Alt+B", action: "bulletList", scope: "editor" },
    { id: "numberedList", label: "Numbered List", shortcut: "Ctrl+Alt+N", action: "numberedList", scope: "editor" },
    { id: "taskList", label: "Task List", shortcut: "Ctrl+Alt+K", action: "taskList", scope: "editor" },
    { id: "codeBlock", label: "Code Block", shortcut: "Ctrl+Alt+C", action: "codeBlock", scope: "editor" },
    { id: "table", label: "Table", shortcut: "Ctrl+Alt+T", action: "table", scope: "editor" },
    { id: "horizontalRule", label: "Horizontal Rule", shortcut: "Ctrl+Alt+R", action: "horizontalRule", scope: "editor" },
    { id: "tableInsertRowAbove", label: "Insert Row Above", tableAction: "insertRowAbove", scope: "table" },
    { id: "tableInsertRowBelow", label: "Insert Row Below", tableAction: "insertRowBelow", scope: "table" },
    { id: "tableDeleteRows", label: "Delete Row", tableAction: "deleteRows", scope: "table" },
    { id: "tableInsertColumnLeft", label: "Insert Column Left", tableAction: "insertColumnLeft", scope: "table" },
    { id: "tableInsertColumnRight", label: "Insert Column Right", tableAction: "insertColumnRight", scope: "table" },
    { id: "tableDeleteColumns", label: "Delete Column", tableAction: "deleteColumns", scope: "table" },
    { id: "tableAlignColumnLeft", label: "Align Column Left", tableAction: "alignColumnLeft", scope: "table" },
    { id: "tableAlignColumnCenter", label: "Align Column Center", tableAction: "alignColumnCenter", scope: "table" },
    { id: "tableAlignColumnRight", label: "Align Column Right", tableAction: "alignColumnRight", scope: "table" },
    { id: "tableAlignColumnDefault", label: "Clear Column Alignment", tableAction: "alignColumnDefault", scope: "table" },
    { id: "tableClearCells", label: "Clear Selected Cells", tableAction: "clearCells", scope: "table" },
    { id: "tableClearRows", label: "Clear Row", tableAction: "clearRows", scope: "table" },
    { id: "tableClearColumns", label: "Clear Column", tableAction: "clearColumns", scope: "table" },
    { id: "tableNormalize", label: "Normalize Table", tableAction: "normalizeTable", scope: "table" },
    { id: "tableDelete", label: "Delete Table", tableAction: "deleteTable", scope: "table" },
    { id: "themeDark", label: "Dark Theme", action: "themeDark", editable: false },
    { id: "themeLight", label: "Light Theme", action: "themeLight", editable: false },
    { id: "letterPage", label: "Letter Page", action: "letterPage", editable: false },
    { id: "a4Page", label: "A4 Page", action: "a4Page", editable: false },
    { id: "resetMargins", label: "Reset Margins", action: "resetMargins", editable: false },
    { id: "keyboardShortcuts", label: "Keyboard Shortcuts", shortcut: "Ctrl+,", run: () => openShortcutDialog() },
  ];

  const isMacPlatform = /\bMac|iPhone|iPad|iPod\b/.test(
    String(navigator.platform || navigator.userAgent || "")
  );
  const systemThemeQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null;
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
  const selectionStats = document.getElementById("selectionStats");
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
  const markdownDefaultModal = document.getElementById("markdownDefaultModal");
  const markdownDefaultMakeButton = document.getElementById("markdownDefaultMakeButton");
  const markdownDefaultNotNowButton = document.getElementById("markdownDefaultNotNowButton");
  const markdownDefaultDismissButton = document.getElementById("markdownDefaultDismissButton");
  const findBar = document.getElementById("findBar");
  const findInput = document.getElementById("findInput");
  const replaceInput = document.getElementById("replaceInput");
  const findCount = document.getElementById("findCount");
  const replaceButton = document.getElementById("replaceButton");
  const replaceAllButton = document.getElementById("replaceAllButton");
  const findPreviousButton = document.getElementById("findPreviousButton");
  const findNextButton = document.getElementById("findNextButton");
  const findCloseButton = document.getElementById("findCloseButton");
  const findOverlay = document.getElementById("findOverlay");
  const spellingContextMenu = document.getElementById("spellingContextMenu");
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
    "heading4",
    "heading5",
    "heading6",
    "blockquote",
    "bulletList",
    "numberedList",
    "taskList",
    "codeBlock",
    "table",
    "horizontalRule",
  ]);

  const documentSettings = {
    theme: getSystemThemePreference(),
    themeOverride: null,
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
    savedToDisk: false,
    statusTimer: null,
    statsTimer: null,
    statsPending: false,
    internalRender: false,
    activeMenu: null,
    marginDrag: null,
    scrollSyncing: false,
    confirmResolve: null,
    savedRange: null,
    toolbarFrame: null,
    tableContext: null,
    tableSelection: null,
    spellingContext: null,
    spellingRequestId: 0,
    spellcheckEnabled: true,
    suppressNextDocumentClick: false,
    findQuery: createFindQuery(""),
    findMatches: [],
    findActiveIndex: -1,
    findReplaceVisible: false,
    findRefreshTimer: null,
    findOverlayTimer: null,
    shortcuts: createDefaultShortcutMap(),
    shortcutPreferencesLoaded: false,
    markdownDefaultPromptChoice: "",
    markdownDefaultPromptShown: false,
    history: createHistoryState(),
  };

  const bridge = createBridge();
  document.body.classList.toggle("native-shell", bridge.native && isMacPlatform);

  window.InkwellBridgeEvent = (event) => {
    if (event.type === "security" && event.data && event.data.message) {
      setStatus(event.data.message);
    } else if (event.type === "closeRequest") {
      handleCloseRequest();
    } else if (event.type === "documentLoaded" && event.data) {
      loadDocument(event.data.content || "", event.data.name || "Untitled.md", false, true);
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

  spellingContextMenu.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  spellingContextMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-spelling-suggestion]");
    if (!button) {
      return;
    }
    replaceSpellingContext(button.dataset.spellingSuggestion || "");
  });

  for (const button of tableMenuButtons) {
    button.addEventListener("click", () => {
      runTableAction(button.dataset.tableAction);
    });
  }

  editor.addEventListener("beforeinput", (event) => {
    if (state.internalRender || state.history.applying) {
      return;
    }

    if (event.inputType === "historyUndo") {
      event.preventDefault();
      undoHistory();
      return;
    }

    if (event.inputType === "historyRedo") {
      event.preventDefault();
      redoHistory();
      return;
    }

    if (isHistoryInputType(event.inputType)) {
      beginHistoryTransaction("Typing", event.inputType, getNativeInputMergeKey(event));
    }
  });

  editor.addEventListener("input", (event) => {
    if (state.internalRender || state.history.applying) {
      return;
    }

    const paragraphInput = isParagraphInput(event);
    if (!paragraphInput) {
      normalizeLooseText();
    }

    if (shouldTransformAfterInput(event)) {
      transformActiveBlock();
    }

    normalizeActiveCodeBlock();
    commitHistoryTransaction({
      label: getInputHistoryLabel(event),
      inputType: event.inputType || "input",
      mergeKey: getNativeInputMergeKey(event),
      allowMerge: isMergeableInputType(event.inputType),
    });
    scheduleStatsUpdate();
    scheduleFindRefresh();
    if (!paragraphInput) {
      scheduleSelectionToolbarUpdate();
    }
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
    withHistoryTransaction("Paste", () => {
      if (looksLikeMarkdown(text)) {
        insertMarkdownAtSelection(text);
      } else {
        insertPlainTextAtSelection(text);
      }
    }, { inputType: "insertFromPaste", mergeKey: "paste" });
    scheduleStatsUpdate();
    scheduleFindRefresh();
    scheduleSelectionToolbarUpdate();
  });

  editor.addEventListener("copy", handleEditorCopy);
  editor.addEventListener("cut", handleEditorCut);
  editor.addEventListener("mousedown", handleEditorMouseDown, true);
  editor.addEventListener("pointerdown", handleEditorSecondaryPointerDown, true);
  editor.addEventListener("pointerdown", handleEditorPointerDown);
  editor.addEventListener("pointermove", handleEditorPointerMove);
  editor.addEventListener("auxclick", handleEditorAuxClick, true);
  editor.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      event.preventDefault();
    }
  });

  editor.addEventListener("contextmenu", handleEditorContextMenu);

  document.addEventListener("click", (event) => {
    if (state.suppressNextDocumentClick) {
      state.suppressNextDocumentClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!event.target.closest("[data-menu-root]")) {
      closeAllMenus();
    }
    if (!editor.contains(event.target) && !selectionToolbar.contains(event.target)) {
      hideSelectionToolbar();
    }
    if (!tableContextMenu.contains(event.target)) {
      hideTableContextMenu();
    }
    if (!spellingContextMenu.contains(event.target)) {
      hideSpellingContextMenu();
    }
    if (!editor.contains(event.target) && !tableContextMenu.contains(event.target)) {
      clearTableSelection();
    }
  });

  document.addEventListener("selectionchange", () => {
    updateSelectionStats();
    if (!findBar.hidden) {
      hideSelectionToolbar();
      return;
    }
    scheduleSelectionToolbarUpdate();
    updateSelectedTableCells();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!markdownDefaultModal.hidden) {
        closeMarkdownDefaultPrompt();
        return;
      }
      if (!shortcutModal.hidden) {
        closeShortcutDialog();
        return;
      }
      if (!confirmModal.hidden) {
        closeConfirm(false);
        return;
      }
      if (!findBar.hidden) {
        closeFindBar();
        return;
      }
      hideSelectionToolbar();
      hideTableContextMenu();
      hideSpellingContextMenu();
      clearTableSelection();
      closeAllMenus();
      return;
    }

    if (!shortcutModal.hidden || !markdownDefaultModal.hidden) {
      return;
    }

    if (shouldDropStaleEnterRepeat(event)) {
      event.preventDefault();
      return;
    }

    if (handleCodeBlockKey(event)) {
      return;
    }

    if (handleTableNavigationKey(event)) {
      return;
    }

    const command = getCommandForKeyboardEvent(event);
    if (command && commandIsAvailable(command, event)) {
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
    if (state.marginDrag) {
      setStatus(statusText.textContent);
    }
    state.marginDrag = null;
    finishTableDragSelection();
  });

  window.addEventListener("pointercancel", () => {
    if (state.marginDrag) {
      setStatus(statusText.textContent);
    }
    state.marginDrag = null;
    finishTableDragSelection();
  });

  window.addEventListener("resize", () => {
    updateLayout();
    scheduleSelectionToolbarUpdate();
    hideTableContextMenu();
    hideSpellingContextMenu();
    scheduleFindOverlayRender();
  });

  documentScroll.addEventListener("scroll", () => {
    syncRulerScrollFromDocument();
    scheduleSelectionToolbarUpdate();
    hideTableContextMenu();
    hideSpellingContextMenu();
    scheduleFindOverlayRender();
  });

  ruler.addEventListener("scroll", syncDocumentScrollFromRuler);

  if (!bridge.native) {
    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    });
  }

  setupSystemThemeListener();
  loadDocument(DEFAULT_DOCUMENT, "Untitled.md", false, false);
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
  markdownDefaultMakeButton.addEventListener("click", () => {
    makeMarkdownDefaultEditor();
  });
  markdownDefaultNotNowButton.addEventListener("click", closeMarkdownDefaultPrompt);
  markdownDefaultDismissButton.addEventListener("click", () => {
    dismissMarkdownDefaultPromptPermanently();
  });
  markdownDefaultModal.addEventListener("click", (event) => {
    if (event.target === markdownDefaultModal) {
      closeMarkdownDefaultPrompt();
    }
  });
  findInput.addEventListener("input", () => {
    rebuildFindMatches(true);
    focusFindInput(false);
  });
  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFindBar();
    } else if (event.key === "Enter") {
      event.preventDefault();
      goToFindMatch(event.shiftKey ? -1 : 1);
    }
  });
  replaceInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFindBar();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        replaceAllFindMatches();
      } else {
        replaceActiveFindMatch();
      }
    }
  });
  replaceButton.addEventListener("click", replaceActiveFindMatch);
  replaceAllButton.addEventListener("click", replaceAllFindMatches);
  findPreviousButton.addEventListener("click", () => goToFindMatch(-1));
  findNextButton.addEventListener("click", () => goToFindMatch(1));
  findCloseButton.addEventListener("click", closeFindBar);

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

    updateMenuCommandStates();
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

  function updateMenuCommandStates() {
    for (const button of commandButtons) {
      const command = commandById.get(button.dataset.command);
      if (!command) {
        continue;
      }
      button.disabled = !commandIsAvailable(command, { target: document.activeElement });
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

    if (command.tableAction) {
      return runActiveTableAction(command.tableAction);
    }
    if (command.action) {
      runMenuAction(command.action);
    } else if (command.run) {
      command.run();
    }
    return true;
  }

  window.InkwellInvokeCommand = (commandId) => invokeCommand(String(commandId || ""));

  function commandIsAvailable(command, event) {
    if (command.id === "undo" || command.id === "redo") {
      return !eventTargetsStandaloneTextEntry(event);
    }
    if (command.scope === "table") {
      return Boolean(getActiveTableCell());
    }
    return command.scope !== "editor" || selectionIsInsideEditor();
  }

  function eventTargetsStandaloneTextEntry(event) {
    const target = event && event.target;
    if (!target || !target.tagName || editor.contains(target)) {
      return false;
    }

    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function createDefaultShortcutMap() {
    const shortcuts = new Map();
    for (const command of editableShortcutCommands) {
      shortcuts.set(command.id, normalizeDefaultShortcutText(command));
    }
    return shortcuts;
  }

  function refreshShortcutMenuLabels() {
    for (const button of commandButtons) {
      const command = commandById.get(button.dataset.command);
      const shortcut = command ? getShortcutText(command.id) : "";
      const shortcutEl = button.querySelector(".menu-shortcut");
      if (shortcutEl) {
        shortcutEl.textContent = shortcut === "None" ? "" : shortcutToPlatformText(shortcut);
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
    const modifierMatch = shortcut.ctrl && !shortcut.meta && isMacPlatform
      ? Boolean(event.metaKey) && !Boolean(event.ctrlKey)
      : Boolean(event.ctrlKey) === shortcut.ctrl && Boolean(event.metaKey) === shortcut.meta;

    return (
      modifierMatch &&
      Boolean(event.shiftKey) === shortcut.shift &&
      Boolean(event.altKey) === shortcut.alt &&
      shortcutKeysMatch(shortcut.key, normalizeEventKey(event))
    );
  }

  function shortcutKeysMatch(shortcutKey, eventKey) {
    return shortcutKey === eventKey || (shortcutKey === "=" && eventKey === "+");
  }

  function normalizeEventKey(event) {
    const key = event && typeof event === "object" ? event.key : event;
    if (isMacPlatform && event && event.metaKey && event.altKey) {
      const code = String(event.code || "");
      if (/^Key[A-Z]$/.test(code)) {
        return code.slice(3).toLowerCase();
      }
      if (/^Digit\d$/.test(code)) {
        return code.slice(5);
      }
      if (code === "Backquote") {
        return "Backtick";
      }
    }
    return normalizeKeyToken(key);
  }

  function normalizeShortcutText(text) {
    const parsed = parseShortcutText(text);
    return parsed ? shortcutToText(parsed) : "None";
  }

  function normalizeDefaultShortcutText(command) {
    if (isMacPlatform && command.id === "inlineCode") {
      return "Command+Option+Backtick";
    }
    const text = command.shortcut;
    const parsed = parseShortcutText(text);
    if (!parsed) {
      return "None";
    }

    if (isMacPlatform && parsed.ctrl && !parsed.meta) {
      parsed.ctrl = false;
      parsed.meta = true;
    }

    return shortcutToText(parsed);
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
      parts.push(isMacPlatform ? "Option" : "Alt");
    }
    if (shortcut.meta) {
      parts.push(isMacPlatform ? "Command" : "Meta");
    }
    parts.push(keyDisplay.get(shortcut.key) || (/^[a-z]$/.test(shortcut.key) ? shortcut.key.toUpperCase() : shortcut.key));
    return parts.join("+");
  }

  function shortcutToPlatformText(text) {
    const shortcut = parseShortcutText(text);
    if (!shortcut) {
      return "None";
    }

    const parts = [];
    if (shortcut.ctrl) {
      parts.push(isMacPlatform && !shortcut.meta ? "Command" : "Ctrl");
    }
    if (shortcut.shift) {
      parts.push("Shift");
    }
    if (shortcut.alt) {
      parts.push(isMacPlatform ? "Option" : "Alt");
    }
    if (shortcut.meta) {
      parts.push(isMacPlatform ? "Command" : "Meta");
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
      scheduleMarkdownDefaultPrompt();
    } catch (error) {
      state.shortcutPreferencesLoaded = true;
      setStatus("Using default shortcuts");
      scheduleMarkdownDefaultPrompt();
    }
  }

  function applyPreferences(preferences) {
    if (!preferences || typeof preferences !== "object") {
      return;
    }

    const shortcuts = preferences.shortcuts;
    const markdownDefaultPromptChoice = preferences.markdownDefaultPromptChoice;
    if (["accepted", "dismissed"].includes(markdownDefaultPromptChoice)) {
      state.markdownDefaultPromptChoice = markdownDefaultPromptChoice;
    }
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
    const preferences = {
      version: 1,
      shortcuts,
    };
    if (["accepted", "dismissed"].includes(state.markdownDefaultPromptChoice)) {
      preferences.markdownDefaultPromptChoice = state.markdownDefaultPromptChoice;
    }
    await bridge.send("savePreferences", { preferences });
  }

  function scheduleMarkdownDefaultPrompt() {
    if (!bridge.native || !isMacPlatform || state.markdownDefaultPromptShown) {
      return;
    }
    if (["accepted", "dismissed"].includes(state.markdownDefaultPromptChoice)) {
      return;
    }

    window.setTimeout(() => {
      showMarkdownDefaultPromptIfNeeded();
    }, 700);
  }

  async function showMarkdownDefaultPromptIfNeeded() {
    if (!bridge.native || !isMacPlatform || state.markdownDefaultPromptShown) {
      return;
    }
    if (["accepted", "dismissed"].includes(state.markdownDefaultPromptChoice)) {
      return;
    }
    if (!confirmModal.hidden || !shortcutModal.hidden || !markdownDefaultModal.hidden) {
      scheduleMarkdownDefaultPrompt();
      return;
    }

    try {
      const result = await bridge.send("markdownDefaultEditorStatus");
      if (result && result.isDefault) {
        return;
      }
      state.markdownDefaultPromptShown = true;
      markdownDefaultModal.hidden = false;
      markdownDefaultMakeButton.focus();
    } catch (error) {
      // If LaunchServices status is unavailable, avoid nagging.
    }
  }

  async function makeMarkdownDefaultEditor() {
    markdownDefaultMakeButton.disabled = true;
    markdownDefaultDismissButton.disabled = true;
    markdownDefaultNotNowButton.disabled = true;

    try {
      const result = await bridge.send("makeMarkdownDefaultEditor");
      if (result && result.isDefault) {
        state.markdownDefaultPromptChoice = "accepted";
        await persistPreferences();
        closeMarkdownDefaultPrompt();
        setStatus("Inkwell is now the default Markdown editor");
        return;
      }
      setStatus("Default Markdown editor could not be changed");
    } catch (error) {
      handleBridgeError(error, "Default Markdown editor could not be changed.");
    } finally {
      markdownDefaultMakeButton.disabled = false;
      markdownDefaultDismissButton.disabled = false;
      markdownDefaultNotNowButton.disabled = false;
    }
  }

  async function dismissMarkdownDefaultPromptPermanently() {
    state.markdownDefaultPromptChoice = "dismissed";
    try {
      await persistPreferences();
      closeMarkdownDefaultPrompt();
      setStatus("Default editor prompt dismissed");
    } catch (error) {
      handleBridgeError(error, "Could not save preference.");
    }
  }

  function closeMarkdownDefaultPrompt() {
    markdownDefaultModal.hidden = true;
    editor.focus();
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
      normalized.set(command.id, normalizeStoredShortcutText(command, shortcuts.get(command.id) || "None"));
    }
    return normalized;
  }

  function normalizeStoredShortcutText(command, text) {
    const normalized = normalizeShortcutText(text);
    if (isMacPlatform && command.id === "inlineCode" && normalized === "Command+Backtick") {
      return "Command+Option+Backtick";
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

  function openFindBar(options = {}) {
    closeAllMenus();
    hideSelectionToolbar();
    hideTableContextMenu();
    clearTableSelection();
    state.findReplaceVisible = Boolean(options.replace);
    updateFindMode();

    const selectedText = getSelectedText();
    if (selectedText && !/[\r\n]/.test(selectedText) && selectedText.length <= 120) {
      state.findQuery = createFindQuery(selectedText);
      findInput.value = selectedText;
    } else if (findInput.value !== getFindQueryText()) {
      findInput.value = getFindQueryText();
    }

    findBar.hidden = false;
    findOverlay.hidden = false;
    rebuildFindMatches(true, { scrollActive: true });
    if (state.findReplaceVisible && options.focusReplace) {
      replaceInput.focus();
      replaceInput.select();
    } else {
      focusFindInput(true);
    }
  }

  function closeFindBar() {
    findBar.hidden = true;
    findOverlay.hidden = true;
    clearFindTimers();
    findOverlay.replaceChildren();
    findInput.blur();
    replaceInput.blur();
    editor.focus();
  }

  function updateFindMode() {
    findBar.classList.toggle("is-replacing", state.findReplaceVisible);
  }

  function useSelectionForFind() {
    const selectedText = getSelectedText();
    if (!selectedText || /[\r\n]/.test(selectedText)) {
      setStatus("Select a single line of text first");
      return;
    }
    state.findQuery = createFindQuery(selectedText);
    findInput.value = selectedText;
    findBar.hidden = false;
    findOverlay.hidden = false;
    rebuildFindMatches(true, { scrollActive: true });
    setStatus("Using selection for find");
    focusFindInput(true);
  }

  function goToFindMatch(direction) {
    if (findBar.hidden) {
      openFindBar();
    }

    if (!getFindQueryText()) {
      focusFindInput(false);
      return;
    }

    if (!state.findMatches.length) {
      rebuildFindMatches(true);
    }

    const count = state.findMatches.length;
    if (!count) {
      updateFindControls();
      focusFindInput(false);
      return;
    }

    const nextIndex = state.findActiveIndex < 0
      ? (direction < 0 ? count - 1 : 0)
      : (state.findActiveIndex + direction + count) % count;
    activateFindMatch(nextIndex, true);
    focusFindInput(false);
  }

  function replaceActiveFindMatch() {
    if (findBar.hidden || !state.findReplaceVisible) {
      openFindBar({ replace: true, focusReplace: true });
    }
    if (!getFindQueryText()) {
      focusFindInput(false);
      return false;
    }
    if (!state.findMatches.length) {
      rebuildFindMatches(true, { scrollActive: true });
    }
    const match = state.findMatches[state.findActiveIndex >= 0 ? state.findActiveIndex : 0];
    const range = match ? createRangeFromFindMatch(match) : null;
    if (!range) {
      updateFindControls();
      return false;
    }

    withHistoryTransaction("Replace", () => {
      replaceRangeWithText(range, replaceInput.value);
    }, {
      inputType: "insertReplacementText",
      mergeKey: "replace",
    });
    markEdited("Replaced match");
    rebuildFindMatches(false, { scrollActive: true });
    replaceInput.focus();
    return true;
  }

  function replaceAllFindMatches() {
    if (findBar.hidden || !state.findReplaceVisible) {
      openFindBar({ replace: true, focusReplace: true });
    }
    if (!getFindQueryText()) {
      focusFindInput(false);
      return 0;
    }
    rebuildFindMatches(true);
    const ranges = state.findMatches
      .map((match) => createRangeFromFindMatch(match))
      .filter(Boolean)
      .reverse();
    if (!ranges.length) {
      updateFindControls();
      setStatus("No matches to replace");
      return 0;
    }

    withHistoryTransaction("Replace All", () => {
      for (const range of ranges) {
        replaceRangeWithText(range, replaceInput.value);
      }
    }, {
      inputType: "insertReplacementText",
      mergeKey: "replace:all",
    });
    markEdited("Replaced " + ranges.length + " matches");
    rebuildFindMatches(true, { scrollActive: true });
    replaceInput.focus();
    return ranges.length;
  }

  function replaceRangeWithText(range, text) {
    range.deleteContents();
    range.insertNode(document.createTextNode(String(text || "")));
  }

  function scheduleFindRefresh() {
    if (findBar.hidden) {
      return;
    }

    if (state.findRefreshTimer) {
      return;
    }

    state.findRefreshTimer = window.setTimeout(() => {
      state.findRefreshTimer = null;
      rebuildFindMatches(false);
    }, FIND_RENDER_DELAY_MS);
  }

  function scheduleFindOverlayRender() {
    if (findBar.hidden || state.findOverlayTimer) {
      return;
    }

    state.findOverlayTimer = window.setTimeout(() => {
      state.findOverlayTimer = null;
      renderFindOverlay();
    }, FIND_RENDER_DELAY_MS);
  }

  function clearFindTimers() {
    if (state.findRefreshTimer) {
      window.clearTimeout(state.findRefreshTimer);
      state.findRefreshTimer = null;
    }
    if (state.findOverlayTimer) {
      window.clearTimeout(state.findOverlayTimer);
      state.findOverlayTimer = null;
    }
  }

  function createFindQuery(rawValue) {
    return {
      text: String(rawValue || ""),
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    };
  }

  function getFindQueryText() {
    return state.findQuery && typeof state.findQuery === "object" ? state.findQuery.text : String(state.findQuery || "");
  }

  function focusFindInput(selectText) {
    findInput.focus();
    if (selectText) {
      findInput.select();
    }
  }

  function rebuildFindMatches(resetActive, options = {}) {
    const query = createFindQuery(findInput.value);
    state.findQuery = query;
    state.findMatches = query.text ? findLiteralMatches(query, collectFindUnits()) : [];
    setActiveFindIndexAfterRebuild(resetActive);
    if (state.findActiveIndex >= 0 && options.scrollActive) {
      activateFindMatch(state.findActiveIndex, true);
      return;
    }

    updateFindControls();
    renderFindOverlay();
  }

  function setActiveFindIndexAfterRebuild(resetActive) {
    if (state.findMatches.length) {
      state.findActiveIndex = resetActive
        ? 0
        : clamp(state.findActiveIndex, 0, state.findMatches.length - 1);
    } else {
      state.findActiveIndex = -1;
    }
  }

  function findLiteralMatches(query, units) {
    const needle = normalizeFindText(query.text, query);
    const matches = [];

    for (const unit of units) {
      const haystack = normalizeFindText(unit.text, query);
      let index = haystack.indexOf(needle);
      while (index !== -1) {
        const start = getFindPosition(unit, index);
        const end = getFindPosition(unit, index + query.text.length);
        if (start && end) {
          matches.push(createFindMatch(start, end, unit, index));
        }
        index = haystack.indexOf(needle, index + Math.max(query.text.length, 1));
      }
    }

    return matches;
  }

  function normalizeFindText(value, query) {
    const text = String(value || "");
    return query.caseSensitive ? text : text.toLowerCase();
  }

  function createFindMatch(start, end, unit, index) {
    return {
      startNode: start.node,
      startOffset: start.offset,
      endNode: end.node,
      endOffset: end.offset,
      unit,
      unitOffset: index,
    };
  }

  function collectFindUnits() {
    const units = [];
    for (const child of editor.childNodes) {
      collectFindUnitsFromNode(child, units);
    }
    return units;
  }

  function collectFindUnitsFromNode(node, units) {
    if (!node) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      appendFindUnit(node, units);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName.toLowerCase();
    if (tag === "br" || tag === "script" || tag === "style") {
      return;
    }

    if (FIND_BOUNDARY_TAGS.has(tag)) {
      appendFindUnit(node, units);
      return;
    }

    for (const child of node.childNodes) {
      collectFindUnitsFromNode(child, units);
    }
  }

  function appendFindUnit(root, units) {
    const segments = [];
    let text = "";

    if (root.nodeType === Node.TEXT_NODE) {
      const value = root.textContent || "";
      if (value) {
        segments.push({ node: root, start: 0, end: value.length });
        units.push({ text: value, segments });
      }
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const value = textNode.textContent || "";
      if (value) {
        const start = text.length;
        text += value;
        segments.push({ node: textNode, start, end: text.length });
      }
      textNode = walker.nextNode();
    }

    if (text) {
      units.push({ text, segments });
    }
  }

  function getFindPosition(unit, offset) {
    for (let index = 0; index < unit.segments.length; index += 1) {
      const segment = unit.segments[index];
      const isLast = index === unit.segments.length - 1;
      if ((offset >= segment.start && offset <= segment.end) || (isLast && offset >= segment.end)) {
        return {
          node: segment.node,
          offset: clamp(offset - segment.start, 0, segment.end - segment.start),
        };
      }
    }
    return null;
  }

  function activateFindMatch(index, scrollIntoView) {
    if (index < 0 || index >= state.findMatches.length) {
      state.findActiveIndex = -1;
      updateFindControls();
      renderFindOverlay();
      return;
    }

    state.findActiveIndex = index;
    const range = createRangeFromFindMatch(state.findMatches[index]);
    if (range) {
      if (scrollIntoView) {
        scrollFindRangeIntoView(range);
      }
    }

    updateFindControls();
    renderFindOverlay();
  }

  function createRangeFromFindMatch(match) {
    try {
      const range = document.createRange();
      range.setStart(match.startNode, match.startOffset);
      range.setEnd(match.endNode, match.endOffset);
      return range;
    } catch (_error) {
      return null;
    }
  }

  function scrollFindRangeIntoView(range) {
    const rect = getRangeRect(range);
    if (!rect) {
      return;
    }

    const scrollRect = documentScroll.getBoundingClientRect();
    const targetY = rect.top - scrollRect.top - scrollRect.height / 2 + rect.height / 2;
    const targetX = rect.left - scrollRect.left - scrollRect.width / 2 + rect.width / 2;
    if (rect.top < scrollRect.top + 42 || rect.bottom > scrollRect.bottom - 42) {
      documentScroll.scrollTop += targetY;
    }
    if (rect.left < scrollRect.left + 24 || rect.right > scrollRect.right - 24) {
      documentScroll.scrollLeft += targetX;
    }
  }

  function updateFindControls() {
    const count = state.findMatches.length;
    findCount.textContent = count ? state.findActiveIndex + 1 + " / " + count : "0 / 0";
    findPreviousButton.disabled = count === 0;
    findNextButton.disabled = count === 0;
  }

  function renderFindOverlay() {
    findOverlay.replaceChildren();
    if (findBar.hidden || !state.findMatches.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let rectCount = 0;
    for (let index = 0; index < state.findMatches.length && rectCount < MAX_FIND_RECTS; index += 1) {
      const range = createRangeFromFindMatch(state.findMatches[index]);
      if (!range) {
        continue;
      }

      for (const rect of range.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) {
          continue;
        }
        const marker = document.createElement("span");
        marker.className = "find-match" + (index === state.findActiveIndex ? " is-active" : "");
        marker.style.left = rect.left + "px";
        marker.style.top = rect.top + "px";
        marker.style.width = rect.width + "px";
        marker.style.height = rect.height + "px";
        fragment.append(marker);
        rectCount += 1;
        if (rectCount >= MAX_FIND_RECTS) {
          break;
        }
      }
    }
    findOverlay.append(fragment);
  }

  function runMenuAction(action) {
    if (action === "undo") {
      undoHistory();
      scheduleSelectionToolbarUpdate();
      return;
    }
    if (action === "redo") {
      redoHistory();
      scheduleSelectionToolbarUpdate();
      return;
    }

    ensureEditorFocus();
    let edited = EDITING_ACTIONS.has(action);

    const runAction = () => {
      if (action === "selectAll") {
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
      } else if (action === "heading4") {
        document.execCommand("formatBlock", false, "h4");
      } else if (action === "heading5") {
        document.execCommand("formatBlock", false, "h5");
      } else if (action === "heading6") {
        document.execCommand("formatBlock", false, "h6");
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
    };

    if (edited) {
      withHistoryTransaction(getActionHistoryLabel(action), runAction, {
        inputType: "command",
        mergeKey: "command:" + action,
        allowMerge: false,
      });
    } else {
      runAction();
    }

    if (edited) {
      updateStatsNow();
      scheduleFindRefresh();
    } else {
      updateChrome();
    }

    scheduleSelectionToolbarUpdate();
  }

  function getActionHistoryLabel(action) {
    const command = COMMANDS.find((candidate) => candidate.action === action);
    return command ? command.label : "Edit";
  }

  function setupRuler() {
    leftMarginHandle.addEventListener("pointerdown", (event) => beginMarginDrag(event, "left"));
    rightMarginHandle.addEventListener("pointerdown", (event) => beginMarginDrag(event, "right"));
  }

  function beginMarginDrag(event, side) {
    event.preventDefault();
    const rect = rulerTrack.getBoundingClientRect();
    state.marginDrag = {
      side,
      rectLeft: rect.left,
      rectRight: rect.right,
      pageWidthIn: documentSettings.pageWidthIn,
      marginLeftIn: documentSettings.marginLeftIn,
      marginRightIn: documentSettings.marginRightIn,
      zoom: documentSettings.zoom / 100,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateMarginDrag(event) {
    const drag = state.marginDrag;
    if (!drag) {
      return;
    }

    const pxPerIn = PX_PER_INCH * drag.zoom;

    if (drag.side === "left") {
      const pointerIn = (event.clientX - drag.rectLeft) / pxPerIn;
      if (pointerIn < 0) {
        expandPageFromDrag(drag, -pointerIn);
        documentSettings.marginLeftIn = getExpansionMarginBuffer();
        documentSettings.marginRightIn = clamp(
          drag.marginRightIn,
          MIN_MARGIN_IN,
          documentSettings.pageWidthIn - MIN_CONTENT_IN
        );
        setLiveStatus("Page width " + formatInches(documentSettings.pageWidthIn));
      } else {
        documentSettings.pageWidthIn = drag.pageWidthIn;
        documentSettings.marginRightIn = drag.marginRightIn;
        const maxLeft = documentSettings.pageWidthIn - documentSettings.marginRightIn - MIN_CONTENT_IN;
        documentSettings.marginLeftIn = clamp(pointerIn, MIN_MARGIN_IN, maxLeft);
        setLiveStatus("Left margin " + formatInches(documentSettings.marginLeftIn));
      }
    } else if (drag.side === "right") {
      const pointerIn = (drag.rectRight - event.clientX) / pxPerIn;
      if (pointerIn < 0) {
        expandPageFromDrag(drag, -pointerIn);
        documentSettings.marginRightIn = getExpansionMarginBuffer();
        documentSettings.marginLeftIn = clamp(
          drag.marginLeftIn,
          MIN_MARGIN_IN,
          documentSettings.pageWidthIn - MIN_CONTENT_IN
        );
        setLiveStatus("Page width " + formatInches(documentSettings.pageWidthIn));
      } else {
        documentSettings.pageWidthIn = drag.pageWidthIn;
        documentSettings.marginLeftIn = drag.marginLeftIn;
        const maxRight = documentSettings.pageWidthIn - documentSettings.marginLeftIn - MIN_CONTENT_IN;
        documentSettings.marginRightIn = clamp(pointerIn, MIN_MARGIN_IN, maxRight);
        setLiveStatus("Right margin " + formatInches(documentSettings.marginRightIn));
      }
    }

    clampMargins();
    updateLayout();
  }

  function expandPageFromDrag(drag, overflowIn) {
    documentSettings.pageWidthIn = clamp(
      drag.pageWidthIn + overflowIn * 2,
      MIN_PAGE_WIDTH_IN,
      MAX_PAGE_WIDTH_IN
    );
  }

  function getExpansionMarginBuffer() {
    return Math.min(PAGE_EXPANSION_MARGIN_IN, Math.max(MIN_MARGIN_IN, documentSettings.pageWidthIn - MIN_CONTENT_IN));
  }

  async function newDocument() {
    if (!(await confirmDiscardChanges())) {
      return;
    }

    try {
      if (bridge.native) {
        await bridge.send("newFile");
      }
      loadDocument("", "Untitled.md", false, false);
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
        loadDocument(result.content, result.name, false, true);
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
    loadDocument(content, file.name, false, true);
    setStatus("Opened " + file.name);
  });

  async function saveFile(saveAs) {
    flushStatsUpdate();
    const content = getMarkdownContent();

    try {
      if (bridge.native) {
        const result = await bridge.send(saveAs ? "saveFileAs" : "saveFile", {
          content,
          name: state.name,
        });
        state.name = result.name;
        state.savedToDisk = true;
        markHistorySaved(content);
        setStatus("Saved " + result.name);
      } else {
        downloadMarkdown(content);
        state.savedToDisk = true;
        markHistorySaved(content);
        setStatus("Downloaded " + state.name);
      }
    } catch (error) {
      handleBridgeError(error, "Save failed.");
    }
  }

  async function pastePlainTextFromCommand() {
    let text = "";
    try {
      if (bridge.native) {
        const result = await bridge.send("readPlainTextClipboard");
        text = result.text || "";
      } else if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        text = await navigator.clipboard.readText();
      } else {
        setStatus("Plain text paste is unavailable here");
        return false;
      }
    } catch (error) {
      handleBridgeError(error, "Plain text paste failed.");
      return false;
    }

    withHistoryTransaction("Paste Plain Text", () => {
      if (hasTableSelection()) {
        pasteTableText(state.tableSelection, text);
        clearTableSelection();
      } else {
        insertPlainTextWithLineBreaksAtSelection(text);
      }
    }, {
      inputType: "insertFromPaste",
      mergeKey: "paste:plain",
    });
    markEdited("Pasted plain text");
    return true;
  }

  async function pageSetup() {
    if (!bridge.native) {
      setStatus("Page setup is available in the macOS app");
      return false;
    }

    try {
      const result = await bridge.send("pageSetup", currentPageSetupPayload());
      applyPageSetupResult(result);
      setStatus("Page setup updated");
      return true;
    } catch (error) {
      handleBridgeError(error, "Page setup failed.");
      return false;
    }
  }

  async function printDocument() {
    flushStatsUpdate();
    if (bridge.native) {
      try {
        await bridge.send("printDocument", currentPageSetupPayload());
        setStatus("Print dialog opened");
      } catch (error) {
        handleBridgeError(error, "Print failed.");
      }
      return;
    }
    window.print();
  }

  async function exportMarkdown() {
    const content = getMarkdownContent();
    await exportContent({
      format: "markdown",
      name: suggestedExportName(".md"),
      content,
    });
  }

  async function exportHTML() {
    await exportContent({
      format: "html",
      name: suggestedExportName(".html"),
      content: buildStandaloneHTMLExport(),
    });
  }

  async function exportContent(payload) {
    try {
      if (bridge.native) {
        const result = await bridge.send("exportFile", payload);
        setStatus("Exported " + (result.name || payload.name));
      } else {
        const type = payload.format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8";
        downloadBlob(payload.content || "", payload.name, type);
        setStatus("Exported " + payload.name);
      }
    } catch (error) {
      handleBridgeError(error, "Export failed.");
    }
  }

  async function startSpeaking() {
    const text = getSelectedText() || editor.innerText || "";
    if (!text.trim()) {
      setStatus("No text to speak");
      return false;
    }

    if (bridge.native) {
      try {
        await bridge.send("startSpeaking", { text });
        setStatus("Speaking");
        return true;
      } catch (error) {
        handleBridgeError(error, "Speech failed.");
        return false;
      }
    }

    if ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      setStatus("Speaking");
      return true;
    }
    setStatus("Speech is unavailable here");
    return false;
  }

  async function stopSpeaking() {
    if (bridge.native) {
      try {
        await bridge.send("stopSpeaking");
        setStatus("Speech stopped");
      } catch (error) {
        handleBridgeError(error, "Could not stop speech.");
      }
      return;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setStatus("Speech stopped");
    }
  }

  function loadDocument(content, name, markDirty, savedToDisk) {
    renderMarkdown(content || "");
    state.name = name || "Untitled.md";
    state.savedToDisk = Boolean(savedToDisk);
    resetHistory(getMarkdownContent(), Boolean(markDirty));
    updateChrome();
    updateStatsNow();
    scheduleFindRefresh();
  }

  function renderMarkdown(markdown) {
    state.internalRender = true;
    window.InkwellMarkdown.renderMarkdown(markdown, editor, document);
    state.internalRender = false;
  }

  function createHistoryState() {
    return {
      undo: [],
      redo: [],
      pending: null,
      applying: false,
      lastCommittedAt: 0,
      byteSize: 0,
      savedRevision: 0,
      revision: 0,
      currentMarkdown: "",
    };
  }

  function resetHistory(markdown, dirty) {
    const history = state.history;
    history.undo = [];
    history.redo = [];
    history.pending = null;
    history.lastCommittedAt = 0;
    history.byteSize = 0;
    history.revision = dirty ? 1 : 0;
    history.savedRevision = 0;
    history.currentMarkdown = String(markdown || "");
    state.dirty = Boolean(dirty);
  }

  function markHistorySaved(content) {
    state.history.currentMarkdown = String(content != null ? content : getMarkdownContent());
    state.history.savedRevision = state.history.revision;
    state.history.lastCommittedAt = 0;
    updateDirtyFromHistory();
  }

  function beginHistoryTransaction(label, inputType, mergeKey) {
    if (state.history.applying || state.internalRender) {
      return;
    }

    state.history.pending = {
      label: label || "Edit",
      beforeMarkdown: state.history.currentMarkdown,
      beforeSelection: createSelectionBookmark(),
      startedAt: Date.now(),
      inputType: inputType || "input",
      mergeKey: mergeKey || "input",
    };
  }

  function commitHistoryTransaction(options = {}) {
    const history = state.history;
    if (history.applying || state.internalRender) {
      return false;
    }

    const pending = history.pending;
    const beforeMarkdown =
      options.beforeMarkdown != null
        ? String(options.beforeMarkdown)
        : pending
          ? pending.beforeMarkdown
          : history.currentMarkdown;
    const afterMarkdown = options.afterMarkdown != null ? String(options.afterMarkdown) : getMarkdownContent();
    history.pending = null;

    if (afterMarkdown === beforeMarkdown) {
      history.currentMarkdown = afterMarkdown;
      return false;
    }

    const now = Date.now();
    const entry = {
      label: options.label || (pending && pending.label) || "Edit",
      beforeMarkdown,
      afterMarkdown,
      beforeSelection: options.beforeSelection || (pending && pending.beforeSelection) || null,
      afterSelection: options.afterSelection || createSelectionBookmark(),
      startedAt: options.startedAt || (pending && pending.startedAt) || now,
      committedAt: now,
      inputType: options.inputType || (pending && pending.inputType) || "input",
      mergeKey: options.mergeKey || (pending && pending.mergeKey) || "input",
      size: 0,
    };
    entry.size = getHistoryEntrySize(entry);

    const merged = Boolean(options.allowMerge) && mergeHistoryEntry(entry);
    if (!merged) {
      history.undo.push(entry);
      history.revision += 1;
    }

    history.redo = [];
    history.currentMarkdown = afterMarkdown;
    history.lastCommittedAt = now;
    pruneHistory();
    updateDirtyFromHistory();
    return true;
  }

  function withHistoryTransaction(label, fn, options = {}) {
    const beforeMarkdown = getMarkdownContent();
    const beforeSelection = createSelectionBookmark();
    const previousApplying = state.history.applying;
    state.history.applying = true;
    let result;
    try {
      result = fn();
    } finally {
      state.history.applying = previousApplying;
    }

    commitHistoryTransaction({
      label,
      beforeMarkdown,
      beforeSelection,
      inputType: options.inputType || "command",
      mergeKey: options.mergeKey || "command:" + label,
      allowMerge: Boolean(options.allowMerge),
    });
    return result;
  }

  function undoHistory() {
    commitHistoryTransaction({ allowMerge: false });
    const history = state.history;
    const entry = history.undo.pop();
    if (!entry) {
      setStatus("Nothing to undo");
      return false;
    }

    history.redo.push(entry);
    history.revision -= 1;
    applyHistorySnapshot(entry.beforeMarkdown, entry.beforeSelection);
    recalculateHistoryByteSize();
    updateDirtyFromHistory();
    setStatus("Undid " + entry.label);
    return true;
  }

  function redoHistory() {
    const history = state.history;
    const entry = history.redo.pop();
    if (!entry) {
      setStatus("Nothing to redo");
      return false;
    }

    history.undo.push(entry);
    history.revision += 1;
    applyHistorySnapshot(entry.afterMarkdown, entry.afterSelection);
    recalculateHistoryByteSize();
    updateDirtyFromHistory();
    setStatus("Redid " + entry.label);
    return true;
  }

  function applyHistorySnapshot(markdown, selectionBookmark) {
    state.history.applying = true;
    try {
      renderMarkdown(markdown || "");
    } finally {
      state.history.applying = false;
    }
    state.history.currentMarkdown = getMarkdownContent();
    restoreSelectionBookmark(selectionBookmark);
    updateStatsNow();
    scheduleFindRefresh();
    scheduleSelectionToolbarUpdate();
  }

  function mergeHistoryEntry(entry) {
    const history = state.history;
    const previous = history.undo[history.undo.length - 1];
    if (!canMergeHistoryEntry(previous, entry)) {
      return false;
    }

    previous.afterMarkdown = entry.afterMarkdown;
    previous.afterSelection = entry.afterSelection;
    previous.committedAt = entry.committedAt;
    previous.inputType = entry.inputType;
    previous.size = getHistoryEntrySize(previous);
    return true;
  }

  function canMergeHistoryEntry(previous, entry) {
    return Boolean(
      previous &&
        state.history.lastCommittedAt &&
        previous.mergeKey === entry.mergeKey &&
        isMergeableInputType(previous.inputType) &&
        isMergeableInputType(entry.inputType) &&
        entry.committedAt - state.history.lastCommittedAt <= HISTORY_GROUP_DELAY_MS
    );
  }

  function pruneHistory() {
    recalculateHistoryByteSize();
    while (
      state.history.undo.length > 1 &&
      (state.history.undo.length > HISTORY_MAX_ENTRIES || state.history.byteSize > HISTORY_MAX_BYTES)
    ) {
      state.history.undo.shift();
      recalculateHistoryByteSize();
    }
  }

  function recalculateHistoryByteSize() {
    state.history.byteSize = [...state.history.undo, ...state.history.redo].reduce(
      (total, entry) => total + getHistoryEntrySize(entry),
      0
    );
  }

  function getHistoryEntrySize(entry) {
    return (
      stringByteSize(entry.beforeMarkdown) +
      stringByteSize(entry.afterMarkdown) +
      stringByteSize(JSON.stringify(entry.beforeSelection || null)) +
      stringByteSize(JSON.stringify(entry.afterSelection || null))
    );
  }

  function stringByteSize(value) {
    return String(value || "").length * 2;
  }

  function updateDirtyFromHistory() {
    state.dirty = state.history.revision !== state.history.savedRevision;
    updateChrome();
  }

  function isHistoryInputType(inputType) {
    return HISTORY_CONTENT_INPUT_TYPES.has(inputType || "");
  }

  function isMergeableInputType(inputType) {
    return HISTORY_TYPING_INPUT_TYPES.has(inputType || "");
  }

  function getInputHistoryLabel(event) {
    const inputType = event && event.inputType ? event.inputType : "";
    if (inputType.startsWith("delete")) {
      return "Delete";
    }
    if (inputType === "insertFromPaste") {
      return "Paste";
    }
    return "Typing";
  }

  function getNativeInputMergeKey(event) {
    const inputType = event && event.inputType ? event.inputType : "input";
    const kind = inputType.startsWith("delete") ? "delete" : "type";
    const block = getActiveBlock();
    const blockIndex = block ? Array.from(editor.children).indexOf(block) : -1;
    return "native:" + kind + ":" + blockIndex;
  }

  function createSelectionBookmark() {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode || !selection.focusNode || !selectionIsInsideEditor()) {
      return null;
    }

    return {
      anchor: createSelectionPointBookmark(selection.anchorNode, selection.anchorOffset),
      focus: createSelectionPointBookmark(selection.focusNode, selection.focusOffset),
      isCollapsed: selection.isCollapsed,
    };
  }

  function createSelectionPointBookmark(node, offset) {
    const path = [];
    let current = node;
    while (current && current !== editor) {
      const parent = current.parentNode;
      if (!parent) {
        return null;
      }
      path.unshift(Array.from(parent.childNodes).indexOf(current));
      current = parent;
    }

    return current === editor ? { path, offset } : null;
  }

  function restoreSelectionBookmark(bookmark) {
    const selection = window.getSelection();
    if (!selection || !bookmark || !bookmark.anchor || !bookmark.focus) {
      placeCaretAtEnd(editor);
      editor.focus();
      return false;
    }

    const anchor = resolveSelectionPointBookmark(bookmark.anchor);
    const focus = resolveSelectionPointBookmark(bookmark.focus);
    if (!anchor || !focus) {
      placeCaretAtEnd(editor);
      editor.focus();
      return false;
    }

    const range = document.createRange();
    try {
      range.setStart(anchor.node, anchor.offset);
      range.setEnd(focus.node, focus.offset);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_error) {
      placeCaretAtEnd(editor);
      editor.focus();
      return false;
    }

    editor.focus();
    return true;
  }

  function resolveSelectionPointBookmark(point) {
    let node = editor;
    for (const index of point.path) {
      if (!node.childNodes || !node.childNodes.length) {
        return null;
      }
      node = node.childNodes[clamp(index, 0, node.childNodes.length - 1)];
    }

    const maxOffset = node.nodeType === Node.TEXT_NODE ? node.textContent.length : node.childNodes.length;
    return { node, offset: clamp(point.offset, 0, maxOffset) };
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
      if (hasSerializedBlockChildren(node)) {
        return serializeBlocks(Array.from(node.childNodes));
      }
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
      return "```" + language + "\n" + code.textContent + "\n```";
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
        if (tag === "table") {
          return "\n\n" + serializeTable(node) + "\n\n";
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

  function hasSerializedBlockChildren(node) {
    return Array.from(node.childNodes).some(
      (child) => child.nodeType === Node.ELEMENT_NODE && SERIALIZED_BLOCK_TAGS.has(child.tagName.toLowerCase())
    );
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

  function isParagraphInput(event) {
    return Boolean(event && PARAGRAPH_INPUT_TYPES.has(event.inputType));
  }

  function shouldTransformAfterInput(event) {
    if (!event || event.inputType === "insertFromPaste") {
      return true;
    }

    if (isParagraphInput(event)) {
      return false;
    }

    const data = event.data || "";
    if (data && /[#*~`\[\]()|>\-+\d.: ]/.test(data)) {
      return true;
    }

    const block = getActiveBlock();
    if (!block || block.closest("pre")) {
      return false;
    }

    return blockMayContainMarkdownTransform(block);
  }

  function blockMayContainMarkdownTransform(block) {
    const raw = block.textContent || "";
    return (
      /^(#{1,6})\s+.+/.test(raw) ||
      /^[-*+]\s+\[( |x|X)\]\s+.+/.test(raw) ||
      /^[-*+]\s+.+/.test(raw) ||
      /^\d+[.)]\s+.+/.test(raw) ||
      raw.startsWith("> ") ||
      hasCompleteInlineMarkdown(raw)
    );
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

    if (
      block.childNodes.length === 1 &&
      block.firstChild.nodeType === Node.TEXT_NODE &&
      hasCompleteInlineMarkdown(raw)
    ) {
      const inline = window.InkwellMarkdown.parseInline(raw);
      if (inline.some((node) => node.type !== "text")) {
        renderInline(raw, block);
        placeCaretAtEnd(block);
      }
    }
  }

  function hasCompleteInlineMarkdown(raw) {
    return /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\)|(^|[^*])\*[^*]+\*(?!\*))/.test(raw);
  }

  function shouldDropStaleEnterRepeat(event) {
    if (
      event.key !== "Enter" ||
      !event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return false;
    }

    if (!selectionIsInsideEditor()) {
      return false;
    }

    return getEventAgeMs(event) > ENTER_REPEAT_STALE_MS;
  }

  function getEventAgeMs(event) {
    if (!event || typeof event.timeStamp !== "number") {
      return 0;
    }

    const age = performance.now() - event.timeStamp;
    return age >= 0 && age < 60000 ? age : 0;
  }

  function handleCodeBlockKey(event) {
    if (event.key !== "Tab" && event.key !== "Enter") {
      return false;
    }

    const code = getActiveCodeElement();
    if (!code) {
      return false;
    }

    event.preventDefault();
    if (event.key === "Tab") {
      withHistoryTransaction(event.shiftKey ? "Outdent Code" : "Indent Code", () => {
        updateCodeIndentation(code, event.shiftKey);
      }, {
        inputType: event.shiftKey ? "formatOutdent" : "formatIndent",
        mergeKey: "code:indent",
      });
    } else {
      withHistoryTransaction("Insert Code Line", () => {
        replaceCodeSelection(code, "\n");
      }, {
        inputType: "insertLineBreak",
        mergeKey: "code:line-break",
        allowMerge: true,
      });
    }

    updateStatsNow();
    scheduleFindRefresh();
    scheduleSelectionToolbarUpdate();
    return true;
  }

  function getActiveCodeElement() {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode || !selection.focusNode) {
      return null;
    }

    const anchor =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    const focus =
      selection.focusNode.nodeType === Node.ELEMENT_NODE ? selection.focusNode : selection.focusNode.parentElement;
    const pre = anchor ? anchor.closest("pre") : null;
    if (!pre || !editor.contains(pre) || !focus || !pre.contains(focus)) {
      return null;
    }

    let code = pre.querySelector("code");
    if (!code) {
      code = document.createElement("code");
      code.textContent = pre.textContent || "";
      pre.replaceChildren(code);
    }
    return code;
  }

  function normalizeActiveCodeBlock() {
    const code = getActiveCodeElement();
    if (code) {
      normalizeCodeElement(code);
    }
  }

  function normalizeCodeElement(code) {
    const pre = code.closest("pre");
    if (!pre) {
      return code;
    }

    const codeElements = pre.querySelectorAll("code");
    const alreadySimple =
      codeElements.length === 1 &&
      pre.childNodes.length === 1 &&
      pre.firstChild === code &&
      (code.childNodes.length === 0 ||
        (code.childNodes.length === 1 && code.firstChild.nodeType === Node.TEXT_NODE));
    if (alreadySimple) {
      if (!code.firstChild) {
        code.append(document.createTextNode(""));
      }
      return code;
    }

    const offsets = getTextSelectionOffsets(pre);
    const normalized = document.createElement("code");
    normalized.textContent = pre.textContent || "";
    pre.replaceChildren(normalized);
    if (offsets) {
      restoreCodeSelection(normalized, offsets.anchor, offsets.focus);
    }
    return normalized;
  }

  function replaceCodeSelection(code, replacement) {
    const normalized = normalizeCodeElement(code);
    const offsets = getTextSelectionOffsets(normalized);
    const text = normalized.textContent || "";
    const start = offsets ? Math.min(offsets.anchor, offsets.focus) : text.length;
    const end = offsets ? Math.max(offsets.anchor, offsets.focus) : text.length;
    normalized.textContent = text.slice(0, start) + replacement + text.slice(end);
    restoreCodeSelection(normalized, start + replacement.length, start + replacement.length);
  }

  function updateCodeIndentation(code, outdent) {
    const normalized = normalizeCodeElement(code);
    const offsets = getTextSelectionOffsets(normalized);
    const text = normalized.textContent || "";
    if (!offsets) {
      normalized.textContent = outdent ? text.replace(/^( {1,2}|\t)/, "") : "  " + text;
      restoreCodeSelection(normalized, 0, 0);
      return;
    }

    const start = Math.min(offsets.anchor, offsets.focus);
    const end = Math.max(offsets.anchor, offsets.focus);
    if (start === end && !outdent) {
      replaceCodeSelection(normalized, "  ");
      return;
    }

    const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEndIndex = text.indexOf("\n", Math.max(end, lineStart));
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const segment = text.slice(lineStart, lineEnd);
    const transformed = segment
      .split("\n")
      .map((line) => (outdent ? line.replace(/^( {1,2}|\t)/, "") : "  " + line))
      .join("\n");
    normalized.textContent = text.slice(0, lineStart) + transformed + text.slice(lineEnd);
    const caret = outdent ? lineStart : Math.min(normalized.textContent.length, start + 2);
    restoreCodeSelection(normalized, caret, caret);
  }

  function getTextSelectionOffsets(root) {
    const selection = window.getSelection();
    if (
      !selection ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !root.contains(selection.anchorNode) ||
      !root.contains(selection.focusNode)
    ) {
      return null;
    }

    return {
      anchor: getTextOffsetInNode(root, selection.anchorNode, selection.anchorOffset),
      focus: getTextOffsetInNode(root, selection.focusNode, selection.focusOffset),
    };
  }

  function getTextOffsetInNode(root, node, offset) {
    const range = document.createRange();
    try {
      range.selectNodeContents(root);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (_error) {
      return (root.textContent || "").length;
    }
  }

  function restoreCodeSelection(code, anchorOffset, focusOffset) {
    if (!code.firstChild) {
      code.append(document.createTextNode(""));
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const textNode = code.firstChild;
    const maxOffset = textNode.textContent.length;
    const range = document.createRange();
    range.setStart(textNode, clamp(anchorOffset, 0, maxOffset));
    range.setEnd(textNode, clamp(focusOffset, 0, maxOffset));
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
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

  function insertPlainTextWithLineBreaksAtSelection(text) {
    const nodes = [];
    const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    lines.forEach((line, index) => {
      if (index > 0) {
        nodes.push(document.createElement("br"));
      }
      if (line) {
        nodes.push(document.createTextNode(line));
      }
    });
    insertNodesAtSelection(nodes.length ? nodes : [document.createTextNode("")]);
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

  function handleEditorMouseDown(event) {
    if (!isSecondaryEditorEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.suppressNextDocumentClick = true;
    handleEditorContextMenu(event);
  }

  function handleEditorSecondaryPointerDown(event) {
    if (!isSecondaryEditorEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.suppressNextDocumentClick = true;
    handleEditorContextMenu(event);
  }

  function handleEditorAuxClick(event) {
    if (!isSecondaryEditorEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.suppressNextDocumentClick = true;
    handleEditorContextMenu(event);
  }

  function isSecondaryEditorEvent(event) {
    return event.button === 2 || (isMacPlatform && event.button === 0 && event.ctrlKey);
  }

  function handleEditorContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const cell = event.target.closest("th, td");
    if (cell && editor.contains(cell)) {
      closeAllMenus();
      hideSelectionToolbar();
      hideSpellingContextMenu();
      openTableContextMenu(cell, event.clientX, event.clientY);
      return;
    }

    hideTableContextMenu();
    clearTableSelection();
    handleSpellingContextMenu(event);
  }

  function handleSpellingContextMenu(event) {
    hideSpellingContextMenu();
    if (!bridge.native) {
      return;
    }

    event.preventDefault();
    closeAllMenus();
    hideSelectionToolbar();

    const wordContext = getWordContextAtPoint(event.clientX, event.clientY) || getWordContextFromSelection();
    if (!wordContext) {
      return;
    }

    requestSpellingSuggestions(wordContext, event.clientX, event.clientY);
  }

  function showSpellingSuggestionsForCurrentWord() {
    if (!bridge.native) {
      setStatus("Spelling suggestions unavailable");
      return false;
    }

    const wordContext = getWordContextFromSelection();
    if (!wordContext) {
      setStatus("Place the cursor in a word to show spelling suggestions");
      return false;
    }

    const point = getSpellingMenuPoint(wordContext.range);
    requestSpellingSuggestions(wordContext, point.clientX, point.clientY);
    return true;
  }

  function checkDocumentSpelling() {
    if (!bridge.native) {
      setStatus("Spelling check unavailable");
      return false;
    }

    const words = collectSpellingWordContexts();
    if (!words.length) {
      setStatus("No words to check");
      return false;
    }

    let index = 0;
    const checkNext = () => {
      const wordContext = words[index];
      index += 1;
      if (!wordContext) {
        setStatus("No spelling issues found");
        return;
      }

      bridge.send("spellingSuggestions", { word: wordContext.word })
        .then((result) => {
          if (result && result.misspelled) {
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(wordContext.range.cloneRange());
            }
            const point = getSpellingMenuPoint(wordContext.range);
            requestSpellingSuggestions(wordContext, point.clientX, point.clientY);
            setStatus("Spelling issue: " + wordContext.word);
            return;
          }
          checkNext();
        })
        .catch(() => {
          setStatus("Spelling check unavailable");
        });
    };

    checkNext();
    return true;
  }

  function toggleContinuousSpellcheck() {
    state.spellcheckEnabled = !state.spellcheckEnabled;
    editor.spellcheck = state.spellcheckEnabled;
    setStatus(state.spellcheckEnabled ? "Spelling while typing on" : "Spelling while typing off");
    return true;
  }

  function checkDocumentGrammar() {
    if (!bridge.native) {
      setStatus("Grammar check unavailable");
      return false;
    }

    const text = getRenderedStatsText();
    if (!String(text || "").trim()) {
      setStatus("No text to check");
      return false;
    }

    bridge.send("grammarCheck", { text })
      .then((result) => {
        if (result && result.hasIssue) {
          const detail = String(result.description || "").trim();
          setStatus(detail ? "Grammar: " + detail : "Grammar issue found");
          return;
        }
        setStatus("No grammar issues found");
      })
      .catch(() => {
        setStatus("Grammar check unavailable");
      });
    return true;
  }

  function requestSpellingSuggestions(wordContext, clientX, clientY) {
    const requestId = ++state.spellingRequestId;
    state.spellingContext = {
      requestId,
      word: wordContext.word,
      range: wordContext.range,
    };
    renderSpellingContextMenu(wordContext.word, [], {
      loading: true,
      clientX,
      clientY,
    });

    bridge.send("spellingSuggestions", { word: wordContext.word })
      .then((result) => {
        if (!state.spellingContext || state.spellingContext.requestId !== requestId) {
          return;
        }
        const suggestions = Array.isArray(result.suggestions)
          ? result.suggestions
            .map((value) => String(value || "").trim())
            .filter((value, index, list) => value && value !== wordContext.word && list.indexOf(value) === index)
            .slice(0, 6)
          : [];
        renderSpellingContextMenu(wordContext.word, suggestions, {
          misspelled: Boolean(result.misspelled),
          clientX,
          clientY,
        });
      })
      .catch(() => {
        if (state.spellingContext && state.spellingContext.requestId === requestId) {
          hideSpellingContextMenu();
          setStatus("Spelling suggestions unavailable");
        }
      });
  }

  function getSpellingMenuPoint(range) {
    const rect = range && typeof range.getBoundingClientRect === "function"
      ? range.getBoundingClientRect()
      : null;
    return {
      clientX: rect && rect.left ? rect.left : Math.round(window.innerWidth / 2),
      clientY: rect && rect.bottom ? rect.bottom + 4 : Math.round(window.innerHeight / 2),
    };
  }

  function collectSpellingWordContexts() {
    const contexts = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const text = textNode.nodeValue || "";
      const matches = text.matchAll(/[\p{L}\p{M}'’-]+/gu);
      for (const match of matches) {
        const word = match[0];
        const index = match.index || 0;
        if (!/\p{L}/u.test(word)) {
          continue;
        }
        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + word.length);
        contexts.push({ word, range });
      }
      textNode = walker.nextNode();
    }
    return contexts;
  }

  function getWordContextAtPoint(clientX, clientY) {
    const range = createCaretRangeFromPoint(clientX, clientY);
    if (!range) {
      return null;
    }

    const textPoint = resolveTextPoint(range.startContainer, range.startOffset);
    if (!textPoint || !editor.contains(textPoint.node)) {
      return null;
    }

    return getWordContextFromTextPoint(textPoint);
  }

  function getWordContextFromSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode || !selectionIsInsideEditor()) {
      return null;
    }

    if (!selection.isCollapsed && selection.rangeCount > 0) {
      const selectedText = selection.toString().trim();
      if (selectedText && isSingleSpellingWord(selectedText)) {
        const range = selection.getRangeAt(0).cloneRange();
        return {
          word: selectedText,
          range,
        };
      }
    }

    const textPoint = resolveTextPoint(selection.anchorNode, selection.anchorOffset);
    return textPoint ? getWordContextFromTextPoint(textPoint) : null;
  }

  function getWordContextFromTextPoint(textPoint) {
    const text = textPoint.node.nodeValue || "";
    let index = clamp(textPoint.offset, 0, text.length);
    if (index >= text.length || !isSpellingWordCharacter(text[index])) {
      if (index > 0 && isSpellingWordCharacter(text[index - 1])) {
        index -= 1;
      } else if (index < text.length - 1 && isSpellingWordCharacter(text[index + 1])) {
        index += 1;
      } else {
        return null;
      }
    }

    let start = index;
    let end = index + 1;
    while (start > 0 && isSpellingWordCharacter(text[start - 1])) {
      start -= 1;
    }
    while (end < text.length && isSpellingWordCharacter(text[end])) {
      end += 1;
    }

    const word = text.slice(start, end);
    if (!/\p{L}/u.test(word)) {
      return null;
    }

    const wordRange = document.createRange();
    wordRange.setStart(textPoint.node, start);
    wordRange.setEnd(textPoint.node, end);
    return {
      word,
      range: wordRange,
    };
  }

  function createCaretRangeFromPoint(clientX, clientY) {
    if (typeof document.caretRangeFromPoint === "function") {
      return document.caretRangeFromPoint(clientX, clientY);
    }
    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(clientX, clientY);
      if (!position) {
        return null;
      }
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  function resolveTextPoint(node, offset) {
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return { node, offset };
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const childNodes = Array.from(node.childNodes);
    const nearby = [
      childNodes[offset],
      childNodes[offset - 1],
      node,
    ];
    for (const candidate of nearby) {
      const textNode = findNearestTextNode(candidate);
      if (textNode) {
        return {
          node: textNode,
          offset: candidate === childNodes[offset - 1] ? (textNode.nodeValue || "").length : 0,
        };
      }
    }
    return null;
  }

  function findNearestTextNode(node) {
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node;
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return walker.nextNode();
  }

  function isSpellingWordCharacter(character) {
    return Boolean(character && /[\p{L}\p{M}'’-]/u.test(character));
  }

  function isSingleSpellingWord(text) {
    return /^[\p{L}\p{M}'’-]+$/u.test(String(text || ""));
  }

  function renderSpellingContextMenu(word, suggestions, options = {}) {
    spellingContextMenu.replaceChildren();
    if (options.loading) {
      const loading = document.createElement("button");
      loading.className = "spelling-menu-item";
      loading.type = "button";
      loading.disabled = true;
      loading.textContent = "Looking up \"" + word + "\"";
      spellingContextMenu.append(loading);
    } else if (suggestions.length) {
      for (const suggestion of suggestions) {
        const button = document.createElement("button");
        button.className = "spelling-menu-item";
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.dataset.spellingSuggestion = suggestion;
        button.textContent = suggestion;
        spellingContextMenu.append(button);
      }
    } else {
      const empty = document.createElement("button");
      empty.className = "spelling-menu-item";
      empty.type = "button";
      empty.disabled = true;
      empty.textContent = options.misspelled ? "No Suggestions" : "No Spelling Suggestions";
      spellingContextMenu.append(empty);
    }

    spellingContextMenu.hidden = false;
    const rect = spellingContextMenu.getBoundingClientRect();
    const left = clamp(options.clientX || 8, 8, window.innerWidth - rect.width - 8);
    const top = clamp(options.clientY || 8, 8, window.innerHeight - rect.height - 8);
    spellingContextMenu.style.left = left + "px";
    spellingContextMenu.style.top = top + "px";
  }

  function replaceSpellingContext(suggestion) {
    const context = state.spellingContext;
    if (!context || !context.range || !suggestion) {
      hideSpellingContextMenu();
      return false;
    }

    editor.focus();
    withHistoryTransaction("Correct Spelling", () => {
      context.range.deleteContents();
      const textNode = document.createTextNode(suggestion);
      context.range.insertNode(textNode);
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, {
      inputType: "insertReplacementText",
      mergeKey: "spelling",
    });
    hideSpellingContextMenu();
    markEdited("Corrected spelling");
    return true;
  }

  function hideSpellingContextMenu() {
    spellingContextMenu.hidden = true;
    spellingContextMenu.replaceChildren();
    state.spellingContext = null;
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

    if (action === "copyCells") {
      copyTableSelection(context);
      return;
    }
    if (action === "cutCells") {
      cutTableSelection(context);
      return;
    }
    if (action === "pasteCells") {
      pasteIntoTableSelectionFromMenu(context);
      return;
    }

    withHistoryTransaction("Table updated", () => {
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
    }, {
      inputType: "table",
      mergeKey: "table:" + action,
    });
    hideTableContextMenu();
    clearTableSelection();
    markEdited("Table updated");
  }

  function runActiveTableAction(action) {
    const activeCell = getActiveTableCell();
    if (!activeCell) {
      setStatus("Place the cursor in a table first");
      return false;
    }

    const table = activeCell.closest("table");
    const selectedCells = getSelectedTableCells(table);
    state.tableContext = {
      table,
      cell: activeCell,
      cells: selectedCells.length ? selectedCells : [activeCell],
    };
    runTableAction(action);
    return true;
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
      setStatus("Press " + primaryShortcutText("V") + " to paste into selected cells");
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
    withHistoryTransaction("Cut table cells", () => {
      clearTableCells(state.tableSelection.cells);
    }, {
      inputType: "deleteByCut",
      mergeKey: "table:cut",
    });
    markEdited("Cut table cells");
  }

  function pasteTextIntoTableSelection(text) {
    if (!hasTableSelection()) {
      return false;
    }

    withHistoryTransaction("Paste table cells", () => {
      pasteTableText(state.tableSelection, text);
      clearTableSelection();
    }, {
      inputType: "insertFromPaste",
      mergeKey: "table:paste",
    });
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

    const nonEmptyLines = lines.filter((line) => line.trim());
    if (nonEmptyLines.some((line) => line.includes("\t"))) {
      return lines.map((line) => line.split("\t"));
    }

    if (nonEmptyLines.length && nonEmptyLines.every((line) => line.includes("|"))) {
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
      withHistoryTransaction("Add Table Row", () => {
        const row = createTableRow(table);
        ensureTableBody(table).append(row);
        normalizeGeneratedHeaders(table);
        placeCaretAtEnd(row.firstElementChild || row);
        setTableSelectionCells(table, [row.firstElementChild].filter(Boolean));
      }, {
        inputType: "table",
        mergeKey: "table:navigate-add-row",
      });
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
    updateDirtyFromHistory();
    updateStatsNow();
    scheduleFindRefresh();
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
    const selection = window.getSelection();
    if (selection && selection.isCollapsed && selectionToolbar.hidden && !state.savedRange) {
      return;
    }

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

  function getSystemThemePreference() {
    return systemThemeQuery && systemThemeQuery.matches ? "light" : "dark";
  }

  function setupSystemThemeListener() {
    if (!systemThemeQuery) {
      return;
    }

    const updateSystemTheme = () => {
      if (documentSettings.themeOverride) {
        return;
      }
      applyTheme(getSystemThemePreference());
    };

    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", updateSystemTheme);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(updateSystemTheme);
    }
  }

  function setTheme(theme) {
    documentSettings.themeOverride = theme;
    applyTheme(theme);
    setStatus(theme === "light" ? "Light theme" : "Dark theme");
  }

  function primaryShortcutText(key) {
    return (isMacPlatform ? "Command+" : "Ctrl+") + key;
  }

  function applyTheme(theme) {
    documentSettings.theme = theme;
    document.body.dataset.theme = theme;
  }

  function setPageSize(widthIn, heightIn) {
    documentSettings.pageWidthIn = clamp(widthIn, MIN_PAGE_WIDTH_IN, MAX_PAGE_WIDTH_IN);
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
    zoomState.hidden = documentSettings.zoom === 100;
    zoomState.textContent = "Zoom " + documentSettings.zoom + "%";
    updateRulerLabels();
    updateRulerGeometry(marginLeftPx, marginRightPx);
    syncRulerScrollFromDocument();
    scheduleFindOverlayRender();
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
    documentSettings.pageWidthIn = clamp(documentSettings.pageWidthIn, MIN_PAGE_WIDTH_IN, MAX_PAGE_WIDTH_IN);
    const max = Math.max(MIN_MARGIN_IN, documentSettings.pageWidthIn - MIN_CONTENT_IN);
    documentSettings.marginLeftIn = clamp(documentSettings.marginLeftIn, MIN_MARGIN_IN, max);
    documentSettings.marginRightIn = clamp(
      documentSettings.marginRightIn,
      MIN_MARGIN_IN,
      documentSettings.pageWidthIn - documentSettings.marginLeftIn - MIN_CONTENT_IN
    );
  }

  function syncRulerScrollFromDocument() {
    syncHorizontalScroll(documentScroll, ruler);
  }

  function syncDocumentScrollFromRuler() {
    syncHorizontalScroll(ruler, documentScroll);
  }

  function syncHorizontalScroll(source, target) {
    if (state.scrollSyncing || Math.abs(target.scrollLeft - source.scrollLeft) < 1) {
      return;
    }
    state.scrollSyncing = true;
    target.scrollLeft = source.scrollLeft;
    state.scrollSyncing = false;
  }

  function updateChrome() {
    const unsaved = state.dirty || !state.savedToDisk;
    document.title = (state.dirty ? "*" : "") + state.name + " - Inkwell";
    fileName.textContent = state.name;
    dirtyState.textContent = unsaved ? "Unsaved" : "Saved";
    dirtyState.classList.toggle("is-dirty", unsaved);
  }

  function scheduleStatsUpdate() {
    state.statsPending = true;
    if (state.statsTimer) {
      return;
    }

    state.statsTimer = window.setTimeout(() => {
      state.statsTimer = null;
      if (!state.statsPending) {
        return;
      }
      state.statsPending = false;
      updateStats();
    }, STATS_UPDATE_DELAY_MS);
  }

  function flushStatsUpdate() {
    if (!state.statsPending) {
      return;
    }
    updateStatsNow();
  }

  function updateStatsNow() {
    if (state.statsTimer) {
      window.clearTimeout(state.statsTimer);
      state.statsTimer = null;
    }
    state.statsPending = false;
    updateStats();
  }

  function updateStats() {
    const wordText = getRenderedStatsText();
    const characterText = getRenderedCharacterStatsText();
    const words = countRenderedWords(wordText);
    const chars = countRenderedCharacters(characterText);
    documentStats.textContent = words + " words / " + chars + " chars";
    updateSelectionStats();
  }

  function updateSelectionStats() {
    const selectedText = getSelectionStatsText();
    if (!selectedText) {
      selectionStats.hidden = true;
      selectionStats.textContent = "";
      return;
    }

    const words = countRenderedWords(selectedText);
    const chars = countSelectedCharacters(selectedText);
    selectionStats.textContent = "Selected: " + formatCount(words, "word") + " / " + formatCount(chars, "char");
    selectionStats.hidden = false;
  }

  function getSelectionStatsText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selectionIsInsideEditor()) {
      return "";
    }
    return selection.toString();
  }

  function countSelectedCharacters(text) {
    return String(text || "").length;
  }

  function formatCount(count, singular) {
    return count + " " + singular + (count === 1 ? "" : "s");
  }

  function getRenderedStatsText() {
    if (typeof editor.innerText === "string") {
      return editor.innerText;
    }
    return getRenderedTextFromNode(editor);
  }

  function getRenderedTextFromNode(node) {
    if (!node) {
      return "";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      return "\n";
    }

    const childText = Array.from(node.childNodes).map((child) => getRenderedTextFromNode(child)).join("");
    if (STATS_BLOCK_TAGS.has(tag)) {
      return "\n" + childText + "\n";
    }
    return childText;
  }

  function getRenderedCharacterStatsText() {
    return getRenderedCharacterTextFromNode(editor);
  }

  function getRenderedCharacterTextFromNode(node) {
    if (!node) {
      return "";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();
    if (tag === "br" || tag === "script" || tag === "style") {
      return "";
    }

    return Array.from(node.childNodes).map((child) => getRenderedCharacterTextFromNode(child)).join("");
  }

  function countRenderedWords(text) {
    const trimmed = String(text || "").trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function countRenderedCharacters(text) {
    return String(text || "").replace(/[\r\n]+/g, "").replace(/\s+$/, "").length;
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

  function setLiveStatus(message) {
    if (state.statusTimer) {
      window.clearTimeout(state.statusTimer);
      state.statusTimer = null;
    }
    statusText.textContent = message;
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
    downloadBlob(content, state.name || "Untitled.md", "text/markdown;charset=utf-8");
  }

  function downloadBlob(content, name, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function currentPageSetupPayload() {
    return {
      pageWidthIn: documentSettings.pageWidthIn,
      pageHeightIn: documentSettings.pageHeightIn,
      marginLeftIn: documentSettings.marginLeftIn,
      marginRightIn: documentSettings.marginRightIn,
    };
  }

  function applyPageSetupResult(result) {
    if (!result || typeof result !== "object") {
      return;
    }
    const pageWidthIn = Number(result.pageWidthIn);
    const pageHeightIn = Number(result.pageHeightIn);
    const marginLeftIn = Number(result.marginLeftIn);
    const marginRightIn = Number(result.marginRightIn);
    if (Number.isFinite(pageWidthIn) && Number.isFinite(pageHeightIn)) {
      documentSettings.pageWidthIn = clamp(pageWidthIn, MIN_PAGE_WIDTH_IN, MAX_PAGE_WIDTH_IN);
      documentSettings.pageHeightIn = Math.max(MIN_CONTENT_IN, pageHeightIn);
    }
    if (Number.isFinite(marginLeftIn)) {
      documentSettings.marginLeftIn = Math.max(MIN_MARGIN_IN, marginLeftIn);
    }
    if (Number.isFinite(marginRightIn)) {
      documentSettings.marginRightIn = Math.max(MIN_MARGIN_IN, marginRightIn);
    }
    clampMargins();
    updateLayout();
  }

  function suggestedExportName(extension) {
    const base = String(state.name || "Untitled")
      .replace(/\.[^.]*$/, "")
      .replace(/[/:\\]/g, "-")
      .trim() || "Untitled";
    return base + extension;
  }

  function buildStandaloneHTMLExport() {
    const clone = editor.cloneNode(true);
    sanitizeExportHTML(clone);
    const title = escapeHTML(state.name || "Inkwell Document");
    const bodyMarkup = serializeExportChildren(clone);
    return "<!doctype html>\n" +
      "<html lang=\"en\">\n" +
      "<head>\n" +
      "  <meta charset=\"utf-8\">\n" +
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
      "  <title>" + title + "</title>\n" +
      "  <style>\n" +
      "    body { margin: 2rem auto; max-width: 760px; font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #202521; }\n" +
      "    table { border-collapse: collapse; width: 100%; }\n" +
      "    th, td { border: 1px solid #d8ded8; padding: 0.45rem 0.55rem; vertical-align: top; }\n" +
      "    pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }\n" +
      "    pre { padding: 1rem; overflow-x: auto; background: #f4f6f4; }\n" +
      "    blockquote { border-left: 3px solid #7d8a7e; margin-left: 0; padding-left: 1rem; color: #526055; }\n" +
      "  </style>\n" +
      "</head>\n" +
      "<body>\n" +
      bodyMarkup +
      "\n</body>\n</html>\n";
  }

  function sanitizeExportHTML(root) {
    for (const node of Array.from(root.querySelectorAll("script, style, iframe, object, embed, img"))) {
      node.remove();
    }
    for (const element of Array.from(root.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "contenteditable" || name === "class") {
          element.removeAttribute(attribute.name);
        }
      }
      if (element.tagName.toLowerCase() === "a") {
        const href = window.InkwellMarkdown.sanitizeHref(element.getAttribute("href"));
        if (href) {
          element.setAttribute("href", href);
          element.setAttribute("rel", "noreferrer noopener");
        } else {
          element.removeAttribute("href");
        }
      }
    }
  }

  function serializeExportChildren(root) {
    let output = "";
    for (const child of Array.from(root.childNodes)) {
      output += serializeExportNode(child);
    }
    return output;
  }

  function serializeExportNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHTML(node.nodeValue || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();
    const allowedTags = new Set([
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "input",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ]);
    if (!allowedTags.has(tag)) {
      return serializeExportChildren(node);
    }

    const attributes = serializeExportAttributes(node, tag);
    if (tag === "br" || tag === "hr" || tag === "input") {
      return "<" + tag + attributes + ">";
    }
    return "<" + tag + attributes + ">" + serializeExportChildren(node) + "</" + tag + ">";
  }

  function serializeExportAttributes(element, tag) {
    const attributes = [];
    if (tag === "a") {
      const href = window.InkwellMarkdown.sanitizeHref(element.getAttribute("href"));
      if (href) {
        attributes.push(["href", href], ["rel", "noreferrer noopener"]);
      }
      const title = element.getAttribute("title");
      if (title) {
        attributes.push(["title", title]);
      }
    } else if (tag === "td" || tag === "th") {
      const align = element.dataset.align;
      if (align === "left" || align === "center" || align === "right") {
        attributes.push(["style", "text-align: " + align]);
      }
    } else if (tag === "input" && element.getAttribute("type") === "checkbox") {
      attributes.push(["type", "checkbox"], ["disabled", ""]);
      if (element.checked) {
        attributes.push(["checked", ""]);
      }
    }

    return attributes
      .map(([name, value]) => value === "" ? " " + name : " " + name + "=\"" + escapeHTML(value) + "\"")
      .join("");
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function formatInches(value) {
    return value.toFixed(value < 10 ? 2 : 1) + " in";
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
