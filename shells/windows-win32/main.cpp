#include "inkwell_core.h"

#include <windows.h>
#include <commdlg.h>
#include <shellapi.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

#define INKWELL_EDIT_ID 1001

struct WindowsShell {
  HWND window;
  HWND edit;
  InkwellDocument *doc;
  wchar_t current_path[MAX_PATH];
};

static WindowsShell g_shell;

static char *wide_to_utf8(const wchar_t *text) {
  int len = WideCharToMultiByte(CP_UTF8, 0, text, -1, NULL, 0, NULL, NULL);
  if (len <= 0) {
    return NULL;
  }
  char *out = (char *)malloc((size_t)len);
  if (!out) {
    return NULL;
  }
  WideCharToMultiByte(CP_UTF8, 0, text, -1, out, len, NULL, NULL);
  return out;
}

static wchar_t *utf8_to_wide(const char *text) {
  int len = MultiByteToWideChar(CP_UTF8, 0, text, -1, NULL, 0);
  if (len <= 0) {
    return NULL;
  }
  wchar_t *out = (wchar_t *)malloc((size_t)len * sizeof(wchar_t));
  if (!out) {
    return NULL;
  }
  MultiByteToWideChar(CP_UTF8, 0, text, -1, out, len);
  return out;
}

static void sync_doc_from_edit() {
  int len = GetWindowTextLengthW(g_shell.edit);
  wchar_t *wide = (wchar_t *)malloc(((size_t)len + 1) * sizeof(wchar_t));
  char *utf8;
  if (!wide) {
    return;
  }
  GetWindowTextW(g_shell.edit, wide, len + 1);
  utf8 = wide_to_utf8(wide);
  free(wide);
  if (!utf8) {
    return;
  }
  inkwell_document_load_markdown(g_shell.doc, utf8, strlen(utf8));
  free(utf8);
}

static void sync_edit_from_doc() {
  wchar_t *wide = utf8_to_wide(inkwell_document_text(g_shell.doc));
  if (!wide) {
    return;
  }
  SetWindowTextW(g_shell.edit, wide);
  free(wide);
}

static bool read_file_utf8(const wchar_t *path, char **out, size_t *out_len) {
  FILE *file = _wfopen(path, L"rb");
  long size;
  char *content;
  size_t read_count;
  if (!file) {
    return false;
  }
  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return false;
  }
  size = ftell(file);
  if (size < 0 || (unsigned long)size > INKWELL_MAX_DOCUMENT_BYTES) {
    fclose(file);
    return false;
  }
  rewind(file);
  content = (char *)malloc((size_t)size + 1);
  if (!content) {
    fclose(file);
    return false;
  }
  read_count = fread(content, 1, (size_t)size, file);
  fclose(file);
  if (read_count != (size_t)size) {
    free(content);
    return false;
  }
  content[size] = '\0';
  *out = content;
  *out_len = (size_t)size;
  return true;
}

static bool write_file_utf8(const wchar_t *path, const char *text, size_t len) {
  FILE *file = _wfopen(path, L"wb");
  if (!file) {
    return false;
  }
  if (fwrite(text, 1, len, file) != len) {
    fclose(file);
    return false;
  }
  return fclose(file) == 0;
}

static void open_file() {
  OPENFILENAMEW ofn;
  wchar_t path[MAX_PATH] = L"";
  ZeroMemory(&ofn, sizeof(ofn));
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = g_shell.window;
  ofn.lpstrFilter = L"Markdown\0*.md;*.markdown;*.mdown\0Text\0*.txt\0All\0*.*\0";
  ofn.lpstrFile = path;
  ofn.nMaxFile = MAX_PATH;
  ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST;
  if (GetOpenFileNameW(&ofn)) {
    char *content = NULL;
    size_t len = 0;
    if (read_file_utf8(path, &content, &len)) {
      inkwell_document_load_markdown(g_shell.doc, content, len);
      free(content);
      wcscpy_s(g_shell.current_path, MAX_PATH, path);
      sync_edit_from_doc();
      inkwell_document_mark_saved(g_shell.doc);
    }
  }
}

static void open_path(const wchar_t *path) {
  char *content = NULL;
  size_t len = 0;
  if (read_file_utf8(path, &content, &len)) {
    inkwell_document_load_markdown(g_shell.doc, content, len);
    free(content);
    wcscpy_s(g_shell.current_path, MAX_PATH, path);
    sync_edit_from_doc();
    inkwell_document_mark_saved(g_shell.doc);
  }
}

