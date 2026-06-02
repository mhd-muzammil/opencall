const baseUrl =
  process.argv.slice(2).find((argument) => argument !== "--") ??
  process.env.NEXT_ASSET_BASE_URL ??
  `http://localhost:${process.env.PORT ?? "3000"}`;

function buildUrl(path) {
  return new URL(path, baseUrl).toString();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractNextAssets(html) {
  const assets = new Set();
  const assetPattern = /(?:src|href)="([^"]*\/_next\/static\/(?:chunks|css)\/[^"]+)"/g;
  let match = assetPattern.exec(html);

  while (match) {
    assets.add(match[1]);
    match = assetPattern.exec(html);
  }

  return Array.from(assets);
}

const pageResponse = await fetchWithTimeout(baseUrl);

if (!pageResponse.ok) {
  console.error(`Expected ${baseUrl} to return 200, received ${pageResponse.status}`);
  process.exit(1);
}

const html = await pageResponse.text();
const assets = extractNextAssets(html);

if (assets.length === 0) {
  console.error(`No Next static assets were found in ${baseUrl}`);
  process.exit(1);
}

const failures = [];

for (const asset of assets) {
  const assetUrl = buildUrl(asset);
  const response = await fetchWithTimeout(assetUrl).catch((error) => ({
    ok: false,
    status: error instanceof Error ? error.message : "request failed",
  }));

  if (!response.ok) {
    failures.push(`${assetUrl} -> ${response.status}`);
  }
}

if (failures.length > 0) {
  console.error("Next static asset validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Validated ${assets.length} Next static asset(s) from ${baseUrl}`);
