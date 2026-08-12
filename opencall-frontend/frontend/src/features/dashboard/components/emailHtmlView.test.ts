import { describe, expect, it } from "vitest";
import {
  applyInlineImages,
  blockRemoteImages,
  buildEmailSrcDoc,
  restoreRemoteImages,
} from "./emailHtmlView";

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
});

// A remote image in a mail is a read receipt. Blocking it by default is the same thing
// Outlook and Gmail do, and it is the whole reason this pass exists.
describe("blockRemoteImages", () => {
  it("holds back an http image and counts it", () => {
    const result = blockRemoteImages(`<img src="http://tracker.example/pixel.gif">`);
    expect(result.blocked).toBe(1);
    expect(result.html).not.toMatch(/\ssrc=/);
    expect(result.html).toContain('data-blocked-src="http://tracker.example/pixel.gif"');
  });

  it("holds back https too", () => {
    expect(blockRemoteImages(`<img src="https://hp.com/logo.png">`).blocked).toBe(1);
  });

  it("does NOT touch the sender's own attached pictures", () => {
    const html = `<img src="blob:http://localhost/abc">`;
    const result = blockRemoteImages(html);
    expect(result.blocked).toBe(0);
    expect(result.html).toBe(html);
  });

  it("counts several and leaves other attributes intact", () => {
    const result = blockRemoteImages(
      `<img width="20" src="http://a/1.png" alt="one"><img src='http://b/2.png'>`,
    );
    expect(result.blocked).toBe(2);
    expect(result.html).toContain('width="20"');
    expect(result.html).toContain('alt="one"');
  });

  it("reports nothing to unblock for a plain body", () => {
    expect(blockRemoteImages("<p>Reminder.</p>").blocked).toBe(0);
  });

  it("round-trips through restore", () => {
    const html = `<img src="https://hp.com/logo.png">`;
    expect(restoreRemoteImages(blockRemoteImages(html).html)).toBe(html);
  });
});

describe("buildEmailSrcDoc", () => {
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
});
