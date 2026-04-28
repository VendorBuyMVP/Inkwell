#include "inkwell_core.h"

#include <ctype.h>
#include <gtk/gtk.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PX_PER_INCH 96.0
#define MIN_ZOOM 60.0
#define MAX_ZOOM 180.0
#define ZOOM_STEP 10.0
#define MIN_MARGIN_IN 0.25
#define MIN_CONTENT_IN 3.0

typedef enum TableAction {
  TABLE_INSERT_ROW_ABOVE = 1,
  TABLE_INSERT_ROW_BELOW,
  TABLE_DELETE_ROW,
  TABLE_INSERT_COLUMN_LEFT,
  TABLE_INSERT_COLUMN_RIGHT,
  TABLE_DELETE_COLUMN,
  TABLE_ALIGN_LEFT,
  TABLE_ALIGN_CENTER,
  TABLE_ALIGN_RIGHT,
  TABLE_ALIGN_DEFAULT,
  TABLE_NORMALIZE,
  TABLE_DELETE
} TableAction;

typedef enum ShortcutCommand {
  SHORTCUT_NEW = 0,
  SHORTCUT_OPEN,
  SHORTCUT_SAVE,
  SHORTCUT_SAVE_AS,
  SHORTCUT_QUIT,
  SHORTCUT_UNDO,
  SHORTCUT_REDO,
  SHORTCUT_SELECT_ALL,
  SHORTCUT_ZOOM_IN,
  SHORTCUT_ZOOM_OUT,
  SHORTCUT_RESET_ZOOM,
  SHORTCUT_FIT_WIDTH,
  SHORTCUT_BOLD,
  SHORTCUT_ITALIC,
  SHORTCUT_STRIKE,
  SHORTCUT_INLINE_CODE,
  SHORTCUT_PARAGRAPH,
  SHORTCUT_H1,
  SHORTCUT_H2,
  SHORTCUT_H3,
  SHORTCUT_BLOCKQUOTE,
  SHORTCUT_BULLET_LIST,
  SHORTCUT_NUMBERED_LIST,
  SHORTCUT_TASK_LIST,
  SHORTCUT_CODE_BLOCK,
  SHORTCUT_TABLE,
  SHORTCUT_HORIZONTAL_RULE,
  SHORTCUT_KEYBOARD_SHORTCUTS,
  SHORTCUT_COUNT
} ShortcutCommand;

typedef struct ShortcutBinding {
  ShortcutCommand command;
  const char *name;
  guint keyval;
  GdkModifierType modifiers;
  guint default_keyval;
  GdkModifierType default_modifiers;
  GtkWidget *menu_shortcut_label;
} ShortcutBinding;

typedef struct LinuxShell {
  GtkApplication *app;
  GtkWidget *window;
  GtkWidget *root;
  GtkWidget *menu_bar;
  GtkWidget *ruler;
  GtkWidget *scroller;
  GtkWidget *page_frame;
  GtkWidget *text_view;
  GtkWidget *status;
  GtkWidget *zoom_label;
  GtkWidget *selection_popover;
  GtkWidget *table_menu;
  GtkCssProvider *css_provider;
  GtkWidget *active_menu_owner;
  InkwellDocument *doc;
  char *current_path;
  const char *initial_path;
  double zoom;
  double page_width_in;
  double page_height_in;
  double margin_left_in;
  double margin_right_in;
  int ruler_visible;
  int light_theme;
  int dragging_margin;
  int table_dragging;
  int table_drag_has_selection;
  InkwellTableCell table_drag_anchor;
  InkwellTableCell table_drag_focus;
  size_t table_line_index;
  size_t table_column_index;
  int syncing_buffer;
  ShortcutBinding shortcuts[SHORTCUT_COUNT];
} LinuxShell;

static char *shell_strdup(const char *text) {
  size_t len;
  char *copy;
  if (!text) {
    return NULL;
  }
  len = strlen(text);
  copy = (char *)malloc(len + 1);
  if (!copy) {
    return NULL;
  }
  memcpy(copy, text, len + 1);
  return copy;
}

static double clamp_double(double value, double min, double max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

static void add_class(GtkWidget *widget, const char *class_name) {
  gtk_style_context_add_class(gtk_widget_get_style_context(widget), class_name);
}

static void shell_set_status(LinuxShell *shell, const char *message) {
  gtk_label_set_text(GTK_LABEL(shell->status), message ? message : "Ready");
}

static void free_current_path(LinuxShell *shell) {
  free(shell->current_path);
  shell->current_path = NULL;
}

static char *buffer_text(GtkTextBuffer *buffer) {
  GtkTextIter start;
  GtkTextIter end;
  gtk_text_buffer_get_bounds(buffer, &start, &end);
  return gtk_text_buffer_get_text(buffer, &start, &end, FALSE);
}

static void apply_markdown_tags(LinuxShell *shell);
static void clear_table_selection(LinuxShell *shell);
static void render_table_cell_selection(LinuxShell *shell);
static void refresh_table_focus_highlight(LinuxShell *shell);
static void update_selection_popover(LinuxShell *shell);
static void update_layout(LinuxShell *shell);

static void sync_doc_from_buffer(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  char *text = buffer_text(buffer);
  if (inkwell_document_load_markdown(shell->doc, text, strlen(text)) != INKWELL_OK) {
    shell_set_status(shell, "Document is too large");
  }
  g_free(text);
}

static void sync_buffer_from_doc(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  shell->syncing_buffer = 1;
  gtk_text_buffer_set_text(buffer, inkwell_document_text(shell->doc), -1);
  shell->syncing_buffer = 0;
  apply_markdown_tags(shell);
  update_selection_popover(shell);
}

static int read_file(const char *path, char **out, size_t *out_len) {
  FILE *file;
  long size;
  char *content;
  size_t read_count;

  file = fopen(path, "rb");
  if (!file) {
    return 0;
  }
  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return 0;
  }
  size = ftell(file);
  if (size < 0 || (unsigned long)size > INKWELL_MAX_DOCUMENT_BYTES) {
    fclose(file);
    return 0;
  }
  rewind(file);
  content = (char *)malloc((size_t)size + 1);
  if (!content) {
    fclose(file);
    return 0;
  }
  read_count = fread(content, 1, (size_t)size, file);
  fclose(file);
  if (read_count != (size_t)size) {
    free(content);
    return 0;
  }
  content[size] = '\0';
  *out = content;
  *out_len = (size_t)size;
  return 1;
}

static int write_file(const char *path, const char *text, size_t len) {
  FILE *file = fopen(path, "wb");
  if (!file) {
    return 0;
  }
  if (fwrite(text, 1, len, file) != len) {
    fclose(file);
    return 0;
  }
  return fclose(file) == 0;
}

static void open_path(LinuxShell *shell, const char *path) {
  char *content = NULL;
  size_t len = 0;
  if (!read_file(path, &content, &len)) {
    shell_set_status(shell, "Could not open file");
    return;
  }
  inkwell_document_load_markdown(shell->doc, content, len);
  sync_buffer_from_doc(shell);
  free(content);
  free_current_path(shell);
  shell->current_path = shell_strdup(path);
  inkwell_document_mark_saved(shell->doc);
  shell_set_status(shell, "Opened file");
}

static void apply_tag_offsets(GtkTextBuffer *buffer, const char *tag, int start_offset, int end_offset) {
  GtkTextIter start;
  GtkTextIter end;
  if (end_offset <= start_offset) {
    return;
  }
  gtk_text_buffer_get_iter_at_offset(buffer, &start, start_offset);
  gtk_text_buffer_get_iter_at_offset(buffer, &end, end_offset);
  gtk_text_buffer_apply_tag_by_name(buffer, tag, &start, &end);
}

static int starts_with_heading(const char *line, int *level, int *content_offset) {
  int i = 0;
  while (line[i] == ' ' && i < 4) {
    i += 1;
  }
  if (line[i] != '#') {
    return 0;
  }
  *level = 0;
  while (line[i] == '#' && *level < 6) {
    *level += 1;
    i += 1;
  }
  if (*level == 0 || line[i] != ' ') {
    return 0;
  }
  *content_offset = i + 1;
  return 1;
}

static void apply_inline_pair(GtkTextBuffer *buffer, const char *line, int line_start, const char *marker, const char *tag) {
  size_t marker_len = strlen(marker);
  const char *cursor = line;
  while ((cursor = strstr(cursor, marker)) != NULL) {
    const char *close = strstr(cursor + marker_len, marker);
    if (!close) {
      return;
    }
    apply_tag_offsets(
        buffer,
        tag,
        line_start + (int)(cursor - line),
        line_start + (int)(close - line) + (int)marker_len);
    cursor = close + marker_len;
  }
}

static void apply_emphasis(GtkTextBuffer *buffer, const char *line, int line_start) {
  const char *cursor = line;
  while ((cursor = strchr(cursor, '*')) != NULL) {
    const char *close;
    if (cursor[1] == '*') {
      cursor += 2;
      continue;
    }
    close = strchr(cursor + 1, '*');
    while (close && close[1] == '*') {
      close = strchr(close + 2, '*');
    }
    if (!close) {
      return;
    }
    apply_tag_offsets(buffer, "italic", line_start + (int)(cursor - line), line_start + (int)(close - line) + 1);
    cursor = close + 1;
  }
}

static void apply_markdown_tags(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start_iter;
  GtkTextIter end_iter;
  char *text;
  size_t len;
  size_t line_start = 0;
  int in_code_block = 0;

  gtk_text_buffer_get_bounds(buffer, &start_iter, &end_iter);
  gtk_text_buffer_remove_all_tags(buffer, &start_iter, &end_iter);

  text = gtk_text_buffer_get_text(buffer, &start_iter, &end_iter, FALSE);
  len = strlen(text);

  while (line_start <= len) {
    size_t line_end = line_start;
    char *line;
    int level = 0;
    int content_offset = 0;
    while (line_end < len && text[line_end] != '\n') {
      line_end += 1;
    }
    line = g_strndup(text + line_start, line_end - line_start);

    if (strncmp(line, "```", 3) == 0) {
      apply_tag_offsets(buffer, "code-block", (int)line_start, (int)line_end);
      in_code_block = !in_code_block;
    } else if (in_code_block) {
      apply_tag_offsets(buffer, "code-block", (int)line_start, (int)line_end);
    } else if (starts_with_heading(line, &level, &content_offset)) {
      const char *tag = level == 1 ? "heading1" : level == 2 ? "heading2" : "heading3";
      apply_tag_offsets(buffer, tag, (int)line_start, (int)line_end);
    } else {
      char *trimmed = line;
      while (*trimmed == ' ') {
        trimmed += 1;
      }
      if (strncmp(trimmed, "> ", 2) == 0) {
        apply_tag_offsets(buffer, "quote", (int)line_start, (int)line_end);
      } else if (strchr(line, '|')) {
        apply_tag_offsets(buffer, "table", (int)line_start, (int)line_end);
      }
      apply_inline_pair(buffer, line, (int)line_start, "**", "bold");
      apply_inline_pair(buffer, line, (int)line_start, "~~", "strike");
      apply_inline_pair(buffer, line, (int)line_start, "`", "inline-code");
      apply_emphasis(buffer, line, (int)line_start);
    }

    g_free(line);
    if (line_end == len) {
      break;
    }
    line_start = line_end + 1;
  }

  g_free(text);
}

