#import <AppKit/AppKit.h>

#include "inkwell_core.h"

@interface InkwellAppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property(nonatomic, retain) NSWindow *window;
@property(nonatomic, retain) NSTextView *textView;
@property(nonatomic, copy) NSString *currentPath;
@property(nonatomic, copy) NSString *pendingOpenPath;
@end

@implementation InkwellAppDelegate {
  InkwellDocument *_document;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _document = inkwell_document_new();
  }
  return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  (void)notification;

  self.window = [[NSWindow alloc]
      initWithContentRect:NSMakeRect(0, 0, 980, 720)
                styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable)
                  backing:NSBackingStoreBuffered
                    defer:NO];
  self.window.title = @"Inkwell Native";
  self.window.delegate = self;

  NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:self.window.contentView.bounds];
  scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  scroll.hasVerticalScroller = YES;

  self.textView = [[NSTextView alloc] initWithFrame:scroll.contentView.bounds];
  self.textView.minSize = NSMakeSize(0, 0);
  self.textView.maxSize = NSMakeSize(CGFLOAT_MAX, CGFLOAT_MAX);
  self.textView.verticallyResizable = YES;
  self.textView.horizontallyResizable = NO;
  self.textView.autoresizingMask = NSViewWidthSizable;
  self.textView.textContainer.widthTracksTextView = YES;
  self.textView.string = @"";

  scroll.documentView = self.textView;
  self.window.contentView = scroll;
  [self.window center];
  [self.window makeKeyAndOrderFront:nil];

  if (self.pendingOpenPath) {
    NSString *path = self.pendingOpenPath;
    self.pendingOpenPath = nil;
    [self loadPath:path];
  }
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  (void)notification;
  inkwell_document_free(_document);
}

- (void)syncDocumentFromTextView {
  NSString *text = self.textView.string ?: @"";
  const char *utf8 = text.UTF8String;
  inkwell_document_load_markdown(_document, utf8, strlen(utf8));
}

- (void)syncTextViewFromDocument {
  const char *text = inkwell_document_text(_document);
  self.textView.string = [NSString stringWithUTF8String:text ?: ""];
}

- (BOOL)loadPath:(NSString *)path {
  if (!self.textView) {
    self.pendingOpenPath = path;
    return YES;
  }

  NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
  NSNumber *fileSize = [attributes objectForKey:NSFileSize];
  if (!fileSize || fileSize.unsignedLongLongValue > INKWELL_MAX_DOCUMENT_BYTES) {
    return NO;
  }

  NSData *data = [NSData dataWithContentsOfFile:path];
  if (!data) {
    return NO;
  }
  if (data.length > INKWELL_MAX_DOCUMENT_BYTES) {
    return NO;
  }

  if (inkwell_document_load_markdown(_document, data.bytes, data.length) != INKWELL_OK) {
    return NO;
  }

  self.currentPath = path;
  [self syncTextViewFromDocument];
  inkwell_document_mark_saved(_document);
  return YES;
}

- (BOOL)application:(NSApplication *)sender openFile:(NSString *)filename {
  (void)sender;
  return [self loadPath:filename];
}

- (IBAction)newDocument:(id)sender {
  (void)sender;
  inkwell_document_load_markdown(_document, "", 0);
  self.currentPath = nil;
  [self syncTextViewFromDocument];
}

- (IBAction)openDocument:(id)sender {
  (void)sender;
  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = NO;
  if ([panel runModal] != NSModalResponseOK) {
    return;
  }

  [self loadPath:panel.URL.path];
}

- (BOOL)saveToCurrentPath {
  if (!self.currentPath) {
    return NO;
  }
  [self syncDocumentFromTextView];
  char *out = NULL;
  size_t len = 0;
  if (inkwell_document_to_markdown(_document, &out, &len) != INKWELL_OK) {
    return NO;
  }
  NSData *data = [NSData dataWithBytes:out length:len];
  BOOL ok = [data writeToFile:self.currentPath atomically:YES];
  inkwell_free_string(out);
  if (ok) {
    inkwell_document_mark_saved(_document);
  }
  return ok;
}

- (IBAction)saveDocument:(id)sender {
  (void)sender;
  if (![self saveToCurrentPath]) {
    [self saveDocumentAs:nil];
  }
}

- (IBAction)saveDocumentAs:(id)sender {
  (void)sender;
  NSSavePanel *panel = [NSSavePanel savePanel];
  panel.nameFieldStringValue = @"Untitled.md";
  if ([panel runModal] != NSModalResponseOK) {
    return;
  }
  self.currentPath = panel.URL.path;
  [self saveToCurrentPath];
}

