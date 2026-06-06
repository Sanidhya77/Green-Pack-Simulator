import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export type PackagingCacheEntry = {
  bullets: string[];
  source: "ai" | "template";
  updatedAt?: string;
};

export type PackagingCacheFile = {
  version: number;
  entries: Record<string, PackagingCacheEntry>;
};

export type OptionBulletContext = {
  imagePath: string;
  packagingType: string;
  hasGreenLabel: boolean;
  optionId: string;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));

const CACHE_PATHS = [
  join(moduleDir, "../../data/packaging-image-cache.json"),
  join(process.cwd(), "data/packaging-image-cache.json"),
  join(process.cwd(), "server/data/packaging-image-cache.json"),
];

let loadedCache: PackagingCacheFile | null = null;

function loadCacheFile(): PackagingCacheFile {
  if (loadedCache) return loadedCache;

  for (const path of CACHE_PATHS) {
    if (existsSync(path)) {
      loadedCache = JSON.parse(readFileSync(path, "utf8")) as PackagingCacheFile;
      return loadedCache;
    }
  }

  loadedCache = { version: 1, entries: {} };
  return loadedCache;
}

export function sustainabilityTier(optionId: string): "lower" | "middle" | "higher" {
  if (optionId === "plastic_standard") return "lower";
  if (optionId === "fiber_compostable") return "higher";
  return "middle";
}

const TIER_LABELS: Record<ReturnType<typeof sustainabilityTier>, string> = {
  lower: "Typically the lowest environmental impact among these three, but still conventional packaging",
  middle: "Mid-range environmental impact — often uses some recycled content",
  higher: "Usually the strongest environmental option in this set (e.g. fiber or compostable-style pack)",
};

export function templateBullets(ctx: OptionBulletContext): string[] {
  const tier = sustainabilityTier(ctx.optionId);
  return [
    ctx.packagingType,
    ctx.hasGreenLabel ? "Visible green or eco label on pack" : "No green/eco label visible",
    TIER_LABELS[tier],
  ];
}

export function getPackagingBullets(ctx: OptionBulletContext): { bullets: string[]; fromCache: boolean } {
  const cache = loadCacheFile();
  const hit = cache.entries[ctx.imagePath];
  if (hit?.bullets?.length) {
    return { bullets: hit.bullets, fromCache: hit.source === "ai" };
  }
  return { bullets: templateBullets(ctx), fromCache: false };
}

export function relativeRankLabel(
  optionId: string,
  options: Array<{ optionId: string }>,
): "least sustainable" | "middle option" | "most sustainable" {
  const tiers = options.map((o) => ({ id: o.optionId, tier: sustainabilityTier(o.optionId) }));
  const chosen = tiers.find((t) => t.id === optionId);
  if (!chosen) return "middle option";

  const hasLower = tiers.some((t) => t.tier === "lower");
  const hasHigher = tiers.some((t) => t.tier === "higher");

  if (chosen.tier === "lower") return "least sustainable";
  if (chosen.tier === "higher") return "most sustainable";
  return "middle option";
}