static void create_markdown_tags(GtkTextBuffer *buffer) {
  gtk_text_buffer_create_tag(buffer, "heading1", "weight", PANGO_WEIGHT_BOLD, "scale", 1.75, "foreground", "#f8f1df", NULL);
  gtk_text_buffer_create_tag(buffer, "heading2", "weight", PANGO_WEIGHT_BOLD, "scale", 1.45, "foreground", "#f8f1df", NULL);
  gtk_text_buffer_create_tag(buffer, "heading3", "weight", PANGO_WEIGHT_BOLD, "scale", 1.25, "foreground", "#f8f1df", NULL);
  gtk_text_buffer_create_tag(buffer, "bold", "weight", PANGO_WEIGHT_BOLD, NULL);
  gtk_text_buffer_create_tag(buffer, "italic", "style", PANGO_STYLE_ITALIC, NULL);
  gtk_text_buffer_create_tag(buffer, "strike", "strikethrough", TRUE, NULL);
  gtk_text_buffer_create_tag(buffer, "inline-code", "family", "monospace", "background", "#31382f", "foreground", "#f3d58a", NULL);
  gtk_text_buffer_create_tag(buffer, "code-block", "family", "monospace", "background", "#151a16", "foreground", "#f3d58a", NULL);
  gtk_text_buffer_create_tag(buffer, "quote", "foreground", "#b9c9b8", "style", PANGO_STYLE_ITALIC, NULL);
  gtk_text_buffer_create_tag(buffer, "table", "family", "monospace", "foreground", "#d9e2d6", NULL);
  gtk_text_buffer_create_tag(buffer, "table-active-column", "background", "#3b3421", "foreground", "#fff5d6", NULL);
  gtk_text_buffer_create_tag(buffer, "table-cell-selection", "background", "#6a5525", "foreground", "#fff7dc", NULL);
}

static void on_buffer_changed(GtkTextBuffer *buffer, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)buffer;
  if (!shell->syncing_buffer) {
    clear_table_selection(shell);
    apply_markdown_tags(shell);
  }
}

static gboolean on_text_key_release(GtkWidget *widget, GdkEventKey *event, gpointer user_data) {
  (void)widget;
  (void)event;
  update_selection_popover((LinuxShell *)user_data);
  refresh_table_focus_highlight((LinuxShell *)user_data);
  return FALSE;
}

static gboolean on_text_button_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  if (event->button == 1 && shell->table_dragging) {
    shell->table_dragging = 0;
    render_table_cell_selection(shell);
    shell_set_status(shell, "Table cells selected");
    return TRUE;
  }
  update_selection_popover(shell);
  refresh_table_focus_highlight(shell);
  return FALSE;
}

static void on_mark_set(GtkTextBuffer *buffer, GtkTextIter *location, GtkTextMark *mark, gpointer user_data) {
  (void)buffer;
  (void)location;
  (void)mark;
  update_selection_popover((LinuxShell *)user_data);
  refresh_table_focus_highlight((LinuxShell *)user_data);
}

static InkwellSelection current_selection_or_cursor(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start;
  GtkTextIter end;
  InkwellSelection selection;
  if (gtk_text_buffer_get_selection_bounds(buffer, &start, &end)) {
    selection.start = (size_t)gtk_text_iter_get_offset(&start);
    selection.end = (size_t)gtk_text_iter_get_offset(&end);
    return selection;
  }
  gtk_text_buffer_get_iter_at_mark(buffer, &start, gtk_text_buffer_get_insert(buffer));
  selection.start = (size_t)gtk_text_iter_get_offset(&start);
  selection.end = selection.start;
  return selection;
}

static void select_all_text(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start;
  GtkTextIter end;
  gtk_text_buffer_get_bounds(buffer, &start, &end);
  gtk_text_buffer_select_range(buffer, &start, &end);
}

static void apply_selection_format(LinuxShell *shell, InkwellStatus (*operation)(InkwellDocument *, InkwellSelection), const char *label) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start;
  GtkTextIter end;
  InkwellSelection selection;

  sync_doc_from_buffer(shell);
  if (!gtk_text_buffer_get_selection_bounds(buffer, &start, &end)) {
    shell_set_status(shell, "Select text first");
    return;
  }
  selection.start = (size_t)gtk_text_iter_get_offset(&start);
  selection.end = (size_t)gtk_text_iter_get_offset(&end);
  if (operation(shell->doc, selection) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, label);
  }
}

static void apply_heading_level(LinuxShell *shell, int level, const char *label) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter cursor;
  GtkTextIter selection_end;
  int offset;
  sync_doc_from_buffer(shell);
  if (gtk_text_buffer_get_selection_bounds(buffer, &cursor, &selection_end)) {
    offset = gtk_text_iter_get_offset(&cursor);
  } else {
    gtk_text_buffer_get_iter_at_mark(buffer, &cursor, gtk_text_buffer_get_insert(buffer));
    offset = gtk_text_iter_get_offset(&cursor);
  }
  if (inkwell_document_apply_heading(shell->doc, (InkwellSelection){(size_t)offset, (size_t)offset}, level) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, label);
  }
}

static const char *line_without_common_prefix(const char *line) {
  const char *cursor = line;
  while (*cursor == ' ' && cursor - line < 4) {
    cursor += 1;
  }
  while (*cursor == '#') {
    cursor += 1;
  }
  if (cursor > line && *cursor == ' ') {
    return cursor + 1;
  }
  if (cursor[0] == '>' && cursor[1] == ' ') {
    return cursor + 2;
  }
  if (cursor[0] == '-' && cursor[1] == ' ' && cursor[2] == '[' && cursor[4] == ']' && cursor[5] == ' ') {
    return cursor + 6;
  }
  if ((cursor[0] == '-' || cursor[0] == '*' || cursor[0] == '+') && cursor[1] == ' ') {
    return cursor + 2;
  }
  if (isdigit((unsigned char)cursor[0])) {
    const char *number = cursor;
    while (isdigit((unsigned char)*number)) {
      number += 1;
    }
    if ((*number == '.' || *number == ')') && number[1] == ' ') {
      return number + 2;
    }
  }
  return line;
}

static void apply_line_prefix(LinuxShell *shell, const char *prefix, const char *label) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter cursor;
  GtkTextIter start;
  GtkTextIter end;
  char *line;
  char *replacement;
  const char *content;

  gtk_text_buffer_get_iter_at_mark(buffer, &cursor, gtk_text_buffer_get_insert(buffer));
  start = cursor;
  end = cursor;
  gtk_text_iter_set_line_offset(&start, 0);
  if (!gtk_text_iter_ends_line(&end)) {
    gtk_text_iter_forward_to_line_end(&end);
  }
  line = gtk_text_buffer_get_text(buffer, &start, &end, FALSE);
  content = line_without_common_prefix(line);
  replacement = g_strconcat(prefix, content, NULL);
  gtk_text_buffer_delete(buffer, &start, &end);
  gtk_text_buffer_insert(buffer, &start, replacement, -1);
  g_free(replacement);
  g_free(line);
  shell_set_status(shell, label);
}

static void on_new(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  inkwell_document_load_markdown(shell->doc, "", 0);
  sync_buffer_from_doc(shell);
  free_current_path(shell);
  shell_set_status(shell, "New document");
}

static void on_open(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkFileChooserNative *dialog;
  (void)widget;

  dialog = gtk_file_chooser_native_new(
      "Open Markdown",
      GTK_WINDOW(shell->window),
      GTK_FILE_CHOOSER_ACTION_OPEN,
      "_Open",
      "_Cancel");

  if (gtk_native_dialog_run(GTK_NATIVE_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
    char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
    open_path(shell, filename);
    g_free(filename);
  }
  gtk_native_dialog_destroy(GTK_NATIVE_DIALOG(dialog));
  g_object_unref(dialog);
}

static int save_to_current_path(LinuxShell *shell) {
  char *out = NULL;
  size_t len = 0;
  int ok;
  sync_doc_from_buffer(shell);
  if (!shell->current_path) {
    return 0;
  }
  if (inkwell_document_to_markdown(shell->doc, &out, &len) != INKWELL_OK) {
    return 0;
  }
  ok = write_file(shell->current_path, out, len);
  inkwell_free_string(out);
  if (ok) {
    inkwell_document_mark_saved(shell->doc);
    shell_set_status(shell, "Saved");
  } else {
    shell_set_status(shell, "Could not save file");
  }
  return ok;
}

static void on_save_as(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkFileChooserNative *dialog;
  (void)widget;

  dialog = gtk_file_chooser_native_new(
      "Save Markdown",
      GTK_WINDOW(shell->window),
      GTK_FILE_CHOOSER_ACTION_SAVE,
      "_Save",
      "_Cancel");
  gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
  gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), "Untitled.md");

  if (gtk_native_dialog_run(GTK_NATIVE_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
    char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
    free_current_path(shell);
    shell->current_path = shell_strdup(filename);
    save_to_current_path(shell);
    g_free(filename);
  }
  gtk_native_dialog_destroy(GTK_NATIVE_DIALOG(dialog));
  g_object_unref(dialog);
}

static void on_save(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  if (!save_to_current_path(shell)) {
    on_save_as(widget, user_data);
  }
}

static void on_quit(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  g_application_quit(G_APPLICATION(shell->app));
}

static void on_undo(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  sync_doc_from_buffer(shell);
  if (inkwell_document_undo(shell->doc) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, "Undo");
  }
}

static void on_redo(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  sync_doc_from_buffer(shell);
  if (inkwell_document_redo(shell->doc) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, "Redo");
  }
}

static void on_select_all(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  select_all_text((LinuxShell *)user_data);
}

static void on_bold(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_selection_format((LinuxShell *)user_data, inkwell_document_apply_bold, "Bold");
}

static void on_italic(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_selection_format((LinuxShell *)user_data, inkwell_document_apply_italic, "Italic");
}

static void on_strike(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_selection_format((LinuxShell *)user_data, inkwell_document_apply_strikethrough, "Strikethrough");
}

static void on_inline_code(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_selection_format((LinuxShell *)user_data, inkwell_document_apply_inline_code, "Inline code");
}

static void on_h1(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_heading_level((LinuxShell *)user_data, 1, "Heading 1");
}

static void on_h2(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_heading_level((LinuxShell *)user_data, 2, "Heading 2");
}

static void on_h3(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_heading_level((LinuxShell *)user_data, 3, "Heading 3");
}

static void on_paragraph(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter cursor;
  int offset;
  (void)widget;
  sync_doc_from_buffer(shell);
  gtk_text_buffer_get_iter_at_mark(buffer, &cursor, gtk_text_buffer_get_insert(buffer));
  offset = gtk_text_iter_get_offset(&cursor);
  if (inkwell_document_apply_paragraph(shell->doc, (InkwellSelection){(size_t)offset, (size_t)offset}) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, "Paragraph");
  } else {
    apply_line_prefix(shell, "", "Paragraph");
  }
}

static void on_blockquote(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_line_prefix((LinuxShell *)user_data, "> ", "Block quote");
}

static void on_bullet_list(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_line_prefix((LinuxShell *)user_data, "- ", "Bulleted list");
}