- (void)applyFormat:(InkwellStatus (*)(InkwellDocument *, InkwellSelection))operation {
  NSRange selected = self.textView.selectedRange;
  [self syncDocumentFromTextView];
  if (operation(_document, (InkwellSelection){selected.location, selected.location + selected.length}) == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

- (IBAction)bold:(id)sender {
  (void)sender;
  [self applyFormat:inkwell_document_apply_bold];
}

- (IBAction)italic:(id)sender {
  (void)sender;
  [self applyFormat:inkwell_document_apply_italic];
}

- (IBAction)strikethrough:(id)sender {
  (void)sender;
  [self applyFormat:inkwell_document_apply_strikethrough];
}

- (IBAction)inlineCode:(id)sender {
  (void)sender;
  [self applyFormat:inkwell_document_apply_inline_code];
}

- (IBAction)headingOne:(id)sender {
  (void)sender;
  [self syncDocumentFromTextView];
  NSRange selected = self.textView.selectedRange;
  if (inkwell_document_apply_heading(_document, (InkwellSelection){selected.location, selected.location}, 1) == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

- (IBAction)insertTable:(id)sender {
  (void)sender;
  [self syncDocumentFromTextView];
  NSRange selected = self.textView.selectedRange;
  if (inkwell_document_insert_table(_document, (InkwellSelection){selected.location, selected.location + selected.length}, 2, 3) == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

- (IBAction)insertCodeBlock:(id)sender {
  (void)sender;
  [self syncDocumentFromTextView];
  NSRange selected = self.textView.selectedRange;
  if (inkwell_document_insert_code_block(_document, (InkwellSelection){selected.location, selected.location + selected.length}, "") == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

- (IBAction)insertHorizontalRule:(id)sender {
  (void)sender;
  [self syncDocumentFromTextView];
  NSRange selected = self.textView.selectedRange;
  if (inkwell_document_insert_horizontal_rule(_document, (InkwellSelection){selected.location, selected.location}) == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

- (IBAction)undoCore:(id)sender {
  (void)sender;
  if (inkwell_document_undo(_document) == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

- (IBAction)redoCore:(id)sender {
  (void)sender;
  if (inkwell_document_redo(_document) == INKWELL_OK) {
    [self syncTextViewFromDocument];
  }
}

@end

static void install_menu(InkwellAppDelegate *delegate) {
  NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@"Inkwell"];
  NSMenuItem *appItem = [[NSMenuItem alloc] initWithTitle:@"Inkwell" action:nil keyEquivalent:@""];
  NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"Inkwell"];
  [appMenu addItemWithTitle:@"Quit Inkwell" action:@selector(terminate:) keyEquivalent:@"q"];
  appItem.submenu = appMenu;
  [mainMenu addItem:appItem];

  NSMenuItem *fileItem = [[NSMenuItem alloc] initWithTitle:@"File" action:nil keyEquivalent:@""];
  NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
  [fileMenu addItemWithTitle:@"New" action:@selector(newDocument:) keyEquivalent:@"n"].target = delegate;
  [fileMenu addItemWithTitle:@"Open" action:@selector(openDocument:) keyEquivalent:@"o"].target = delegate;
  [fileMenu addItemWithTitle:@"Save" action:@selector(saveDocument:) keyEquivalent:@"s"].target = delegate;
  [fileMenu addItemWithTitle:@"Save As" action:@selector(saveDocumentAs:) keyEquivalent:@"S"].target = delegate;
  fileItem.submenu = fileMenu;
  [mainMenu addItem:fileItem];

  NSMenuItem *editItem = [[NSMenuItem alloc] initWithTitle:@"Edit" action:nil keyEquivalent:@""];
  NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  [editMenu addItemWithTitle:@"Undo" action:@selector(undoCore:) keyEquivalent:@"z"].target = delegate;
  [editMenu addItemWithTitle:@"Redo" action:@selector(redoCore:) keyEquivalent:@"Z"].target = delegate;
  editItem.submenu = editMenu;
  [mainMenu addItem:editItem];

  NSMenuItem *formatItem = [[NSMenuItem alloc] initWithTitle:@"Format" action:nil keyEquivalent:@""];
  NSMenu *formatMenu = [[NSMenu alloc] initWithTitle:@"Format"];
  [formatMenu addItemWithTitle:@"Heading 1" action:@selector(headingOne:) keyEquivalent:@"1"].target = delegate;
  [formatMenu addItemWithTitle:@"Bold" action:@selector(bold:) keyEquivalent:@"b"].target = delegate;
  [formatMenu addItemWithTitle:@"Italic" action:@selector(italic:) keyEquivalent:@"i"].target = delegate;
  [formatMenu addItemWithTitle:@"Strikethrough" action:@selector(strikethrough:) keyEquivalent:@""].target = delegate;
  [formatMenu addItemWithTitle:@"Inline Code" action:@selector(inlineCode:) keyEquivalent:@"`"].target = delegate;
  [formatMenu addItemWithTitle:@"Code Block" action:@selector(insertCodeBlock:) keyEquivalent:@""].target = delegate;
  [formatMenu addItemWithTitle:@"Table" action:@selector(insertTable:) keyEquivalent:@""].target = delegate;
  [formatMenu addItemWithTitle:@"Horizontal Rule" action:@selector(insertHorizontalRule:) keyEquivalent:@""].target = delegate;
  formatItem.submenu = formatMenu;
  [mainMenu addItem:formatItem];

  NSApp.mainMenu = mainMenu;
}

int main(int argc, const char *argv[]) {
  (void)argc;
  (void)argv;
  @autoreleasepool {
    NSApplication *app = [NSApplication sharedApplication];
    InkwellAppDelegate *delegate = [[InkwellAppDelegate alloc] init];
    install_menu(delegate);
    app.delegate = delegate;
    [app run];
  }
  return 0;
}
