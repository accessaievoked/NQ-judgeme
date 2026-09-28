// Compiles an EmailLayout's free-position canvas (`elements`, edited by
// dragging boxes around in app.email-builder.jsx exactly like the review
// widget's visual editor) into table-based, inline-styled HTML safe to
// actually send. No .server suffix on purpose: templates.server.ts (sending)
// and app.email-builder.jsx (client-side live preview) both need it.
//
// Real email clients (Outlook desktop's Word rendering engine especially)
// don't support `position: absolute`, so the canvas's x/y/width/height can't
// be shipped as-is — see this repo's EmailLayout model comment in
// schema.prisma. Instead this walks elements top-to-bottom by `y`, groups
// ones that start at (roughly) the same `y` into one horizontal "band"
// (a single <tr> with one <td> per element, left-padded to approximate each
// element's `x`), and inserts an explicit spacer row between bands sized to
// the vertical gap. This reproduces simple, non-overlapping canvas layouts
// (the overwhelming majority of real emails: a stack of text/image/button
// blocks, sometimes two side by side) faithfully; a design that
// deliberately overlaps elements will visually collapse to whichever
// band-order the compiler picked — the canvas editor warns about this.
export type EmailElement = {
  id: string;
  // "section" is a plain background/border box — a "div" a merchant drops
  // behind a group of other elements (send-to-back already puts it under
  // them) to visually group them into a card/panel; it has no text of its
  // own. "divider" is a thin colored rule — `background` is its line color,
  // `height` its thickness, same fields every other element already has, no
  // new properties needed.
  type: "text" | "image" | "button" | "section" | "divider";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  href?: string;
  src?: string;
  fontSize?: number;
  bold?: boolean;
  underline?: boolean;
  color?: string;
  background?: string;
  textAlign?: "left" | "center" | "right";
  borderRadius?: number;
  padding?: number;
  // Text blocks only — whether this block is a hyperlink at all (a button
  // is always one; an image with `href` set is always clickable too, no
  // separate toggle needed there since there's no non-link "look" to lose).
  isLink?: boolean;
  linkColor?: string;
  // Button blocks only — a short glyph (emoji or unicode symbol, e.g. "→",
  // "✓", "🛒") shown beside the button text. Plain text, not an image, so
  // it survives every email client with zero extra requests/broken-image
  // risk, same reasoning avatar initials use over a real avatar image
  // elsewhere in this app.
  icon?: string;
  iconPosition?: "left" | "right";
  // Raw CSS declarations appended last, same escape-hatch role as the
  // widget editor's "Advanced: custom CSS properties" section — e.g.
  // "letter-spacing:1px;". Sanitized the same way styleCompiler.ts's
  // sanitizeValue is: strip anything that could close the declaration/rule
  // early, since this is spliced directly into a style="" attribute.
  customCss?: string;
};

const BAND_THRESHOLD_PX = 12;

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeCustomCss(css: string | undefined): string {
  if (!css) return "";
  return css.replace(/[{}]/g, "").trim();
}

function textDecorationFor(el: EmailElement): string {
  return el.underline ? "underline" : "none";
}

function elementInnerHtml(el: EmailElement): string {
  const align = el.textAlign ?? "left";
  const padding = el.padding ?? 8;
  const borderRadius = el.borderRadius ?? 0;
  const color = el.color ?? "#1a1a1a";
  const background = el.background ?? "transparent";
  const fontSize = el.fontSize ?? 14;
  const fontWeight = el.bold ? "700" : "400";
  const custom = sanitizeCustomCss(el.customCss);

  if (el.type === "image") {
    const img = `<img src="${el.src ?? ""}" width="${el.width}" alt="" style="display:block;width:${el.width}px;height:${el.height}px;object-fit:cover;border-radius:${borderRadius}px;${custom}" />`;
    return el.href ? `<a href="${el.href}" style="text-decoration:none;">${img}</a>` : img;
  }

  if (el.type === "section") {
    return `<div style="width:${el.width}px;height:${el.height}px;background:${background};border-radius:${borderRadius}px;${custom}"></div>`;
  }

  if (el.type === "divider") {
    return `<div style="width:${el.width}px;height:${el.height}px;background:${background === "transparent" ? "#e1e1e1" : background};font-size:1px;line-height:1px;${custom}">&nbsp;</div>`;
  }

  if (el.type === "button") {
    const btnColor = color === "#1a1a1a" ? "#ffffff" : color;
    const iconHtml = el.icon ? `<span style="${el.iconPosition === "right" ? "margin-left" : "margin-right"}:6px;">${escapeHtml(el.icon)}</span>` : "";
    const label = escapeHtml(el.text ?? "Click here");
    const labelHtml = el.iconPosition === "right" ? `${label}${iconHtml}` : `${iconHtml}${label}`;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="${background === "transparent" ? "#1a1a1a" : background}" style="border-radius:${borderRadius}px;">
        <a href="${el.href ?? "#"}" style="display:inline-block;padding:${padding}px ${padding * 2}px;font-size:${fontSize}px;font-weight:${fontWeight};text-decoration:${textDecorationFor(el)};color:${btnColor};${custom}">${labelHtml}</a>
      </td>
    </tr></table>`;
  }

  // text
  const textStyle = `font-size:${fontSize}px;font-weight:${fontWeight};text-decoration:${textDecorationFor(el)};text-align:${align};padding:${padding}px;background:${background};border-radius:${borderRadius}px;${custom}`;
  if (el.isLink) {
    return `<div style="${textStyle}"><a href="${el.href ?? "#"}" style="color:${el.linkColor ?? color};text-decoration:${textDecorationFor(el)};">${escapeHtml(el.text ?? "")}</a></div>`;
  }
  return `<div style="color:${color};${textStyle}">${escapeHtml(el.text ?? "")}</div>`;
}

export function compileEmailLayoutHtml(elements: EmailElement[], canvasWidth: number): string {
  if (!elements || elements.length === 0) return "";

  const sorted = [...elements].sort((a, b) => a.y - b.y || a.x - b.x);

  const bands: EmailElement[][] = [];
  for (const el of sorted) {
    const band = bands[bands.length - 1];
    if (band && Math.abs(el.y - band[0].y) <= BAND_THRESHOLD_PX) {
      band.push(el);
    } else {
      bands.push([el]);
    }
  }
  bands.forEach((band) => band.sort((a, b) => a.x - b.x));

  const rows: string[] = [];
  let cursorBottom = 0;

  for (const band of bands) {
    const bandTop = Math.min(...band.map((e) => e.y));
    const gap = Math.max(bandTop - cursorBottom, 0);
    if (gap > 0) {
      rows.push(`<tr><td style="height:${gap}px;line-height:1px;font-size:1px;" colspan="${band.length * 2}">&nbsp;</td></tr>`);
    }

    const cells: string[] = [];
    let cursorRight = 0;
    for (const el of band) {
      const leftGap = Math.max(el.x - cursorRight, 0);
      if (leftGap > 0) {
        cells.push(`<td style="width:${leftGap}px;line-height:1px;font-size:1px;">&nbsp;</td>`);
      }
      cells.push(`<td valign="top" style="width:${el.width}px;">${elementInnerHtml(el)}</td>`);
      cursorRight = el.x + el.width;
    }
    rows.push(`<tr>${cells.join("")}</tr>`);

    cursorBottom = Math.max(cursorBottom, ...band.map((e) => e.y + e.height));
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${canvasWidth}" style="width:${canvasWidth}px;max-width:100%;">
${rows.join("\n")}
</table>`;
}
