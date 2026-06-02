import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { generatePartAReview, generateTrialFeedback } from "../services/aiService.js";

const router = Router();

const requestCounts = new Map<string, number>();
const MAX_REQUESTS_PER_SESSION = 25;

const optionSchema = z.object({
  optionCode: z.string().trim().min(1).max(8),
  optionId: z.string().trim().min(1).max(80),
  packagingType: z.string().trim().min(1).max(120),
  price: z.number().positive(),
  hasGreenLabel: z.boolean(),
  sustainabilityScore: z.number().int().min(0).max(100),
  imageUrl: z.string().trim().min(10).max(500),
  imageDataUrl: z.string().startsWith("data:image/").max(6_000_000).optional(),
});

router.post("/trial-feedback", async (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    part: z.enum(["A", "B"]),
    trialIndex: z.number().int().min(0),
    productName: z.string().trim().min(1).max(120),
    productDescription: z.string().trim().min(1).max(240),
    selectedOptionId: z.string().trim().min(1).max(80),
    options: z.array(optionSchema).length(3),
    confidence: z.number().int().min(1).max(5),
    reasonLabel: z.string().trim().min(1).max(120),
    reflection: z.string().trim().max(500).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid AI payload" });
  }

  const count = requestCounts.get(parsed.data.sessionId) ?? 0;
  if (count >= MAX_REQUESTS_PER_SESSION) {
    return res.status(429).json({ error: "AI request limit reached for this session" });
  }
  requestCounts.set(parsed.data.sessionId, count + 1);

  const feedback = await generateTrialFeedback({
    productName: parsed.data.productName,
    productDescription: parsed.data.productDescription,
    selectedOptionId: parsed.data.selectedOptionId,
    options: parsed.data.options,
    part: parsed.data.part,
    confidence: parsed.data.confidence,
    reasonLabel: parsed.data.reasonLabel,
    reflection: parsed.data.reflection,
  });

  db.prepare(
    `INSERT INTO ai_explanations
      (session_id, part, trial_index, provider, model, prompt_excerpt, response_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    parsed.data.sessionId,
    parsed.data.part,
    parsed.data.trialIndex,
    feedback.provider,
    feedback.model,
    `${parsed.data.productName} | ${parsed.data.reasonLabel} | conf=${parsed.data.confidence}`,
    feedback.impactAnalysis,
  );

  return res.json({
    impactAnalysis: feedback.impactAnalysis,
    usedFallback: feedback.usedFallback,
  });
});

const partAReviewTrialSchema = z.object({
  trialIndex: z.number().int().min(0).max(4),
  productName: z.string().trim().min(1).max(120),
  productDescription: z.string().trim().min(1).max(240),
  selectedOptionId: z.string().trim().min(1).max(80),
  options: z.array(optionSchema).length(3),
  confidence: z.number().int().min(1).max(5),
  reasonLabel: z.string().trim().min(1).max(120),
  reflection: z.string().trim().max(500).optional(),
});

router.post("/part-a-review", async (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    trials: z.array(partAReviewTrialSchema).min(1).max(5),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Part A review payload" });
  }

  const count = requestCounts.get(parsed.data.sessionId) ?? 0;
  if (count + parsed.data.trials.length > MAX_REQUESTS_PER_SESSION) {
    return res.status(429).json({ error: "AI request limit reached for this session" });
  }
  requestCounts.set(parsed.data.sessionId, count + parsed.data.trials.length);

  const review = await generatePartAReview(
    parsed.data.trials.map((trial) => ({
      ...trial,
      part: "A" as const,
    })),
  );

  for (const item of review.items) {
    const trial = parsed.data.trials.find((t) => t.trialIndex === item.trialIndex);
    db.prepare(
      `INSERT INTO ai_explanations
        (session_id, part, trial_index, provider, model, prompt_excerpt, response_text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      parsed.data.sessionId,
      "A",
      item.trialIndex,
      review.provider,
      review.model,
      trial ? `${trial.productName} | Part A review` : "Part A review",
      item.explanation,
    );
  }

  return res.json({
    items: review.items,
    usedFallback: review.usedFallback,
  });
});

export default router;
