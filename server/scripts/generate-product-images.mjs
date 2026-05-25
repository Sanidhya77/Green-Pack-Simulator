import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is missing in server/.env");
  process.exit(1);
}

const client = new OpenAI({ apiKey, timeout: 45_000 });

const outputDir = join(__dirname, "../../client/public/assets/products");
mkdirSync(outputDir, { recursive: true });

const products = [
  { key: "noodles", name: "instant noodles cup" },
  { key: "coldbrew", name: "cold brew coffee can" },
  { key: "granola", name: "granola bar wrapper" },
  { key: "yogurt", name: "greek yogurt cup" },
  { key: "trailmix", name: "trail mix pouch" },
  { key: "energy", name: "energy drink can" },
  { key: "oatmeal", name: "instant oatmeal cup" },
  { key: "popcorn", name: "microwave popcorn package" },
  { key: "gum", name: "chewing gum pack" },
  { key: "notebook", name: "campus notebook package" },
];

const variants = [
  { key: "standard", packaging: "standard plastic packaging with no eco badge" },
  { key: "recycled", packaging: "recycled-content plastic packaging with a subtle recycle icon" },
  { key: "fiber", packaging: "fiber-based compostable style packaging with a subtle leaf icon" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateOne(product, variant) {
  const prompt = [
    "Single packaged consumer product photo on clean light beige studio background.",
    "One product only, centered, front-facing, no hands, no collage, no shelf, no multiple objects.",
    "Brand text should be generic and subtle: CampusChoice.",
    "Photorealistic ecommerce product photo style.",
    `Product type: ${product.name}.`,
    `Packaging requirement: ${variant.packaging}.`,
    "Show clear package material cues and a complete package in frame.",
  ].join(" ");

  const response = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
    prompt,
    size: "1024x1024",
  });

  const imageB64 = response.data?.[0]?.b64_json;
  if (!imageB64) {
    throw new Error(`No image output for ${product.key}-${variant.key}`);
  }

  const filePath = join(outputDir, `${product.key}-${variant.key}.png`);
  writeFileSync(filePath, Buffer.from(imageB64, "base64"));
  console.log(`Generated ${product.key}-${variant.key}.png`);
}

async function main() {
  for (const product of products) {
    for (const variant of variants) {
      await generateOne(product, variant);
      await sleep(450);
    }
  }
  console.log("All product images generated.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
