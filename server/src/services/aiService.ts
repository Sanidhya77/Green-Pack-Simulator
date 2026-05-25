import OpenAI from "openai";

const provider = process.env.AI_PROVIDER ?? "openai";
const model = process.env.AI_MODEL ?? "gpt-4o-mini";
const apiKey = process.env.OPENAI_API_KEY;

const client = apiKey ? new OpenAI({ apiKey, timeout: 12_000 }) : null;

export type AiInput = {
  productName: string;
  productImageUrl: string;
  packagingType: string;
  hasGreenLabel: boolean;
  price: number;
  part: "A" | "B";
};

export type AiOutput = {
  text: string;
  provider: string;
  model: string;
};

function fallbackExplanation(input: AiInput): string {
  const labelText = input.hasGreenLabel ? "with a green label" : "without a green label";
  return `This option uses ${input.packagingType} packaging ${labelText} at ${input.price.toFixed(2)}. The visible package design suggests a basic sustainability posture; compare material choice, recyclability, and any explicit eco-claims before deciding.`;
}

export async function generateTradeoffExplanation(input: AiInput): Promise<AiOutput> {
  if (!client) {
    return {
      text: fallbackExplanation(input),
      provider,
      model,
    };
  }

  const prompt = [
    "You are assisting in an RTU sustainable packaging behavior study.",
    "Analyze the product image first, then write a concise explanation in 2-3 sentences.",
    "Sentence 1: summarize packaging cues visible in the image.",
    "Sentence 2: infer likely product/company sustainability approach (e.g. recyclable material use, eco-label signaling, lightweight packaging).",
    "Sentence 3: describe neutral trade-off with price and consumer decision context.",
    "Do not moralize, do not invent hidden facts, use cautious language when uncertain.",
    `Product: ${input.productName}`,
    `Packaging option in task: ${input.packagingType}`,
    `Green label in task: ${input.hasGreenLabel ? "yes" : "no"}`,
    `Price in task: ${input.price.toFixed(2)}`,
    `Study part: ${input.part}`,
  ].join("\n");

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: input.productImageUrl, detail: "low" },
          ],
        },
      ],
      max_output_tokens: 220,
    });

    const text = response.output_text?.trim();
    if (!text) {
      return { text: fallbackExplanation(input), provider, model };
    }

    return {
      text: text.slice(0, 500),
      provider,
      model,
    };
  } catch {
    return {
      text: fallbackExplanation(input),
      provider,
      model,
    };
  }
}
