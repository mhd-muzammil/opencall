/**
 * Turning a stored mail body into something safe to put in the reading pane.
 *
 * Pure string work, kept out of the component so each rule can be tested on its own. The
 * server already stripped scripts, handlers and javascript: URLs at ingest; this side adds
 * what only the browser can do — swapping inline pictures for the blobs it fetched with the
 * session token.
 */

/** Where the detail route points a cid: reference before the blob is available. */
const ATTACHMENT_URL = /\/api\/v1\/customer-emails\/[^"'\s>)]+\/attachments\/([^"'\s>);]+)/g;

/**
 * Replace the API attachment URLs the server wrote with the `blob:` URLs the reader has
 * already fetched. A picture with no blob is left pointing at the API URL, which simply
 * fails to load rather than breaking the rest of the body.
 */
export function applyInlineImages(
  html: string,
  blobByAttachmentId: ReadonlyMap<string, string>,
): string {
  return String(html ?? "").replace(ATTACHMENT_URL, (whole, attachmentId: string) => {
    let decoded = attachmentId;
    try {
      decoded = decodeURIComponent(attachmentId);
    } catch {
      // A malformed escape in the sender's text is just text, not a reason to fail the mail.
    }
    return blobByAttachmentId.get(decoded) ?? blobByAttachmentId.get(attachmentId) ?? whole;
  });
}

/**
 * The attachment ids the body actually draws. An inline picture outside this set — a phone's
 * photo on a plain-text mail, say — appears nowhere in the body, so it has to be offered as
 * an attachment instead of quietly disappearing.
 */
export function referencedAttachmentIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of String(html ?? "").matchAll(ATTACHMENT_URL)) {
    const raw = match[1] ?? "";
    ids.add(raw);
    try {
      ids.add(decodeURIComponent(raw));
    } catch {
      // A malformed escape is simply not a match.
    }
  }
  return ids;
}

/**
 * What the reader adds to a mail, and nothing more.
 *
 * Only the font of text the sender left unstyled — a mail client always supplies one — and
 * one rule for pictures: a big photo pasted at full size shrinks to the pane, the way mail
 * clients show it. Spacing, colours, links, quotes and tables are the sender's: any rule
 * here for those would put the reader's look over the mail's, which is exactly what the
 * reader must not do.
 */
const READER_CSS = `
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; }
  img:not([width]):not([style*="width"]) { max-width: 100%; height: auto; }
`;

const READER_HEAD = `<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>${READER_CSS}</style>`;

/**
 * Wrap a body for the sandboxed iframe.
 *
 * The iframe carries `sandbox` without `allow-scripts`, so nothing in here can execute or
 * reach the session. The reader's few lines go first, before any of the mail: the browser
 * puts them at the top of the head, and a mail that is a whole document — what Outlook and
 * most CRMs send — still has its own <html> and <body> attributes and its stylesheets
 * applied after them, so the sender's styles win and the mail looks like the mail. Nothing
 * is searched for and spliced in: a "<head>" inside an attribute, or a banner a mail gateway
 * put above the document, cannot move them.
 */
export function buildEmailSrcDoc(bodyHtml: string): string {
  return `<!doctype html>\n${READER_HEAD}\n${String(bodyHtml ?? "")}`;
}