static void on_numbered_list(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_line_prefix((LinuxShell *)user_data, "1. ", "Numbered list");
}

static void on_task_list(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  apply_line_prefix((LinuxShell *)user_data, "- [ ] ", "Task list");
}

static void on_code_block(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  sync_doc_from_buffer(shell);
  if (inkwell_document_insert_code_block(shell->doc, current_selection_or_cursor(shell), "") == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, "Code block");
  }
}

static void on_table(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  sync_doc_from_buffer(shell);
  if (inkwell_document_insert_table(shell->doc, current_selection_or_cursor(shell), 2, 3) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, "Table");
  }
}

static void on_hr(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  sync_doc_from_buffer(shell);
  if (inkwell_document_insert_horizontal_rule(shell->doc, current_selection_or_cursor(shell)) == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    shell_set_status(shell, "Horizontal rule");
  }
}

static void set_zoom(LinuxShell *shell, double zoom) {
  shell->zoom = clamp_double(zoom, MIN_ZOOM, MAX_ZOOM);
  update_layout(shell);
}

static void on_zoom_in(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  set_zoom((LinuxShell *)user_data, ((LinuxShell *)user_data)->zoom + ZOOM_STEP);
}

static void on_zoom_out(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  set_zoom((LinuxShell *)user_data, ((LinuxShell *)user_data)->zoom - ZOOM_STEP);
}

static void on_reset_zoom(GtkWidget *widget, gpointer user_data) {
  (void)widget;
  set_zoom((LinuxShell *)user_data, 100.0);
}

static void on_fit_width(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkAllocation allocation;
  double available;
  (void)widget;
  gtk_widget_get_allocation(shell->scroller, &allocation);
  available = allocation.width > 80 ? allocation.width - 80 : allocation.width;
  set_zoom(shell, (available / (shell->page_width_in * PX_PER_INCH)) * 100.0);
}

static void on_toggle_ruler(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  shell->ruler_visible = !shell->ruler_visible;
  update_layout(shell);
}

static void apply_theme_css(LinuxShell *shell) {
  char css[4096];
  int font_px = (int)(16.0 * shell->zoom / 100.0);
  if (font_px < 10) {
    font_px = 10;
  }

  snprintf(
      css,
      sizeof(css),
      shell->light_theme
          ? "window, .root { background: #ece8de; color: #1c211b; }"
            ".menu-bar { background: #fffdf7; border-bottom: 1px solid #c9c2b6; min-height: 28px; }"
            ".menu-title { color: #1c211b; background: transparent; border: 0; border-radius: 0; padding: 3px 10px; }"
            ".menu-title:hover { background: #e7eddf; }"
            ".status { color: #4c5849; padding: 4px 8px; }"
            ".page-frame { background: #fffdf7; border: 1px solid #c9c2b6; }"
            "textview, textview text { background: #fffdf7; color: #1c211b; font-family: serif; font-size: %dpx; }"
            "textview text selection { background: #c9a75b; color: #111411; }"
            ".ruler { background: #f6f2e8; color: #4d594a; }"
            ".popover-box { background: #fffdf7; border: 1px solid #c9c2b6; }"
            ".tool-button { color: #1c211b; background: transparent; border: 0; padding: 4px 7px; }"
            ".tool-button:hover { background: #e7eddf; }"
          : "window, .root { background: #101411; color: #f4efe2; }"
            ".menu-bar { background: #141a15; border-bottom: 1px solid #283126; min-height: 28px; }"
            ".menu-title { color: #f4efe2; background: transparent; border: 0; border-radius: 0; padding: 3px 10px; }"
            ".menu-title:hover { background: #263027; }"
            ".status { color: #b8c4b4; padding: 4px 8px; }"
            ".page-frame { background: #20251f; border: 1px solid #3a4438; }"
            "textview, textview text { background: #20251f; color: #f4efe2; font-family: serif; font-size: %dpx; }"
            "textview text selection { background: #6f5b2e; color: #ffffff; }"
            ".ruler { background: #171d18; color: #bac7b8; }"
            ".popover-box { background: #141a15; border: 1px solid #384334; }"
            ".tool-button { color: #f4efe2; background: transparent; border: 0; padding: 4px 7px; }"
            ".tool-button:hover { background: #263027; }",
      font_px);

  gtk_css_provider_load_from_data(shell->css_provider, css, -1, NULL);
  apply_markdown_tags(shell);
  if (shell->table_drag_has_selection) {
    render_table_cell_selection(shell);
  }
}

static void on_theme_dark(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  shell->light_theme = 0;
  apply_theme_css(shell);
  shell_set_status(shell, "Dark theme");
}

static void on_theme_light(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  shell->light_theme = 1;
  apply_theme_css(shell);
  shell_set_status(shell, "Light theme");
}

static void on_letter_page(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  shell->page_width_in = 8.5;
  shell->page_height_in = 11.0;
  update_layout(shell);
  shell_set_status(shell, "Letter page");
}

static void on_a4_page(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  shell->page_width_in = 8.27;
  shell->page_height_in = 11.69;
  update_layout(shell);
  shell_set_status(shell, "A4 page");
}

static void on_reset_margins(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  shell->margin_left_in = 1.0;
  shell->margin_right_in = 1.0;
  update_layout(shell);
  shell_set_status(shell, "Margins reset");
}

static void apply_table_action(LinuxShell *shell, TableAction action) {
  InkwellStatus status = INKWELL_ERR_INVALID_ARGUMENT;
  sync_doc_from_buffer(shell);
  switch (action) {
    case TABLE_INSERT_ROW_ABOVE:
      status = inkwell_document_insert_table_row(shell->doc, shell->table_line_index, 0);
      break;
    case TABLE_INSERT_ROW_BELOW:
      status = inkwell_document_insert_table_row(shell->doc, shell->table_line_index, 1);
      break;
    case TABLE_DELETE_ROW:
      status = inkwell_document_delete_table_row(shell->doc, shell->table_line_index);
      break;
    case TABLE_INSERT_COLUMN_LEFT:
      status = inkwell_document_insert_table_column(shell->doc, shell->table_line_index, shell->table_column_index, 0);
      break;
    case TABLE_INSERT_COLUMN_RIGHT:
      status = inkwell_document_insert_table_column(shell->doc, shell->table_line_index, shell->table_column_index, 1);
      break;
    case TABLE_DELETE_COLUMN:
      status = inkwell_document_delete_table_column(shell->doc, shell->table_line_index, shell->table_column_index);
      break;
    case TABLE_ALIGN_LEFT:
      status = inkwell_document_set_table_column_alignment(shell->doc, shell->table_line_index, shell->table_column_index, INKWELL_ALIGN_LEFT);
      break;
    case TABLE_ALIGN_CENTER:
      status = inkwell_document_set_table_column_alignment(shell->doc, shell->table_line_index, shell->table_column_index, INKWELL_ALIGN_CENTER);
      break;
    case TABLE_ALIGN_RIGHT:
      status = inkwell_document_set_table_column_alignment(shell->doc, shell->table_line_index, shell->table_column_index, INKWELL_ALIGN_RIGHT);
      break;
    case TABLE_ALIGN_DEFAULT:
      status = inkwell_document_set_table_column_alignment(shell->doc, shell->table_line_index, shell->table_column_index, INKWELL_ALIGN_NONE);
      break;
    case TABLE_NORMALIZE:
      status = inkwell_document_normalize_table(shell->doc, shell->table_line_index);
      break;
    case TABLE_DELETE:
      status = inkwell_document_delete_table(shell->doc, shell->table_line_index);
      break;
  }
  if (status == INKWELL_OK) {
    sync_buffer_from_doc(shell);
    refresh_table_focus_highlight(shell);
    shell_set_status(shell, "Table updated");
  } else {
    shell_set_status(shell, "Table action unavailable here");
  }
}

static void on_table_menu_item(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  TableAction action = (TableAction)GPOINTER_TO_INT(g_object_get_data(G_OBJECT(widget), "table-action"));
  apply_table_action(shell, action);
}

static ShortcutBinding *shortcut_for_command(LinuxShell *shell, ShortcutCommand command) {
  if (!shell || command < 0 || command >= SHORTCUT_COUNT) {
    return NULL;
  }
  return &shell->shortcuts[command];
}

static void set_shortcut(
    LinuxShell *shell,
    ShortcutCommand command,
    const char *name,
    guint keyval,
    GdkModifierType modifiers) {
  ShortcutBinding *binding = shortcut_for_command(shell, command);
  if (!binding) {
    return;
  }
  binding->command = command;
  binding->name = name;
  binding->keyval = keyval;
  binding->modifiers = modifiers;
  binding->default_keyval = keyval;
  binding->default_modifiers = modifiers;
}

static void set_default_shortcuts(LinuxShell *shell) {
  set_shortcut(shell, SHORTCUT_NEW, "New", GDK_KEY_n, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_OPEN, "Open", GDK_KEY_o, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_SAVE, "Save", GDK_KEY_s, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_SAVE_AS, "Save As", GDK_KEY_s, GDK_CONTROL_MASK | GDK_SHIFT_MASK);
  set_shortcut(shell, SHORTCUT_QUIT, "Quit", GDK_KEY_q, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_UNDO, "Undo", GDK_KEY_z, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_REDO, "Redo", GDK_KEY_z, GDK_CONTROL_MASK | GDK_SHIFT_MASK);
  set_shortcut(shell, SHORTCUT_SELECT_ALL, "Select All", GDK_KEY_a, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_ZOOM_IN, "Zoom In", GDK_KEY_equal, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_ZOOM_OUT, "Zoom Out", GDK_KEY_minus, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_RESET_ZOOM, "Reset Zoom", GDK_KEY_0, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_FIT_WIDTH, "Fit Width", GDK_KEY_w, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_BOLD, "Bold", GDK_KEY_b, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_ITALIC, "Italic", GDK_KEY_i, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_STRIKE, "Strikethrough", GDK_KEY_x, GDK_CONTROL_MASK | GDK_SHIFT_MASK);
  set_shortcut(shell, SHORTCUT_INLINE_CODE, "Inline Code", GDK_KEY_grave, GDK_CONTROL_MASK);
  set_shortcut(shell, SHORTCUT_PARAGRAPH, "Paragraph", GDK_KEY_p, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_H1, "Heading 1", GDK_KEY_1, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_H2, "Heading 2", GDK_KEY_2, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_H3, "Heading 3", GDK_KEY_3, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_BLOCKQUOTE, "Block Quote", GDK_KEY_q, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_BULLET_LIST, "Bulleted List", GDK_KEY_b, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_NUMBERED_LIST, "Numbered List", GDK_KEY_n, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_TASK_LIST, "Task List", GDK_KEY_k, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_CODE_BLOCK, "Code Block", GDK_KEY_c, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_TABLE, "Table", GDK_KEY_t, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_HORIZONTAL_RULE, "Horizontal Rule", GDK_KEY_r, GDK_CONTROL_MASK | GDK_MOD1_MASK);
  set_shortcut(shell, SHORTCUT_KEYBOARD_SHORTCUTS, "Keyboard Shortcuts", GDK_KEY_comma, GDK_CONTROL_MASK);
}