static bool save_current() {
  char *out = NULL;
  size_t len = 0;
  bool ok;
  if (g_shell.current_path[0] == L'\0') {
    return false;
  }
  sync_doc_from_edit();
  if (inkwell_document_to_markdown(g_shell.doc, &out, &len) != INKWELL_OK) {
    return false;
  }
  ok = write_file_utf8(g_shell.current_path, out, len);
  inkwell_free_string(out);
  if (ok) {
    inkwell_document_mark_saved(g_shell.doc);
  }
  return ok;
}

static void save_as() {
  OPENFILENAMEW ofn;
  wchar_t path[MAX_PATH] = L"Untitled.md";
  ZeroMemory(&ofn, sizeof(ofn));
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = g_shell.window;
  ofn.lpstrFilter = L"Markdown\0*.md;*.markdown;*.mdown\0Text\0*.txt\0All\0*.*\0";
  ofn.lpstrFile = path;
  ofn.nMaxFile = MAX_PATH;
  ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST;
  if (GetSaveFileNameW(&ofn)) {
    wcscpy_s(g_shell.current_path, MAX_PATH, path);
    save_current();
  }
}

static void apply_format(InkwellStatus (*operation)(InkwellDocument *, InkwellSelection)) {
  DWORD start = 0;
  DWORD end = 0;
  sync_doc_from_edit();
  SendMessageW(g_shell.edit, EM_GETSEL, (WPARAM)&start, (LPARAM)&end);
  if (operation(g_shell.doc, (InkwellSelection){start, end}) == INKWELL_OK) {
    sync_edit_from_doc();
  }
}

static LRESULT CALLBACK window_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
  switch (message) {
    case WM_CREATE:
      g_shell.edit = CreateWindowExW(
          WS_EX_CLIENTEDGE,
          L"EDIT",
          L"",
          WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_LEFT | ES_MULTILINE | ES_AUTOVSCROLL | ES_WANTRETURN,
          0,
          0,
          100,
          100,
          hwnd,
          (HMENU)INKWELL_EDIT_ID,
          GetModuleHandleW(NULL),
          NULL);
      return 0;
    case WM_SIZE:
      MoveWindow(g_shell.edit, 0, 0, LOWORD(lparam), HIWORD(lparam), TRUE);
      return 0;
    case WM_COMMAND:
      switch (LOWORD(wparam)) {
        case 1:
          inkwell_document_load_markdown(g_shell.doc, "", 0);
          g_shell.current_path[0] = L'\0';
          sync_edit_from_doc();
          return 0;
        case 2:
          open_file();
          return 0;
        case 3:
          if (!save_current()) {
            save_as();
          }
          return 0;
        case 4:
          save_as();
          return 0;
        case 5:
          apply_format(inkwell_document_apply_bold);
          return 0;
        case 6:
          apply_format(inkwell_document_apply_italic);
          return 0;
      }
      break;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, message, wparam, lparam);
}

static HMENU make_menu() {
  HMENU menu = CreateMenu();
  HMENU file = CreateMenu();
  HMENU format = CreateMenu();
  AppendMenuW(file, MF_STRING, 1, L"New");
  AppendMenuW(file, MF_STRING, 2, L"Open");
  AppendMenuW(file, MF_STRING, 3, L"Save");
  AppendMenuW(file, MF_STRING, 4, L"Save As");
  AppendMenuW(format, MF_STRING, 5, L"Bold");
  AppendMenuW(format, MF_STRING, 6, L"Italic");
  AppendMenuW(menu, MF_POPUP, (UINT_PTR)file, L"File");
  AppendMenuW(menu, MF_POPUP, (UINT_PTR)format, L"Format");
  return menu;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE prev, PWSTR cmd, int show) {
  WNDCLASSW wc;
  MSG msg;
  int argc = 0;
  wchar_t **argv = NULL;
  (void)prev;
  (void)cmd;

  g_shell.doc = inkwell_document_new();
  if (!g_shell.doc) {
    return 1;
  }

  ZeroMemory(&wc, sizeof(wc));
  wc.lpfnWndProc = window_proc;
  wc.hInstance = instance;
  wc.lpszClassName = L"InkwellNativeWindow";
  wc.hCursor = LoadCursor(NULL, IDC_IBEAM);
  RegisterClassW(&wc);

  g_shell.window = CreateWindowExW(
      0,
      wc.lpszClassName,
      L"Inkwell Native",
      WS_OVERLAPPEDWINDOW,
      CW_USEDEFAULT,
      CW_USEDEFAULT,
      1000,
      760,
      NULL,
      make_menu(),
      instance,
      NULL);
  ShowWindow(g_shell.window, show);

  argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  if (argv && argc > 1 && argv[1][0] != L'-') {
    open_path(argv[1]);
  }
  if (argv) {
    LocalFree(argv);
  }

  while (GetMessageW(&msg, NULL, 0, 0)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }

  inkwell_document_free(g_shell.doc);
  return 0;
}
