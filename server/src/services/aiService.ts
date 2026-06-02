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

export type PartAReviewItemResult = {
  trialIndex: number;
  explanation: string;
};

export async function generatePartAReview(
  trials: Array<TrialFeedbackInput & { trialIndex: number }>,
): Promise<{ items: PartAReviewItemResult[]; provider: string; model: string; usedFallback: boolean }> {
  const items: PartAReviewItemResult[] = [];
  let usedFallback = false;

  for (const trial of trials) {
    const feedback = await generateTrialFeedback(trial);
    items.push({ trialIndex: trial.trialIndex, explanation: feedback.impactAnalysis });
    if (feedback.usedFallback) usedFallback = true;
  }

  return {
    items,
    provider,
    model,
    usedFallback,
  };
}