static const char *shortcut_key_name(guint keyval, char *buffer, size_t buffer_len) {
  gunichar unicode;
  const char *name;
  if (keyval == GDK_KEY_equal) {
    return "=";
  }
  if (keyval == GDK_KEY_plus) {
    return "+";
  }
  if (keyval == GDK_KEY_minus) {
    return "-";
  }
  if (keyval == GDK_KEY_grave) {
    return "`";
  }
  if (keyval == GDK_KEY_comma) {
    return ",";
  }
  if (keyval == GDK_KEY_period) {
    return ".";
  }
  if (keyval == GDK_KEY_slash) {
    return "/";
  }
  if (keyval == GDK_KEY_space) {
    return "Space";
  }

  unicode = gdk_keyval_to_unicode(keyval);
  if (unicode != 0 && g_unichar_isprint(unicode)) {
    gint len = g_unichar_to_utf8(g_unichar_toupper(unicode), buffer);
    buffer[len] = '\0';
    return buffer;
  }

  name = gdk_keyval_name(keyval);
  if (!name) {
    return "";
  }
  snprintf(buffer, buffer_len, "%s", name);
  return buffer;
}

static char *shortcut_to_text(guint keyval, GdkModifierType modifiers) {
  GString *out;
  char key_buffer[16];
  if (keyval == 0) {
    return g_strdup("");
  }
  out = g_string_new("");
  if (modifiers & GDK_CONTROL_MASK) {
    g_string_append(out, "Ctrl+");
  }
  if (modifiers & GDK_SHIFT_MASK) {
    g_string_append(out, "Shift+");
  }
  if (modifiers & GDK_MOD1_MASK) {
    g_string_append(out, "Alt+");
  }
  g_string_append(out, shortcut_key_name(keyval, key_buffer, sizeof(key_buffer)));
  return g_string_free(out, FALSE);
}

static guint shortcut_key_from_name(const char *token) {
  gunichar unicode;
  guint keyval;
  if (g_ascii_strcasecmp(token, "=") == 0 || g_ascii_strcasecmp(token, "equal") == 0) {
    return GDK_KEY_equal;
  }
  if (g_ascii_strcasecmp(token, "plus") == 0) {
    return GDK_KEY_plus;
  }
  if (g_ascii_strcasecmp(token, "-") == 0 || g_ascii_strcasecmp(token, "minus") == 0) {
    return GDK_KEY_minus;
  }
  if (g_ascii_strcasecmp(token, "`") == 0 || g_ascii_strcasecmp(token, "grave") == 0 || g_ascii_strcasecmp(token, "backtick") == 0) {
    return GDK_KEY_grave;
  }
  if (g_ascii_strcasecmp(token, ",") == 0 || g_ascii_strcasecmp(token, "comma") == 0) {
    return GDK_KEY_comma;
  }
  if (g_ascii_strcasecmp(token, ".") == 0 || g_ascii_strcasecmp(token, "period") == 0) {
    return GDK_KEY_period;
  }
  if (g_ascii_strcasecmp(token, "/") == 0 || g_ascii_strcasecmp(token, "slash") == 0) {
    return GDK_KEY_slash;
  }
  if (g_ascii_strcasecmp(token, "space") == 0) {
    return GDK_KEY_space;
  }
  if (g_utf8_strlen(token, -1) == 1) {
    unicode = g_utf8_get_char(token);
    keyval = gdk_unicode_to_keyval(g_unichar_tolower(unicode));
    if (keyval != 0) {
      return keyval;
    }
  }
  keyval = gdk_keyval_from_name(token);
  if (keyval != GDK_KEY_VoidSymbol) {
    return gdk_keyval_to_lower(keyval);
  }
  return 0;
}

static int parse_shortcut_text(const char *text, guint *keyval, GdkModifierType *modifiers) {
  char *copy;
  char **parts;
  char *key_token = NULL;
  int i;

  *keyval = 0;
  *modifiers = 0;
  copy = g_strdup(text ? text : "");
  g_strstrip(copy);
  if (copy[0] == '\0' || g_ascii_strcasecmp(copy, "none") == 0) {
    g_free(copy);
    return 1;
  }

  parts = g_strsplit(copy, "+", -1);
  for (i = 0; parts[i] != NULL; i += 1) {
    char *token = g_strstrip(parts[i]);
    if (token[0] == '\0') {
      continue;
    }
    if (g_ascii_strcasecmp(token, "ctrl") == 0 || g_ascii_strcasecmp(token, "control") == 0) {
      *modifiers = (GdkModifierType)(*modifiers | GDK_CONTROL_MASK);
    } else if (g_ascii_strcasecmp(token, "shift") == 0) {
      *modifiers = (GdkModifierType)(*modifiers | GDK_SHIFT_MASK);
    } else if (g_ascii_strcasecmp(token, "alt") == 0 || g_ascii_strcasecmp(token, "option") == 0) {
      *modifiers = (GdkModifierType)(*modifiers | GDK_MOD1_MASK);
    } else {
      if (key_token) {
        g_strfreev(parts);
        g_free(copy);
        return 0;
      }
      key_token = token;
    }
  }

  if (!key_token) {
    g_strfreev(parts);
    g_free(copy);
    return 0;
  }
  *keyval = shortcut_key_from_name(key_token);
  g_strfreev(parts);
  g_free(copy);
  return *keyval != 0;
}

static void refresh_shortcut_menu_labels(LinuxShell *shell) {
  int i;
  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    ShortcutBinding *binding = &shell->shortcuts[i];
    if (binding->menu_shortcut_label) {
      char *text = shortcut_to_text(binding->keyval, binding->modifiers);
      gtk_label_set_text(GTK_LABEL(binding->menu_shortcut_label), text);
      g_free(text);
    }
  }
}

static void restore_default_shortcuts(LinuxShell *shell) {
  int i;
  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    shell->shortcuts[i].keyval = shell->shortcuts[i].default_keyval;
    shell->shortcuts[i].modifiers = shell->shortcuts[i].default_modifiers;
  }
  refresh_shortcut_menu_labels(shell);
}

static int apply_shortcut_entries(LinuxShell *shell, GtkWidget **entries, GtkWidget *error_label) {
  guint keyvals[SHORTCUT_COUNT];
  GdkModifierType modifiers[SHORTCUT_COUNT];
  int i;
  int j;

  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    const char *text = gtk_entry_get_text(GTK_ENTRY(entries[i]));
    if (!parse_shortcut_text(text, &keyvals[i], &modifiers[i])) {
      char message[160];
      snprintf(message, sizeof(message), "Invalid shortcut: %s", shell->shortcuts[i].name);
      gtk_label_set_text(GTK_LABEL(error_label), message);
      return 0;
    }
  }

  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    if (keyvals[i] == 0) {
      continue;
    }
    for (j = i + 1; j < SHORTCUT_COUNT; j += 1) {
      if (keyvals[j] == 0) {
        continue;
      }
      if (gdk_keyval_to_lower(keyvals[i]) == gdk_keyval_to_lower(keyvals[j]) && modifiers[i] == modifiers[j]) {
        char message[220];
        snprintf(message, sizeof(message), "Shortcut already used: %s and %s", shell->shortcuts[i].name, shell->shortcuts[j].name);
        gtk_label_set_text(GTK_LABEL(error_label), message);
        return 0;
      }
    }
  }

  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    shell->shortcuts[i].keyval = keyvals[i];
    shell->shortcuts[i].modifiers = modifiers[i];
  }
  gtk_label_set_text(GTK_LABEL(error_label), "");
  refresh_shortcut_menu_labels(shell);
  return 1;
}

static void populate_shortcut_entries(LinuxShell *shell, GtkWidget **entries) {
  int i;
  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    char *text = shortcut_to_text(shell->shortcuts[i].keyval, shell->shortcuts[i].modifiers);
    gtk_entry_set_text(GTK_ENTRY(entries[i]), text);
    g_free(text);
  }
}

static void on_keyboard_shortcuts(GtkWidget *widget, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkWidget *dialog;
  GtkWidget *content;
  GtkWidget *scroller;
  GtkWidget *grid;
  GtkWidget *error_label;
  GtkWidget *entries[SHORTCUT_COUNT];
  int i;
  int response;
  (void)widget;

  dialog = gtk_dialog_new_with_buttons(
      "Keyboard Shortcuts",
      GTK_WINDOW(shell->window),
      GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
      "_Cancel",
      GTK_RESPONSE_CANCEL,
      "_Apply",
      GTK_RESPONSE_APPLY,
      NULL);
  gtk_dialog_add_button(GTK_DIALOG(dialog), "_Reset Defaults", 10);
  gtk_window_set_default_size(GTK_WINDOW(dialog), 560, 520);

  content = gtk_dialog_get_content_area(GTK_DIALOG(dialog));
  scroller = gtk_scrolled_window_new(NULL, NULL);
  gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroller), GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
  gtk_widget_set_margin_top(scroller, 10);
  gtk_widget_set_margin_bottom(scroller, 10);
  gtk_widget_set_margin_start(scroller, 12);
  gtk_widget_set_margin_end(scroller, 12);

  grid = gtk_grid_new();
  gtk_grid_set_column_spacing(GTK_GRID(grid), 16);
  gtk_grid_set_row_spacing(GTK_GRID(grid), 6);
  gtk_container_add(GTK_CONTAINER(scroller), grid);

  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    GtkWidget *name = gtk_label_new(shell->shortcuts[i].name);
    GtkWidget *entry = gtk_entry_new();
    gtk_widget_set_halign(name, GTK_ALIGN_START);
    gtk_entry_set_activates_default(GTK_ENTRY(entry), TRUE);
    gtk_grid_attach(GTK_GRID(grid), name, 0, i, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), entry, 1, i, 1, 1);
    entries[i] = entry;
  }
  populate_shortcut_entries(shell, entries);

  error_label = gtk_label_new("");
  gtk_widget_set_halign(error_label, GTK_ALIGN_START);
  gtk_grid_attach(GTK_GRID(grid), error_label, 0, SHORTCUT_COUNT, 2, 1);

  gtk_box_pack_start(GTK_BOX(content), scroller, TRUE, TRUE, 0);
  gtk_widget_show_all(dialog);

  while ((response = gtk_dialog_run(GTK_DIALOG(dialog))) != GTK_RESPONSE_CANCEL && response != GTK_RESPONSE_DELETE_EVENT) {
    if (response == 10) {
      restore_default_shortcuts(shell);
      populate_shortcut_entries(shell, entries);
      gtk_label_set_text(GTK_LABEL(error_label), "");
      shell_set_status(shell, "Default shortcuts");
      continue;
    }
    if (response == GTK_RESPONSE_APPLY && apply_shortcut_entries(shell, entries, error_label)) {
      shell_set_status(shell, "Keyboard shortcuts updated");
      break;
    }
  }

  gtk_widget_destroy(dialog);
}

