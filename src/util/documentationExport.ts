import type { DocumentationContent } from "./documentation";
import type { jsPDF } from "jspdf";

type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean; link?: string };
type ParagraphBlock = { kind: "paragraph"; runs: Run[]; heading?: number; indent?: number; marker?: string; code?: boolean; quote?: boolean; caption?: boolean };
type ImageBlock = { kind: "image"; data: string; width: number; height: number; alt: string; caption?: string };
type TableBlock = { kind: "table"; rows: Run[][][]; header: boolean };
type Block = ParagraphBlock | ImageBlock | TableBlock;
type PreparedSection = { title: string; html?: string; blocks: Block[] };
const rasterData = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z\d+/=\s]+$/i;
const safeLink = (href: string) => /^(?:https?:|mailto:)/i.test(href) ? href : undefined;

async function imageBlock(data: string, alt: string, caption?: string): Promise<ImageBlock> {
  if (!rasterData.test(data)) throw new Error(`The image "${alt || "Untitled image"}" must be an embedded PNG, JPEG, GIF or WebP image.`);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The image "${alt}" could not be loaded.`)), 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error(`The image "${alt}" could not be decoded.`)); };
    image.src = data;
  });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error(`The image "${alt}" is empty.`);
  const scale = Math.min(1, 2200 / image.naturalWidth, 2600 / image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot render export images.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { kind: "image", data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, alt, caption };
}

function inlineRuns(node: Node, inherited: Omit<Run, "text"> = {}): Run[] {
  if (node.nodeType === Node.TEXT_NODE) return [{ text: node.textContent || "", ...inherited }];
  if (!(node instanceof Element)) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return [{ text: "\n", ...inherited }];
  if (tag === "img") return [];
  if (tag === "input") return [{ text: node.hasAttribute("checked") ? "[x] " : "[ ] ", ...inherited }];
  const style = {
    ...inherited,
    ...(["b", "strong"].includes(tag) ? { bold: true } : {}),
    ...(["i", "em"].includes(tag) ? { italic: true } : {}),
    ...(tag === "code" ? { code: true } : {}),
    ...(["s", "del"].includes(tag) ? { strike: true } : {}),
    ...(tag === "a" ? { link: safeLink(node.getAttribute("href") || "") } : {}),
  };
  return [...node.childNodes].flatMap(child => inlineRuns(child, style));
}

function trimRuns(runs: Run[]): Run[] {
  const result = runs.map(run => ({ ...run }));
  while (result.length && !result[0].text.trim()) result.shift();
  while (result.length && !result[result.length - 1].text.trim()) result.pop();
  if (result.length) {
    result[0].text = result[0].text.trimStart();
    result[result.length - 1].text = result[result.length - 1].text.trimEnd();
  }
  return result;
}

function blocksFromHtml(root: ParentNode, images: Map<string, ImageBlock>, level = 0): Block[] {
  const blocks: Block[] = [];
  const attachedImages = (node: Element) => [...node.querySelectorAll("img")].flatMap(image => {
    const block = images.get(image.getAttribute("src") || "");
    return block ? [{ ...block, caption: block.alt }] : [];
  });
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) blocks.push({ kind: "paragraph", runs: [{ text: node.textContent }] });
      continue;
    }
    if (!(node instanceof Element)) continue;
    const tag = node.tagName.toLowerCase();
    if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map(row => [...row.children].map(cell => inlineRuns(cell)));
      if (rows.length) blocks.push({ kind: "table", rows, header: Boolean(node.querySelector("thead, th")) });
      blocks.push(...attachedImages(node));
    } else if (tag === "ul" || tag === "ol") {
      let index = Number(node.getAttribute("start")) || 1;
      for (const item of [...node.children]) {
        if (item.tagName !== "LI") continue;
        const copy = item.cloneNode(true) as Element;
        const nested = [...copy.children].filter(child => ["UL", "OL"].includes(child.tagName));
        nested.forEach(child => child.remove());
        const paragraphs = [...copy.children].filter(child => child.tagName === "P");
        const items = paragraphs.length ? paragraphs.map(child => inlineRuns(child)) : [inlineRuns(copy)];
        items.forEach((runs, itemIndex) => blocks.push({ kind: "paragraph", runs: trimRuns(runs), indent: level + 1, marker: itemIndex === 0 ? tag === "ol" ? `${index}.` : "•" : undefined }));
        blocks.push(...attachedImages(copy));
        index += 1;
        for (const child of nested) {
          const wrapper = document.createElement("template");
          wrapper.content.append(child);
          blocks.push(...blocksFromHtml(wrapper.content, images, level + 1));
        }
      }
    } else if (tag === "blockquote") {
      blocks.push(...blocksFromHtml(node, images, level).map(block => block.kind === "paragraph" ? { ...block, quote: true, indent: level + 1 } : block));
    } else if (tag === "pre") {
      blocks.push({ kind: "paragraph", runs: [{ text: node.textContent || "", code: true }], code: true });
    } else if (tag === "hr") {
      blocks.push({ kind: "paragraph", runs: [{ text: " " }] });
    } else if (/^(?:p|h[1-6])$/.test(tag)) {
      const foundImages = [...node.querySelectorAll("img")];
      const runs = inlineRuns(node);
      if (runs.some(run => run.text.trim())) blocks.push({ kind: "paragraph", runs, heading: tag.startsWith("h") ? Number(tag.slice(1)) : undefined });
      for (const image of foundImages) {
        const block = images.get(image.getAttribute("src") || "");
        if (block) blocks.push(block);
      }
    } else {
      blocks.push(...blocksFromHtml(node, images, level));
    }
  }
  return blocks;
}

async function prepare(content: DocumentationContent): Promise<PreparedSection[]> {
  const [{ markdownToEditorHtml }, { exportBoardImage }] = await Promise.all([
    import("@sunaissu/document-editor"), import("@sunaissu/noteboard"),
  ]);
  const prepared: PreparedSection[] = [];
  for (const section of content.sections) {
    if (section.type === "text") {
      // Template contents remain inert: linked images are never put in the live DOM.
      const template = document.createElement("template");
      template.innerHTML = markdownToEditorHtml(section.content);
      const images = new Map<string, ImageBlock>();
      for (const image of [...template.content.querySelectorAll("img")]) {
        const source = image.getAttribute("src") || "";
        const alt = image.getAttribute("alt") || "Image";
        if (rasterData.test(source)) {
          const block = await imageBlock(source, alt);
          images.set(block.data, block);
          image.setAttribute("src", block.data);
          const scale = Math.min(1, 650 / block.width, 700 / block.height);
          image.setAttribute("width", String(Math.round(block.width * scale)));
          image.setAttribute("height", String(Math.round(block.height * scale)));
        } else {
          const placeholder = document.createElement("span");
          placeholder.textContent = `[Image: ${alt}. External image not included${safeLink(source) ? `: ${source}` : "."}]`;
          image.replaceWith(placeholder);
        }
      }
      prepared.push({ title: section.title, html: template.innerHTML, blocks: blocksFromHtml(template.content, images) });
    } else {
      for (const element of section.elements) {
        if (element.type === "image" && !element.isDeleted && !element.hidden && !rasterData.test(element.dataUrl || "")) {
          throw new Error(`The board "${section.title || "Untitled board"}" contains an image that has not been embedded. Add the image to the board before exporting.`);
        }
      }
      const visible = section.elements.some(element => !element.isDeleted && !element.hidden);
      const blocks: Block[] = visible ? [await imageBlock(await exportBoardImage(section.elements, "png", { background: "#ffffff", padding: 24, scale: 2 }), section.title || "Board", section.caption)] : [{ kind: "paragraph", runs: [{ text: "Empty board", italic: true }] }];
      if (!visible && section.caption) blocks.push({ kind: "paragraph", runs: [{ text: section.caption }], caption: true });
      prepared.push({ title: section.title, blocks });
    }
  }
  return prepared;
}

async function createWord(sections: PreparedSection[], title: string): Promise<Blob> {
  const [word, { htmlToContent }] = await Promise.all([import("docx"), import("docx/html")]);
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Footer, PageNumber } = word;
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof word.Table>)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 320 }, keepNext: true }),
  ];
  for (const section of sections) {
    if (section.title) children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 240, after: 160 } }));
    if (section.html !== undefined) {
      children.push(...htmlToContent(section.html, {
        maxImageWidth: 650,
        stylesheet: "p { margin: 0 0 8pt; } h1,h2,h3,h4,h5,h6 { color: #111827; page-break-after: avoid; } table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10pt; } td,th { border: 0.5pt solid #cbd5e1; padding: 6pt; } th { background-color: #eef2f6; font-weight: bold; } pre { font-family: Courier New; font-size: 9pt; white-space: pre-wrap; background-color: #f3f4f6; } blockquote { margin-left: 18pt; color: #475569; }",
      }));
    } else {
      for (const block of section.blocks) {
        if (block.kind === "image") {
          const scale = Math.min(650 / block.width, 700 / block.height, 1);
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: Boolean(block.caption), children: [new ImageRun({ type: "png", data: block.data, transformation: { width: Math.round(block.width * scale), height: Math.round(block.height * scale) }, altText: { title: block.alt, description: block.caption || block.alt, name: block.alt } })] }));
          if (block.caption) children.push(new Paragraph({ children: [new TextRun({ text: block.caption, italics: true, size: 19, color: "475569" })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
        } else if (block.kind === "paragraph") {
          children.push(new Paragraph({ children: block.runs.map(run => new TextRun({ text: run.text, italics: Boolean(run.italic || block.caption) })) }));
        }
      }
    }
  }
  const document = new Document({
    title, creator: "ThyncSpace", description: "Documentation exported from ThyncSpace",
    features: { updateFields: true },
    styles: { default: {
      document: { run: { font: "Arial", size: 22, color: "111827" }, paragraph: { spacing: { after: 160, line: 276 } } },
      title: { run: { font: "Arial", size: 48, bold: true, color: "111827" } },
      heading1: { run: { font: "Arial", size: 32, bold: true, color: "111827" }, paragraph: { keepNext: true } },
      heading2: { run: { font: "Arial", size: 27, bold: true, color: "111827" }, paragraph: { keepNext: true } },
      heading3: { run: { font: "Arial", size: 24, bold: true, color: "111827" }, paragraph: { keepNext: true } },
    } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080, footer: 480 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 18, color: "64748b" })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(document);
}

type PdfPiece = Run & { width: number };
function pdfFont(pdf: jsPDF, run: Run, size: number) {
  pdf.setFont(run.code ? "courier" : "helvetica", run.bold && run.italic ? "bolditalic" : run.bold ? "bold" : run.italic ? "italic" : "normal");
  pdf.setFontSize(size);
}
// jsPDF's built-in fonts cannot encode every script. Canvas keeps those words
// legible without fetching fonts or sending private content to another service.
const needsGlyphImage = (text: string) => /[^\u0020-\u00ff\u2022\u2013\u2014\u2018\u2019\u201c\u201d\u2026]/u.test(text);
function glyphCanvas(run: Run, size: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot render PDF text.");
  const font = `${run.italic ? "italic " : ""}${run.bold ? "bold " : ""}${size * 3}px ${run.code ? "monospace" : "Arial, sans-serif"}`;
  context.font = font;
  const width = context.measureText(run.text).width;
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.ceil(size * 4.5);
  context.font = font;
  context.fillStyle = run.link ? "#1d4ed8" : "#111827";
  context.fillText(run.text, 0, size * 3);
  return { canvas, width: width / 3 };
}
function textWidth(pdf: jsPDF, run: Run, size: number) {
  pdfFont(pdf, run, size);
  return needsGlyphImage(run.text) ? glyphCanvas(run, size).width : pdf.getTextWidth(run.text);
}
function wrapRuns(pdf: jsPDF, runs: Run[], width: number, size: number): PdfPiece[][] {
  const lines: PdfPiece[][] = [[]];
  let used = 0;
  const append = (run: Run) => {
    const partWidth = textWidth(pdf, run, size);
    if (used && used + partWidth > width) { lines.push([]); used = 0; }
    if (!used && /^ +$/.test(run.text)) return;
    lines[lines.length - 1].push({ ...run, width: partWidth });
    used += partWidth;
  };
  for (const run of runs) {
    for (const part of run.text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split(/(\n| +)/)) {
      if (!part) continue;
      if (part === "\n") { lines.push([]); used = 0; continue; }
      if (textWidth(pdf, { ...run, text: part }, size) > width) {
        for (const character of Array.from(part)) append({ ...run, text: character });
      } else append({ ...run, text: part });
    }
  }
  return lines;
}

async function createPdf(sections: PreparedSection[], title: string): Promise<Blob> {
  const { jsPDF: Pdf } = await import("jspdf");
  const pdf = new Pdf({ unit: "pt", format: "a4", compress: true });
  pdf.setProperties({ title, creator: "ThyncSpace" });
  const margin = 54, width = pdf.internal.pageSize.getWidth() - margin * 2, bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;
  const nextPage = () => { pdf.addPage(); y = margin; };
  const room = (height: number) => { if (y + height > bottom) nextPage(); };
  const drawLine = (line: PdfPiece[], x: number, baseline: number, size: number) => {
    for (const piece of line) {
      pdfFont(pdf, piece, size);
      pdf.setTextColor(piece.link ? "#1d4ed8" : "#111827");
      if (needsGlyphImage(piece.text)) {
        const { canvas } = glyphCanvas(piece, size);
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, baseline - size, canvas.width / 3, canvas.height / 3);
      } else pdf.text(piece.text, x, baseline);
      if (piece.link) pdf.link(x, baseline - size, piece.width, size * 1.3, { url: piece.link });
      if (piece.strike) { pdf.setDrawColor("#111827"); pdf.line(x, baseline - size * 0.3, x + piece.width, baseline - size * 0.3); }
      x += piece.width;
    }
  };
  const paragraph = (block: ParagraphBlock, sizeOverride?: number) => {
    const size = sizeOverride || (block.heading ? Math.max(11, 19 - block.heading * 1.5) : block.code || block.caption ? 9.5 : 11);
    const height = size * 1.4, indent = Math.min(block.indent || 0, 8) * 16;
    const runs = block.runs.map(run => ({ ...run, bold: run.bold || Boolean(block.heading), italic: run.italic || block.caption, code: run.code || block.code }));
    if (block.heading) { y += 8; room(height * 3); }
    const lines = wrapRuns(pdf, runs, width - indent, size);
    lines.forEach((line, index) => {
      room(height);
      if (block.marker && index === 0) drawLine([{ text: block.marker, width: 0 }], margin + indent - textWidth(pdf, { text: block.marker }, size) - 6, y + size, size);
      drawLine(line, margin + indent, y + size, size);
      y += height;
    });
    y += block.marker ? 3 : 8;
  };
  paragraph({ kind: "paragraph", runs: [{ text: title, bold: true }] }, 24);
  y += 8;
  for (const section of sections) {
    const first = section.blocks[0];
    if (section.title && first?.kind === "image") {
      const imageHeight = first.height * Math.min(width / first.width, 510 / first.height, 1);
      const captionHeight = first.caption ? wrapRuns(pdf, [{ text: first.caption }], width, 9.5).length * 13.3 + 8 : 0;
      room(Math.min(bottom - margin, imageHeight + captionHeight + 62));
    }
    if (section.title) paragraph({ kind: "paragraph", runs: [{ text: section.title }], heading: 1 });
    for (const block of section.blocks) {
      if (block.kind === "paragraph") paragraph(block);
      else if (block.kind === "image") {
        const scale = Math.min(width / block.width, 510 / block.height, 1);
        const imageWidth = block.width * scale, imageHeight = block.height * scale;
        const captionHeight = block.caption ? wrapRuns(pdf, [{ text: block.caption }], width, 9.5).length * 13.3 + 8 : 0;
        room(imageHeight + captionHeight + 10);
        pdf.addImage(block.data, "PNG", margin + (width - imageWidth) / 2, y, imageWidth, imageHeight);
        y += imageHeight + 10;
        if (block.caption) paragraph({ kind: "paragraph", runs: [{ text: block.caption }], caption: true });
      } else {
        const columns = Math.max(...block.rows.map(row => row.length));
        const cellWidth = width / columns, size = 9, lineHeight = 12.5, padding = 6;
        const rowLines = block.rows.map((row, index) => Array.from({ length: columns }, (_, column) => wrapRuns(pdf, (row[column] || []).map(run => ({ ...run, bold: run.bold || (block.header && index === 0) })), cellWidth - padding * 2, size)));
        const drawRow = (cells: PdfPiece[][][], start: number, count: number, header: boolean) => {
          const height = count * lineHeight + padding * 2;
          cells.forEach((lines, column) => {
            pdf.setDrawColor("#cbd5e1"); pdf.setLineWidth(0.5); pdf.setFillColor(header ? "#eef2f6" : "#ffffff");
            pdf.rect(margin + column * cellWidth, y, cellWidth, height, "FD");
            lines.slice(start, start + count).forEach((line, index) => drawLine(line, margin + column * cellWidth + padding, y + padding + size + index * lineHeight, size));
          });
          y += height;
        };
        for (let index = 0; index < rowLines.length; index++) {
          const cells = rowLines[index], total = Math.max(1, ...cells.map(lines => lines.length));
          let offset = 0;
          while (offset < total) {
            if (bottom - y < lineHeight + padding * 2) {
              nextPage();
              if (block.header && index > 0) {
                const headerLines = Math.max(...rowLines[0].map(lines => lines.length));
                if (headerLines * lineHeight + padding * 2 < (bottom - margin) / 3) drawRow(rowLines[0], 0, headerLines, true);
              }
            }
            const count = Math.min(total - offset, Math.max(1, Math.floor((bottom - y - padding * 2) / lineHeight)));
            drawRow(cells, offset, count, block.header && index === 0);
            offset += count;
          }
        }
        y += 12;
      }
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor("#64748b");
    pdf.text(`Page ${page} of ${pages}`, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 28, { align: "center" });
  }
  return pdf.output("blob");
}

/** Returns a local export; the caller owns downloading it and showing failures. */
export async function exportDocumentation(content: DocumentationContent, title: string, format: "docx" | "pdf"): Promise<Blob> {
  // Take the complete revision before importing libraries or rendering any image.
  const snapshot = structuredClone(content);
  const exportTitle = title.trim() || "Untitled documentation";
  if (snapshot.format !== "thyncspace-documentation" || snapshot.version !== 1 || !Array.isArray(snapshot.sections)) throw new Error("This documentation format cannot be exported.");
  if (format !== "docx" && format !== "pdf") throw new Error("Choose Word or PDF for the export.");
  const sections = await prepare(snapshot);
  return format === "docx" ? createWord(sections, exportTitle) : createPdf(sections, exportTitle);
}
