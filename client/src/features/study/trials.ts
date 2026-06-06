/** Trial choice grid — export every option image at 3:4 (e.g. 1200×1600) so it fills the slot. */
export const TRIAL_IMAGE_SIZE = { width: 1200, height: 1600, aspect: "3 / 4" as const };

export type StudyPart = "A" | "B";

export type TrialOption = {
  id: string;
  optionCode: "A" | "B" | "C";
  packagingType: string;
  price: number;
  hasGreenLabel: boolean;
  sustainabilityScore: number;
  imagePath: string;
};

export type TrialDefinition = {
  id: string;
  part: StudyPart;
  indexInPart: number;
  productName: string;
  productDescription: string;
  options: TrialOption[];
};

const JUICE_IMAGE_PATHS = [
  "/assets/products/Low_Sustainability_Juice.png",
  "/assets/products/Medium_Sustainability_Juice.png",
  "/assets/products/High_Sustainability_Juice.png",
] as const;

const products = [
  {
    key: "juice",
    name: "Apple Juice Bottle",
    description: "Single-serve apple juice bottle for campus use.",
  },
  {
    key: "coldbrew",
    name: "Cold Drink Can",
    description: "Campus soft drink can, 330 ml.",
  },
  {
    key: "notebook",
    name: "Campus Notebook",
    description: "A5 hardcover notebook used for lectures.",
  },
  {
    key: "shampoo",
    name: "Shampoo Bottle",
    description: "Daily-use shampoo bottle, 375 ml.",
  },
  {
    key: "noodles",
    name: "Instant Noodles Cup",
    description: "Quick student meal cup, chicken flavor.",
  },
  {
    key: "trailmix",
    name: "Trail Mix Pouch",
    description: "Nut and dried-fruit mix pouch, 227 g.",
  },
  {
    key: "yogurt",
    name: "Greek Yogurt Cup",
    description: "Plain nonfat greek yogurt, 150 g cup.",
  },
  {
    key: "granola",
    name: "Granola Bar",
    description: "Peanut butter and oats granola bar, 40 g.",
  },
  {
    key: "pens",
    name: "Ballpoint Pen Pack",
    description: "10-pack pens used for coursework and exams.",
  },
  {
    key: "grocerybag",
    name: "Reusable Grocery Bag",
    description: "Student carry bag for daily shopping.",
  },
];

type PriceRanges = {
  standard: [number, number];
  recycled: [number, number];
  fiber: [number, number];
};

const EUR_PRICE_RANGES: Record<string, PriceRanges> = {
  juice: { standard: [0.99, 1.49], recycled: [1.19, 1.79], fiber: [1.49, 2.19] },
  grocerybag: { standard: [0.79, 1.49], recycled: [3.5, 5.99], fiber: [6.5, 10.99] },
  shampoo: { standard: [3.99, 5.99], recycled: [5.99, 8.49], fiber: [9.49, 12.99] },
  notebook: { standard: [10.99, 14.99], recycled: [12.99, 17.49], fiber: [14.99, 19.99] },
  pens: { standard: [2.99, 4.99], recycled: [3.99, 5.99], fiber: [5.49, 7.99] },
  coldbrew: { standard: [0.99, 1.49], recycled: [1.19, 1.79], fiber: [1.49, 2.19] },
  noodles: { standard: [0.39, 0.79], recycled: [0.79, 1.19], fiber: [1.19, 1.89] },
  yogurt: { standard: [0.99, 1.49], recycled: [1.49, 1.99], fiber: [1.89, 2.59] },
  granola: { standard: [1.19, 1.69], recycled: [1.59, 2.09], fiber: [1.99, 2.79] },
  trailmix: { standard: [3.29, 4.99], recycled: [3.99, 5.99], fiber: [5.49, 7.99] },
};

function midpoint(range: [number, number]): number {
  return Number(((range[0] + range[1]) / 2).toFixed(2));
}

function buildOptions(_seed: number, productKey: string): TrialOption[] {
  const ranges = EUR_PRICE_RANGES[productKey] ?? {
    standard: [1.0, 2.0],
    recycled: [2.0, 3.0],
    fiber: [3.0, 4.0],
  };
  const defaultImages = [
    `/assets/products/${productKey}-standard.png`,
    `/assets/products/${productKey}-recycled.png`,
    `/assets/products/${productKey}-fiber.png`,
  ] as const;
  const images = productKey === "juice" ? JUICE_IMAGE_PATHS : defaultImages;

  return [
    {
      id: "plastic_standard",
      optionCode: "A",
      packagingType: productKey === "juice" ? "Standard plastic bottle" : "Standard plastic",
      price: midpoint(ranges.standard),
      hasGreenLabel: false,
      sustainabilityScore: 36,
      imagePath: images[0],
    },
    {
      id: "recycled_mix",
      optionCode: "B",
      packagingType: productKey === "juice" ? "Recycled-content plastic bottle" : "Recycled-content plastic",
      price: midpoint(ranges.recycled),
      hasGreenLabel: true,
      sustainabilityScore: 63,
      imagePath: images[1],
    },
    {
      id: "fiber_compostable",
      optionCode: "C",
      packagingType: productKey === "juice" ? "Fiber-based carton bottle" : "Fiber-based compostable",
      price: midpoint(ranges.fiber),
      hasGreenLabel: true,
      sustainabilityScore: 84,
      imagePath: images[2],
    },
  ];
}

const DISPLAY_CODES = ["A", "B", "C"] as const;

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  const rand = seededRandom(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Randomize left-to-right order; relabel slots A/B/C for display only. */
export function shuffleTrialOptions(options: TrialOption[], seed: string): TrialOption[] {
  return shuffleWithSeed(options, seed).map((opt, idx) => ({
    ...opt,
    optionCode: DISPLAY_CODES[idx],
  }));
}

/** Per-session trial list with independently shuffled options (Parts A and B). */
export function buildSessionTrials(sessionId: string): TrialDefinition[] {
  return TRIALS.map((trial, globalIndex) => ({
    ...trial,
    options: shuffleTrialOptions(
      trial.options.map((o) => ({ ...o })),
      `${sessionId}-${globalIndex}`,
    ),
  }));
}

const PART_A_PRODUCTS = products.slice(0, 5);
const PART_B_PRODUCTS = products.slice(5, 10);

function buildPart(part: StudyPart, slice: typeof products, offset: number): TrialDefinition[] {
  return slice.map((product, idx) => ({
    id: `${part}-${product.key}`,
    part,
    indexInPart: idx,
    productName: product.name,
    productDescription: product.description,
    options: buildOptions(idx + offset, product.key),
  }));
}

export const TRIALS: TrialDefinition[] = [
  ...buildPart("A", PART_A_PRODUCTS, 0),
  ...buildPart("B", PART_B_PRODUCTS, 5),
];

export const PART_A_TRIAL_COUNT = PART_A_PRODUCTS.length;
export const PART_B_TRIAL_COUNT = PART_B_PRODUCTS.length;

export function partAEndTrialIndex(): number {
  for (let i = TRIALS.length - 1; i >= 0; i -= 1) {
    if (TRIALS[i].part === "A") return i;
  }
  return -1;
}

export function partBStartTrialIndex(): number {
  return TRIALS.findIndex((t) => t.part === "B");
}

export const REASON_OPTIONS = [
  { value: "price", label: "Price/value for money" },
  { value: "sustainability", label: "Sustainability impact" },
  { value: "label", label: "Green label/certification" },
  { value: "gut", label: "Gut feeling / habit" },
  { value: "other", label: "Other reason" },
] as const;

export type ReasonValue = (typeof REASON_OPTIONS)[number]["value"];
