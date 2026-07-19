import { readFile, writeFile } from "node:fs/promises";

const SOURCE_URL = "https://democrats.org.il/candidates/";
const OUTPUT_FILE = new URL("../candidates.js", import.meta.url);

function decodeHtml(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value = "") {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function findField(block, elementId) {
  const pattern = new RegExp(
    `<div class="[^"]*elementor-element-${elementId}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
  );
  const match = block.match(pattern);
  return stripTags(match?.[1] ?? "");
}

function parseCandidates(html) {
  const listStart = html.indexOf('id="candidate-list"');
  const popupStart = html.indexOf('id="popup-marked-grid"', listStart);
  const listHtml = html.slice(listStart, popupStart > -1 ? popupStart : undefined);
  const blocks = listHtml
    .split(/<div class="jet-listing-grid__item jet-listing-dynamic-post-/)
    .slice(1)
    .filter((block) => block.includes("elementor-24893"));

  const seen = new Set();
  const candidates = [];

  for (const block of blocks) {
    const postId = block.match(/data-post-id="(\d+)"/)?.[1];
    const image = block.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*attachment-large/)?.[1];
    const title = findField(block, "21d703e");
    const firstName = findField(block, "d7f1fe5");
    const lastName = findField(block, "852ee53");
    const bio = findField(block, "eeef3e4");
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (!postId || !name || !image || !bio || seen.has(postId)) {
      continue;
    }

    seen.add(postId);
    candidates.push({
      id: `candidate-${postId}`,
      name,
      title,
      image: decodeHtml(image),
      bio,
    });
  }

  return candidates;
}

async function loadHtml() {
  const localPath = process.argv[2];
  if (localPath) {
    return readFile(localPath, "utf8");
  }

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  }
  return response.text();
}

const html = await loadHtml();
const candidates = parseCandidates(html);

if (candidates.length < 40) {
  throw new Error(`Expected a full candidate list, found ${candidates.length}`);
}

const generated = `// Generated from ${SOURCE_URL}
// Refresh with: node tools/scrape-candidates.mjs
window.CANDIDATES = ${JSON.stringify(candidates, null, 2)};
`;

await writeFile(OUTPUT_FILE, generated);
console.log(`Wrote ${candidates.length} candidates to ${OUTPUT_FILE.pathname}`);
