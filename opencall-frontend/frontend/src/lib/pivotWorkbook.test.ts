import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";
import {
  buildPivotWorkbookBytes,
  buildSheetXml,
  columnLetter,
  escapeXml,
  parseSheetPathMap,
  rangeRef,
  readCacheSource,
  updateCacheDefinition,
} from "./pivotWorkbook";

describe("columnLetter", () => {
  it("maps zero-based indices to Excel column letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(701)).toBe("ZZ");
  });
});

describe("rangeRef", () => {
  it("spans the matrix from A1", () => {
    expect(rangeRef(3, 26)).toBe("A1:Z3");
    expect(rangeRef(1, 1)).toBe("A1:A1");
  });

  it("falls back to A1 for an empty matrix", () => {
    expect(rangeRef(0, 5)).toBe("A1");
    expect(rangeRef(5, 0)).toBe("A1");
  });
});

describe("escapeXml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe(
      "a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;",
    );
  });

  it("strips characters illegal in XML 1.0 but keeps tabs/newlines", () => {
    expect(escapeXml("a\u0000b\u0007c")).toBe("abc");
    expect(escapeXml("a\tb\nc")).toBe("a\tb\nc");
  });
});

describe("buildSheetXml", () => {
  it("writes numeric, string and skips empty cells", () => {
    const xml = buildSheetXml([
      ["Ticket ID", "WIP aging"],
      ["WO-1", 5],
      ["", 0],
    ]);

    expect(xml).toContain('<dimension ref="A1:B3"/>');
    // Strings -> inline strings (no shared-strings table needed).
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Ticket ID</t></is></c>');
    // Numbers -> bare <v>.
    expect(xml).toContain('<c r="B2"><v>5</v></c>');
    expect(xml).toContain('<c r="B3"><v>0</v></c>');
    // Empty string cell A3 is omitted entirely.
    expect(xml).not.toContain('r="A3"');
    // Suppress the "Number Stored as Text" flag over the used range, after
    // </sheetData> (schema-valid position) so text IDs/phones show no triangle.
    expect(xml).toContain(
      '</sheetData><ignoredErrors><ignoredError sqref="A1:B3" numberStoredAsText="1"/></ignoredErrors></worksheet>',
    );
  });

  it("omits ignoredErrors for an empty matrix", () => {
    const xml = buildSheetXml([]);
    expect(xml).not.toContain("ignoredErrors");
  });
});

describe("parseSheetPathMap", () => {
  it("joins workbook sheets to their part paths via relationships", () => {
    const workbookXml = `<workbook><sheets>
      <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
      <sheet name="Today Open Call" sheetId="2" r:id="rId3"/>
    </sheets></workbook>`;
    const relsXml = `<Relationships>
      <Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId3" Type="x/worksheet" Target="/xl/worksheets/sheet9.xml"/>
      <Relationship Id="rId2" Type="x/styles" Target="styles.xml"/>
    </Relationships>`;

    const map = parseSheetPathMap(workbookXml, relsXml);
    expect(map.get("Sheet1")).toBe("xl/worksheets/sheet1.xml");
    // Absolute targets are normalized to the part path.
    expect(map.get("Today Open Call")).toBe("xl/worksheets/sheet9.xml");
  });
});

describe("readCacheSource", () => {
  it("reads the source sheet and range from worksheetSource", () => {
    const xml = `<pivotCacheDefinition><cacheSource type="worksheet"><worksheetSource ref="A1:Z10" sheet="Sheet1"/></cacheSource></pivotCacheDefinition>`;
    expect(readCacheSource(xml)).toEqual({ sheet: "Sheet1", ref: "A1:Z10" });
  });

  it("returns nulls when there is no worksheetSource", () => {
    expect(readCacheSource("<pivotCacheDefinition/>")).toEqual({
      sheet: null,
      ref: null,
    });
  });
});