static GtkWidget *menu_item(const char *label, ShortcutCommand command, GCallback callback, LinuxShell *shell) {
  GtkWidget *item = gtk_menu_item_new();
  GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 24);
  GtkWidget *name = gtk_label_new(label);
  GtkWidget *shortcut_label = gtk_label_new("");
  ShortcutBinding *binding = shortcut_for_command(shell, command);
  char *shortcut_text = NULL;

  gtk_widget_set_halign(name, GTK_ALIGN_START);
  gtk_widget_set_hexpand(name, TRUE);
  gtk_widget_set_halign(shortcut_label, GTK_ALIGN_END);

  if (binding) {
    shortcut_text = shortcut_to_text(binding->keyval, binding->modifiers);
    gtk_label_set_text(GTK_LABEL(shortcut_label), shortcut_text);
    binding->menu_shortcut_label = shortcut_label;
    g_free(shortcut_text);
  }

  gtk_box_pack_start(GTK_BOX(row), name, TRUE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(row), shortcut_label, FALSE, FALSE, 0);
  gtk_container_add(GTK_CONTAINER(item), row);
  g_signal_connect(item, "activate", callback, shell);
  return item;
}

static void append_menu_item(GtkWidget *menu, const char *label, ShortcutCommand command, GCallback callback, LinuxShell *shell) {
  gtk_menu_shell_append(GTK_MENU_SHELL(menu), menu_item(label, command, callback, shell));
}

static void append_separator(GtkWidget *menu) {
  gtk_menu_shell_append(GTK_MENU_SHELL(menu), gtk_separator_menu_item_new());
}

static void popup_menu_for_owner(GtkWidget *owner, GdkEvent *event) {
  GtkWidget *menu = GTK_WIDGET(g_object_get_data(G_OBJECT(owner), "menu"));
  LinuxShell *shell = (LinuxShell *)g_object_get_data(G_OBJECT(owner), "shell");
  if (!menu || !shell) {
    return;
  }
  shell->active_menu_owner = owner;
  gtk_menu_popup_at_widget(GTK_MENU(menu), owner, GDK_GRAVITY_SOUTH_WEST, GDK_GRAVITY_NORTH_WEST, event);
}

static gboolean on_menu_enter(GtkWidget *widget, GdkEventCrossing *event, gpointer user_data) {
  (void)user_data;
  popup_menu_for_owner(widget, (GdkEvent *)event);
  return FALSE;
}

static gboolean on_menu_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
  (void)user_data;
  if (event->button == 1) {
    popup_menu_for_owner(widget, (GdkEvent *)event);
    return TRUE;
  }
  return FALSE;
}

static GtkWidget *menu_title(LinuxShell *shell, const char *label, GtkWidget *menu) {
  GtkWidget *button = gtk_button_new_with_label(label);
  gtk_button_set_relief(GTK_BUTTON(button), GTK_RELIEF_NONE);
  gtk_widget_add_events(button, GDK_ENTER_NOTIFY_MASK | GDK_BUTTON_PRESS_MASK);
  add_class(button, "menu-title");
  g_object_set_data(G_OBJECT(button), "menu", menu);
  g_object_set_data(G_OBJECT(button), "shell", shell);
  g_signal_connect(button, "enter-notify-event", G_CALLBACK(on_menu_enter), NULL);
  g_signal_connect(button, "button-press-event", G_CALLBACK(on_menu_press), NULL);
  return button;
}

static GtkWidget *build_menu_bar(LinuxShell *shell) {
  GtkWidget *bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
  GtkWidget *file_menu = gtk_menu_new();
  GtkWidget *edit_menu = gtk_menu_new();
  GtkWidget *view_menu = gtk_menu_new();
  GtkWidget *format_menu = gtk_menu_new();
  GtkWidget *settings_menu = gtk_menu_new();
  GtkWidget *spacer = gtk_label_new("");

  add_class(bar, "menu-bar");

  append_menu_item(file_menu, "New", SHORTCUT_NEW, G_CALLBACK(on_new), shell);
  append_menu_item(file_menu, "Open", SHORTCUT_OPEN, G_CALLBACK(on_open), shell);
  append_menu_item(file_menu, "Save", SHORTCUT_SAVE, G_CALLBACK(on_save), shell);
  append_menu_item(file_menu, "Save As", SHORTCUT_SAVE_AS, G_CALLBACK(on_save_as), shell);
  append_separator(file_menu);
  append_menu_item(file_menu, "Quit", SHORTCUT_QUIT, G_CALLBACK(on_quit), shell);

  append_menu_item(edit_menu, "Undo", SHORTCUT_UNDO, G_CALLBACK(on_undo), shell);
  append_menu_item(edit_menu, "Redo", SHORTCUT_REDO, G_CALLBACK(on_redo), shell);
  append_separator(edit_menu);
  append_menu_item(edit_menu, "Select All", SHORTCUT_SELECT_ALL, G_CALLBACK(on_select_all), shell);

  append_menu_item(view_menu, "Zoom In", SHORTCUT_ZOOM_IN, G_CALLBACK(on_zoom_in), shell);
  append_menu_item(view_menu, "Zoom Out", SHORTCUT_ZOOM_OUT, G_CALLBACK(on_zoom_out), shell);
  append_menu_item(view_menu, "Reset Zoom", SHORTCUT_RESET_ZOOM, G_CALLBACK(on_reset_zoom), shell);
  append_menu_item(view_menu, "Fit Width", SHORTCUT_FIT_WIDTH, G_CALLBACK(on_fit_width), shell);
  append_separator(view_menu);
  append_menu_item(view_menu, "Show/Hide Ruler", SHORTCUT_COUNT, G_CALLBACK(on_toggle_ruler), shell);

  append_menu_item(format_menu, "Bold", SHORTCUT_BOLD, G_CALLBACK(on_bold), shell);
  append_menu_item(format_menu, "Italic", SHORTCUT_ITALIC, G_CALLBACK(on_italic), shell);
  append_menu_item(format_menu, "Strikethrough", SHORTCUT_STRIKE, G_CALLBACK(on_strike), shell);
  append_menu_item(format_menu, "Inline Code", SHORTCUT_INLINE_CODE, G_CALLBACK(on_inline_code), shell);
  append_separator(format_menu);
  append_menu_item(format_menu, "Paragraph", SHORTCUT_PARAGRAPH, G_CALLBACK(on_paragraph), shell);
  append_menu_item(format_menu, "Heading 1", SHORTCUT_H1, G_CALLBACK(on_h1), shell);
  append_menu_item(format_menu, "Heading 2", SHORTCUT_H2, G_CALLBACK(on_h2), shell);
  append_menu_item(format_menu, "Heading 3", SHORTCUT_H3, G_CALLBACK(on_h3), shell);
  append_menu_item(format_menu, "Block Quote", SHORTCUT_BLOCKQUOTE, G_CALLBACK(on_blockquote), shell);
  append_menu_item(format_menu, "Bulleted List", SHORTCUT_BULLET_LIST, G_CALLBACK(on_bullet_list), shell);
  append_menu_item(format_menu, "Numbered List", SHORTCUT_NUMBERED_LIST, G_CALLBACK(on_numbered_list), shell);
  append_menu_item(format_menu, "Task List", SHORTCUT_TASK_LIST, G_CALLBACK(on_task_list), shell);
  append_separator(format_menu);
  append_menu_item(format_menu, "Code Block", SHORTCUT_CODE_BLOCK, G_CALLBACK(on_code_block), shell);
  append_menu_item(format_menu, "Table", SHORTCUT_TABLE, G_CALLBACK(on_table), shell);
  append_menu_item(format_menu, "Horizontal Rule", SHORTCUT_HORIZONTAL_RULE, G_CALLBACK(on_hr), shell);

  append_menu_item(settings_menu, "Dark Theme", SHORTCUT_COUNT, G_CALLBACK(on_theme_dark), shell);
  append_menu_item(settings_menu, "Light Theme", SHORTCUT_COUNT, G_CALLBACK(on_theme_light), shell);
  append_separator(settings_menu);
  append_menu_item(settings_menu, "Letter Page", SHORTCUT_COUNT, G_CALLBACK(on_letter_page), shell);
  append_menu_item(settings_menu, "A4 Page", SHORTCUT_COUNT, G_CALLBACK(on_a4_page), shell);
  append_menu_item(settings_menu, "Reset Margins", SHORTCUT_COUNT, G_CALLBACK(on_reset_margins), shell);
  append_separator(settings_menu);
  append_menu_item(settings_menu, "Keyboard Shortcuts", SHORTCUT_KEYBOARD_SHORTCUTS, G_CALLBACK(on_keyboard_shortcuts), shell);

  gtk_box_pack_start(GTK_BOX(bar), menu_title(shell, "File", file_menu), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(bar), menu_title(shell, "Edit", edit_menu), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(bar), menu_title(shell, "View", view_menu), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(bar), menu_title(shell, "Format", format_menu), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(bar), menu_title(shell, "Settings", settings_menu), FALSE, FALSE, 0);
  gtk_widget_set_hexpand(spacer, TRUE);
  gtk_box_pack_start(GTK_BOX(bar), spacer, TRUE, TRUE, 0);
  shell->zoom_label = gtk_label_new("100%");
  add_class(shell->zoom_label, "status");
  gtk_box_pack_start(GTK_BOX(bar), shell->zoom_label, FALSE, FALSE, 6);
  gtk_widget_show_all(file_menu);
  gtk_widget_show_all(edit_menu);
  gtk_widget_show_all(view_menu);
  gtk_widget_show_all(format_menu);
  gtk_widget_show_all(settings_menu);
  return bar;
}

static GtkWidget *tool_button(const char *label, const char *tooltip, GCallback callback, LinuxShell *shell) {
  GtkWidget *button = gtk_button_new_with_label(label);
  gtk_button_set_relief(GTK_BUTTON(button), GTK_RELIEF_NONE);
  gtk_widget_set_tooltip_text(button, tooltip);
  add_class(button, "tool-button");
  g_signal_connect(button, "clicked", callback, shell);
  return button;
}

