#include "inkwell_core.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct StringStack {
  char **items;
  size_t count;
  size_t capacity;
} StringStack;

struct InkwellDocument {
  char *text;
  size_t len;
  int dirty;
  StringStack undo;
  StringStack redo;
};

typedef struct LineInfo {
  size_t start;
  size_t end;
} LineInfo;

static char **split_table_cells(const char *line, size_t *out_count);
static void free_lines(char **lines, size_t count);

static char *core_strndup(const char *text, size_t len) {
  char *copy = (char *)malloc(len + 1);
  if (!copy) {
    return NULL;
  }
  if (len > 0 && text) {
    memcpy(copy, text, len);
  }
  copy[len] = '\0';
  return copy;
}

static char *core_strdup(const char *text) {
  if (!text) {
    return core_strndup("", 0);
  }
  return core_strndup(text, strlen(text));
}

static void stack_clear(StringStack *stack) {
  size_t i;
  if (!stack) {
    return;
  }
  for (i = 0; i < stack->count; i += 1) {
    free(stack->items[i]);
  }
  free(stack->items);
  stack->items = NULL;
  stack->count = 0;
  stack->capacity = 0;
}

static InkwellStatus stack_push(StringStack *stack, const char *text) {
  char **next_items;
  char *copy;
  size_t next_capacity;

  if (!stack || !text) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }

  if (stack->count == stack->capacity) {
    next_capacity = stack->capacity == 0 ? 8 : stack->capacity * 2;
    next_items = (char **)realloc(stack->items, next_capacity * sizeof(char *));
    if (!next_items) {
      return INKWELL_ERR_OUT_OF_MEMORY;
    }
    stack->items = next_items;
    stack->capacity = next_capacity;
  }

  copy = core_strdup(text);
  if (!copy) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }

  stack->items[stack->count] = copy;
  stack->count += 1;
  return INKWELL_OK;
}

static char *stack_pop(StringStack *stack) {
  char *item;
  if (!stack || stack->count == 0) {
    return NULL;
  }
  stack->count -= 1;
  item = stack->items[stack->count];
  stack->items[stack->count] = NULL;
  return item;
}

static InkwellStatus remember_undo(InkwellDocument *doc) {
  InkwellStatus status;
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  status = stack_push(&doc->undo, doc->text ? doc->text : "");
  if (status != INKWELL_OK) {
    return status;
  }
  stack_clear(&doc->redo);
  return INKWELL_OK;
}

static InkwellSelection normalize_selection(InkwellSelection selection, size_t max) {
  size_t tmp;
  if (selection.start > selection.end) {
    tmp = selection.start;
    selection.start = selection.end;
    selection.end = tmp;
  }
  if (selection.start > max) {
    selection.start = max;
  }
  if (selection.end > max) {
    selection.end = max;
  }
  return selection;
}

static InkwellStatus replace_range_raw(
    InkwellDocument *doc,
    size_t start,
    size_t end,
    const char *replacement,
    size_t replacement_len,
    int record_undo) {
  char *next;
  size_t next_len;
  InkwellStatus status;

  if (!doc || !replacement || start > end || end > doc->len) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  if (replacement_len > INKWELL_MAX_DOCUMENT_BYTES || doc->len - (end - start) > INKWELL_MAX_DOCUMENT_BYTES - replacement_len) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  if (record_undo) {
    status = remember_undo(doc);
    if (status != INKWELL_OK) {
      return status;
    }
  }

  next_len = doc->len - (end - start) + replacement_len;
  next = (char *)malloc(next_len + 1);
  if (!next) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }

  memcpy(next, doc->text, start);
  memcpy(next + start, replacement, replacement_len);
  memcpy(next + start + replacement_len, doc->text + end, doc->len - end);
  next[next_len] = '\0';

  free(doc->text);
  doc->text = next;
  doc->len = next_len;
  doc->dirty = 1;
  return INKWELL_OK;
}

static LineInfo line_at_offset(const char *text, size_t len, size_t offset) {
  LineInfo info;
  info.start = offset;
  info.end = offset;
  while (info.start > 0 && text[info.start - 1] != '\n') {
    info.start -= 1;
  }
  while (info.end < len && text[info.end] != '\n') {
    info.end += 1;
  }
  return info;
}

static size_t skip_spaces(const char *text, size_t start, size_t end) {
  size_t i = start;
  while (i < end && (text[i] == ' ' || text[i] == '\t')) {
    i += 1;
  }
  return i;
}

