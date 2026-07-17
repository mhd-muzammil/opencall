// Native Excel PivotTable export.
//
// SheetJS (the `xlsx` package) cannot create — or even preserve — native
// PivotTable parts: it parses a workbook into its own model and drops the
// pivotCache / pivotTable XML on write. So a genuine PivotTable can only be
// produced by injecting the live report data into a *prebuilt* template
// workbook (authored once in Excel, with the PivotTable already configured)
// and rewriting only the data sheets + the pivot cache source range, leaving
// every PivotTable XML part untouched.
//
// This module does exactly that, operating on the raw .xlsx ZIP via fflate:
//   1. read workbook.xml + its rels to map sheet name -> part path,
//   2. discover the pivot cache's source sheet from pivotCacheDefinition,
//   3. overwrite the data sheets' XML with the report rows,
//   4. point the cache source range at the new data extent + set
//      refreshOnLoad="1" so Excel rebuilds the cache on open.
//
// See docs/pivot-template.md for the template the export expects.
import { unzipSync, zipSync, type Unzipped } from "fflate";

export type PivotCellValue = string | number | boolean;
export type PivotAoa = readonly (readonly PivotCellValue[])[];

// Public path of the prebuilt template (served from Next's `public/` folder).
export const PIVOT_TEMPLATE_URL = "/pivot-template.xlsx";

// Worksheet names the exporter populates, beyond the pivot's own source sheet.
export const OPEN_CALL_SHEET = "Today Open Call";
export const CLOSED_CALLS_SHEET = "Today Closed Calls";

const WORKBOOK_PART = "xl/workbook.xml";
const WORKBOOK_RELS_PART = "xl/_rels/workbook.xml.rels";

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Convert a zero-based column index to its Excel letter (0 -> A, 25 -> Z, 26 -> AA).
export function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

// A1-style range covering rowCount x colCount cells from A1. Falls back to "A1"
// for an empty matrix so the source ref is always valid.
export function rangeRef(rowCount: number, colCount: number): string {
  if (rowCount < 1 || colCount < 1) {
    return "A1";
  }
  return `A1:${columnLetter(colCount - 1)}${rowCount}`;
}

// Drop characters that are illegal in XML 1.0 (Excel rejects them as
// "unreadable content"), then escape the markup-significant ones.
export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cellXml(ref: string, value: PivotCellValue, styleId?: number): string {
  const s = styleId === undefined ? "" : ` s="${styleId}"`;
  if (value === "" || value === null || value === undefined) {
    // A styled empty cell still needs to exist so its borders/fill render.
    return styleId === undefined ? "" : `<c r="${ref}"${s}/>`;
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? `<c r="${ref}"${s}><v>${value}</v></c>`
      : styleId === undefined
        ? ""
        : `<c r="${ref}"${s}/>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  // Inline strings keep us from having to touch the shared-strings table.
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

// Render a full worksheet part (`<worksheet>...`) from an array-of-arrays.
// Empty cells are omitted (a valid sparse sheet); the dimension spans the
// widest row so Excel sizes the used range correctly.
export function buildSheetXml(aoa: PivotAoa): string {
  const rowCount = aoa.length;
  const colCount = aoa.reduce((max, row) => Math.max(max, row.length), 0);

  let body = "";
  for (let r = 0; r < rowCount; r += 1) {
    const row = aoa[r] ?? [];
    let cells = "";
    for (let c = 0; c < row.length; c += 1) {
      const value = row[c];
      if (value !== undefined) {
        cells += cellXml(`${columnLetter(c)}${r + 1}`, value);
      }
    }
    body += `<row r="${r + 1}">${cells}</row>`;
  }

  const usedRange = rangeRef(rowCount, colCount);

  // Suppress Excel's "Number Stored as Text" green-triangle on the whole used
  // range. Identifier/code columns (Ticket ID, Case ID, Contact, WO OTC CODE,
  // ...) are intentionally written as text — storing them as numbers would drop
  // leading "+"/zeros and round IDs past Excel's 15-digit precision. Numeric
  // measure columns are written as real <v> numbers, so they aren't text and
  // this ignore never touches them. `ignoredErrors` is display-only metadata.
  const ignoredErrors =
    rowCount >= 1 && colCount >= 1
      ? `<ignoredErrors><ignoredError sqref="${usedRange}" numberStoredAsText="1"/></ignoredErrors>`
      : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${SHEET_NS}" xmlns:r="${REL_NS}">` +
    `<dimension ref="${usedRange}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<sheetData>${body}</sheetData>` +
    ignoredErrors +
    `</worksheet>`
  );
}