describe("updateCacheDefinition", () => {
  it("adds refreshOnLoad and repoints the source range", () => {
    const xml = `<pivotCacheDefinition xmlns="x" recordCount="2"><cacheSource type="worksheet"><worksheetSource ref="A1:Z3" sheet="Sheet1"/></cacheSource></pivotCacheDefinition>`;
    const out = updateCacheDefinition(xml, "A1:C5");
    expect(out).toContain('refreshOnLoad="1"');
    expect(out).toContain('ref="A1:C5"');
    expect(out).not.toContain('ref="A1:Z3"');
    // Original attributes are preserved.
    expect(out).toContain('recordCount="2"');
  });

  it("replaces an existing refreshOnLoad value", () => {
    const xml = `<pivotCacheDefinition refreshOnLoad="0"><cacheSource><worksheetSource ref="A1:B2" sheet="S"/></cacheSource></pivotCacheDefinition>`;
    const out = updateCacheDefinition(xml, "A1:B9");
    expect(out).toContain('refreshOnLoad="1"');
    expect(out).not.toContain('refreshOnLoad="0"');
  });
});

// A minimal but structurally faithful pivot template: Sheet1 (source) + Pivot +
// the two data sheets, plus a pivot cache definition pointing at Sheet1.
function makeTemplate(): Uint8Array {
  const ns =
    'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const sheet = (label: string) =>
    `<?xml version="1.0"?><worksheet ${ns}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${label}</t></is></c></row></sheetData></worksheet>`;

  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook ${ns}><sheets>` +
        `<sheet name="Sheet1" sheetId="1" r:id="rId1"/>` +
        `<sheet name="Pivot" sheetId="2" r:id="rId2"/>` +
        `<sheet name="Today Open Call" sheetId="3" r:id="rId3"/>` +
        `<sheet name="Today Closed Calls" sheetId="4" r:id="rId4"/>` +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships>` +
        `<Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="x/worksheet" Target="worksheets/sheet2.xml"/>` +
        `<Relationship Id="rId3" Type="x/worksheet" Target="worksheets/sheet3.xml"/>` +
        `<Relationship Id="rId4" Type="x/worksheet" Target="worksheets/sheet4.xml"/>` +
        `</Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet("OLD-SOURCE")),
    "xl/worksheets/sheet2.xml": strToU8(sheet("PIVOT-KEEP-ME")),
    "xl/worksheets/sheet3.xml": strToU8(sheet("OLD-OPEN")),
    "xl/worksheets/sheet4.xml": strToU8(sheet("OLD-CLOSED")),
    "xl/pivotCache/pivotCacheDefinition1.xml": strToU8(
      `<?xml version="1.0"?><pivotCacheDefinition ${ns} recordCount="1">` +
        `<cacheSource type="worksheet"><worksheetSource ref="A1:Z2" sheet="Sheet1"/></cacheSource>` +
        `<cacheFields count="0"/></pivotCacheDefinition>`,
    ),
  });
}

describe("buildPivotWorkbookBytes", () => {
  const sourceAoa = [
    ["Segment", "RTPL status", "Ticket ID"],
    ["PC", "Actionable", "WO-1"],
    ["Print", "cx pending", "WO-2"],
  ];
  const openAoa = [["Ticket ID"], ["WO-1"], ["WO-2"]];
  const closedAoa = [["Ticket ID"], ["WO-9"]];

  it("injects the data sheets and repoints the cache, preserving pivot parts", () => {
    const out = buildPivotWorkbookBytes(makeTemplate(), {
      sourceAoa,
      openAoa,
      closedAoa,
    });
    const files = unzipSync(out);

    const sheet1 = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    const cache = strFromU8(files["xl/pivotCache/pivotCacheDefinition1.xml"]!);
    const open = strFromU8(files["xl/worksheets/sheet3.xml"]!);
    const closed = strFromU8(files["xl/worksheets/sheet4.xml"]!);
    const pivot = strFromU8(files["xl/worksheets/sheet2.xml"]!);

    // Source sheet rewritten with the pivot data.
    expect(sheet1).toContain("Actionable");
    expect(sheet1).toContain("WO-1");
    expect(sheet1).not.toContain("OLD-SOURCE");

    // Cache repointed at the 3x3 extent and set to refresh on load.
    expect(cache).toContain('refreshOnLoad="1"');
    expect(cache).toContain('ref="A1:C3"');

    // Verbatim data sheets populated.
    expect(open).toContain("WO-2");
    expect(open).not.toContain("OLD-OPEN");
    expect(closed).toContain("WO-9");

    // The PivotTable's own sheet is preserved byte-for-byte.
    expect(pivot).toContain("PIVOT-KEEP-ME");
  });

  it("throws on a template without a workbook part", () => {
    const broken = zipSync({ "junk.xml": strToU8("<x/>") });
    expect(() => buildPivotWorkbookBytes(broken, { sourceAoa })).toThrow(
      /Invalid pivot template/,
    );
  });
});

// Integration check against the *real* committed template. Skipped (not failed)
// if the artifact is absent, so branches without it still pass CI; when present
// it guards the actual production behaviour: every PivotTable part survives the
// injection byte-for-byte and only the data sheet + cache definition change.
describe("buildPivotWorkbookBytes against the real pivot-template.xlsx", () => {
  const templatePath = fileURLToPath(
    new URL("../../public/pivot-template.xlsx", import.meta.url),
  );
  const hasTemplate = existsSync(templatePath);

  it.skipIf(!hasTemplate)(
    "preserves all pivot parts and repoints the cache",
    () => {
      const templateBytes = new Uint8Array(readFileSync(templatePath));
      const original = unzipSync(templateBytes);

      // 26-column source matching DAILY_CALL_PLAN_COLUMNS, with 8 data rows.
      const header: string[] = [...DAILY_CALL_PLAN_COLUMNS];
      const idx = (col: string) => header.indexOf(col);
      const rows = Array.from({ length: 8 }, (_, i) => {
        const row: (string | number)[] = header.map(() => "");
        row[idx("Ticket ID")] = `WO-TEST-${i + 1}`;
        row[idx("Segment")] = i % 2 === 0 ? "PC" : "Print";
        row[idx("WIP aging")] = i;
        row[idx("RTPL status")] = i % 3 === 0 ? "Actionable" : "cx pending";
        row[idx("WO OTC CODE")] = "01-Trade";
        return row;
      });
      const sourceAoa = [header, ...rows];

      const out = unzipSync(
        buildPivotWorkbookBytes(templateBytes, {
          sourceAoa,
          openAoa: sourceAoa,
          closedAoa: [["Ticket ID"], ["WO-CLOSED-1"]],
        }),
      );

      // Resolve which parts the exporter is allowed to mutate.
      const sheetPaths = parseSheetPathMap(
        strFromU8(original["xl/workbook.xml"]!),
        strFromU8(original["xl/_rels/workbook.xml.rels"]!),
      );
      const cacheDefPath = Object.keys(original).find((p) =>
        /pivotCacheDefinition\d*\.xml$/i.test(p),
      )!;
      const sourceSheet = readCacheSource(strFromU8(original[cacheDefPath]!)).sheet!;
      const sourcePath = sheetPaths.get(sourceSheet)!;
      const mutable = new Set(
        [
          sourcePath,
          cacheDefPath,
          sheetPaths.get("Today Open Call"),
          sheetPaths.get("Today Closed Calls"),
        ].filter((p): p is string => Boolean(p)),
      );

      // No parts dropped, and the PivotTable parts survive.
      for (const part of Object.keys(original)) {
        expect(Object.keys(out)).toContain(part);
      }
      expect(out["xl/pivotTables/pivotTable1.xml"]).toBeDefined();
      expect(out["xl/pivotCache/pivotCacheRecords1.xml"]).toBeDefined();

      // Everything except the data sheet + cache definition is byte-for-byte
      // identical (the pivot sheet, its rels, the pivotTable XML, styles, ...).
      for (const part of Object.keys(original)) {
        if (mutable.has(part)) {
          continue;
        }
        expect(out[part]).toEqual(original[part]);
      }

      // Cache forced to refresh and repointed at the exact 9-row extent.
      const cache = strFromU8(out[cacheDefPath]!);
      expect(cache).toContain('refreshOnLoad="1"');
      expect(cache).toMatch(/<worksheetSource\b[^>]*\bref="A1:AA9"/);

      // Source sheet rewritten with the injected rows.
      const source = strFromU8(out[sourcePath]!);
      expect(source).toContain("WO-TEST-8");
      expect(source).toContain("Actionable");
    },
  );
});
