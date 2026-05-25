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

const products = [
  {
    key: "detergent",
    name: "Liquid Laundry Detergent",
    description: "Campus-use detergent bottle, 2.2L.",
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
  detergent: { standard: [7.5, 10.0], recycled: [9.0, 12.5], fiber: [12.0, 16.0] },
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
  return [
    {
      id: "plastic_standard",
      optionCode: "A",
      packagingType: "Standard plastic",
      price: midpoint(ranges.standard),
      hasGreenLabel: false,
      sustainabilityScore: 36,
      imagePath: `/assets/products/${productKey}-standard.png`,
    },
    {
      id: "recycled_mix",
      optionCode: "B",
      packagingType: "Recycled-content plastic",
      price: midpoint(ranges.recycled),
      hasGreenLabel: true,
      sustainabilityScore: 63,
      imagePath: `/assets/products/${productKey}-recycled.png`,
    },
    {
      id: "fiber_compostable",
      optionCode: "C",
      packagingType: "Fiber-based compostable",
      price: midpoint(ranges.fiber),
      hasGreenLabel: true,
      sustainabilityScore: 84,
      imagePath: `/assets/products/${productKey}-fiber.png`,
    },
  ];
}

function buildPart(part: StudyPart, offset: number): TrialDefinition[] {
  return products.map((product, idx) => ({
    id: `${part}-${product.key}`,
    part,
    indexInPart: idx,
    productName: product.name,
    productDescription: product.description,
    options: buildOptions(idx + offset, product.key),
  }));
}

export const TRIALS: TrialDefinition[] = [...buildPart("A", 0)];

export const REASON_OPTIONS = [
  { value: "price", label: "Price/value for money" },
  { value: "sustainability", label: "Sustainability impact" },
  { value: "label", label: "Green label/certification" },
  { value: "gut", label: "Gut feeling / habit" },
  { value: "other", label: "Other reason" },
] as const;

export type ReasonValue = (typeof REASON_OPTIONS)[number]["value"];