// ——— Styled records sheet (WYSIWYG view inside the pivot workbook) ————————
// Colors mirror the on-screen records grid: solid blue header with dark bold
// text, slate gridline borders.
const RECORDS_HEADER_FILL_RGB = "FF0EA5E9";
const RECORDS_HEADER_FONT_RGB = "FF0F172A";
const RECORDS_GRID_BORDER_RGB = "FFCBD5E1";

export interface StyledSheetOptions {
  headerXf: number;
  bodyXf: number;
  widths: readonly number[];
}

// Render a fully-styled worksheet part: every cell in the used range is written
// (so borders show on blanks), the header row is frozen, and an autofilter
// spans the header — mirroring the app's sticky header + per-column filters.
export function buildStyledSheetXml(aoa: PivotAoa, opts: StyledSheetOptions): string {
  const rowCount = aoa.length;
  const colCount = aoa.reduce((max, row) => Math.max(max, row.length), 0);
  const usedRange = rangeRef(rowCount, colCount);

  const cols = opts.widths
    .slice(0, colCount)
    .map(
      (width, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");

  let body = "";
  for (let r = 0; r < rowCount; r += 1) {
    const row = aoa[r] ?? [];
    const styleId = r === 0 ? opts.headerXf : opts.bodyXf;
    let cells = "";
    for (let c = 0; c < colCount; c += 1) {
      cells += cellXml(`${columnLetter(c)}${r + 1}`, row[c] ?? "", styleId);
    }
    const heightAttr = r === 0 ? ` ht="24" customHeight="1"` : "";
    body += `<row r="${r + 1}"${heightAttr}>${cells}</row>`;
  }

  const headerRange = `A1:${columnLetter(Math.max(colCount - 1, 0))}1`;
  const ignoredErrors =
    rowCount >= 1 && colCount >= 1
      ? `<ignoredErrors><ignoredError sqref="${usedRange}" numberStoredAsText="1"/></ignoredErrors>`
      : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${SHEET_NS}" xmlns:r="${REL_NS}">` +
    `<dimension ref="${usedRange}"/>` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${body}</sheetData>` +
    `<autoFilter ref="${headerRange}"/>` +
    ignoredErrors +
    `</worksheet>`
  );
}

// Append the records-grid font/fill/border and two cell formats (header, body)
// to the template's styles.xml, returning the new cellXf indices. Existing
// style records are untouched, so every other sheet keeps its formatting.
export function appendRecordsStyles(stylesXml: string): {
  xml: string;
  headerXf: number;
  bodyXf: number;
} {
  const append = (
    xml: string,
    tag: string,
    inner: string,
    added: number,
  ): { xml: string; firstIndex: number } => {
    const countRe = new RegExp(`<${tag} count="(\\d+)"`, "i");
    const match = xml.match(countRe);
    if (!match?.[1]) {
      throw new Error(`Pivot template styles.xml is missing <${tag} count>.`);
    }
    const count = Number(match[1]);
    let out = xml.replace(countRe, `<${tag} count="${count + added}"`);
    out = out.replace(new RegExp(`</${tag}>`, "i"), `${inner}</${tag}>`);
    return { xml: out, firstIndex: count };
  };

  const font = append(
    stylesXml,
    "fonts",
    `<font><b/><sz val="11"/><color rgb="${RECORDS_HEADER_FONT_RGB}"/><name val="Calibri"/></font>`,
    1,
  );
  const fill = append(
    font.xml,
    "fills",
    `<fill><patternFill patternType="solid"><fgColor rgb="${RECORDS_HEADER_FILL_RGB}"/><bgColor indexed="64"/></patternFill></fill>`,
    1,
  );
  const border = append(
    fill.xml,
    "borders",
    `<border><left style="thin"><color rgb="${RECORDS_GRID_BORDER_RGB}"/></left>` +
      `<right style="thin"><color rgb="${RECORDS_GRID_BORDER_RGB}"/></right>` +
      `<top style="thin"><color rgb="${RECORDS_GRID_BORDER_RGB}"/></top>` +
      `<bottom style="thin"><color rgb="${RECORDS_GRID_BORDER_RGB}"/></bottom>` +
      `<diagonal/></border>`,
    1,
  );
  const xfs = append(
    border.xml,
    "cellXfs",
    `<xf numFmtId="0" fontId="${font.firstIndex}" fillId="${fill.firstIndex}" borderId="${border.firstIndex}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="${border.firstIndex}" xfId="0" applyBorder="1"/>`,
    2,
  );

  return { xml: xfs.xml, headerXf: xfs.firstIndex, bodyXf: xfs.firstIndex + 1 };
}

const CONTENT_TYPES_PART = "[Content_Types].xml";
const STYLES_PART = "xl/styles.xml";
const WORKSHEET_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

// Register a brand-new worksheet part in the workbook: ZIP part, content-type
// override, workbook relationship, and the <sheet> entry (appended last, so
// existing sheet indices — and anything referencing them — are unchanged).
export function addWorksheetPart(
  files: Unzipped,
  sheetName: string,
  sheetXml: string,
): void {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const workbookXml = decoder.decode(files[WORKBOOK_PART] ?? new Uint8Array());
  const relsXml = decoder.decode(files[WORKBOOK_RELS_PART] ?? new Uint8Array());
  const contentTypesXml = decoder.decode(files[CONTENT_TYPES_PART] ?? new Uint8Array());
  if (!workbookXml || !relsXml || !contentTypesXml) {
    throw new Error("Invalid workbook: missing workbook.xml, rels, or content types.");
  }

  // Fresh part path / relationship id / sheetId, all past the existing maxima.
  let partNo = 1;
  while (files[`xl/worksheets/sheet${partNo}.xml`]) {
    partNo += 1;
  }
  const partPath = `xl/worksheets/sheet${partNo}.xml`;

  let maxRid = 0;
  for (const match of relsXml.matchAll(/\bId="rId(\d+)"/gi)) {
    maxRid = Math.max(maxRid, Number(match[1]));
  }
  const rid = `rId${maxRid + 1}`;

  let maxSheetId = 0;
  for (const match of workbookXml.matchAll(/\bsheetId="(\d+)"/gi)) {
    maxSheetId = Math.max(maxSheetId, Number(match[1]));
  }

  // Every insertion must land — a silent no-op would produce a workbook Excel
  // rejects. Throwing here lets the exporter fall back to a plain workbook.
  const replaceOnce = (
    xml: string,
    re: RegExp,
    replacement: string,
    what: string,
  ): string => {
    if (!re.test(xml)) {
      throw new Error(`Invalid workbook: missing ${what}.`);
    }
    return xml.replace(re, replacement);
  };

  files[partPath] = encoder.encode(sheetXml);
  files[CONTENT_TYPES_PART] = encoder.encode(
    replaceOnce(
      contentTypesXml,
      /<\/Types>/i,
      `<Override PartName="/${partPath}" ContentType="${WORKSHEET_CONTENT_TYPE}"/></Types>`,
      "</Types> in [Content_Types].xml",
    ),
  );
  files[WORKBOOK_RELS_PART] = encoder.encode(
    replaceOnce(
      relsXml,
      /<\/Relationships>/i,
      `<Relationship Id="${rid}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${partNo}.xml"/></Relationships>`,
      "</Relationships> in workbook rels",
    ),
  );
  files[WORKBOOK_PART] = encoder.encode(
    replaceOnce(
      workbookXml,
      /<\/(\w+:)?sheets>/i,
      `<sheet name="${escapeXml(sheetName)}" sheetId="${maxSheetId + 1}" r:id="${rid}"/></$1sheets>`,
      "</sheets> in workbook.xml",
    ),
  );
}

// Map each worksheet's display name to the ZIP path of its part, by joining
// workbook.xml's <sheet r:id=...> entries to the workbook relationships.
export function parseSheetPathMap(
  workbookXml: string,
  relsXml: string,
): Map<string, string> {
  const ridToName = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/gi)) {
    const tag = match[0];
    const name = tag.match(/\bname="([^"]*)"/i)?.[1];
    const rid =
      tag.match(/\br:id="([^"]*)"/i)?.[1] ?? tag.match(/\bid="([^"]*)"/i)?.[1];
    if (name && rid) {
      ridToName.set(rid, name);
    }
  }

  const nameToPath = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
    const tag = match[0];
    const id = tag.match(/\bId="([^"]*)"/i)?.[1];
    const target = tag.match(/\bTarget="([^"]*)"/i)?.[1];
    if (!id || !target) {
      continue;
    }
    const name = ridToName.get(id);
    if (!name) {
      continue;
    }
    const normalized = target.replace(/^[./]+/, "");
    nameToPath.set(name, normalized.startsWith("xl/") ? normalized : `xl/${normalized}`);
  }
  return nameToPath;
}

