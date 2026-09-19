// Ready-made block types offered by the widget-editor's "+ Add block" palette
// (app/routes/app.widget-editor.jsx). Plain data — no server-only logic — so
// it can be imported client-side for the palette UI same as styleCatalog.ts.
//
// Every block a merchant adds lives inside the review-item template (the
// markup between <!--ITEM--> markers in reviewWidget/defaults.server.ts),
// which is why "stars/title/body/author/avatar/verified" all use the same
// {{token}} placeholders renderTemplate.ts substitutes per-review — a block
// isn't a copy of one review, it's the mapping applied to every review, so
// the editor only ever needs to render (and let you edit) one sample of it.
//
// Each block is a real, tagged HTML element:
//   data-jm-block="<unique id>"       — addressable by the style compiler
//   data-jm-block-type="<type below>" — how the editor knows what controls/
//                                        icon/label to show for it
//
// "container" is the one block type that can hold other blocks: the editor's
// "+ Add block" always inserts into the currently selected container (the
// review item itself is one, see defaults.server.ts), giving real nesting
// without needing a separate JSON block tree — the HTML *is* the tree.
export type BlockType = {
  type: string;
  label: string;
  icon: string;
  description: string;
  container?: boolean;
  html: (id: string) => string;
};

export const BLOCK_TYPES: BlockType[] = [
  {
    type: "stars",
    label: "Stars",
    icon: "★",
    description: "This review's star rating.",
    html: (id) => `<div class="jm-reviews__item-stars" data-jm-block="${id}" data-jm-block-type="stars">{{stars}}</div>`,
  },
  {
    type: "title",
    label: "Title",
    icon: "T",
    description: "The review's title.",
    html: (id) => `<div class="jm-reviews__item-title" data-jm-block="${id}" data-jm-block-type="title">{{title}}</div>`,
  },
  {
    type: "body",
    label: "Body text",
    icon: "¶",
    description: "The review's written text.",
    html: (id) => `<div class="jm-reviews__item-body" data-jm-block="${id}" data-jm-block-type="body">{{body}}</div>`,
  },
  {
    type: "author",
    label: "Author",
    icon: "@",
    description: "Reviewer's name.",
    html: (id) => `<div class="jm-reviews__item-author" data-jm-block="${id}" data-jm-block-type="author">{{author}}</div>`,
  },
  {
    type: "avatar",
    label: "Avatar",
    icon: "◍",
    description: "Initials circle for the reviewer.",
    html: (id) => `<div class="jm-reviews__item-avatar" data-jm-block="${id}" data-jm-block-type="avatar">{{avatar}}</div>`,
  },
  {
    type: "verified",
    label: "Verified badge",
    icon: "✓",
    description: "Shows only for verified buyers.",
    html: (id) => `<div class="jm-reviews__item-verified" data-jm-block="${id}" data-jm-block-type="verified">{{verified}}</div>`,
  },
  {
    type: "container",
    label: "Container",
    icon: "▢",
    description: "A group other blocks can be dropped into.",
    container: true,
    html: (id) => `<div class="jm-reviews__item-group" data-jm-block="${id}" data-jm-block-type="container"></div>`,
  },
];

export function blockTypeFor(type) {
  return BLOCK_TYPES.find((b) => b.type === type) || null;
}