static void build_selection_popover(LinuxShell *shell) {
  GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 2);
  shell->selection_popover = gtk_popover_new(shell->text_view);
  add_class(box, "popover-box");
  gtk_box_pack_start(GTK_BOX(box), tool_button("B", "Bold", G_CALLBACK(on_bold), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("I", "Italic", G_CALLBACK(on_italic), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("S", "Strikethrough", G_CALLBACK(on_strike), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("</>", "Inline code", G_CALLBACK(on_inline_code), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 2);
  gtk_box_pack_start(GTK_BOX(box), tool_button("P", "Paragraph", G_CALLBACK(on_paragraph), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("H1", "Heading 1", G_CALLBACK(on_h1), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("H2", "Heading 2", G_CALLBACK(on_h2), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("H3", "Heading 3", G_CALLBACK(on_h3), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button(">", "Block quote", G_CALLBACK(on_blockquote), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 2);
  gtk_box_pack_start(GTK_BOX(box), tool_button("-", "Bulleted list", G_CALLBACK(on_bullet_list), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("1.", "Numbered list", G_CALLBACK(on_numbered_list), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("[ ]", "Task list", G_CALLBACK(on_task_list), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("{ }", "Code block", G_CALLBACK(on_code_block), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("T", "Table", G_CALLBACK(on_table), shell), FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(box), tool_button("---", "Horizontal rule", G_CALLBACK(on_hr), shell), FALSE, FALSE, 0);
  gtk_container_add(GTK_CONTAINER(shell->selection_popover), box);
  gtk_widget_show_all(box);
  gtk_widget_hide(shell->selection_popover);
}

static void update_selection_popover(LinuxShell *shell) {
  GtkTextBuffer *buffer;
  GtkTextIter start;
  GtkTextIter end;
  GdkRectangle iter_rect;
  GdkRectangle pointing;
  int x;
  int y;

  if (!shell->selection_popover || !gtk_widget_has_focus(shell->text_view)) {
    return;
  }

  buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  if (!gtk_text_buffer_get_selection_bounds(buffer, &start, &end)) {
    gtk_widget_hide(shell->selection_popover);
    return;
  }

  gtk_text_view_get_iter_location(GTK_TEXT_VIEW(shell->text_view), &start, &iter_rect);
  gtk_text_view_buffer_to_window_coords(GTK_TEXT_VIEW(shell->text_view), GTK_TEXT_WINDOW_WIDGET, iter_rect.x, iter_rect.y, &x, &y);
  pointing.x = x;
  pointing.y = y;
  pointing.width = iter_rect.width > 1 ? iter_rect.width : 1;
  pointing.height = iter_rect.height > 1 ? iter_rect.height : 18;
  gtk_popover_set_pointing_to(GTK_POPOVER(shell->selection_popover), &pointing);
  gtk_widget_show_all(shell->selection_popover);
  gtk_popover_popup(GTK_POPOVER(shell->selection_popover));
}

static GtkWidget *table_menu_item(const char *label, TableAction action, LinuxShell *shell) {
  GtkWidget *item = gtk_menu_item_new_with_label(label);
  g_object_set_data(G_OBJECT(item), "table-action", GINT_TO_POINTER((int)action));
  g_signal_connect(item, "activate", G_CALLBACK(on_table_menu_item), shell);
  return item;
}

static void build_table_menu(LinuxShell *shell) {
  shell->table_menu = gtk_menu_new();
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Insert Row Above", TABLE_INSERT_ROW_ABOVE, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Insert Row Below", TABLE_INSERT_ROW_BELOW, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Delete Row", TABLE_DELETE_ROW, shell));
  append_separator(shell->table_menu);
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Insert Column Left", TABLE_INSERT_COLUMN_LEFT, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Insert Column Right", TABLE_INSERT_COLUMN_RIGHT, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Delete Column", TABLE_DELETE_COLUMN, shell));
  append_separator(shell->table_menu);
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Align Column Left", TABLE_ALIGN_LEFT, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Align Column Center", TABLE_ALIGN_CENTER, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Align Column Right", TABLE_ALIGN_RIGHT, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Clear Column Alignment", TABLE_ALIGN_DEFAULT, shell));
  append_separator(shell->table_menu);
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Normalize Table", TABLE_NORMALIZE, shell));
  gtk_menu_shell_append(GTK_MENU_SHELL(shell->table_menu), table_menu_item("Delete Table", TABLE_DELETE, shell));
  gtk_widget_show_all(shell->table_menu);
}

static char *line_text_at_iter(GtkTextBuffer *buffer, GtkTextIter *iter) {
  GtkTextIter start = *iter;
  GtkTextIter end = *iter;
  gtk_text_iter_set_line_offset(&start, 0);
  if (!gtk_text_iter_ends_line(&end)) {
    gtk_text_iter_forward_to_line_end(&end);
  }
  return gtk_text_buffer_get_text(buffer, &start, &end, FALSE);
}

static int line_starts_with_pipe(const char *line) {
  size_t i = 0;
  while (line[i] == ' ' && i < 4) {
    i += 1;
  }
  return line[i] == '|';
}

static size_t table_column_at_iter(GtkTextBuffer *buffer, GtkTextIter *iter, const char *line) {
  GtkTextIter start = *iter;
  char *text;
  size_t bars = 0;
  size_t i;
  int has_leading_pipe = line_starts_with_pipe(line);
  gtk_text_iter_set_line_offset(&start, 0);
  text = gtk_text_buffer_get_text(buffer, &start, iter, FALSE);
  for (i = 0; text[i] != '\0'; i += 1) {
    if (text[i] == '|') {
      bars += 1;
    }
  }
  g_free(text);
  if (has_leading_pipe) {
    return bars > 0 ? bars - 1 : 0;
  }
  return bars;
}

static void clear_table_column_highlight(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start;
  GtkTextIter end;
  gtk_text_buffer_get_bounds(buffer, &start, &end);
  gtk_text_buffer_remove_tag_by_name(buffer, "table-active-column", &start, &end);
}

static void clear_table_cell_selection_highlight(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start;
  GtkTextIter end;
  gtk_text_buffer_get_bounds(buffer, &start, &end);
  gtk_text_buffer_remove_tag_by_name(buffer, "table-cell-selection", &start, &end);
}

static void clear_table_selection(LinuxShell *shell) {
  if (!shell || !shell->text_view) {
    return;
  }
  shell->table_dragging = 0;
  shell->table_drag_has_selection = 0;
  clear_table_cell_selection_highlight(shell);
}

static int table_cell_offsets(const char *line, size_t column_index, int *out_start, int *out_end) {
  size_t line_len = strlen(line);
  size_t content_start = 0;
  size_t content_end = line_len;
  size_t cell_start;
  size_t current = 0;
  size_t i;

  while (content_start < line_len && line[content_start] == ' ' && content_start < 4) {
    content_start += 1;
  }
  if (content_start < line_len && line[content_start] == '|') {
    content_start += 1;
  } else {
    content_start = 0;
  }
  while (content_end > content_start && (line[content_end - 1] == ' ' || line[content_end - 1] == '\t')) {
    content_end -= 1;
  }
  if (content_end > content_start && line[content_end - 1] == '|') {
    content_end -= 1;
  }

  cell_start = content_start;
  for (i = content_start; i <= content_end; i += 1) {
    if (i == content_end || line[i] == '|') {
      if (current == column_index) {
        *out_start = (int)cell_start;
        *out_end = (int)i;
        return *out_end > *out_start;
      }
      current += 1;
      cell_start = i + 1;
    }
  }
  return 0;
}

static int table_cell_content_offset(const char *line, size_t column_index, int *out_offset) {
  int start;
  int end;
  if (!table_cell_offsets(line, column_index, &start, &end)) {
    return 0;
  }
  while (start < end && (line[start] == ' ' || line[start] == '\t')) {
    start += 1;
  }
  *out_offset = start;
  return 1;
}

static void highlight_table_column(LinuxShell *shell, const InkwellTableCell *cell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start_iter;
  GtkTextIter end_iter;
  char *text;
  size_t len;
  size_t line_start = 0;
  size_t line_index = 0;

  clear_table_column_highlight(shell);

  gtk_text_buffer_get_bounds(buffer, &start_iter, &end_iter);
  text = gtk_text_buffer_get_text(buffer, &start_iter, &end_iter, FALSE);
  len = strlen(text);

  while (line_start <= len) {
    size_t line_end = line_start;
    char *line;
    int cell_start;
    int cell_end;
    while (line_end < len && text[line_end] != '\n') {
      line_end += 1;
    }
    if (line_index >= cell->table_start_line && line_index <= cell->table_end_line) {
      line = g_strndup(text + line_start, line_end - line_start);
      if (table_cell_offsets(line, cell->column_index, &cell_start, &cell_end)) {
        apply_tag_offsets(buffer, "table-active-column", (int)line_start + cell_start, (int)line_start + cell_end);
      }
      g_free(line);
    }
    if (line_end == len) {
      break;
    }
    line_start = line_end + 1;
    line_index += 1;
  }

  g_free(text);
}

static void render_table_cell_selection(LinuxShell *shell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter start_iter;
  GtkTextIter end_iter;
  InkwellTableCell *anchor = &shell->table_drag_anchor;
  InkwellTableCell *focus = &shell->table_drag_focus;
  size_t row_min;
  size_t row_max;
  size_t col_min;
  size_t col_max;
  char *text;
  size_t len;
  size_t line_start = 0;
  size_t line_index = 0;

  clear_table_column_highlight(shell);
  clear_table_cell_selection_highlight(shell);

  if (!shell->table_drag_has_selection ||
      anchor->table_start_line != focus->table_start_line ||
      anchor->table_end_line != focus->table_end_line ||
      anchor->column_count != focus->column_count) {
    return;
  }

  row_min = anchor->line_index < focus->line_index ? anchor->line_index : focus->line_index;
  row_max = anchor->line_index > focus->line_index ? anchor->line_index : focus->line_index;
  col_min = anchor->column_index < focus->column_index ? anchor->column_index : focus->column_index;
  col_max = anchor->column_index > focus->column_index ? anchor->column_index : focus->column_index;

  gtk_text_buffer_get_bounds(buffer, &start_iter, &end_iter);
  text = gtk_text_buffer_get_text(buffer, &start_iter, &end_iter, FALSE);
  len = strlen(text);

  while (line_start <= len) {
    size_t line_end = line_start;
    char *line;
    while (line_end < len && text[line_end] != '\n') {
      line_end += 1;
    }
    if (line_index >= row_min && line_index <= row_max && line_index != anchor->delimiter_line) {
      size_t column;
      line = g_strndup(text + line_start, line_end - line_start);
      for (column = col_min; column <= col_max; column += 1) {
        int cell_start;
        int cell_end;
        if (table_cell_offsets(line, column, &cell_start, &cell_end)) {
          apply_tag_offsets(buffer, "table-cell-selection", (int)line_start + cell_start, (int)line_start + cell_end);
        }
      }
      g_free(line);
    }
    if (line_end == len) {
      break;
    }
    line_start = line_end + 1;
    line_index += 1;
  }

  g_free(text);
}

static InkwellStatus table_cell_at_iter(LinuxShell *shell, GtkTextIter *iter, InkwellTableCell *cell) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  InkwellDocument *temp_doc;
  InkwellStatus status;
  char *line;
  char *text;
  size_t line_index;
  size_t column_index;

  line = line_text_at_iter(buffer, iter);
  if (!strchr(line, '|')) {
    g_free(line);
    return INKWELL_ERR_NOT_FOUND;
  }

  text = buffer_text(buffer);
  temp_doc = inkwell_document_new();
  if (!temp_doc) {
    g_free(text);
    g_free(line);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  status = inkwell_document_load_markdown(temp_doc, text, strlen(text));
  if (status != INKWELL_OK) {
    inkwell_document_free(temp_doc);
    g_free(text);
    g_free(line);
    return status;
  }

  line_index = (size_t)gtk_text_iter_get_line(iter);
  column_index = table_column_at_iter(buffer, iter, line);
  status = inkwell_document_table_cell_at(temp_doc, line_index, column_index, cell);
  if (status != INKWELL_OK && column_index > 0) {
    column_index -= 1;
    status = inkwell_document_table_cell_at(temp_doc, line_index, column_index, cell);
  }

  inkwell_document_free(temp_doc);
  g_free(text);
  g_free(line);
  return status;
}

static void refresh_table_focus_highlight(LinuxShell *shell) {
  GtkTextBuffer *buffer;
  GtkTextIter cursor;
  InkwellTableCell cell;

  if (!shell || !shell->text_view) {
    return;
  }

  buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  gtk_text_buffer_get_iter_at_mark(buffer, &cursor, gtk_text_buffer_get_insert(buffer));
  if (table_cell_at_iter(shell, &cursor, &cell) == INKWELL_OK) {
    shell->table_line_index = cell.line_index;
    shell->table_column_index = cell.column_index;
    if (!shell->table_drag_has_selection) {
      highlight_table_column(shell, &cell);
    }
  } else {
    clear_table_column_highlight(shell);
    if (!shell->table_dragging) {
      clear_table_selection(shell);
    }
  }
}

static int table_cell_document_offset(GtkTextBuffer *buffer, size_t line_index, size_t column_index, int *out_offset) {
  GtkTextIter line_start;
  GtkTextIter line_end;
  char *line;
  int cell_offset;

  if (line_index >= (size_t)gtk_text_buffer_get_line_count(buffer)) {
    return 0;
  }
  gtk_text_buffer_get_iter_at_line(buffer, &line_start, (int)line_index);
  line_end = line_start;
  if (!gtk_text_iter_ends_line(&line_end)) {
    gtk_text_iter_forward_to_line_end(&line_end);
  }
  line = gtk_text_buffer_get_text(buffer, &line_start, &line_end, FALSE);
  if (!table_cell_content_offset(line, column_index, &cell_offset)) {
    g_free(line);
    return 0;
  }
  *out_offset = gtk_text_iter_get_offset(&line_start) + cell_offset;
  g_free(line);
  return 1;
}

static int move_table_cell(LinuxShell *shell, int forward) {
  GtkTextBuffer *buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  GtkTextIter cursor;
  GtkTextIter target;
  InkwellTableCell cell;
  size_t target_line;
  size_t target_column;
  int target_offset;

  if (gtk_text_buffer_get_selection_bounds(buffer, &cursor, &target)) {
    return 0;
  }
  gtk_text_buffer_get_iter_at_mark(buffer, &cursor, gtk_text_buffer_get_insert(buffer));
  if (table_cell_at_iter(shell, &cursor, &cell) != INKWELL_OK) {
    return 0;
  }

  target_line = cell.line_index;
  target_column = cell.column_index;
  if (forward) {
    if (target_line == cell.delimiter_line) {
      target_line = cell.delimiter_line + 1;
      target_column = 0;
    } else if (target_column + 1 < cell.column_count) {
      target_column += 1;
    } else {
      target_line += 1;
      if (target_line == cell.delimiter_line) {
        target_line += 1;
      }
      target_column = 0;
    }
    if (target_line > cell.table_end_line) {
      return 0;
    }
  } else {
    if (target_line == cell.delimiter_line) {
      if (cell.delimiter_line == cell.table_start_line) {
        return 0;
      }
      target_line = cell.delimiter_line - 1;
      target_column = cell.column_count - 1;
    } else if (target_column > 0) {
      target_column -= 1;
    } else {
      if (target_line == cell.table_start_line) {
        return 0;
      }
      target_line -= 1;
      if (target_line == cell.delimiter_line) {
        if (target_line == cell.table_start_line) {
          return 0;
        }
        target_line -= 1;
      }
      target_column = cell.column_count - 1;
    }
    if (target_line < cell.table_start_line) {
      return 0;
    }
  }

  if (!table_cell_document_offset(buffer, target_line, target_column, &target_offset)) {
    return 0;
  }
  gtk_text_buffer_get_iter_at_offset(buffer, &target, target_offset);
  gtk_text_buffer_place_cursor(buffer, &target);
  gtk_text_view_scroll_to_iter(GTK_TEXT_VIEW(shell->text_view), &target, 0.1, FALSE, 0.0, 0.0);
  refresh_table_focus_highlight(shell);
  return 1;
}

static int table_cell_at_event(LinuxShell *shell, GtkWidget *widget, double x, double y, GtkTextIter *iter, InkwellTableCell *cell) {
  int bx;
  int by;
  gtk_text_view_window_to_buffer_coords(GTK_TEXT_VIEW(widget), GTK_TEXT_WINDOW_WIDGET, (int)x, (int)y, &bx, &by);
  gtk_text_view_get_iter_at_location(GTK_TEXT_VIEW(widget), iter, bx, by);
  return table_cell_at_iter(shell, iter, cell) == INKWELL_OK;
}

static void set_table_drag_selection(LinuxShell *shell, const InkwellTableCell *anchor, const InkwellTableCell *focus) {
  shell->table_drag_anchor = *anchor;
  shell->table_drag_focus = *focus;
  shell->table_drag_has_selection = 1;
  shell->table_line_index = focus->line_index;
  shell->table_column_index = focus->column_index;
  render_table_cell_selection(shell);
}

static gboolean on_text_motion(GtkWidget *widget, GdkEventMotion *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkTextIter iter;
  InkwellTableCell cell;

  if (!shell->table_dragging) {
    return FALSE;
  }

  if (!table_cell_at_event(shell, widget, event->x, event->y, &iter, &cell) ||
      cell.line_index == cell.delimiter_line ||
      cell.table_start_line != shell->table_drag_anchor.table_start_line ||
      cell.table_end_line != shell->table_drag_anchor.table_end_line) {
    return TRUE;
  }

  set_table_drag_selection(shell, &shell->table_drag_anchor, &cell);
  return TRUE;
}

static gboolean on_text_button_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkTextBuffer *buffer;
  GtkTextIter iter;
  InkwellTableCell cell;

  if (event->button == 1) {
    buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
    if (!table_cell_at_event(shell, widget, event->x, event->y, &iter, &cell) || cell.line_index == cell.delimiter_line) {
      clear_table_selection(shell);
      refresh_table_focus_highlight(shell);
      return FALSE;
    }

    shell->table_dragging = 1;
    set_table_drag_selection(shell, &cell, &cell);
    gtk_text_buffer_place_cursor(buffer, &iter);
    gtk_text_buffer_select_range(buffer, &iter, &iter);
    shell_set_status(shell, "Table cell selected");
    return TRUE;
  }

  if (event->button != 3) {
    return FALSE;
  }

  buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  if (!table_cell_at_event(shell, widget, event->x, event->y, &iter, &cell)) {
    clear_table_column_highlight(shell);
    clear_table_selection(shell);
    return FALSE;
  }

  gtk_text_buffer_place_cursor(buffer, &iter);
  shell->table_line_index = cell.line_index;
  shell->table_column_index = cell.column_index;
  clear_table_selection(shell);
  highlight_table_column(shell, &cell);
  gtk_menu_popup_at_pointer(GTK_MENU(shell->table_menu), (GdkEvent *)event);
  return TRUE;
}

static gboolean on_ruler_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkAllocation a;
  double page_px = shell->page_width_in * PX_PER_INCH * shell->zoom / 100.0;
  double left_margin = shell->margin_left_in * PX_PER_INCH * shell->zoom / 100.0;
  double right_margin = shell->margin_right_in * PX_PER_INCH * shell->zoom / 100.0;
  double start_x;
  double i;
  gtk_widget_get_allocation(widget, &a);
  start_x = (a.width - page_px) / 2.0;
  if (start_x < 20.0) {
    start_x = 20.0;
  }

  cairo_set_source_rgb(cr, shell->light_theme ? 0.965 : 0.090, shell->light_theme ? 0.945 : 0.115, shell->light_theme ? 0.900 : 0.095);
  cairo_paint(cr);

  cairo_set_source_rgb(cr, shell->light_theme ? 0.98 : 0.13, shell->light_theme ? 0.96 : 0.16, shell->light_theme ? 0.91 : 0.13);
  cairo_rectangle(cr, start_x, 4, page_px, a.height - 8);
  cairo_fill(cr);

  cairo_set_source_rgba(cr, 0.72, 0.55, 0.21, 0.22);
  cairo_rectangle(cr, start_x, 4, left_margin, a.height - 8);
  cairo_rectangle(cr, start_x + page_px - right_margin, 4, right_margin, a.height - 8);
  cairo_fill(cr);

  cairo_set_source_rgb(cr, shell->light_theme ? 0.35 : 0.66, shell->light_theme ? 0.38 : 0.72, shell->light_theme ? 0.32 : 0.63);
  cairo_set_line_width(cr, 1);
  for (i = 0.0; i <= shell->page_width_in + 0.001; i += 0.25) {
    double x = start_x + i * PX_PER_INCH * shell->zoom / 100.0;
    double h = ((int)(i * 4.0 + 0.5) % 4) == 0 ? 16.0 : ((int)(i * 4.0 + 0.5) % 2) == 0 ? 11.0 : 7.0;
    cairo_move_to(cr, x, a.height - 5);
    cairo_line_to(cr, x, a.height - 5 - h);
  }
  cairo_stroke(cr);

  cairo_set_source_rgb(cr, 0.80, 0.61, 0.24);
  cairo_rectangle(cr, start_x + left_margin - 3, 5, 6, a.height - 10);
  cairo_rectangle(cr, start_x + page_px - right_margin - 3, 5, 6, a.height - 10);
  cairo_fill(cr);
  return FALSE;
}

static int ruler_handle_at(LinuxShell *shell, GtkWidget *widget, double x) {
  GtkAllocation a;
  double page_px = shell->page_width_in * PX_PER_INCH * shell->zoom / 100.0;
  double start_x;
  double left_x;
  double right_x;
  gtk_widget_get_allocation(widget, &a);
  start_x = (a.width - page_px) / 2.0;
  if (start_x < 20.0) {
    start_x = 20.0;
  }
  left_x = start_x + shell->margin_left_in * PX_PER_INCH * shell->zoom / 100.0;
  right_x = start_x + page_px - shell->margin_right_in * PX_PER_INCH * shell->zoom / 100.0;
  if (x >= left_x - 8 && x <= left_x + 8) {
    return 1;
  }
  if (x >= right_x - 8 && x <= right_x + 8) {
    return 2;
  }
  return 0;
}

static gboolean on_ruler_button_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  if (event->button != 1) {
    return FALSE;
  }
  shell->dragging_margin = ruler_handle_at(shell, widget, event->x);
  return shell->dragging_margin != 0;
}

static gboolean on_ruler_motion(GtkWidget *widget, GdkEventMotion *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkAllocation a;
  double page_px = shell->page_width_in * PX_PER_INCH * shell->zoom / 100.0;
  double start_x;
  double offset_in;
  if (!shell->dragging_margin) {
    return FALSE;
  }
  gtk_widget_get_allocation(widget, &a);
  start_x = (a.width - page_px) / 2.0;
  if (start_x < 20.0) {
    start_x = 20.0;
  }
  if (shell->dragging_margin == 1) {
    offset_in = (event->x - start_x) / (PX_PER_INCH * shell->zoom / 100.0);
    shell->margin_left_in = clamp_double(offset_in, MIN_MARGIN_IN, shell->page_width_in - shell->margin_right_in - MIN_CONTENT_IN);
  } else {
    offset_in = (start_x + page_px - event->x) / (PX_PER_INCH * shell->zoom / 100.0);
    shell->margin_right_in = clamp_double(offset_in, MIN_MARGIN_IN, shell->page_width_in - shell->margin_left_in - MIN_CONTENT_IN);
  }
  update_layout(shell);
  return TRUE;
}

static gboolean on_ruler_button_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  (void)widget;
  (void)event;
  shell->dragging_margin = 0;
  return FALSE;
}

static void update_layout(LinuxShell *shell) {
  int page_px = (int)(shell->page_width_in * PX_PER_INCH * shell->zoom / 100.0);
  int margin_left = (int)(shell->margin_left_in * PX_PER_INCH * shell->zoom / 100.0);
  int margin_right = (int)(shell->margin_right_in * PX_PER_INCH * shell->zoom / 100.0);
  char zoom_text[16];

  if (page_px < 420) {
    page_px = 420;
  }
  gtk_widget_set_size_request(shell->page_frame, page_px, -1);
  gtk_text_view_set_left_margin(GTK_TEXT_VIEW(shell->text_view), margin_left);
  gtk_text_view_set_right_margin(GTK_TEXT_VIEW(shell->text_view), margin_right);
  gtk_text_view_set_pixels_above_lines(GTK_TEXT_VIEW(shell->text_view), 4);
  gtk_text_view_set_pixels_below_lines(GTK_TEXT_VIEW(shell->text_view), 4);
  apply_theme_css(shell);

  snprintf(zoom_text, sizeof(zoom_text), "%.0f%%", shell->zoom);
  gtk_label_set_text(GTK_LABEL(shell->zoom_label), zoom_text);
  gtk_widget_set_visible(shell->ruler, shell->ruler_visible);
  gtk_widget_queue_draw(shell->ruler);
}

static int shortcut_matches(const ShortcutBinding *binding, GdkEventKey *event) {
  guint event_key;
  GdkModifierType event_modifiers;
  if (!binding || binding->keyval == 0) {
    return 0;
  }
  event_key = gdk_keyval_to_lower(event->keyval);
  event_modifiers = (GdkModifierType)(event->state & (GDK_CONTROL_MASK | GDK_SHIFT_MASK | GDK_MOD1_MASK));
  return event_key == gdk_keyval_to_lower(binding->keyval) && event_modifiers == binding->modifiers;
}

static void invoke_shortcut_command(LinuxShell *shell, ShortcutCommand command, GtkWidget *widget) {
  switch (command) {
    case SHORTCUT_NEW:
      on_new(widget, shell);
      break;
    case SHORTCUT_OPEN:
      on_open(widget, shell);
      break;
    case SHORTCUT_SAVE:
      on_save(widget, shell);
      break;
    case SHORTCUT_SAVE_AS:
      on_save_as(widget, shell);
      break;
    case SHORTCUT_QUIT:
      on_quit(widget, shell);
      break;
    case SHORTCUT_UNDO:
      on_undo(widget, shell);
      break;
    case SHORTCUT_REDO:
      on_redo(widget, shell);
      break;
    case SHORTCUT_SELECT_ALL:
      on_select_all(widget, shell);
      break;
    case SHORTCUT_ZOOM_IN:
      on_zoom_in(widget, shell);
      break;
    case SHORTCUT_ZOOM_OUT:
      on_zoom_out(widget, shell);
      break;
    case SHORTCUT_RESET_ZOOM:
      on_reset_zoom(widget, shell);
      break;
    case SHORTCUT_FIT_WIDTH:
      on_fit_width(widget, shell);
      break;
    case SHORTCUT_BOLD:
      on_bold(widget, shell);
      break;
    case SHORTCUT_ITALIC:
      on_italic(widget, shell);
      break;
    case SHORTCUT_STRIKE:
      on_strike(widget, shell);
      break;
    case SHORTCUT_INLINE_CODE:
      on_inline_code(widget, shell);
      break;
    case SHORTCUT_PARAGRAPH:
      on_paragraph(widget, shell);
      break;
    case SHORTCUT_H1:
      on_h1(widget, shell);
      break;
    case SHORTCUT_H2:
      on_h2(widget, shell);
      break;
    case SHORTCUT_H3:
      on_h3(widget, shell);
      break;
    case SHORTCUT_BLOCKQUOTE:
      on_blockquote(widget, shell);
      break;
    case SHORTCUT_BULLET_LIST:
      on_bullet_list(widget, shell);
      break;
    case SHORTCUT_NUMBERED_LIST:
      on_numbered_list(widget, shell);
      break;
    case SHORTCUT_TASK_LIST:
      on_task_list(widget, shell);
      break;
    case SHORTCUT_CODE_BLOCK:
      on_code_block(widget, shell);
      break;
    case SHORTCUT_TABLE:
      on_table(widget, shell);
      break;
    case SHORTCUT_HORIZONTAL_RULE:
      on_hr(widget, shell);
      break;
    case SHORTCUT_KEYBOARD_SHORTCUTS:
      on_keyboard_shortcuts(widget, shell);
      break;
    case SHORTCUT_COUNT:
      break;
  }
}

static gboolean on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  int i;
  (void)widget;
  if ((event->keyval == GDK_KEY_Tab || event->keyval == GDK_KEY_ISO_Left_Tab) &&
      (event->state & (GDK_CONTROL_MASK | GDK_MOD1_MASK)) == 0) {
    int forward = event->keyval != GDK_KEY_ISO_Left_Tab && (event->state & GDK_SHIFT_MASK) == 0;
    if (move_table_cell(shell, forward)) {
      return TRUE;
    }
  }
  for (i = 0; i < SHORTCUT_COUNT; i += 1) {
    if (shortcut_matches(&shell->shortcuts[i], event)) {
      invoke_shortcut_command(shell, shell->shortcuts[i].command, widget);
      return TRUE;
    }
  }
  return FALSE;
}

static void on_activate(GtkApplication *app, gpointer user_data) {
  LinuxShell *shell = (LinuxShell *)user_data;
  GtkWidget *content_outer;
  GtkWidget *content_center;
  GtkTextBuffer *buffer;
  GtkSettings *settings;

  settings = gtk_settings_get_default();
  if (settings) {
    g_object_set(settings, "gtk-application-prefer-dark-theme", TRUE, NULL);
  }

  shell->window = gtk_application_window_new(app);
  gtk_window_set_title(GTK_WINDOW(shell->window), "Inkwell Native");
  gtk_window_set_default_size(GTK_WINDOW(shell->window), 1120, 820);
  g_signal_connect(shell->window, "key-press-event", G_CALLBACK(on_key_press), shell);

  shell->css_provider = gtk_css_provider_new();
  gtk_style_context_add_provider_for_screen(
      gdk_screen_get_default(),
      GTK_STYLE_PROVIDER(shell->css_provider),
      GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);

  shell->root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
  add_class(shell->root, "root");
  shell->menu_bar = build_menu_bar(shell);
  gtk_box_pack_start(GTK_BOX(shell->root), shell->menu_bar, FALSE, FALSE, 0);

  shell->ruler = gtk_drawing_area_new();
  add_class(shell->ruler, "ruler");
  gtk_widget_set_size_request(shell->ruler, -1, 30);
  gtk_widget_add_events(shell->ruler, GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK | GDK_POINTER_MOTION_MASK);
  g_signal_connect(shell->ruler, "draw", G_CALLBACK(on_ruler_draw), shell);
  g_signal_connect(shell->ruler, "button-press-event", G_CALLBACK(on_ruler_button_press), shell);
  g_signal_connect(shell->ruler, "motion-notify-event", G_CALLBACK(on_ruler_motion), shell);
  g_signal_connect(shell->ruler, "button-release-event", G_CALLBACK(on_ruler_button_release), shell);
  gtk_box_pack_start(GTK_BOX(shell->root), shell->ruler, FALSE, FALSE, 0);

  shell->scroller = gtk_scrolled_window_new(NULL, NULL);
  gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(shell->scroller), GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
  content_outer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
  content_center = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
  gtk_widget_set_margin_top(content_center, 18);
  gtk_widget_set_margin_bottom(content_center, 18);

  shell->page_frame = gtk_event_box_new();
  add_class(shell->page_frame, "page-frame");
  shell->text_view = gtk_text_view_new();
  gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(shell->text_view), GTK_WRAP_WORD_CHAR);
  gtk_text_view_set_monospace(GTK_TEXT_VIEW(shell->text_view), FALSE);
  gtk_text_view_set_top_margin(GTK_TEXT_VIEW(shell->text_view), 48);
  gtk_text_view_set_bottom_margin(GTK_TEXT_VIEW(shell->text_view), 48);
  gtk_widget_add_events(shell->text_view, GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK | GDK_POINTER_MOTION_MASK);
  gtk_container_add(GTK_CONTAINER(shell->page_frame), shell->text_view);
  gtk_box_pack_start(GTK_BOX(content_center), gtk_label_new(""), TRUE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(content_center), shell->page_frame, FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(content_center), gtk_label_new(""), TRUE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(content_outer), content_center, TRUE, TRUE, 0);
  gtk_container_add(GTK_CONTAINER(shell->scroller), content_outer);
  gtk_box_pack_start(GTK_BOX(shell->root), shell->scroller, TRUE, TRUE, 0);

  shell->status = gtk_label_new("Ready");
  gtk_widget_set_halign(shell->status, GTK_ALIGN_START);
  add_class(shell->status, "status");
  gtk_box_pack_start(GTK_BOX(shell->root), shell->status, FALSE, FALSE, 0);

  gtk_container_add(GTK_CONTAINER(shell->window), shell->root);

  buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(shell->text_view));
  create_markdown_tags(buffer);
  g_signal_connect(buffer, "changed", G_CALLBACK(on_buffer_changed), shell);
  g_signal_connect(buffer, "mark-set", G_CALLBACK(on_mark_set), shell);
  g_signal_connect(shell->text_view, "button-release-event", G_CALLBACK(on_text_button_release), shell);
  g_signal_connect(shell->text_view, "key-release-event", G_CALLBACK(on_text_key_release), shell);
  g_signal_connect(shell->text_view, "button-press-event", G_CALLBACK(on_text_button_press), shell);
  g_signal_connect(shell->text_view, "motion-notify-event", G_CALLBACK(on_text_motion), shell);

  build_selection_popover(shell);
  build_table_menu(shell);
  apply_theme_css(shell);
  update_layout(shell);

  gtk_widget_show_all(shell->window);
  gtk_widget_hide(shell->selection_popover);
  if (!shell->ruler_visible) {
    gtk_widget_hide(shell->ruler);
  }

  if (shell->initial_path) {
    open_path(shell, shell->initial_path);
    shell->initial_path = NULL;
  }
}

int main(int argc, char **argv) {
  LinuxShell shell;
  char *app_argv[2];
  int status;
  memset(&shell, 0, sizeof(shell));
  shell.zoom = 100.0;
  shell.page_width_in = 8.5;
  shell.page_height_in = 11.0;
  shell.margin_left_in = 1.0;
  shell.margin_right_in = 1.0;
  shell.ruler_visible = 1;
  shell.light_theme = 0;
  set_default_shortcuts(&shell);
  if (argc > 1 && argv[1][0] != '-') {
    shell.initial_path = argv[1];
  }
  shell.doc = inkwell_document_new();
  if (!shell.doc) {
    return 1;
  }
  shell.app = gtk_application_new("io.github.VendorBuyMVP.Inkwell", G_APPLICATION_NON_UNIQUE);
  g_signal_connect(shell.app, "activate", G_CALLBACK(on_activate), &shell);
  app_argv[0] = argv[0];
  app_argv[1] = NULL;
  status = g_application_run(G_APPLICATION(shell.app), 1, app_argv);
  g_object_unref(shell.app);
  if (shell.css_provider) {
    g_object_unref(shell.css_provider);
  }
  free_current_path(&shell);
  inkwell_document_free(shell.doc);
  return status;
}
