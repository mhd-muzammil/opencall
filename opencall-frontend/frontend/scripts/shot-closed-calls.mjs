// Drive the running app to the redesigned Closed Calls page and screenshot it.
//
// Not a test — a way to LOOK at the page against the real backend. Run with the servers
// already up on :3000 (web) and :4000 (api):
//
//   node scripts/shot-closed-calls.mjs [outDir]
//
// Selectors mirror tests/pages/LoginPage.ts so this cannot drift from the e2e harness.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "screenshots";
const USER = process.env.OPENCALL_USER ?? "admin";
const PASS = process.env.OPENCALL_PASS ?? "admin123";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });

const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("response", (response) => {
  if (response.status() >= 400) {
    problems.push(`http ${response.status()}: ${response.url()}`);
  }
});

async function shot(name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file}`);
  return file;
}

/** What the page says about itself, so the report is not only an image. */
function readout() {
  return page.evaluate(() => {
    const one = (selector) =>
      document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const all = (selector) =>
      [...document.querySelectorAll(selector)].map((node) =>
        node.textContent.replace(/\s+/g, " ").trim(),
      );
    const num = (value) =>
      Number((String(value).match(/[\d,]+/)?.[0] ?? "0").replace(/,/g, ""));
    const cards = all(".ccRegionCard .ccN");
    return {
      scope: one(".ccScope"),
      activePreset: one(".ccSeg button.ccOn"),
      sourceValues: all(".ccSrc .ccVal"),
      coverage: all(".ccSrc .ccCov"),
      delta: one(".ccSrcNote"),
      rollup: num(cards[0]),
      partsSum: cards.slice(1).reduce((sum, value) => sum + num(value), 0),
      regionCards: all(".ccRegionCard .ccNm"),
      ledgerColumns: document.querySelectorAll(".ccTbl thead th").length,
      ledgerCount: one(".ccLedgerHead .ccCnt"),
      ledgerFirstRow: all(".ccTbl tbody tr:first-child td").slice(0, 6),
      repeatPanel: one(".ccKpiRow"),
      buckets: all(".ccBucket"),
      reconWindow: one(".ccReconWin"),
      fourthBucket: one(".ccNewline"),
      badge: one(".sidebarBadge"),
    };
  });
}

try {
  console.log("→ login");
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.locator("input#Username").fill(USER);
  await page.locator("input#Password").fill(PASS);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The workspace generates the day's report on first paint, which is slow against a real
  // database — wait for the sidebar rather than a fixed sleep.
  await page
    .getByRole("button", { name: /Closed Calls/ })
    .first()
    .waitFor({ timeout: 180_000 });
  console.log("  workspace loaded");

  console.log("\n→ Closed Calls (default period: today)");
  await page.getByRole("button", { name: /Closed Calls/ }).first().click();
  await page.locator(".closedCalls").waitFor({ timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  await shot("01-today");
  console.log(JSON.stringify(await readout(), null, 2));

  console.log("\n→ All dates — the period this database actually holds closures for");
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await page.waitForTimeout(3500);
  await shot("02-all-dates");
  const all = await readout();
  console.log(JSON.stringify(all, null, 2));
  console.log(
    all.rollup === all.partsSum
      ? `✓ region cards sum to the rollup (${all.rollup})`
      : `✗ MISMATCH: rollup ${all.rollup} vs parts ${all.partsSum}`,
  );

  console.log("\n→ search must narrow the ledger and nothing else");
  const before = await page.evaluate(() =>
    [...document.querySelectorAll(".ccSrc .ccVal")].map((n) => n.textContent.trim()),
  );
  await page.locator('.ccLedgerHead input[type="search"]').fill("chennai");
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    sources: [...document.querySelectorAll(".ccSrc .ccVal")].map((n) =>
      n.textContent.trim(),
    ),
    ledger:
      document
        .querySelector(".ccLedgerHead .ccCnt")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null,
    rollup:
      document.querySelector(".ccRegionCard .ccN")?.textContent?.trim() ?? null,
  }));
  console.log(
    JSON.stringify(before) === JSON.stringify(after.sources)
      ? "✓ source blocks unchanged by search"
      : `✗ search leaked: ${JSON.stringify(before)} -> ${JSON.stringify(after.sources)}`,
  );
  console.log(`  ledger line: ${after.ledger}`);
  console.log(`  rollup card: ${after.rollup}`);
  await shot("03-search");
  await page.locator('.ccLedgerHead input[type="search"]').fill("");
  await page.waitForTimeout(600);

  console.log("\n→ pick a region");
  await page.locator(".ccRegionTabs button").nth(1).click();
  await page.waitForTimeout(2500);
  const scopeNow = (await page.locator(".ccScope").textContent()) ?? "";
  console.log(`  scope now: ${scopeNow.replace(/\s+/g, " ").trim()}`);
  await shot("04-region");

  console.log("\n→ drill into our closed count");
  await page.locator(".ccSrcOurs .ccVal button").click();
  await page.locator(".ccModal").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await shot("05-drill");
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        title: document.querySelector(".ccModal .ccMh h3")?.textContent?.trim() ?? null,
        subtitle: document.querySelector(".ccModal .ccMh p")?.textContent?.trim() ?? null,
        rows: document.querySelectorAll(".ccModal tbody tr").length,
        columns: [...document.querySelectorAll(".ccModal thead th")].map((n) =>
          n.textContent.trim(),
        ),
      })),
      null,
      2,
    ),
  );
  await page.locator(".ccModal .ccX").click();

  console.log("\n--- problems seen ---");
  console.log(problems.length ? [...new Set(problems)].slice(0, 25).join("\n") : "(none)");
} catch (error) {
  console.error("FAILED:", error.message);
  await shot("FAILURE");
  console.error("\n--- problems seen ---");
  console.error([...new Set(problems)].slice(0, 25).join("\n") || "(none)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
