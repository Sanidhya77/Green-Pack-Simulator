import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { generateTradeoffExplanation } from "../services/aiService.js";

const router = Router();

const requestCounts = new Map<string, number>();
const MAX_REQUESTS_PER_SESSION = 25;

router.post("/explanation", async (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    part: z.enum(["A", "B"]),
    trialIndex: z.number().int().min(0),
    productName: z.string().trim().min(1).max(120),
    productImageUrl: z.string().trim().min(10).max(200000),
    packagingType: z.string().trim().min(1).max(120),
    hasGreenLabel: z.boolean(),
    price: z.number().positive(),
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

  const explanation = await generateTradeoffExplanation({
    productName: parsed.data.productName,
    productImageUrl: parsed.data.productImageUrl,
    packagingType: parsed.data.packagingType,
    hasGreenLabel: parsed.data.hasGreenLabel,
    price: parsed.data.price,
    part: parsed.data.part,
  });

  db.prepare(
    `INSERT INTO ai_explanations
      (session_id, part, trial_index, provider, model, prompt_excerpt, response_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    parsed.data.sessionId,
    parsed.data.part,
    parsed.data.trialIndex,
    explanation.provider,
    explanation.model,
    `${parsed.data.productName} | ${parsed.data.packagingType} | ${parsed.data.price.toFixed(2)} | ${parsed.data.productImageUrl.slice(0, 80)}`,
    explanation.text,
  );

  return res.json({ explanation: explanation.text });
});

export default router;