static int is_heading_line(const char *text, size_t start, size_t end, size_t *content_start) {
  size_t i = skip_spaces(text, start, end);
  size_t hashes = 0;
  while (i + hashes < end && text[i + hashes] == '#') {
    hashes += 1;
  }
  if (hashes < 1 || hashes > 6 || i + hashes >= end || text[i + hashes] != ' ') {
    return 0;
  }
  if (content_start) {
    *content_start = i + hashes + 1;
  }
  return 1;
}

static int line_is_blank(const char *line) {
  size_t i;
  for (i = 0; line[i]; i += 1) {
    if (!isspace((unsigned char)line[i])) {
      return 0;
    }
  }
  return 1;
}

static int line_is_fence(const char *line) {
  size_t i = 0;
  char marker;
  size_t count = 0;
  while (line[i] == ' ' && i < 4) {
    i += 1;
  }
  marker = line[i];
  if (marker != '`' && marker != '~') {
    return 0;
  }
  while (line[i + count] == marker) {
    count += 1;
  }
  return count >= 3;
}

static int line_is_hr(const char *line) {
  size_t i = 0;
  char marker = '\0';
  size_t count = 0;
  while (line[i] == ' ' && i < 4) {
    i += 1;
  }
  marker = line[i];
  if (marker != '-' && marker != '*' && marker != '_') {
    return 0;
  }
  while (line[i]) {
    if (line[i] == marker) {
      count += 1;
    } else if (!isspace((unsigned char)line[i])) {
      return 0;
    }
    i += 1;
  }
  return count >= 3;
}

static int line_is_list_item(const char *line, int *is_task) {
  size_t i = 0;
  while (line[i] == ' ' && i < 4) {
    i += 1;
  }
  if ((line[i] == '-' || line[i] == '*' || line[i] == '+') && line[i + 1] == ' ') {
    i += 2;
  } else if (isdigit((unsigned char)line[i])) {
    while (isdigit((unsigned char)line[i])) {
      i += 1;
    }
    if ((line[i] != '.' && line[i] != ')') || line[i + 1] != ' ') {
      return 0;
    }
    i += 2;
  } else {
    return 0;
  }
  if (is_task) {
    *is_task = line[i] == '[' &&
               (line[i + 1] == ' ' || line[i + 1] == 'x' || line[i + 1] == 'X') &&
               line[i + 2] == ']' &&
               line[i + 3] == ' ';
  }
  return 1;
}

static int line_is_table_delimiter(const char *line) {
  size_t count;
  char **cells;
  size_t i;
  int ok = 1;

  if (!line || !strchr(line, '|')) {
    return 0;
  }

  cells = split_table_cells(line, &count);
  if (!cells || count == 0) {
    free_lines(cells, count);
    return 0;
  }
  for (i = 0; i < count; i += 1) {
    const char *cell = cells[i];
    size_t j = 0;
    size_t dashes = 0;
    if (cell[j] == ':') {
      j += 1;
    }
    while (cell[j] == '-') {
      dashes += 1;
      j += 1;
    }
    if (cell[j] == ':') {
      j += 1;
    }
    if (cell[j] != '\0' || dashes < 3) {
      ok = 0;
      break;
    }
  }
  free_lines(cells, count);
  return ok;
}

static int line_table_cell_count(const char *line, size_t *out_count) {
  char **cells;
  size_t count = 0;
  if (!line || !strchr(line, '|')) {
    return 0;
  }
  cells = split_table_cells(line, &count);
  if (!cells || count == 0) {
    free_lines(cells, count);
    return 0;
  }
  free_lines(cells, count);
  if (out_count) {
    *out_count = count;
  }
  return 1;
}

static void analyze_inline_links(const char *line, InkwellMarkdownStats *stats) {
  const char *cursor = line;
  while ((cursor = strchr(cursor, '[')) != NULL) {
    const char *close_label = strchr(cursor + 1, ']');
    const char *open_target;
    const char *close_target;
    char *target;
    char *safe;
    if (!close_label || close_label[1] != '(') {
      cursor += 1;
      continue;
    }
    open_target = close_label + 2;
    close_target = strchr(open_target, ')');
    if (!close_target || close_target == open_target) {
      cursor += 1;
      continue;
    }
    target = core_strndup(open_target, (size_t)(close_target - open_target));
    if (!target) {
      return;
    }
    safe = inkwell_sanitize_href(target);
    stats->links += 1;
    if (!safe) {
      stats->unsafe_links += 1;
    }
    free(target);
    free(safe);
    cursor = close_target + 1;
  }
}

