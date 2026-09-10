// Download a Closed Calls export from the running app and read it back.
//
// The bug this guards is that the file said nothing about its own filter: a period, a
// region or a search could all produce the same anonymous workbook. Unit tests pin the
// pure helpers; this proves the button actually wires them to the download.
//
//   node scripts/check-closed-calls-export.mjs
import { chromium } from "@playwright/test";
import XLSX from "xlsx";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1680, height: 1050 },
  acceptDownloads: true,
});
const outDir = mkdtempSync(join(tmpdir(), "cc-export-"));

async function grab(label) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Export Excel" }).click(),
  ]);
  const file = join(outDir, download.suggestedFilename());
  await download.saveAs(file);

  const book = XLSX.readFile(file);
  const scope = XLSX.utils.sheet_to_json(book.Sheets.Scope, { header: 1 });
  const data = XLSX.utils.sheet_to_json(book.Sheets["Closed Calls"], { defval: "" });

  console.log(`\n── ${label}`);
  console.log(`   filename : ${download.suggestedFilename()}`);
  console.log(`   sheets   : ${book.SheetNames.join(", ")}`);
  console.log(`   rows     : ${data.length}`);
  for (const row of scope) {
    if (row.length === 2 && String(row[0]) !== "Note") {
      console.log(`   ${String(row[0]).padEnd(38)} ${row[1]}`);
    }
  }
}

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

  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await page.waitForTimeout(3000);
  await grab("All dates, all regions");

  await page.locator(".ccRegionTabs button").nth(1).click();
  await page.waitForTimeout(2500);
  await grab("All dates, one region");

  await page.locator(".ccRegionTabs button").first().click();
  await page.waitForTimeout(2000);
  await page.locator('.ccLedgerHead input[type="search"]').fill("chennai");
  await page.waitForTimeout(900);
  await grab("All dates, search applied");
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
