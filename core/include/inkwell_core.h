#ifndef INKWELL_CORE_H
#define INKWELL_CORE_H

#include <stddef.h>

#define INKWELL_MAX_DOCUMENT_BYTES (25u * 1024u * 1024u)

#ifdef __cplusplus
extern "C" {
#endif

typedef struct InkwellDocument InkwellDocument;

typedef struct InkwellSelection {
  size_t start;
  size_t end;
} InkwellSelection;

typedef enum InkwellAlignment {
  INKWELL_ALIGN_NONE = 0,
  INKWELL_ALIGN_LEFT = 1,
  INKWELL_ALIGN_CENTER = 2,
  INKWELL_ALIGN_RIGHT = 3
} InkwellAlignment;

typedef enum InkwellStatus {
  INKWELL_OK = 0,
  INKWELL_ERR_INVALID_ARGUMENT = 1,
  INKWELL_ERR_OUT_OF_MEMORY = 2,
  INKWELL_ERR_NOT_FOUND = 3
} InkwellStatus;

typedef struct InkwellMarkdownStats {
  size_t headings;
  size_t paragraphs;
  size_t blockquotes;
  size_t lists;
  size_t task_items;
  size_t tables;
  size_t code_blocks;
  size_t horizontal_rules;
  size_t links;
  size_t unsafe_links;
} InkwellMarkdownStats;

typedef struct InkwellTableCell {
  size_t table_start_line;
  size_t table_end_line;
  size_t delimiter_line;
  size_t line_index;
  size_t column_index;
  size_t column_count;
} InkwellTableCell;

const char *inkwell_core_version(void);

InkwellStatus inkwell_markdown_analyze(const char *text, size_t len, InkwellMarkdownStats *out);

InkwellDocument *inkwell_document_new(void);
void inkwell_document_free(InkwellDocument *doc);

InkwellStatus inkwell_document_load_markdown(InkwellDocument *doc, const char *text, size_t len);
InkwellStatus inkwell_document_to_markdown(const InkwellDocument *doc, char **out, size_t *out_len);
const char *inkwell_document_text(const InkwellDocument *doc);
size_t inkwell_document_length(const InkwellDocument *doc);
int inkwell_document_is_dirty(const InkwellDocument *doc);
void inkwell_document_mark_saved(InkwellDocument *doc);

InkwellStatus inkwell_document_apply_heading(InkwellDocument *doc, InkwellSelection selection, int level);
InkwellStatus inkwell_document_apply_paragraph(InkwellDocument *doc, InkwellSelection selection);
InkwellStatus inkwell_document_apply_bold(InkwellDocument *doc, InkwellSelection selection);
InkwellStatus inkwell_document_apply_italic(InkwellDocument *doc, InkwellSelection selection);
InkwellStatus inkwell_document_apply_strikethrough(InkwellDocument *doc, InkwellSelection selection);
InkwellStatus inkwell_document_apply_inline_code(InkwellDocument *doc, InkwellSelection selection);
InkwellStatus inkwell_document_insert_code_block(InkwellDocument *doc, InkwellSelection selection, const char *language);
InkwellStatus inkwell_document_insert_horizontal_rule(InkwellDocument *doc, InkwellSelection selection);
InkwellStatus inkwell_document_insert_table(InkwellDocument *doc, InkwellSelection selection, int rows, int cols);

InkwellStatus inkwell_document_insert_table_row(InkwellDocument *doc, size_t line_index, int after);
InkwellStatus inkwell_document_delete_table_row(InkwellDocument *doc, size_t line_index);
InkwellStatus inkwell_document_insert_table_column(InkwellDocument *doc, size_t line_index, size_t column_index, int after);
InkwellStatus inkwell_document_delete_table_column(InkwellDocument *doc, size_t line_index, size_t column_index);
InkwellStatus inkwell_document_delete_table(InkwellDocument *doc, size_t line_index);
InkwellStatus inkwell_document_normalize_table(InkwellDocument *doc, size_t line_index);
InkwellStatus inkwell_document_set_table_column_alignment(
    InkwellDocument *doc,
    size_t line_index,
    size_t column_index,
    InkwellAlignment align);
InkwellStatus inkwell_document_table_cell_at(
    const InkwellDocument *doc,
    size_t line_index,
    size_t column_index,
    InkwellTableCell *out);

InkwellStatus inkwell_document_undo(InkwellDocument *doc);
InkwellStatus inkwell_document_redo(InkwellDocument *doc);

char *inkwell_slugify(const char *text);
char *inkwell_sanitize_href(const char *href);
void inkwell_free_string(char *text);

#ifdef __cplusplus
}
#endif

#endif