static InkwellStatus replace_line_with_prefix(InkwellDocument *doc, InkwellSelection selection, const char *prefix) {
  LineInfo line;
  size_t content_start;
  char *content;
  char *replacement;
  size_t prefix_len;
  size_t content_len;
  InkwellStatus status;

  selection = normalize_selection(selection, doc->len);
  line = line_at_offset(doc->text, doc->len, selection.start);
  if (!is_heading_line(doc->text, line.start, line.end, &content_start)) {
    content_start = skip_spaces(doc->text, line.start, line.end);
  }

  content_len = line.end - content_start;
  content = core_strndup(doc->text + content_start, content_len);
  if (!content) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  prefix_len = strlen(prefix);
  replacement = (char *)malloc(prefix_len + content_len + 1);
  if (!replacement) {
    free(content);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  memcpy(replacement, prefix, prefix_len);
  memcpy(replacement + prefix_len, content, content_len + 1);
  status = replace_range_raw(doc, line.start, line.end, replacement, prefix_len + content_len, 1);
  free(content);
  free(replacement);
  return status;
}

static InkwellStatus wrap_selection(InkwellDocument *doc, InkwellSelection selection, const char *left, const char *right) {
  char *replacement;
  size_t left_len;
  size_t right_len;
  size_t selected_len;
  InkwellStatus status;

  if (!doc || !left || !right) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  selection = normalize_selection(selection, doc->len);
  left_len = strlen(left);
  right_len = strlen(right);
  selected_len = selection.end - selection.start;

  replacement = (char *)malloc(left_len + selected_len + right_len + 1);
  if (!replacement) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  memcpy(replacement, left, left_len);
  memcpy(replacement + left_len, doc->text + selection.start, selected_len);
  memcpy(replacement + left_len + selected_len, right, right_len);
  replacement[left_len + selected_len + right_len] = '\0';

  status = replace_range_raw(doc, selection.start, selection.end, replacement, left_len + selected_len + right_len, 1);
  free(replacement);
  return status;
}

static char **split_lines(const char *text, size_t len, size_t *out_count) {
  char **lines = NULL;
  size_t count = 0;
  size_t capacity = 0;
  size_t start = 0;
  size_t i;

  for (i = 0; i <= len; i += 1) {
    if (i == len || text[i] == '\n') {
      char **next_lines;
      if (count == capacity) {
        capacity = capacity == 0 ? 8 : capacity * 2;
        next_lines = (char **)realloc(lines, capacity * sizeof(char *));
        if (!next_lines) {
          size_t j;
          for (j = 0; j < count; j += 1) {
            free(lines[j]);
          }
          free(lines);
          return NULL;
        }
        lines = next_lines;
      }
      lines[count] = core_strndup(text + start, i - start);
      if (!lines[count]) {
        size_t j;
        for (j = 0; j < count; j += 1) {
          free(lines[j]);
        }
        free(lines);
        return NULL;
      }
      count += 1;
      start = i + 1;
    }
  }

  *out_count = count;
  return lines;
}

static void free_lines(char **lines, size_t count) {
  size_t i;
  if (!lines) {
    return;
  }
  for (i = 0; i < count; i += 1) {
    free(lines[i]);
  }
  free(lines);
}

static char *join_lines(char **lines, size_t count, size_t *out_len) {
  size_t total = 0;
  size_t i;
  size_t offset = 0;
  char *joined;

  for (i = 0; i < count; i += 1) {
    total += strlen(lines[i]);
    if (i + 1 < count) {
      total += 1;
    }
  }

  joined = (char *)malloc(total + 1);
  if (!joined) {
    return NULL;
  }
  for (i = 0; i < count; i += 1) {
    size_t line_len = strlen(lines[i]);
    memcpy(joined + offset, lines[i], line_len);
    offset += line_len;
    if (i + 1 < count) {
      joined[offset] = '\n';
      offset += 1;
    }
  }
  joined[offset] = '\0';
  if (out_len) {
    *out_len = offset;
  }
  return joined;
}

static char **split_table_cells(const char *line, size_t *out_count) {
  const char *start = line;
  size_t len = strlen(line);
  char **cells = NULL;
  size_t count = 0;
  size_t capacity = 0;
  size_t i;
  size_t cell_start;

  if (len > 0 && start[0] == '|') {
    start += 1;
    len -= 1;
  }
  if (len > 0 && start[len - 1] == '|') {
    len -= 1;
  }

  cell_start = 0;
  for (i = 0; i <= len; i += 1) {
    if (i == len || start[i] == '|') {
      size_t left = cell_start;
      size_t right = i;
      char **next_cells;
      while (left < right && isspace((unsigned char)start[left])) {
        left += 1;
      }
      while (right > left && isspace((unsigned char)start[right - 1])) {
        right -= 1;
      }
      if (count == capacity) {
        capacity = capacity == 0 ? 4 : capacity * 2;
        next_cells = (char **)realloc(cells, capacity * sizeof(char *));
        if (!next_cells) {
          free_lines(cells, count);
          return NULL;
        }
        cells = next_cells;
      }
      cells[count] = core_strndup(start + left, right - left);
      if (!cells[count]) {
        free_lines(cells, count);
        return NULL;
      }
      count += 1;
      cell_start = i + 1;
    }
  }

  *out_count = count;
  return cells;
}

static char *format_table_row(char **cells, size_t count) {
  size_t total = 3;
  size_t i;
  size_t offset = 0;
  char *row;
  for (i = 0; i < count; i += 1) {
    total += strlen(cells[i]) + 3;
  }
  row = (char *)malloc(total + 1);
  if (!row) {
    return NULL;
  }
  row[offset++] = '|';
  for (i = 0; i < count; i += 1) {
    size_t len = strlen(cells[i]);
    row[offset++] = ' ';
    memcpy(row + offset, cells[i], len);
    offset += len;
    row[offset++] = ' ';
    row[offset++] = '|';
  }
  row[offset] = '\0';
  return row;
}

static const char *alignment_marker(InkwellAlignment align) {
  if (align == INKWELL_ALIGN_LEFT) {
    return ":---";
  }
  if (align == INKWELL_ALIGN_CENTER) {
    return ":---:";
  }
  if (align == INKWELL_ALIGN_RIGHT) {
    return "---:";
  }
  return "---";
}

static int find_table_bounds(char **lines, size_t line_count, size_t line_index, size_t *start, size_t *end) {
  size_t delimiter = 0;
  size_t e;
  size_t header_count = 0;
  size_t delimiter_count = 0;
  int found = 0;

  if (line_index >= line_count || !line_table_cell_count(lines[line_index], NULL)) {
    return 0;
  }

  if (line_index + 1 < line_count && line_is_table_delimiter(lines[line_index + 1])) {
    delimiter = line_index + 1;
    found = 1;
  } else {
    size_t i = line_index;
    while (i > 0 && line_table_cell_count(lines[i], NULL)) {
      if (line_is_table_delimiter(lines[i])) {
        delimiter = i;
        found = 1;
        break;
      }
      i -= 1;
    }
  }

  if (!found || delimiter == 0) {
    return 0;
  }
  if (!line_table_cell_count(lines[delimiter - 1], &header_count) ||
      !line_table_cell_count(lines[delimiter], &delimiter_count) ||
      header_count == 0 ||
      delimiter_count != header_count) {
    return 0;
  }

  e = delimiter;
  while (e + 1 < line_count) {
    size_t body_count = 0;
    if (line_is_table_delimiter(lines[e + 1]) ||
        !line_table_cell_count(lines[e + 1], &body_count) ||
        body_count != header_count) {
      break;
    }
    e += 1;
  }
  if (line_index < delimiter - 1 || line_index > e) {
    return 0;
  }
  *start = delimiter - 1;
  *end = e;
  return 1;
}

static InkwellStatus replace_all_from_lines(InkwellDocument *doc, char **lines, size_t count) {
  char *joined;
  size_t joined_len;
  InkwellStatus status;

  joined = join_lines(lines, count, &joined_len);
  if (!joined) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  status = replace_range_raw(doc, 0, doc->len, joined, joined_len, 1);
  free(joined);
  return status;
}

const char *inkwell_core_version(void) {
  return "0.4.1";
}

InkwellStatus inkwell_markdown_analyze(const char *text, size_t len, InkwellMarkdownStats *out) {
  char **lines;
  size_t count;
  size_t i = 0;

  if (!out || (!text && len > 0)) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  memset(out, 0, sizeof(*out));
  lines = split_lines(text ? text : "", len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }

  while (i < count) {
    char *line = lines[i];
    size_t line_len = strlen(line);
    size_t content_start = 0;
    int task = 0;

    if (line_is_blank(line)) {
      i += 1;
      continue;
    }
    if (line_is_fence(line)) {
      out->code_blocks += 1;
      i += 1;
      while (i < count) {
        if (line_is_fence(lines[i])) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (is_heading_line(line, 0, line_len, &content_start)) {
      out->headings += 1;
      analyze_inline_links(line + content_start, out);
      i += 1;
      continue;
    }
    if (line_is_hr(line)) {
      out->horizontal_rules += 1;
      i += 1;
      continue;
    }
    if (i + 1 < count && strchr(line, '|') && line_is_table_delimiter(lines[i + 1])) {
      out->tables += 1;
      analyze_inline_links(line, out);
      i += 2;
      while (i < count && strchr(lines[i], '|') && !line_is_blank(lines[i])) {
        analyze_inline_links(lines[i], out);
        i += 1;
      }
      continue;
    }
    if (line[0] == '>' || (line[0] == ' ' && line[1] == '>')) {
      out->blockquotes += 1;
      analyze_inline_links(line, out);
      i += 1;
      continue;
    }
    if (line_is_list_item(line, &task)) {
      out->lists += 1;
      while (i < count && line_is_list_item(lines[i], &task)) {
        if (task) {
          out->task_items += 1;
        }
        analyze_inline_links(lines[i], out);
        i += 1;
      }
      continue;
    }

    out->paragraphs += 1;
    while (i < count && !line_is_blank(lines[i])) {
      analyze_inline_links(lines[i], out);
      i += 1;
    }
  }

  free_lines(lines, count);
  return INKWELL_OK;
}

InkwellDocument *inkwell_document_new(void) {
  InkwellDocument *doc = (InkwellDocument *)calloc(1, sizeof(InkwellDocument));
  if (!doc) {
    return NULL;
  }
  doc->text = core_strdup("");
  if (!doc->text) {
    free(doc);
    return NULL;
  }
  return doc;
}

void inkwell_document_free(InkwellDocument *doc) {
  if (!doc) {
    return;
  }
  free(doc->text);
  stack_clear(&doc->undo);
  stack_clear(&doc->redo);
  free(doc);
}

InkwellStatus inkwell_document_load_markdown(InkwellDocument *doc, const char *text, size_t len) {
  char *copy;
  if (!doc || (!text && len > 0) || len > INKWELL_MAX_DOCUMENT_BYTES) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  copy = core_strndup(text ? text : "", len);
  if (!copy) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  free(doc->text);
  doc->text = copy;
  doc->len = len;
  doc->dirty = 0;
  stack_clear(&doc->undo);
  stack_clear(&doc->redo);
  return INKWELL_OK;
}

InkwellStatus inkwell_document_to_markdown(const InkwellDocument *doc, char **out, size_t *out_len) {
  if (!doc || !out) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  *out = core_strndup(doc->text, doc->len);
  if (!*out) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (out_len) {
    *out_len = doc->len;
  }
  return INKWELL_OK;
}

const char *inkwell_document_text(const InkwellDocument *doc) {
  return doc ? doc->text : "";
}

size_t inkwell_document_length(const InkwellDocument *doc) {
  return doc ? doc->len : 0;
}

int inkwell_document_is_dirty(const InkwellDocument *doc) {
  return doc ? doc->dirty : 0;
}

void inkwell_document_mark_saved(InkwellDocument *doc) {
  if (doc) {
    doc->dirty = 0;
  }
}

InkwellStatus inkwell_document_apply_heading(InkwellDocument *doc, InkwellSelection selection, int level) {
  char prefix[8];
  int i;
  if (!doc || level < 1 || level > 6) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  for (i = 0; i < level; i += 1) {
    prefix[i] = '#';
  }
  prefix[level] = ' ';
  prefix[level + 1] = '\0';
  return replace_line_with_prefix(doc, selection, prefix);
}

InkwellStatus inkwell_document_apply_paragraph(InkwellDocument *doc, InkwellSelection selection) {
  return replace_line_with_prefix(doc, selection, "");
}

InkwellStatus inkwell_document_apply_bold(InkwellDocument *doc, InkwellSelection selection) {
  return wrap_selection(doc, selection, "**", "**");
}

InkwellStatus inkwell_document_apply_italic(InkwellDocument *doc, InkwellSelection selection) {
  return wrap_selection(doc, selection, "*", "*");
}

InkwellStatus inkwell_document_apply_strikethrough(InkwellDocument *doc, InkwellSelection selection) {
  return wrap_selection(doc, selection, "~~", "~~");
}

InkwellStatus inkwell_document_apply_inline_code(InkwellDocument *doc, InkwellSelection selection) {
  return wrap_selection(doc, selection, "`", "`");
}

InkwellStatus inkwell_document_insert_code_block(InkwellDocument *doc, InkwellSelection selection, const char *language) {
  char *replacement;
  size_t language_len = language ? strlen(language) : 0;
  size_t selected_len;
  InkwellStatus status;
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  selection = normalize_selection(selection, doc->len);
  selected_len = selection.end - selection.start;
  replacement = (char *)malloc(8 + language_len + selected_len + 1);
  if (!replacement) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  sprintf(replacement, "```%s\n", language ? language : "");
  memcpy(replacement + 4 + language_len, doc->text + selection.start, selected_len);
  memcpy(replacement + 4 + language_len + selected_len, "\n```", 5);
  status = replace_range_raw(doc, selection.start, selection.end, replacement, 8 + language_len + selected_len, 1);
  free(replacement);
  return status;
}

InkwellStatus inkwell_document_insert_horizontal_rule(InkwellDocument *doc, InkwellSelection selection) {
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  selection = normalize_selection(selection, doc->len);
  return replace_range_raw(doc, selection.start, selection.end, "\n---\n", 5, 1);
}

InkwellStatus inkwell_document_insert_table(InkwellDocument *doc, InkwellSelection selection, int rows, int cols) {
  char *table;
  size_t capacity;
  size_t offset = 0;
  int r;
  int c;
  InkwellStatus status;
  if (!doc || rows < 1 || cols < 1 || rows > 50 || cols > 20) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  selection = normalize_selection(selection, doc->len);
  capacity = (size_t)(rows + 2) * (size_t)cols * 16u + 64u;
  table = (char *)calloc(capacity, 1);
  if (!table) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  for (c = 0; c < cols; c += 1) {
    offset += (size_t)snprintf(table + offset, capacity - offset, "| Header %d ", c + 1);
  }
  offset += (size_t)snprintf(table + offset, capacity - offset, "|\n");
  for (c = 0; c < cols; c += 1) {
    offset += (size_t)snprintf(table + offset, capacity - offset, "| --- ");
  }
  offset += (size_t)snprintf(table + offset, capacity - offset, "|\n");
  for (r = 0; r < rows; r += 1) {
    for (c = 0; c < cols; c += 1) {
      offset += (size_t)snprintf(table + offset, capacity - offset, "| Cell ");
    }
    offset += (size_t)snprintf(table + offset, capacity - offset, "|");
    if (r + 1 < rows) {
      offset += (size_t)snprintf(table + offset, capacity - offset, "\n");
    }
  }
  status = replace_range_raw(doc, selection.start, selection.end, table, strlen(table), 1);
  free(table);
  return status;
}

InkwellStatus inkwell_document_insert_table_row(InkwellDocument *doc, size_t line_index, int after) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  size_t insert_at;
  size_t cell_count = 0;
  char **cells;
  char *row;
  char **next_lines;
  size_t i;
  InkwellStatus status;

  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end)) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }
  cells = split_table_cells(lines[start], &cell_count);
  if (!cells) {
    free_lines(lines, count);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  for (i = 0; i < cell_count; i += 1) {
    free(cells[i]);
    cells[i] = core_strdup("");
    if (!cells[i]) {
      free_lines(cells, cell_count);
      free_lines(lines, count);
      return INKWELL_ERR_OUT_OF_MEMORY;
    }
  }
  row = format_table_row(cells, cell_count);
  free_lines(cells, cell_count);
  if (!row) {
    free_lines(lines, count);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  insert_at = after ? line_index + 1 : line_index;
  if (insert_at <= start + 1) {
    insert_at = start + 2;
  }
  if (insert_at > end + 1) {
    insert_at = end + 1;
  }
  next_lines = (char **)realloc(lines, (count + 1) * sizeof(char *));
  if (!next_lines) {
    free(row);
    free_lines(lines, count);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  lines = next_lines;
  memmove(lines + insert_at + 1, lines + insert_at, (count - insert_at) * sizeof(char *));
  lines[insert_at] = row;
  status = replace_all_from_lines(doc, lines, count + 1);
  free_lines(lines, count + 1);
  return status;
}

InkwellStatus inkwell_document_delete_table_row(InkwellDocument *doc, size_t line_index) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  InkwellStatus status;

  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end) || line_index <= start + 1 || line_index > end) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }
  free(lines[line_index]);
  memmove(lines + line_index, lines + line_index + 1, (count - line_index - 1) * sizeof(char *));
  status = replace_all_from_lines(doc, lines, count - 1);
  free_lines(lines, count - 1);
  return status;
}

