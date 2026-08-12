/**
 * Turning a stored mail body into something safe to put in the reading pane.
 *
 * Pure string work, kept out of the component so each rule can be tested on its own. The
 * server already stripped scripts, handlers and javascript: URLs at ingest; this side adds
 * the two things only the browser can do — swapping inline pictures for the blobs it
 * fetched with the session token, and holding back remote images until asked.
 */

/** Where the detail route points a cid: reference before the blob is available. */
const ATTACHMENT_URL = /\/api\/v1\/customer-emails\/[^"'\s>]+\/attachments\/([^"'\s>]+)/g;

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
    const decoded = decodeURIComponent(attachmentId);
    return blobByAttachmentId.get(decoded) ?? blobByAttachmentId.get(attachmentId) ?? whole;
  });
}

export interface RemoteImageResult {
  html: string;
  /** How many were held back, so the banner can say whether there is anything to show. */
  blocked: number;
}

/**
 * Hold back images hosted on someone else's server.
 *
 * A remote image in a mail is a read receipt: fetching it tells the sender the address is
 * live and someone opened the message, with a timestamp and an IP. Every serious mail
 * client blocks them until asked, and so does this one — `blob:` pictures the sender
 * attached are untouched, because those cost no request.
 */
export function blockRemoteImages(html: string): RemoteImageResult {
  let blocked = 0;
  const out = String(html ?? "").replace(
    /(<img\b[^>]*?)\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (whole, head: string, dq?: string, sq?: string, bare?: string) => {
      const url = (dq ?? sq ?? bare ?? "").trim();
      if (!/^https?:/i.test(url)) return whole;
      blocked += 1;
      return `${head} data-blocked-src="${url.replace(/"/g, "&quot;")}"`;
    },
  );
  return { html: out, blocked };
}

/** Put the held-back images back, for when the reader presses "Show images". */
export function restoreRemoteImages(html: string): string {
  return String(html ?? "").replace(/\sdata-blocked-src=/gi, " src=");
}

/**
 * Wrap a body for the sandboxed iframe.
 *
 * The iframe carries `sandbox` with no `allow-scripts` and no `allow-same-origin`, so
 * nothing in here can execute or reach the session. The styles below only set a readable
 * default; the sender's own styles come after and win, which is the point — the mail is
 * supposed to look like the mail.
 */
export function buildEmailSrcDoc(bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px; line-height: 1.5; color: #1f2430;
    padding: 4px 2px; overflow-x: auto; word-break: break-word;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #2563eb; }
  blockquote {
    margin: 8px 0; padding-left: 12px;
    border-left: 3px solid #d8dce6; color: #5b6478;
  }
  img[data-blocked-src] {
    min-width: 12px; min-height: 12px;
    border: 1px dashed #c7cddb; border-radius: 4px; background: #f4f6fa;
  }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
