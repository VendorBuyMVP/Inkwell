import { Markdown } from "@tiptap/markdown";
import { TextAlign } from "@tiptap/extension-text-align";
import { FontSize, LineHeight, TextStyleKit } from "@tiptap/extension-text-style";

const ALIGNMENTS = ["left", "center", "right", "justify"];

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.min(Math.max(number, min), max);
}

function normalizeFontSizePx(value) {
  const clamped = clampNumber(value, 5, 72);
  return clamped === null ? null : String(Math.round(clamped));
}

function normalizeLineHeight(value) {
  const clamped = clampNumber(value, 0.8, 3);
  return clamped === null ? null : String(Math.round(clamped * 100) / 100);
}

function normalizeParagraphSpacingEm(value) {
  const clamped = clampNumber(value, 0, 3);
  return clamped === null ? null : String(Math.round(clamped * 100) / 100);
}

function normalizeTextAlign(value) {
  const align = String(value || "").trim().toLowerCase();
  return ALIGNMENTS.includes(align) ? align : "";
}

window.InkwellEditorEngine = Object.freeze({
  source: "Tiptap 3.26.0 TextStyleKit, TextAlign, and Markdown",
  extensions: Object.freeze({
    markdown: Markdown.name,
    textAlign: TextAlign.name,
    textStyleKit: TextStyleKit.name,
    fontSize: FontSize.name,
    lineHeight: LineHeight.name,
  }),
  normalizeFontSizePx,
  normalizeLineHeight,
  normalizeParagraphSpacingEm,
  normalizeTextAlign,
});