// Read the worksheet name and A1 range backing a pivot cache, from its
// <worksheetSource> element. `sheet`/`ref` are null when the cache is built
// from a named range or table instead of a plain worksheet range.
export function readCacheSource(cacheXml: string): {
  sheet: string | null;
  ref: string | null;
} {
  const tag = cacheXml.match(/<(?:\w+:)?worksheetSource\b[^>]*>/i)?.[0];
  if (!tag) {
    return { sheet: null, ref: null };
  }
  return {
    sheet: tag.match(/\bsheet="([^"]*)"/i)?.[1] ?? null,
    ref: tag.match(/\bref="([^"]*)"/i)?.[1] ?? null,
  };
}

// Force refreshOnLoad="1" on the cache definition and repoint its
// <worksheetSource ref="..."> at the new data extent. A cache built from a
// named range (no ref attribute) only gets the refresh flag.
export function updateCacheDefinition(cacheXml: string, newRef: string): string {
  let out = cacheXml.replace(
    /<((?:\w+:)?)pivotCacheDefinition\b([^>]*)>/i,
    (_match, prefix: string, attrs: string) => {
      const next = /\brefreshOnLoad=/i.test(attrs)
        ? attrs.replace(/\brefreshOnLoad="[^"]*"/i, 'refreshOnLoad="1"')
        : ` refreshOnLoad="1"${attrs}`;
      return `<${prefix}pivotCacheDefinition${next}>`;
    },
  );

  if (newRef) {
    out = out.replace(
      /(<(?:\w+:)?worksheetSource\b[^>]*\bref=")[^"]*(")/i,
      `$1${newRef}$2`,
    );
  }
  return out;
}

export interface PivotWorkbookInput {
  // Rows feeding the PivotTable (written to the cache's source sheet, header
  // row first). The header order must match the template's cache fields.
  sourceAoa: PivotAoa;
  // Optional verbatim data sheets, written only if the template contains them.
  openAoa?: PivotAoa;
  closedAoa?: PivotAoa;
  // Optional styled records-view sheet (the user's on-screen table), added as a
  // new tab so the template's own sheets — pivot included — are untouched.
  records?: {
    name: string;
    aoa: PivotAoa;
    widths: readonly number[];
  };
}

function findCacheDefinitionPath(files: Unzipped): string | undefined {
  return Object.keys(files).find((path) =>
    /xl\/pivotCache\/pivotCacheDefinition\d*\.xml$/i.test(path),
  );
}

// Inject report data into a prebuilt PivotTable template and return the bytes
// of the resulting .xlsx. Every part except the data sheets and the cache
// definition's source range / refresh flag is preserved byte-for-byte, so the
// native PivotTable (analyze tab, field pane, drill-down, ...) stays intact.
export function buildPivotWorkbookBytes(
  templateBytes: Uint8Array,
  input: PivotWorkbookInput,
): Uint8Array {
  const files = unzipSync(templateBytes);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const workbookBytes = files[WORKBOOK_PART];
  const relsBytes = files[WORKBOOK_RELS_PART];
  if (!workbookBytes || !relsBytes) {
    throw new Error("Invalid pivot template: missing workbook.xml or its relationships.");
  }
  const sheetPaths = parseSheetPathMap(
    decoder.decode(workbookBytes),
    decoder.decode(relsBytes),
  );

  // Discover which sheet the PivotTable reads from. Excel keeps the cache's
  // <worksheetSource sheet="..."> in sync when a tab is renamed, so this works
  // whatever the data sheet is called. The name list is only a fallback for
  // caches built from a named range (which carry no sheet attribute).
  const cacheDefPath = findCacheDefinitionPath(files);
  let sourceSheetName: string | null = null;
  if (cacheDefPath) {
    const cacheBytes = files[cacheDefPath];
    if (cacheBytes) {
      sourceSheetName = readCacheSource(decoder.decode(cacheBytes)).sheet;
    }
  }
  if (!sourceSheetName || !sheetPaths.has(sourceSheetName)) {
    sourceSheetName =
      ["opencall", "Open Call", "Sheet1"].find((name) => sheetPaths.has(name)) ??
      sourceSheetName;
  }

  const writeSheet = (name: string | null, aoa: PivotAoa | undefined): void => {
    if (!name || !aoa) {
      return;
    }
    const path = sheetPaths.get(name);
    if (path) {
      files[path] = encoder.encode(buildSheetXml(aoa));
    }
  };

  // 1. Pivot data source sheet.
  writeSheet(sourceSheetName, input.sourceAoa);

  // 2. Repoint the cache at the new extent + force a refresh on open.
  if (cacheDefPath) {
    const cacheBytes = files[cacheDefPath];
    if (cacheBytes) {
      const colCount = input.sourceAoa.reduce((max, row) => Math.max(max, row.length), 0);
      const newRef = rangeRef(input.sourceAoa.length, colCount);
      files[cacheDefPath] = encoder.encode(
        updateCacheDefinition(decoder.decode(cacheBytes), newRef),
      );
    }
  }

  // 3. Verbatim data sheets (only when the template carries them).
  writeSheet(OPEN_CALL_SHEET, input.openAoa);
  writeSheet(CLOSED_CALLS_SHEET, input.closedAoa);

  // 4. Styled records-view sheet: register the grid styles in styles.xml, then
  //    add (or overwrite) the sheet. Existing style records keep their indices,
  //    so no other sheet's formatting moves.
  if (input.records) {
    const stylesBytes = files[STYLES_PART];
    if (!stylesBytes) {
      throw new Error("Invalid pivot template: missing xl/styles.xml.");
    }
    const styles = appendRecordsStyles(decoder.decode(stylesBytes));
    files[STYLES_PART] = encoder.encode(styles.xml);

    const sheetXml = buildStyledSheetXml(input.records.aoa, {
      headerXf: styles.headerXf,
      bodyXf: styles.bodyXf,
      widths: input.records.widths,
    });
    const existingPath = sheetPaths.get(input.records.name);
    if (existingPath) {
      files[existingPath] = encoder.encode(sheetXml);
    } else {
      addWorksheetPart(files, input.records.name, sheetXml);
    }
  }

  return zipSync(files, { level: 6 });
}
