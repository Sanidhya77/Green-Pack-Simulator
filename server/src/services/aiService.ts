import {
  getPackagingBullets,
  relativeRankLabel,
  type OptionBulletContext,
} from "./packagingCache.js";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const provider = process.env.AI_PROVIDER ?? "openai";
const model = process.env.AI_MODEL ?? "gpt-4o-mini";
const apiKey = process.env.OPENAI_API_KEY;

const client = apiKey ? new OpenAI({ apiKey, timeout: 45_000 }) : null;

export type TrialOptionContext = {
  optionCode: string;
  optionId: string;
  packagingType: string;
  price: number;
  hasGreenLabel: boolean;
  sustainabilityScore: number;
  imageUrl: string;
  imageDataUrl?: string;
};

export type TrialFeedbackInput = {
  productName: string;
  productDescription: string;
  selectedOptionId: string;
  options: TrialOptionContext[];
  part: "A" | "B";
  confidence: number;
  reasonLabel: string;
  reflection?: string;
};

export type TrialFeedbackOutput = {
  impactAnalysis: string;
  provider: string;
  model: string;
  usedFallback: boolean;
};

function mimeTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function localAssetCandidates(relativePath: string): string[] {
  const normalized = relativePath.replace(/^\/+/, "");
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    join(moduleDir, "../../../client/public", normalized),
    join(process.cwd(), "client/public", normalized),
    join(process.cwd(), "../client/public", normalized),
  ];
}

