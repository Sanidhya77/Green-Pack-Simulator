import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../../client/public");
const cachePath = join(__dirname, "../data/packaging-image-cache.json");

const PRODUCT_KEYS = [
  "juice",
  "coldbrew",
  "notebook",
  "shampoo",
  "noodles",
  "trailmix",
  "yogurt",
  "granola",
  "pens",
  "grocerybag",
];

const JUICE_PATHS = [
  "/assets/products/Low_Sustainability_Juice.png",
  "/assets/products/Medium_Sustainability_Juice.png",
  "/assets/products/High_Sustainability_Juice.png",
];

const VARIANT_META = [
  {
    suffix: "standard",
    optionId: "plastic_standard",
    packagingType: "Standard plastic packaging",
    hasGreenLabel: false,
  },
  {
    suffix: "recycled",
    optionId: "recycled_mix",
    packagingType: "Recycled-content plastic packaging",
    hasGreenLabel: true,
  },
  {
    suffix: "fiber",
    optionId: "fiber_compostable",
    packagingType: "Fiber-based compostable-style packaging",
    hasGreenLabel: true,
  },
];

function buildCatalog() {
  const items = [];
  for (const key of PRODUCT_KEYS) {
    if (key === "juice") {
      JUICE_PATHS.forEach((imagePath, idx) => {
        items.push({
          imagePath,
          productKey: key,
          ...VARIANT_META[idx],
        });
      });
      continue;
    }
    for (const variant of VARIANT_META) {
      items.push({
        imagePath: `/assets/products/${key}-${variant.suffix}.png`,
        productKey: key,
        ...variant,
      });
    }
  }
  return items;
}

function mimeTypeFromPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function toDataUrl(imagePath) {
  const localPath = join(publicDir, imagePath.replace(/^\/+/, ""));
  if (!existsSync(localPath)) {
    throw new Error(`Missing image: ${localPath}`);
  }
  const mime = mimeTypeFromPath(localPath);
  const base64 = readFileSync(localPath).toString("base64");
  return `data:${mime};base64,${base64}`;
}

function templateBullets(item) {
  const tier =
    item.optionId === "plastic_standard"
      ? "Usually the least eco-friendly option in a three-pack set"
      : item.optionId === "fiber_compostable"
        ? "Usually the strongest eco option in a three-pack set"
        : "Mid-range eco option — often part-recycled plastic";
  return [item.packagingType, item.hasGreenLabel ? "Green/eco label visible" : "No green label visible", tier];
}

async function analyzeImage(client, item) {
  const dataUrl = toDataUrl(item.imagePath);
  const response = await client.responses.create({
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Product category: ${item.productKey}.`,
              `Packaging hint: ${item.packagingType}.`,
              "Study this packaging photo only.",
              'Return JSON: {"bullets":["...","...","..."]}',
              "Exactly 3 bullets. Max 14 words each.",
              "Describe visible material, labels, and likely environmental traits.",
              "Do NOT use numeric sustainability scores.",
              "Plain English. No markdown.",
            ].join("\n"),
          },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    max_output_tokens: 200,
  });

  const text = response.output_text?.trim() ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response for ${item.imagePath}`);
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.bullets) || parsed.bullets.length === 0) {
    throw new Error(`Invalid bullets for ${item.imagePath}`);
  }
  return parsed.bullets.slice(0, 3).map((b) => String(b).trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const useAi = process.argv.includes("--ai");
  const catalog = buildCatalog();
  const existing = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, "utf8"))
    : { version: 1, entries: {} };

  const client = useAi
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 })
    : null;

  if (useAi && !process.env.OPENAI_API_KEY) {
    console.error("Set OPENAI_API_KEY in server/.env to run --ai mode.");
    process.exit(1);
  }

  for (const item of catalog) {
    if (useAi && existing.entries[item.imagePath]?.source === "ai") {
      console.log(`Skip (cached AI): ${item.imagePath}`);
      continue;
    }

    try {
      const bullets = useAi ? await analyzeImage(client, item) : templateBullets(item);
      existing.entries[item.imagePath] = {
        bullets,
        source: useAi ? "ai" : "template",
        updatedAt: new Date().toISOString(),
      };
      console.log(`${useAi ? "AI" : "Template"}: ${item.imagePath}`);
      if (useAi) await sleep(400);
    } catch (error) {
      console.error(`Failed ${item.imagePath}:`, error.message);
      existing.entries[item.imagePath] = {
        bullets: templateBullets(item),
        source: "template",
        updatedAt: new Date().toISOString(),
      };
    }
  }

  writeFileSync(cachePath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(existing.entries).length} entries to ${cachePath}`);
}

main();
