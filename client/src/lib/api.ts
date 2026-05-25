import type { ReasonValue, StudyPart } from "../features/study/trials";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function send<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }

  return (await response.json()) as T;
}

export const studyApi = {
  startSession: (participantCode?: string) =>
    send<{ sessionId: string }>("/api/study/session/start", { participantCode }),

  submitBaseline: (
    sessionId: string,
    thinksSustainability: "always" | "often" | "sometimes" | "rarely" | "never",
  ) =>
    send<{ ok: true }>("/api/study/baseline", { sessionId, thinksSustainability }),

  submitChoice: (payload: {
    sessionId: string;
    part: StudyPart;
    trialIndex: number;
    productKey: string;
    optionId: string;
    price: number;
    packagingType: string;
    hasGreenLabel: boolean;
  }) => send<{ ok: true }>("/api/study/choice", payload),

  submitFeedback: (payload: {
    sessionId: string;
    part: StudyPart;
    trialIndex: number;
    reason: ReasonValue;
    confidence: number;
    reflection?: string;
  }) => send<{ ok: true }>("/api/study/feedback", payload),

  submitSummary: (payload: {
    sessionId: string;
    priceFocusCount: number;
    sustainabilityFocusCount: number;
    labelFocusCount: number;
    gutFocusCount: number;
  }) => send<{ ok: true }>("/api/study/summary", payload),
};

export const aiApi = {
  getExplanation: (payload: {
    sessionId: string;
    part: StudyPart;
    trialIndex: number;
    productName: string;
    productImageUrl: string;
    packagingType: string;
    hasGreenLabel: boolean;
    price: number;
  }) => send<{ explanation: string }>("/api/ai/explanation", payload),
};