function assetPathFromReference(reference: string): string | null {
  const match = reference.match(/\/assets\/products\/[^?#]+/);
  return match ? match[0] : null;
}

async function resolveOptionImage(option: TrialOptionContext): Promise<string | null> {
  if (option.imageDataUrl?.startsWith("data:image/")) {
    return option.imageDataUrl;
  }
  return resolveImageDataUrl(option.imageUrl);
}

async function resolveImageDataUrl(reference: string): Promise<string | null> {
  if (reference.startsWith("data:")) return reference;

  const assetPath = assetPathFromReference(reference);
  if (assetPath) {
    const normalized = assetPath.replace(/^\/+/, "");
    for (const candidate of localAssetCandidates(normalized)) {
      if (existsSync(candidate)) {
        const mimeType = mimeTypeFromPath(candidate);
        const data = readFileSync(candidate).toString("base64");
        return `data:${mimeType};base64,${data}`;
      }
    }
  }

  if (reference.startsWith("http://") || reference.startsWith("https://")) {
    try {
      const response = await fetch(reference, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  return null;
}

function selectedOption(input: TrialFeedbackInput): TrialOptionContext {
  return input.options.find((o) => o.optionId === input.selectedOptionId) ?? input.options[0];
}

function fallbackImpact(input: TrialFeedbackInput): string {
  const sorted = [...input.options].sort((a, b) => b.sustainabilityScore - a.sustainabilityScore);
  const chosen = selectedOption(input);
  const chosenRank = sorted.findIndex((o) => o.optionId === chosen.optionId) + 1;
  const reflectionLine = input.reflection?.trim()
    ? ` You noted: "${input.reflection.trim().slice(0, 120)}".`
    : "";

  return [
    `You chose Option ${chosen.optionCode} (${chosen.packagingType}, €${chosen.price.toFixed(2)}), ranking #${chosenRank} of 3 on sustainability in this trial.`,
    `Your main reason was "${input.reasonLabel}" with confidence ${input.confidence}/5.`,
    `Across options, sustainability scores range from ${sorted[sorted.length - 1].sustainabilityScore} to ${sorted[0].sustainabilityScore} out of 100.`,
    reflectionLine,
  ]
    .join(" ")
    .trim();
}

function buildPrompt(input: TrialFeedbackInput): string {
  const chosen = selectedOption(input);
  const optionLines = input.options
    .map(
      (o) =>
        `- Option ${o.optionCode}: ${o.packagingType}, €${o.price.toFixed(2)}, green label ${o.hasGreenLabel ? "yes" : "no"}, sustainability score ${o.sustainabilityScore}/100`,
    )
    .join("\n");

  const reflectionLine = input.reflection?.trim()
    ? input.reflection.trim()
    : "(no additional reflection provided)";

  return [
    "You are assisting an RTU sustainable packaging behavior study.",
    "You receive one packaging photo per option (A, B, C). Study all three before writing.",
    `Product: ${input.productName}`,
    `Description: ${input.productDescription}`,
    "Options:",
    optionLines,
    `Chosen option: ${chosen.optionCode} (${chosen.packagingType}, €${chosen.price.toFixed(2)}).`,
    "",
    "Participant answers (use these to interpret their choice):",
    `- Confidence in choice (1-5): ${input.confidence}`,
    `- Main decision reason: ${input.reasonLabel}`,
    `- Optional reflection: ${reflectionLine}`,
    "",
    "Write one impact analysis in 4-6 sentences (plain text, no headings or bullets):",
    "1) Compare visible packaging/material/label cues across A, B, and C from the images.",
    "2) Explain relative environmental impact and price trade-offs among the three.",
    "3) Interpret how well their stated reason and confidence fit what is visible in their chosen option versus the alternatives.",
    "Do not moralize. Do not invent facts not visible in the images. Use cautious language when uncertain.",
  ].join("\n");
}

function fallbackOutput(input: TrialFeedbackInput): TrialFeedbackOutput {
  return {
    impactAnalysis: fallbackImpact(input),
    provider,
    model,
    usedFallback: true,
  };
}

export async function generateTrialFeedback(input: TrialFeedbackInput): Promise<TrialFeedbackOutput> {
  if (!client || input.part !== "A") {
    return fallbackOutput(input);
  }

  const prompt = buildPrompt(input);
  const content: OpenAI.Responses.ResponseInputMessageContentList = [{ type: "input_text", text: prompt }];

  for (const option of input.options) {
    const imageDataUrl = await resolveOptionImage(option);
    if (!imageDataUrl) {
      console.error(`Could not resolve image for option ${option.optionCode}: ${option.imageUrl}`);
      return fallbackOutput(input);
    }
    content.push({
      type: "input_text",
      text: `Photo — Option ${option.optionCode}:`,
    });
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high",
    });
  }

  try {
    const response = await client.responses.create({
      model,
      input: [{ role: "user", content }],
      max_output_tokens: 500,
    });

    const text = response.output_text?.trim();
    if (!text) {
      return fallbackOutput(input);
    }

    return {
      impactAnalysis: text.slice(0, 1200),
      provider,
      model,
      usedFallback: false,
    };
  } catch (error) {
    console.error("OpenAI trial feedback failed:", error);
    return fallbackOutput(input);
  }
}

function fallbackChoiceFeedback(input: TrialFeedbackInput): string[] {
  const chosen = selectedOption(input);
  const rankLabel = relativeRankLabel(
    chosen.optionId,
    input.options.map((o) => ({ optionId: o.optionId })),
  );
  const greener = input.options.find((o) => o.optionId === "fiber_compostable");
  const bullets = [
    `You chose Option ${chosen.optionCode} — the ${rankLabel} of the three options in this trial.`,
    `Your main reason was "${input.reasonLabel}" (confidence ${input.confidence}/5).`,
  ];

  if (input.reasonLabel.toLowerCase().includes("price")) {
    bullets.push(
      rankLabel === "most sustainable"
        ? "Even with price in mind, you picked a stronger eco option — compare unit price and pack size next time."
        : "Cheaper packs often use more virgin plastic; check whether a slightly higher price buys recycled or fiber-based material.",
    );
  } else if (input.reasonLabel.toLowerCase().includes("sustainability")) {
    bullets.push(
      rankLabel === "most sustainable"
        ? "Your sustainability focus matched the greenest option — look for the same material cues on future purchases."
        : "You cared about impact, but a greener pack was available — compare materials side by side before deciding.",
    );
  } else if (input.reasonLabel.toLowerCase().includes("label")) {
    bullets.push(
      "Eco labels are useful, but also read the material line (recycled content, compostable, or mixed plastic).",
    );
  } else {
    bullets.push(
      "Gut choices are common — pause to compare material type, recyclability symbols, and whether the label matches the pack.",
    );
  }

  bullets.push(
    "When shopping for eco-friendly packaging, look for: recycled or renewable materials, clear recycling instructions, minimal layers, and third-party eco labels — not just green graphics.",
  );

  if (rankLabel !== "most sustainable" && greener) {
    bullets.push(
      `For a greener pick next time, compare your pack with Option ${greener.optionCode} (${greener.packagingType}) and what its label claims.`,
    );
  }

  if (input.reflection?.trim()) {
    bullets.push(`You noted: "${input.reflection.trim().slice(0, 120)}".`);
  }

  return bullets.slice(0, 6);
}

function buildChoiceFeedbackPrompt(
  input: TrialFeedbackInput,
  optionSummaries: Array<{ optionCode: string; bullets: string[] }>,
): string {
  const chosen = selectedOption(input);
  const summaries = optionSummaries
    .map((o) => `Option ${o.optionCode}:\n${o.bullets.map((b) => `- ${b}`).join("\n")}`)
    .join("\n\n");

  const reflectionLine = input.reflection?.trim()
    ? input.reflection.trim()
    : "(no additional reflection provided)";

  return [
    "You assist an RTU sustainable packaging behavior study.",
    `Product: ${input.productName}`,
    `Description: ${input.productDescription}`,
    "Packaging summaries already shown to the participant:",
    summaries,
    "",
    `Chosen: Option ${chosen.optionCode} (${chosen.packagingType}, €${chosen.price.toFixed(2)}).`,
    `Main decision reason: ${input.reasonLabel}. Confidence: ${input.confidence}/5.`,
    `Optional reflection: ${reflectionLine}`,
    "",
    'Return JSON only: {"choiceFeedback":["...","..."]}',
    "Write 4 to 5 bullet strings. Each bullet max 28 words.",
    "Cover ALL of the following across the bullets:",
    "1) How sustainable their choice was relative to the other two options (no numeric scores).",
    "2) How well their stated reason fits what is visible on their chosen pack versus alternatives.",
    "3) Practical tips: what to look for on packaging when trying to shop more sustainably (materials, labels, recyclability symbols, greenwashing cues).",
    "4) One concrete suggestion for this product type — what they could compare or check next time.",
    "5) If a greener option existed, briefly point to what made it different without shaming.",
    "Use plain language. Be helpful and educational, not moralizing. Do not invent facts not supported by the summaries.",
  ].join("\n");
}

async function generateChoiceFeedback(
  input: TrialFeedbackInput,
  optionSummaries: Array<{ optionCode: string; bullets: string[] }>,
): Promise<{ bullets: string[]; usedFallback: boolean }> {
  if (!client || input.part !== "A") {
    return { bullets: fallbackChoiceFeedback(input), usedFallback: true };
  }

  try {
    const response = await client.responses.create({
      model,
      input: [{ role: "user", content: buildChoiceFeedbackPrompt(input, optionSummaries) }],
      max_output_tokens: 450,
    });

    const text = response.output_text?.trim() ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { bullets: fallbackChoiceFeedback(input), usedFallback: true };
    }

    const parsed = JSON.parse(match[0]) as { choiceFeedback?: string[] };
    const bullets = parsed.choiceFeedback?.filter(Boolean).slice(0, 5).map((b) => String(b).trim());
    if (!bullets?.length) {
      return { bullets: fallbackChoiceFeedback(input), usedFallback: true };
    }

    return { bullets, usedFallback: false };
  } catch (error) {
    console.error("OpenAI choice feedback failed:", error);
    return { bullets: fallbackChoiceFeedback(input), usedFallback: true };
  }
}

export type PartAReviewOptionResult = {
  optionCode: string;
  optionId: string;
  imageUrl: string;
  bullets: string[];
  isSelected: boolean;
};

export type PartAReviewItemResult = {
  trialIndex: number;
  options: PartAReviewOptionResult[];
  choiceFeedback: string[];
  /** @deprecated legacy field for DB logging */
  explanation: string;
};

export async function generatePartAReview(
  trials: Array<TrialFeedbackInput & { trialIndex: number }>,
): Promise<{ items: PartAReviewItemResult[]; provider: string; model: string; usedFallback: boolean }> {
  const items: PartAReviewItemResult[] = [];
  let usedFallback = false;

  for (const trial of trials) {
    const optionSummaries = trial.options.map((o) => {
      const ctx: OptionBulletContext = {
        imagePath: o.imageUrl,
        packagingType: o.packagingType,
        hasGreenLabel: o.hasGreenLabel,
        optionId: o.optionId,
      };
      return {
        optionCode: o.optionCode,
        optionId: o.optionId,
        imageUrl: o.imageUrl,
        bullets: getPackagingBullets(ctx).bullets,
        isSelected: o.optionId === trial.selectedOptionId,
      };
    });

    const summaryForAi = optionSummaries.map((o) => ({
      optionCode: o.optionCode,
      bullets: o.bullets,
    }));

    const choice = await generateChoiceFeedback(trial, summaryForAi);
    if (choice.usedFallback) usedFallback = true;

    items.push({
      trialIndex: trial.trialIndex,
      options: optionSummaries,
      choiceFeedback: choice.bullets,
      explanation: [...choice.bullets, ...optionSummaries.flatMap((o) => o.bullets)].join(" | "),
    });
  }

  return {
    items,
    provider,
    model,
    usedFallback,
  };
}