static InkwellStatus mutate_table_column(InkwellDocument *doc, size_t line_index, size_t column_index, int insert, int after) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  size_t line;
  InkwellStatus status = INKWELL_OK;

  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end)) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }

  for (line = start; line <= end; line += 1) {
    size_t cell_count = 0;
    size_t target;
    char **cells = split_table_cells(lines[line], &cell_count);
    char *formatted;
    if (!cells) {
      status = INKWELL_ERR_OUT_OF_MEMORY;
      break;
    }
    if (column_index >= cell_count) {
      free_lines(cells, cell_count);
      status = INKWELL_ERR_INVALID_ARGUMENT;
      break;
    }
    if (!insert && cell_count <= 1) {
      free_lines(cells, cell_count);
      status = INKWELL_ERR_INVALID_ARGUMENT;
      break;
    }
    target = column_index + (after ? 1 : 0);
    if (insert) {
      char **next_cells = (char **)realloc(cells, (cell_count + 1) * sizeof(char *));
      if (!next_cells) {
        free_lines(cells, cell_count);
        status = INKWELL_ERR_OUT_OF_MEMORY;
        break;
      }
      cells = next_cells;
      memmove(cells + target + 1, cells + target, (cell_count - target) * sizeof(char *));
      cells[target] = core_strdup(line == start + 1 ? "---" : "");
      if (!cells[target]) {
        free_lines(cells, cell_count + 1);
        status = INKWELL_ERR_OUT_OF_MEMORY;
        break;
      }
      cell_count += 1;
    } else {
      free(cells[column_index]);
      memmove(cells + column_index, cells + column_index + 1, (cell_count - column_index - 1) * sizeof(char *));
      cell_count -= 1;
    }
    formatted = format_table_row(cells, cell_count);
    free_lines(cells, cell_count);
    if (!formatted) {
      status = INKWELL_ERR_OUT_OF_MEMORY;
      break;
    }
    free(lines[line]);
    lines[line] = formatted;
  }

  if (status == INKWELL_OK) {
    status = replace_all_from_lines(doc, lines, count);
  }
  free_lines(lines, count);
  return status;
}

