import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";

const router = Router();

const partSchema = z.enum(["A", "B"]);

router.post("/session/start", (req, res) => {
  const bodySchema = z.object({
    participantCode: z.string().trim().max(100).optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid session payload" });
  }

  const sessionId = randomUUID();
  db.prepare("INSERT INTO sessions (id, participant_code) VALUES (?, ?)")
    .run(sessionId, parsed.data.participantCode ?? null);

  return res.json({ sessionId });
});

router.post("/baseline", (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    thinksSustainability: z.enum(["always", "often", "sometimes", "rarely", "never"]),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid baseline payload" });
  }

  db.prepare(
    `INSERT INTO baseline_responses (session_id, thinks_sustainability)
     VALUES (?, ?)
     ON CONFLICT(session_id) DO UPDATE SET thinks_sustainability = excluded.thinks_sustainability`,
  ).run(parsed.data.sessionId, parsed.data.thinksSustainability);

  return res.json({ ok: true });
});

router.post("/choice", (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    part: partSchema,
    trialIndex: z.number().int().min(0),
    productKey: z.string().min(1).max(100),
    optionId: z.string().min(1).max(100),
    price: z.number().positive(),
    packagingType: z.string().min(1).max(100),
    hasGreenLabel: z.boolean(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid choice payload" });
  }

  db.prepare(
    `INSERT INTO trial_choices
      (session_id, part, trial_index, product_key, option_id, price, packaging_type, has_green_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, part, trial_index) DO UPDATE SET
       option_id = excluded.option_id,
       price = excluded.price,
       packaging_type = excluded.packaging_type,
       has_green_label = excluded.has_green_label`,
  ).run(
    parsed.data.sessionId,
    parsed.data.part,
    parsed.data.trialIndex,
    parsed.data.productKey,
    parsed.data.optionId,
    parsed.data.price,
    parsed.data.packagingType,
    parsed.data.hasGreenLabel ? 1 : 0,
  );

  return res.json({ ok: true });
});

router.post("/feedback", (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    part: partSchema,
    trialIndex: z.number().int().min(0),
    reason: z.enum(["price", "sustainability", "label", "gut", "other"]),
    confidence: z.number().int().min(1).max(5),
    reflection: z.string().trim().max(1000).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid feedback payload" });
  }

  db.prepare(
    `INSERT INTO post_choice_feedback
      (session_id, part, trial_index, reason, confidence, reflection)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, part, trial_index) DO UPDATE SET
       reason = excluded.reason,
       confidence = excluded.confidence,
       reflection = excluded.reflection`,
  ).run(
    parsed.data.sessionId,
    parsed.data.part,
    parsed.data.trialIndex,
    parsed.data.reason,
    parsed.data.confidence,
    parsed.data.reflection ?? null,
  );

  return res.json({ ok: true });
});

router.post("/summary", (req, res) => {
  const bodySchema = z.object({
    sessionId: z.string().uuid(),
    priceFocusCount: z.number().int().min(0),
    sustainabilityFocusCount: z.number().int().min(0),
    labelFocusCount: z.number().int().min(0),
    gutFocusCount: z.number().int().min(0),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid summary payload" });
  }

  db.prepare(
    `INSERT INTO final_summaries
      (session_id, price_focus_count, sustainability_focus_count, label_focus_count, gut_focus_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       price_focus_count = excluded.price_focus_count,
       sustainability_focus_count = excluded.sustainability_focus_count,
       label_focus_count = excluded.label_focus_count,
       gut_focus_count = excluded.gut_focus_count`,
  ).run(
    parsed.data.sessionId,
    parsed.data.priceFocusCount,
    parsed.data.sustainabilityFocusCount,
    parsed.data.labelFocusCount,
    parsed.data.gutFocusCount,
  );

  return res.json({ ok: true });
});

export default router;
