// Shared shapes for the widget's section/block modules (reviewWidget/sections/*).
// Nothing here is server-only or DB-shaped on purpose — the same modules
// drive the admin editor's client-side preview (app.widget-editor.jsx) and
// the storefront's server-side render (apps.reviews.jsx), and the *output*
// of all of it is still just plain html/css/styleBlocks saved to
// WidgetTheme (see styleBlocks/renderTemplate) — sections are a way to
// organize the source code that produces that output, not a new storage
// format.
//
// Each section/block module owns a `controls` array — its own controller:
// the exact fields the widget editor's settings panel shows when that
// section/block is selected, and what style-block property each one reads/
// writes. app.widget-editor.jsx never hardcodes which fields a given
// section gets; it just resolves the selected thing's module and renders
// whatever `controls` that module declares (see reviewWidget/sections/controls.ts
// for the shared field-builders most modules compose their list from).
// "content" is special: it doesn't read/write a style-block row at all — it
// edits the selected block's actual text content in itemHtml (see
// app.widget-editor.jsx's getBlockContent/setBlockContent). Only the
// "text" block type (sections/blocks/text.ts) uses it, since every other
// block's content comes from a review-data {{token}}, not free text.
export type ControlType = "text" | "color" | "select" | "image" | "content";

export type ControlOption = { value: string; label: string };

export type SectionControl = {
  /** Unique within the owning module — used as the React key. */
  key: string;
  label: string;
  type: ControlType;
  /** The CSS property this control reads/writes as a style-block row. For
   * type "image" this is always effectively "background-image" (plus it
   * auto-sets background-size/position), regardless of what's passed here. */
  property: string;
  /** Which style-block target this control writes to, if not the section's
   * own target/blockId — e.g. the summary section's "Star color" control
   * writes to the "summary-stars" target instead of "summary". */
  target?: string;
  /** Required for type "select". */
  options?: ControlOption[];
  placeholder?: string;
  /** Small subdued caption shown under the field — e.g. the background
   * image control's note that only a URL is supported for now. */
  helpText?: string;
  /** Clusters controls under one heading in the settings panel — purely
   * cosmetic grouping, e.g. "Layout", "Appearance". */
  group?: string;
  /** Hide this control unless the predicate (given a getVal(property,target)
   * reader) returns true — e.g. the reviews-list's "Columns" control only
   * shows once its "Layout" control is set to "grid". */
  showIf?: (getVal: (property: string, target?: string) => string) => boolean;
  /** Extra style-block writes to make right after this control's own value
   * is set — e.g. picking a flex direction also turns on `display: flex`. */
  onSet?: (value: string, setVal: (property: string, value: string, target?: string) => void) => void;
};

// A fixed, always-present piece of the widget (summary bar, quick-rate box,
// the reviews list wrapper, ...). Contributes its own default html/css slice
// (composed together in sections/index.ts) plus its own settings controls.
export type SectionModule = {
  target: string; // matches styleCatalog.ts TARGETS[].value
  label: string;
  icon: string;
  selector: string; // CSS selector the compiled style blocks attach to
  /** This section's default markup, or null if it contributes none (e.g.
   * the reviews-list wrapper is injected by renderTemplate.ts itself). */
  html: string | null;
  /** This section's default CSS rules. */
  css: string;
  controls: SectionControl[];
};

// A block type droppable inside the review card (reviewWidget/blockTypes.ts
// re-exports these for backward compatibility). Unlike a SectionModule,
// there can be many instances of one block type (each with its own
// generated id), so it contributes an html *factory* instead of static html.
export type BlockModule = {
  type: string;
  label: string;
  icon: string;
  description: string;
  container?: boolean;
  html: (id: string) => string;
  css: string;
  controls: SectionControl[];
};