InkwellStatus inkwell_document_insert_table_column(InkwellDocument *doc, size_t line_index, size_t column_index, int after) {
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  return mutate_table_column(doc, line_index, column_index, 1, after);
}

InkwellStatus inkwell_document_delete_table_column(InkwellDocument *doc, size_t line_index, size_t column_index) {
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  return mutate_table_column(doc, line_index, column_index, 0, 0);
}

InkwellStatus inkwell_document_delete_table(InkwellDocument *doc, size_t line_index) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  size_t remove_count;
  size_t tail_count;
  InkwellStatus status;

  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end)) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }

  remove_count = end - start + 1;
  tail_count = count - end - 1;
  for (size_t i = start; i <= end; i += 1) {
    free(lines[i]);
  }
  memmove(lines + start, lines + end + 1, tail_count * sizeof(char *));
  status = replace_all_from_lines(doc, lines, count - remove_count);
  free_lines(lines, count - remove_count);
  return status;
}

InkwellStatus inkwell_document_normalize_table(InkwellDocument *doc, size_t line_index) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  size_t line;
  InkwellStatus status = INKWELL_OK;

  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end)) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }

  for (line = start; line <= end; line += 1) {
    size_t cell_count = 0;
    char **cells = split_table_cells(lines[line], &cell_count);
    char *formatted;
    if (!cells) {
      status = INKWELL_ERR_OUT_OF_MEMORY;
      break;
    }
    formatted = format_table_row(cells, cell_count);
    free_lines(cells, cell_count);
    if (!formatted) {
      status = INKWELL_ERR_OUT_OF_MEMORY;
      break;
    }
    free(lines[line]);
    lines[line] = formatted;
  }

  if (status == INKWELL_OK) {
    status = replace_all_from_lines(doc, lines, count);
  }
  free_lines(lines, count);
  return status;
}

