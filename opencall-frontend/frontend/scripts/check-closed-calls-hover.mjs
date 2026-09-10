// Assert that no control on Closed Calls turns indigo when you point at it.
//
// globals.css carries `button:hover:not(:disabled) { background: var(--accent-strong) }`
// at specificity (0,2,1), which outranks a plain .ccX class and repaints the hovered
// control solid indigo. Eyeballing a screenshot catches the buckets and misses the ticket
// links, so this hovers one of every family and reads the computed background back.
import { chromium } from "@playwright/test";

const ACCENT = ["rgb(79, 70, 229)", "rgb(67, 56, 202)"]; // --accent / --accent-strong

const FAMILIES = [
  [".ccBtn", "header / footer button"],
  [".ccBtn.ccPrimary", "primary button"],
  [".ccSeg button", "period preset"],
  [".ccRegionTabs button", "region pill"],
  [".ccSrcOurs .ccVal button", "source headline"],
  [".ccSplit button", "source split link"],
  [".ccTotalLink", "row-total sentence"],
  [".ccRegionCard .ccCmp button", "region comparison figure"],
  [".ccBucket", "reconciliation bucket"],
  [".ccLedgerHead + .ccTbl .ccTk", "ledger ticket link"],
  [".ccFb", "feedback button"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });

try {
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.locator("input#Username").fill(process.env.OPENCALL_USER ?? "admin");
  await page.locator("input#Password").fill(process.env.OPENCALL_PASS ?? "admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("button", { name: /Closed Calls/ })
    .first()
    .waitFor({ timeout: 180_000 });
  await page.getByRole("button", { name: /Closed Calls/ }).first().click();
  await page.locator(".closedCalls").waitFor({ timeout: 60_000 });
  // All dates is the only period this database holds rows for, so the ledger and the
  // region figures actually exist to be hovered.
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await page.waitForTimeout(3000);

  let failures = 0;
  for (const [selector, label] of FAMILIES) {
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) {
      console.log(`  –  ${label.padEnd(30)} not on the page`);
      continue;
    }
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(120);
    const style = await target.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        minHeight: computed.minHeight,
        color: computed.color,
      };
    });
    const indigo = ACCENT.includes(style.background);
    if (indigo) failures += 1;
    console.log(
      `  ${indigo ? "✗" : "✓"}  ${label.padEnd(30)} bg=${style.background} minH=${style.minHeight}`,
    );
  }

  console.log(
    failures === 0
      ? "\n✓ no control repaints with the app accent on hover"
      : `\n✗ ${failures} control(s) still turn indigo on hover`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
