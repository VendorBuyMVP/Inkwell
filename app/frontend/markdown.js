(function attachMarkdown(global) {
  "use strict";

  const MAX_HEADING_ID_LENGTH = 80;

  function normalizeSource(source) {
    return String(source || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u0000/g, "");
  }

  function parseMarkdown(source) {
    const lines = normalizeSource(source).split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (isBlank(line)) {
        index += 1;
        continue;
      }

      const richBlock = parseRichBlock(line);
      if (richBlock) {
        blocks.push(richBlock);
        index += 1;
        continue;
      }

      const fence = line.match(/^\s{0,3}(```+|~~~+)\s*([A-Za-z0-9_.-]*)\s*$/);
      if (fence) {
        const marker = fence[1];
        const language = fence[2] || "";
        const codeLines = [];
        index += 1;

        while (index < lines.length && !isClosingFence(lines[index], marker)) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) {
          index += 1;
        }

        blocks.push({ type: "code", language, text: codeLines.join("\n") });
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})(?:\s+(.*))?$/);
      if (heading) {
        const headingText = (heading[2] || "").replace(/\s+#+\s*$/, "").trim();
        const children = parseInline(headingText);
        blocks.push({
          type: "heading",
          level: heading[1].length,
          id: slugify(plainText(children)),
          children,
        });
        index += 1;
        continue;
      }

      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        blocks.push({ type: "hr" });
        index += 1;
        continue;
      }

      const table = parseTable(lines, index);
      if (table) {
        blocks.push(table.block);
        index = table.nextIndex;
        continue;
      }

      if (/^\s{0,3}>\s?/.test(line)) {
        const quoteLines = [];
        while (index < lines.length && (/^\s{0,3}>\s?/.test(lines[index]) || isBlank(lines[index]))) {
          quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
          index += 1;
        }
        blocks.push({ type: "blockquote", blocks: parseMarkdown(quoteLines.join("\n")) });
        continue;
      }

      const list = parseList(lines, index);
      if (list) {
        blocks.push(list.block);
        index = list.nextIndex;
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index])) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      if (!paragraphLines.length) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      blocks.push({ type: "paragraph", children: parseInline(paragraphLines.join(" ")) });
    }

    return blocks;
  }

  function parseTable(lines, startIndex) {
    if (startIndex + 1 >= lines.length || !lines[startIndex].includes("|")) {
      return null;
    }

    const headers = splitTableCells(lines[startIndex]);
    const delimiter = splitTableCells(lines[startIndex + 1]);
    if (!headers.length || delimiter.length < headers.length || !delimiter.every(isTableDelimiter)) {
      return null;
    }

    const align = delimiter.slice(0, headers.length).map((cell) => {
      const trimmed = cell.trim();
      const left = trimmed.startsWith(":");
      const right = trimmed.endsWith(":");
      if (left && right) {
        return "center";
      }
      if (right) {
        return "right";
      }
      return left ? "left" : "";
    });
    const rows = [];
    let index = startIndex + 2;

    while (index < lines.length && !isBlank(lines[index]) && lines[index].includes("|")) {
      rows.push(padTableCells(splitTableCells(lines[index]), headers.length).map(parseInline));
      index += 1;
    }

    return {
      block: {
        type: "table",
        align,
        headers: padTableCells(headers, headers.length).map(parseInline),
        rows,
      },
      nextIndex: index,
    };
  }

  function splitTableCells(line) {
    let text = String(line || "").trim();
    if (text.startsWith("|")) {
      text = text.slice(1);
    }
    if (text.endsWith("|") && !text.endsWith("\\|")) {
      text = text.slice(0, -1);
    }

    const cells = [];
    let cell = "";
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "\\" && text[index + 1] === "|") {
        cell += "|";
        index += 1;
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

  function padTableCells(cells, length) {
    const padded = cells.slice(0, length);
    while (padded.length < length) {
      padded.push("");
    }
    return padded;
  }

  function isTableDelimiter(cell) {
    return /^:?-{3,}:?$/.test(cell.trim());
  }

  function parseList(lines, startIndex) {
    const first = matchListItem(lines[startIndex]);
    if (!first) {
      return null;
    }

    const ordered = first.ordered;
    const items = [];
    let index = startIndex;

    while (index < lines.length) {
      const match = matchListItem(lines[index]);
      if (!match || match.ordered !== ordered) {
        break;
      }

      const task = match.text.match(/^\[( |x|X)\]\s+(.+)$/);
      const checked = task ? task[1].toLowerCase() === "x" : null;
      const text = task ? task[2] : match.text;
      items.push({ checked, children: parseInline(text) });
      index += 1;
    }

    return {
      block: { type: "list", ordered, items },
      nextIndex: index,
    };
  }

  function matchListItem(line) {
    const unordered = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    if (unordered) {
      return { ordered: false, text: unordered[1] };
    }

    const ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (ordered) {
      return { ordered: true, text: ordered[1] };
    }

    return null;
  }

  function startsBlock(line) {
    return Boolean(
      line.match(/^\s{0,3}(```+|~~~+)\s*([A-Za-z0-9_.-]*)\s*$/) ||
        line.match(/^\s{0,3}#{1,6}(?:\s+|$)/) ||
        line.match(/^\s{0,3}>\s?/) ||
        line.match(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/) ||
        matchListItem(line)
    );
  }

  function isBlank(line) {
    return /^\s*$/.test(line);
  }

  function isClosingFence(line, marker) {
    const escaped = marker[0] === "`" ? "`" : "~";
    const expression = new RegExp("^\\s{0,3}" + escaped + "{" + marker.length + ",}\\s*$");
    return expression.test(line);
  }

  function parseInline(source) {
    const text = String(source || "");
    const nodes = [];
    let index = 0;

    while (index < text.length) {
      const richSpan = parseRichSpan(text.slice(index));
      if (richSpan) {
        nodes.push(richSpan.node);
        index += richSpan.length;
        continue;
      }

      if (text[index] === "`") {
        const close = text.indexOf("`", index + 1);
        if (close > index + 1) {
          nodes.push({ type: "code", text: text.slice(index + 1, close) });
          index = close + 1;
          continue;
        }
      }

      if (text.startsWith("**", index)) {
        const close = text.indexOf("**", index + 2);
        if (close > index + 2) {
          nodes.push({ type: "strong", children: parseInline(text.slice(index + 2, close)) });
          index = close + 2;
          continue;
        }
      }

      if (text.startsWith("~~", index)) {
        const close = text.indexOf("~~", index + 2);
        if (close > index + 2) {
          nodes.push({ type: "strikethrough", children: parseInline(text.slice(index + 2, close)) });
          index = close + 2;
          continue;
        }
      }

      if (text[index] === "*") {
        const close = text.indexOf("*", index + 1);
        if (close > index + 1) {
          nodes.push({ type: "emphasis", children: parseInline(text.slice(index + 1, close)) });
          index = close + 1;
          continue;
        }
      }

      if (text[index] === "[") {
        const closeLabel = text.indexOf("]", index + 1);
        const openTarget = closeLabel >= 0 ? text.indexOf("(", closeLabel) : -1;
        const closeTarget = openTarget >= 0 ? text.indexOf(")", openTarget + 1) : -1;

        if (closeLabel > index + 1 && openTarget === closeLabel + 1 && closeTarget > openTarget + 1) {
          const label = text.slice(index + 1, closeLabel);
          const href = sanitizeHref(text.slice(openTarget + 1, closeTarget));

          if (href) {
            nodes.push({ type: "link", href, children: parseInline(label) });
          } else {
            nodes.push({ type: "text", text: text.slice(index, closeTarget + 1) });
          }

          index = closeTarget + 1;
          continue;
        }
      }

      const next = findNextInlineMarker(text, index + 1);
      nodes.push({ type: "text", text: text.slice(index, next) });
      index = next;
    }

    return mergeTextNodes(nodes);
  }

  function findNextInlineMarker(text, start) {
    const positions = ["`", "*", "[", "~~", "<span"]
      .map((marker) => text.indexOf(marker, start))
      .filter((position) => position >= 0);
    return positions.length ? Math.min(...positions) : text.length;
  }

  function mergeTextNodes(nodes) {
    const merged = [];
    for (const node of nodes) {
      const previous = merged[merged.length - 1];
      if (node.type === "text" && previous && previous.type === "text") {
        previous.text += node.text;
      } else if (node.type === "text" && node.text === "") {
        continue;
      } else {
        merged.push(node);
      }
    }
    return merged;
  }

  function sanitizeHref(rawHref) {
    const href = String(rawHref || "").trim();
    if (!href || /[\u0000-\u001f\u007f\s]/.test(href)) {
      return null;
    }

    if (href.startsWith("#") && href.length > 1) {
      return href;
    }

    try {
      const parsed = new URL(href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
        return parsed.href;
      }
    } catch (_error) {
      return null;
    }

    return null;
  }

  function renderMarkdown(source, root, documentRef) {
    const doc = documentRef || root.ownerDocument || document;
    const blocks = parseMarkdown(source);
    root.replaceChildren(...blocks.map((block) => renderBlock(block, doc)));
  }

  function renderInline(source, root, documentRef) {
    const doc = documentRef || root.ownerDocument || document;
    root.replaceChildren();
    appendInline(root, parseInline(source), doc);
  }

  function renderBlock(block, doc) {
    if (block.type === "heading") {
      const heading = doc.createElement("h" + block.level);
      if (block.id) {
        heading.id = block.id;
      }
      applyRichStyle(heading, block.richStyle);
      appendInline(heading, block.children, doc);
      return heading;
    }

    if (block.type === "paragraph") {
      const paragraph = doc.createElement("p");
      applyRichStyle(paragraph, block.richStyle);
      appendInline(paragraph, block.children, doc);
      return paragraph;
    }

    if (block.type === "code") {
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      if (block.language) {
        code.dataset.language = block.language;
      }
      code.textContent = block.text;
      pre.append(code);
      return pre;
    }

    if (block.type === "blockquote") {
      const quote = doc.createElement("blockquote");
      applyRichStyle(quote, block.richStyle);
      quote.append(...block.blocks.map((child) => renderBlock(child, doc)));
      return quote;
    }

    if (block.type === "list") {
      const list = doc.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) {
        const li = doc.createElement("li");
        if (item.checked !== null) {
          li.className = "task-list-item";
          const checkbox = doc.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = item.checked;
          checkbox.disabled = true;
          li.append(checkbox);
        }
        appendInline(li, item.children, doc);
        list.append(li);
      }
      return list;
    }

    if (block.type === "table") {
      const table = doc.createElement("table");
      const thead = doc.createElement("thead");
      const headRow = doc.createElement("tr");
      const tbody = doc.createElement("tbody");

      block.headers.forEach((cell, index) => {
        const th = doc.createElement("th");
        setTableAlign(th, block.align[index]);
        appendInline(th, cell, doc);
        headRow.append(th);
      });

      for (const row of block.rows) {
        const tr = doc.createElement("tr");
        row.forEach((cell, index) => {
          const td = doc.createElement("td");
          setTableAlign(td, block.align[index]);
          appendInline(td, cell, doc);
          tr.append(td);
        });
        tbody.append(tr);
      }

      thead.append(headRow);
      table.append(thead, tbody);
      return table;
    }

    return doc.createElement("hr");
  }

  function setTableAlign(cell, align) {
    if (!align) {
      return;
    }
    cell.dataset.align = align;
    cell.style.textAlign = align;
  }

  function appendInline(parent, nodes, doc) {
    for (const node of nodes) {
      if (node.type === "text") {
        parent.append(doc.createTextNode(node.text));
      } else if (node.type === "code") {
        const code = doc.createElement("code");
        code.textContent = node.text;
        parent.append(code);
      } else if (node.type === "strong") {
        const strong = doc.createElement("strong");
        appendInline(strong, node.children, doc);
        parent.append(strong);
      } else if (node.type === "emphasis") {
        const emphasis = doc.createElement("em");
        appendInline(emphasis, node.children, doc);
        parent.append(emphasis);
      } else if (node.type === "strikethrough") {
        const strike = doc.createElement("s");
        appendInline(strike, node.children, doc);
        parent.append(strike);
      } else if (node.type === "link") {
        const link = doc.createElement("a");
        link.href = node.href;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        appendInline(link, node.children, doc);
        parent.append(link);
      } else if (node.type === "richSpan") {
        const span = doc.createElement("span");
        applyRichStyle(span, node.richStyle);
        appendInline(span, node.children, doc);
        parent.append(span);
      }
    }
  }

  function parseRichBlock(line) {
    const match = String(line || "").match(/^<(p|h[1-6]|blockquote)\s+style="([^"]*)">([\s\S]*)<\/\1>$/i);
    if (!match) {
      return null;
    }
    const tag = match[1].toLowerCase();
    const richStyle = parseRichStyle(match[2]);
    if (!richStyle) {
      return null;
    }
    const children = parseInline(match[3]);
    if (tag === "blockquote") {
      return { type: "blockquote", richStyle, blocks: [{ type: "paragraph", children }] };
    }
    if (/^h[1-6]$/.test(tag)) {
      return {
        type: "heading",
        level: Number(tag[1]),
        id: slugify(plainText(children)),
        richStyle,
        children,
      };
    }
    return { type: "paragraph", richStyle, children };
  }

  function parseRichSpan(source) {
    const match = String(source || "").match(/^<span\s+style="([^"]*)">([\s\S]*?)<\/span>/i);
    if (!match) {
      return null;
    }
    const richStyle = parseRichStyle(match[1]);
    if (!richStyle || !richStyle.fontSize) {
      return null;
    }
    return {
      length: match[0].length,
      node: {
        type: "richSpan",
        richStyle,
        children: parseInline(match[2]),
      },
    };
  }

  function parseRichStyle(rawStyle) {
    const style = {};
    const declarations = String(rawStyle || "").split(";");
    for (const declaration of declarations) {
      const [rawName, ...rawValueParts] = declaration.split(":");
      const name = String(rawName || "").trim().toLowerCase();
      const value = rawValueParts.join(":").trim().toLowerCase();
      if (!name || !value || /url\s*\(|expression\s*\(|var\s*\(/i.test(value)) {
        continue;
      }
      if (name === "font-size") {
        const match = value.match(/^([0-9]+(?:\.[0-9]+)?)px$/);
        if (match) {
          const fontSize = clampNumber(Number(match[1]), 5, 72);
          style.fontSize = String(Math.round(fontSize));
        }
      } else if (name === "line-height") {
        const match = value.match(/^([0-9]+(?:\.[0-9]+)?)$/);
        if (match) {
          style.lineHeight = String(Math.round(clampNumber(Number(match[1]), 0.8, 3) * 100) / 100);
        }
      } else if (name === "margin-top" || name === "margin-bottom") {
        const match = value.match(/^([0-9]+(?:\.[0-9]+)?)em$/);
        if (match) {
          style.paragraphSpacing = String(Math.round(clampNumber(Number(match[1]), 0, 3) * 100) / 100);
        }
      } else if (name === "text-align") {
        if (value === "center" || value === "right" || value === "justify" || value === "left") {
          style.textAlign = value;
        }
      }
    }
    return Object.keys(style).length ? style : null;
  }

  function applyRichStyle(element, richStyle) {
    if (!richStyle) {
      return;
    }
    if (richStyle.fontSize) {
      element.dataset.fontSize = richStyle.fontSize;
      element.style.fontSize = richStyle.fontSize + "px";
    }
    if (richStyle.lineHeight) {
      element.dataset.lineHeight = richStyle.lineHeight;
      element.style.lineHeight = richStyle.lineHeight;
    }
    if (richStyle.paragraphSpacing) {
      element.dataset.paragraphSpacing = richStyle.paragraphSpacing;
      element.style.marginTop = richStyle.paragraphSpacing + "em";
      element.style.marginBottom = richStyle.paragraphSpacing + "em";
    }
    if (richStyle.textAlign && richStyle.textAlign !== "left") {
      element.dataset.textAlign = richStyle.textAlign;
      element.style.textAlign = richStyle.textAlign;
    }
  }

  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function plainText(nodes) {
    return nodes
      .map((node) => {
        if (node.type === "text" || node.type === "code") {
          return node.text;
        }
        return plainText(node.children || []);
      })
      .join("");
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, MAX_HEADING_ID_LENGTH);
  }

  const api = {
    parseInline,
    parseMarkdown,
    plainText,
    renderInline,
    renderMarkdown,
    sanitizeHref,
    slugify,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.InkwellMarkdown = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