InkwellStatus inkwell_document_set_table_column_alignment(
    InkwellDocument *doc,
    size_t line_index,
    size_t column_index,
    InkwellAlignment align) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  size_t cell_count = 0;
  char **cells;
  char *formatted;
  InkwellStatus status;

  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end) || start + 1 > end) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }
  cells = split_table_cells(lines[start + 1], &cell_count);
  if (!cells) {
    free_lines(lines, count);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (column_index >= cell_count) {
    free_lines(cells, cell_count);
    free_lines(lines, count);
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  free(cells[column_index]);
  cells[column_index] = core_strdup(alignment_marker(align));
  if (!cells[column_index]) {
    free_lines(cells, cell_count);
    free_lines(lines, count);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  formatted = format_table_row(cells, cell_count);
  free_lines(cells, cell_count);
  if (!formatted) {
    free_lines(lines, count);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  free(lines[start + 1]);
  lines[start + 1] = formatted;
  status = replace_all_from_lines(doc, lines, count);
  free_lines(lines, count);
  return status;
}

InkwellStatus inkwell_document_table_cell_at(
    const InkwellDocument *doc,
    size_t line_index,
    size_t column_index,
    InkwellTableCell *out) {
  char **lines;
  size_t count;
  size_t start;
  size_t end;
  size_t column_count = 0;

  if (!doc || !out) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }

  lines = split_lines(doc->text, doc->len, &count);
  if (!lines) {
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  if (!find_table_bounds(lines, count, line_index, &start, &end) ||
      !line_table_cell_count(lines[start], &column_count) ||
      column_index >= column_count) {
    free_lines(lines, count);
    return INKWELL_ERR_NOT_FOUND;
  }

  out->table_start_line = start;
  out->table_end_line = end;
  out->delimiter_line = start + 1;
  out->line_index = line_index;
  out->column_index = column_index;
  out->column_count = column_count;

  free_lines(lines, count);
  return INKWELL_OK;
}

InkwellStatus inkwell_document_undo(InkwellDocument *doc) {
  char *previous;
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  previous = stack_pop(&doc->undo);
  if (!previous) {
    return INKWELL_ERR_NOT_FOUND;
  }
  if (stack_push(&doc->redo, doc->text) != INKWELL_OK) {
    free(previous);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  free(doc->text);
  doc->text = previous;
  doc->len = strlen(previous);
  doc->dirty = 1;
  return INKWELL_OK;
}

InkwellStatus inkwell_document_redo(InkwellDocument *doc) {
  char *next;
  if (!doc) {
    return INKWELL_ERR_INVALID_ARGUMENT;
  }
  next = stack_pop(&doc->redo);
  if (!next) {
    return INKWELL_ERR_NOT_FOUND;
  }
  if (stack_push(&doc->undo, doc->text) != INKWELL_OK) {
    free(next);
    return INKWELL_ERR_OUT_OF_MEMORY;
  }
  free(doc->text);
  doc->text = next;
  doc->len = strlen(next);
  doc->dirty = 1;
  return INKWELL_OK;
}

char *inkwell_slugify(const char *text) {
  char *slug;
  size_t len;
  size_t i;
  size_t out = 0;
  int pending_dash = 0;
  if (!text) {
    return core_strdup("");
  }
  len = strlen(text);
  slug = (char *)malloc(len + 1);
  if (!slug) {
    return NULL;
  }
  for (i = 0; i < len; i += 1) {
    unsigned char ch = (unsigned char)text[i];
    if (isalnum(ch)) {
      if (pending_dash && out > 0) {
        slug[out++] = '-';
      }
      slug[out++] = (char)tolower(ch);
      pending_dash = 0;
    } else if (isspace(ch) || ch == '-') {
      pending_dash = out > 0;
    }
    if (out >= 80) {
      break;
    }
  }
  while (out > 0 && slug[out - 1] == '-') {
    out -= 1;
  }
  slug[out] = '\0';
  return slug;
}

char *inkwell_sanitize_href(const char *href) {
  size_t len;
  size_t i;
  char *copy;
  if (!href) {
    return NULL;
  }
  while (*href && isspace((unsigned char)*href)) {
    href += 1;
  }
  len = strlen(href);
  while (len > 0 && isspace((unsigned char)href[len - 1])) {
    len -= 1;
  }
  if (len == 0) {
    return NULL;
  }
  for (i = 0; i < len; i += 1) {
    unsigned char ch = (unsigned char)href[i];
    if (ch <= 0x20 || ch == 0x7f) {
      return NULL;
    }
  }
  if (href[0] == '#' && len > 1) {
    return core_strndup(href, len);
  }
  if (len >= 7 && strncmp(href, "http://", 7) == 0) {
    copy = core_strndup(href, len);
  } else if (len >= 8 && strncmp(href, "https://", 8) == 0) {
    copy = core_strndup(href, len);
  } else if (len >= 7 && strncmp(href, "mailto:", 7) == 0) {
    copy = core_strndup(href, len);
  } else {
    return NULL;
  }
  if (!copy) {
    return NULL;
  }
  if ((strncmp(copy, "http://", 7) == 0 || strncmp(copy, "https://", 8) == 0) && !strchr(copy + (copy[4] == ':' ? 7 : 8), '/')) {
    size_t copy_len = strlen(copy);
    char *with_slash = (char *)malloc(copy_len + 2);
    if (!with_slash) {
      free(copy);
      return NULL;
    }
    memcpy(with_slash, copy, copy_len);
    with_slash[copy_len] = '/';
    with_slash[copy_len + 1] = '\0';
    free(copy);
    copy = with_slash;
  }
  return copy;
}

void inkwell_free_string(char *text) {
  free(text);
}
