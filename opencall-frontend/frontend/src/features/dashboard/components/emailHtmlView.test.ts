// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyInlineImages, buildEmailSrcDoc, referencedAttachmentIds } from "./emailHtmlView";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("applyInlineImages", () => {
  const blobs = new Map([["att-1", "blob:http://localhost/abc"]]);

  it("swaps the API url for the fetched blob", () => {
    const html = `<img src="/api/v1/customer-emails/e1/attachments/att-1">`;
    expect(applyInlineImages(html, blobs)).toContain("blob:http://localhost/abc");
  });

  it("handles a url-encoded attachment id", () => {
    const html = `<img src="/api/v1/customer-emails/e1/attachments/att%2D1">`;
    expect(applyInlineImages(html, new Map([["att-1", "blob:x"]]))).toContain("blob:x");
  });

  // A missing blob must not take the rest of the mail down with it.
  it("leaves a picture with no blob pointing at the api", () => {
    const html = `<img src="/api/v1/customer-emails/e1/attachments/att-9">`;
    expect(applyInlineImages(html, blobs)).toContain("/attachments/att-9");
  });

  it("leaves ordinary sources alone", () => {
    const html = `<img src="https://hp.com/logo.png">`;
    expect(applyInlineImages(html, blobs)).toBe(html);
  });

  // The sender's own text can contain anything, including a broken %-escape that looks
  // like an attachment route; that must not throw the whole mail back to plain text.
  it("survives a malformed escape in the sender's text", () => {
    const html = `<div>Old link: /api/v1/customer-emails/abc/attachments/%E0%A4%A please ignore</div>`;
    expect(() => applyInlineImages(html, new Map())).not.toThrow();
    expect(applyInlineImages(html, new Map())).toBe(html);
  });
});

// A picture the body never draws must end up on the attachment list, not nowhere.
describe("referencedAttachmentIds", () => {
  it("finds every attachment the body draws, encoded or not", () => {
    const html = `<img src="/api/v1/customer-emails/e1/attachments/att-1"><img src="/api/v1/customer-emails/e1/attachments/att%2D2">`;
    const ids = referencedAttachmentIds(html);
    expect(ids.has("att-1")).toBe(true);
    expect(ids.has("att-2")).toBe(true);
    expect(ids.has("att-3")).toBe(false);
  });

  // A CSS background is written unquoted, inside a quoted style attribute.
  it("reads an unquoted CSS url without the bracket or the next declaration", () => {
    const html = `<td style="background:url(/api/v1/customer-emails/e1/attachments/att-4);color:red">`;
    expect([...referencedAttachmentIds(html)]).toEqual(["att-4"]);
    expect(applyInlineImages(html, new Map([["att-4", "blob:y"]]))).toBe(
      `<td style="background:url(blob:y);color:red">`,
    );
  });

  it("finds none in a body that draws none", () => {
    expect(referencedAttachmentIds("<p>Photo attached.</p>").size).toBe(0);
    expect(referencedAttachmentIds("").size).toBe(0);
  });
});

describe("buildEmailSrcDoc", () => {
  // The office chose original over holding pictures back: a sender's hosted logo loads as it
  // does in Outlook, with no placeholder and nothing to press.
  it("leaves a sender's hosted picture as it was written", () => {
    const doc = buildEmailSrcDoc(`<img src="https://hp.com/logo.png" width="120">`);
    expect(doc).toContain(`<img src="https://hp.com/logo.png" width="120">`);
    expect(doc).not.toContain("data-blocked-src");
  });

  it("puts the body inside a complete document", () => {
    const doc = buildEmailSrcDoc("<p>Hi</p>");
    expect(doc).toMatch(/^<!doctype html>/i);
    expect(doc).toContain("<p>Hi</p>");
  });

  // Links must not be able to navigate the iframe (or the app) away from the page.
  it("sends links to a new tab and suppresses the referrer", () => {
    const doc = buildEmailSrcDoc("");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('content="no-referrer"');
  });

  // Outlook sends a whole document. Its <body> carries the link colours and its <head> the
  // stylesheet; nesting all of it inside the reader's own <body> lost both. Checked on the
  // document a browser actually builds, not on the string.
  it("keeps a whole document's own head and body, with the reader's lines first", () => {
    const mail = `<html lang="en"><head><style>p.MsoNormal{margin:0cm}</style></head><body lang="EN-US" link="#0563C1"><p class="MsoNormal">Hi</p></body></html>`;
    const page = parse(buildEmailSrcDoc(mail));
    expect(page.compatMode).toBe("CSS1Compat");
    expect(page.documentElement.getAttribute("lang")).toBe("en");
    expect(page.body.getAttribute("link")).toBe("#0563C1");
    expect(page.body.getAttribute("lang")).toBe("EN-US");
    const head = Array.from(page.head.children).map((el) => el.tagName.toLowerCase());
    expect(head.slice(0, 4)).toEqual(["meta", "meta", "base", "style"]);
    const styles = Array.from(page.querySelectorAll("style")).map((el) => el.textContent ?? "");
    expect(styles[styles.length - 1]).toBe("p.MsoNormal{margin:0cm}");
    expect(page.body.textContent).toBe("Hi");
  });

  // Nothing is searched for and spliced in, so a "<head>" in an attribute cannot pull the
  // reader's lines into it, and a gateway's banner above the document cannot get ahead of them.
  it("keeps the reader's lines at the top whatever comes first in the mail", () => {
    for (const mail of [
      `<p title="Use the <head> tag">Hi</p><p>Second</p>`,
      `<div><img src="https://gateway.example/banner.png">CAUTION: external mail</div><html><head><style>p{color:red}</style></head><body><p>Hi</p></body></html>`,
    ]) {
      const page = parse(buildEmailSrcDoc(mail));
      expect(page.head.firstElementChild?.getAttribute("charset")).toBe("utf-8");
      expect(page.head.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
      expect(page.head.querySelector("base")?.getAttribute("target")).toBe("_blank");
      expect(page.body.querySelector("meta, base")).toBeNull();
    }
    expect(parse(buildEmailSrcDoc(`<p title="Use the <head> tag">Hi</p>`)).querySelector("p")?.getAttribute("title")).toBe("Use the <head> tag");
  });

  // The mail must look like the mail: spacing, colours, links, quotes and tables are the
  // sender's. Each of these used to be set here and showed every mail in the reader's look.
  it("sets nothing that would override the sender's look", () => {
    const doc = buildEmailSrcDoc("<p>Hi</p>");
    expect(doc).not.toMatch(/line-height|blockquote|table\s*\{|(^|[\s}])a\s*\{|color:\s*#1f2430|padding:\s*4px/);
  });
});
