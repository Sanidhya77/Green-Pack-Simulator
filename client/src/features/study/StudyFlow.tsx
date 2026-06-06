import { useMemo, useState } from "react";
import { aiApi, studyApi } from "../../lib/api";
import {
  buildComparisonTable,
  buildTrialRecord,
  computePartMetrics,
  reasonLabel,
  type TrialRecord,
} from "./studyMetrics";
import {
  PART_A_TRIAL_COUNT,
  PART_B_TRIAL_COUNT,
  buildSessionTrials,
  partAEndTrialIndex,
  partBStartTrialIndex,
  REASON_OPTIONS,
  TRIALS,
  type ReasonValue,
  type TrialDefinition,
  type TrialOption,
} from "./trials";

type Stage = "consent" | "trial" | "partAReview" | "partBIntro" | "final";

type PartAReviewCard = {
  trialIndex: number;
  productName: string;
  selectedOptionCode: string;
  options: Array<{
    optionCode: string;
    imageUrl: string;
    bullets: string[];
    isSelected: boolean;
  }>;
  choiceFeedback: string[];
  reasonLabel: string;
  confidence: number;
};

export function StudyFlow() {
  const [stage, setStage] = useState<Stage>("consent");
  const [sessionId, setSessionId] = useState<string>("");
  const [trialIndex, setTrialIndex] = useState(0);
  const [participantCode, setParticipantCode] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedOption, setSelectedOption] = useState<TrialOption | null>(null);
  const [reason, setReason] = useState<ReasonValue>("price");
  const [confidence, setConfidence] = useState(3);
  const [reflection, setReflection] = useState("");
  const [trialHistory, setTrialHistory] = useState<TrialRecord[]>([]);
  const [partAReviewCards, setPartAReviewCards] = useState<PartAReviewCard[]>([]);
  const [partAReviewLoading, setPartAReviewLoading] = useState(false);
  const [sessionTrials, setSessionTrials] = useState<TrialDefinition[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trial = sessionTrials?.[trialIndex] ?? null;
  const partAEndIndex = partAEndTrialIndex();
  const partBStartIndex = partBStartTrialIndex();

  const progressText = useMemo(() => {
    if (!trial) return "";
    const total = trial.part === "A" ? PART_A_TRIAL_COUNT : PART_B_TRIAL_COUNT;
    return `Part ${trial.part} — Trial ${trial.indexInPart + 1}/${total}`;
  }, [trial]);

  const comparison = useMemo(() => {
    const partA = trialHistory.filter((r) => r.part === "A");
    const partB = trialHistory.filter((r) => r.part === "B");
    return buildComparisonTable(computePartMetrics(partA), computePartMetrics(partB));
  }, [trialHistory]);

  async function startStudy() {
    setError("");
    try {
      setSaving(true);
      const data = await studyApi.startSession(participantCode.trim() || undefined);
      setSessionId(data.sessionId);
      setSessionTrials(buildSessionTrials(data.sessionId));
      setStage("trial");
    } catch {
      setError("Could not start session. Check backend server and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseOption(option: TrialOption) {
    if (!trial) return;
    setError("");
    setSelectedOption(option);

    try {
      setSaving(true);
      await studyApi.submitChoice({
        sessionId,
        part: trial.part,
        trialIndex: trial.indexInPart,
        productKey: trial.id,
        optionId: option.id,
        price: option.price,
        packagingType: option.packagingType,
        hasGreenLabel: option.hasGreenLabel,
      });
    } catch {
      setError("Could not save your choice. Please try again.");
      setSelectedOption(null);
    } finally {
      setSaving(false);
    }
  }

  async function buildPartAReviewPayload(record: TrialRecord) {
    if (!sessionTrials) throw new Error("Session trials not loaded");

    const trialDef = sessionTrials.find((t) => t.part === "A" && t.indexInPart === record.trialIndex);
    if (!trialDef) throw new Error("Trial not found");

    const chosen = trialDef.options.find((o) => o.id === record.optionId);
    if (!chosen) throw new Error("Option not found");

    const optionsPayload = trialDef.options.map((o) => ({
      optionCode: o.optionCode,
      optionId: o.id,
      packagingType: o.packagingType,
      price: o.price,
      hasGreenLabel: o.hasGreenLabel,
      sustainabilityScore: o.sustainabilityScore,
      imageUrl: o.imagePath,
    }));

    return {
      trialIndex: record.trialIndex,
      productName: trialDef.productName,
      productDescription: trialDef.productDescription,
      selectedOptionId: chosen.id,
      confidence: record.confidence,
      reasonLabel: reasonLabel(record.reason),
      reflection: record.reflection,
      options: optionsPayload,
    };
  }

  async function loadPartAReview(records: TrialRecord[]) {
    setPartAReviewLoading(true);
    setError("");

    try {
      const trialsPayload = await Promise.all(records.map((r) => buildPartAReviewPayload(r)));
      const review = await aiApi.getPartAReview({ sessionId, trials: trialsPayload });

      const cards: PartAReviewCard[] = records.map((record) => {
        const item = review.items.find((i) => i.trialIndex === record.trialIndex);
        return {
          trialIndex: record.trialIndex,
          productName: record.productName,
          selectedOptionCode: record.optionCode,
          options: item?.options ?? [],
          choiceFeedback: item?.choiceFeedback ?? [],
          reasonLabel: reasonLabel(record.reason),
          confidence: record.confidence,
        };
      });

      setPartAReviewCards(cards);
      if (review.usedFallback) {
        setError("Some explanations use backup text because AI could not run. Check server and API key.");
      }
    } catch {
      setError("Could not load Part A review. Check that the backend is running.");
      setPartAReviewCards(
        records.map((record) => {
          const trialDef = sessionTrials!.find((t) => t.part === "A" && t.indexInPart === record.trialIndex)!;
          const rank =
            record.sustainabilityRank === 1
              ? "most sustainable"
              : record.sustainabilityRank === 3
                ? "least sustainable"
                : "middle option";
          return {
            trialIndex: record.trialIndex,
            productName: record.productName,
            selectedOptionCode: record.optionCode,
            options: trialDef.options.map((o) => ({
              optionCode: o.optionCode,
              imageUrl: o.imagePath,
              bullets: [o.packagingType, o.hasGreenLabel ? "Eco label visible" : "No eco label"],
              isSelected: o.id === record.optionId,
            })),
            choiceFeedback: [
              `You chose Option ${record.optionCode} — the ${rank} of the three options.`,
              `Your main reason was "${reasonLabel(record.reason)}" (confidence ${record.confidence}/5).`,
            ],
            reasonLabel: reasonLabel(record.reason),
            confidence: record.confidence,
          };
        }),
      );
    } finally {
      setPartAReviewLoading(false);
    }
  }

  async function finishTrialQuestions() {
    if (!trial || !selectedOption) return;
    setError("");

    try {
      setSaving(true);
      await studyApi.submitFeedback({
        sessionId,
        part: trial.part,
        trialIndex: trial.indexInPart,
        reason,
        confidence,
        reflection: reflection.trim() || undefined,
      });

      const record = buildTrialRecord(trial, selectedOption, reason, confidence, reflection);
      const newHistory = [...trialHistory, record];
      setTrialHistory(newHistory);
      resetTrialState();

      if (trialIndex === partAEndIndex) {
        setStage("partAReview");
        await loadPartAReview(newHistory.filter((r) => r.part === "A"));
        return;
      }

      if (trialIndex === TRIALS.length - 1) {
        await submitFinalSummary(newHistory);
        setStage("final");
        return;
      }

      setTrialIndex((v) => v + 1);
    } catch {
      setError("Could not save your responses. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submitFinalSummary(history: TrialRecord[]) {
    await studyApi.submitSummary({
      sessionId,
      priceFocusCount: history.filter((r) => r.reason === "price").length,
      sustainabilityFocusCount: history.filter((r) => r.reason === "sustainability").length,
      labelFocusCount: history.filter((r) => r.reason === "label").length,
      gutFocusCount: history.filter((r) => r.reason === "gut").length,
    });
  }

  function resetTrialState() {
    setSelectedOption(null);
    setReason("price");
    setConfidence(3);
    setReflection("");
  }

  function changeChoice() {
    resetTrialState();
    setError("");
  }

  function startPartB() {
    setError("");
    setStage("trial");
    setTrialIndex(partBStartIndex);
  }

  const trialStepLabel = selectedOption ? "Step 2 of 2" : "Step 1 of 2";

  function studyBrand(showPilotMeta = false) {
    return (
      <div className="brand brand--compact">
        <div className="brand-mark">△</div>
        <div>
          <p className="brand-title">Packaging Choice Study</p>
          {showPilotMeta ? <p className="brand-meta">RTU PILOT · RIGA · 2026</p> : null}
        </div>
      </div>
    );
  }

  function unifiedHeaderTop(meta: string, showPilotMeta = false) {
    return (
      <div className="unified-header-top">
        {studyBrand(showPilotMeta)}
        <p className="unified-header-meta">{meta}</p>
      </div>
    );
  }

  const pickPanel =
    trial && selectedOption ? (
      <aside className="pick-panel">
        <p className="eyebrow">Your Pick</p>
        <h3>Option {selectedOption.optionCode}</h3>
        <div className="product-image-wrap is-pick">
          <img
            src={selectedOption.imagePath}
            alt={`${trial.productName} selected option`}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
        <div className="pick-box">
          <p>Price: €{selectedOption.price.toFixed(2)}</p>
          <p>{selectedOption.packagingType}</p>
        </div>
        <button type="button" className="btn-link pick-change" disabled={saving} onClick={changeChoice}>
          Choose a different option
        </button>
      </aside>
    ) : null;

  if (stage === "consent") {
    return (
      <main className="study-shell">
        <section className="study-card intro-grid">
          <header className="unified-header unified-header--span">
            {unifiedHeaderTop("Welcome · Pilot Study", true)}
          </header>
          <div>
            <h1 className="title">How do students evaluate packaging, eco-labels, and purchase decisions?</h1>
            <p className="subtext">
              Part A: five packaging choices with AI feedback afterward. Part B: five more choices without AI.
            </p>
            <ul className="fact-list">
              <li>10 total product choices</li>
              <li>Confidence, reason, and reflection after each choice</li>
              <li>Final summary compares Part A vs Part B</li>
            </ul>
          </div>
          <aside className="consent-panel">
            <p className="eyebrow">Informed Consent</p>
            <h3>What we record</h3>
            <ul>
              <li>Your product choice per trial</li>
              <li>Reason and confidence after each choice</li>
              <li>Optional reflection notes</li>
            </ul>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              I am 18+ and I consent to participate in this study.
            </label>
            <label className="field-label">
              Participant code (optional)
              <input
                value={participantCode}
                onChange={(e) => setParticipantCode(e.target.value)}
                placeholder="e.g., RTU-P12"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="btn-primary"
                disabled={saving || !consentChecked}
                onClick={startStudy}
              >
                {saving ? "Starting..." : "Begin study"}
              </button>
            </div>
          </aside>
          {error ? <p className="subtext error-text">{error}</p> : null}
        </section>
      </main>
    );
  }

  if (stage === "partAReview") {
    return (
      <main className="study-shell">
        <section className="study-card">
          <header className="unified-header">
            {unifiedHeaderTop("Part A · Review")}
            <h1 className="title title--page">Your five choices — AI review</h1>
            <p className="subtext">
              Compare all three options, then read personalized tips on your choice and what to look for when
              shopping sustainably.
            </p>
          </header>

          {partAReviewLoading ? (
            <p className="subtext">Preparing feedback for your five choices...</p>
          ) : (
            <div className="part-a-review-list">
              {partAReviewCards.map((card) => (
                <article className="part-a-review-card" key={card.trialIndex}>
                  <header className="part-a-review-head">
                    <h3>
                      Trial {card.trialIndex + 1}: {card.productName}
                    </h3>
                    <p className="review-meta">
                      You chose Option {card.selectedOptionCode} · {card.reasonLabel} · confidence{" "}
                      {card.confidence}/5
                    </p>
                  </header>

                  <div className="part-a-review-options">
                    {card.options.map((opt) => (
                      <div
                        className={`part-a-review-option ${opt.isSelected ? "is-selected" : ""}`}
                        key={opt.optionCode}
                      >
                        <div className="part-a-review-option-image">
                          <img src={opt.imageUrl} alt={`Option ${opt.optionCode}`} />
                          {opt.isSelected ? <span className="review-pick-badge">Your choice</span> : null}
                        </div>
                        <p className="part-a-review-option-label">Option {opt.optionCode}</p>
                        <ul className="review-bullet-list">
                          {opt.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="part-a-review-choice-feedback">
                    <p className="review-section-label">About your choice</p>
                    <ul className="review-bullet-list review-bullet-list--emphasis">
                      {card.choiceFeedback.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="button-row">
            <button
              type="button"
              className="btn-primary"
              disabled={partAReviewLoading || partAReviewCards.length === 0}
              onClick={() => setStage("partBIntro")}
            >
              Continue
            </button>
          </div>
          {error ? <p className="subtext error-text">{error}</p> : null}
        </section>
      </main>
    );
  }

  if (stage === "partBIntro") {
    return (
      <main className="study-shell">
        <section className="study-card">
          <header className="unified-header">
            {unifiedHeaderTop("Part B · Intro")}
            <h1 className="title title--page">Part B will now begin</h1>
            <p className="subtext">
              You will make five more packaging choices. There is no AI feedback during or after Part B. The same
              questions (confidence, reason, reflection) follow each choice.
            </p>
          </header>
          <div className="button-row">
            <button type="button" className="btn-primary" onClick={startPartB}>
              Start Part B
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (stage === "final") {
    return (
      <main className="study-shell">
        <section className="study-card">
          <header className="unified-header">
            {unifiedHeaderTop("Study complete")}
            <h1 className="title title--page">Thank you for participating</h1>
            <p className="subtext">
              How your choices differed between Part A (before AI review) and Part B (after AI review).
            </p>
          </header>

          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>Part A (1st 5)</th>
                  <th>Part B (2nd 5)</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.partA}</td>
                    <td>{row.partB}</td>
                    <td>{row.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="comparison-note">
            Positive change on sustainability score or most sustainable picks suggests greener choices in Part B.
            Lower gap vs best option also means closer to the greenest packaging in each trial.
          </p>
        </section>
      </main>
    );
  }

  if (!trial) {
    return null;
  }

  return (
    <main className="study-shell study-shell--trial">
      <section className="study-card study-card--trial">
        <header className="unified-header unified-header--trial">
          {unifiedHeaderTop(`${progressText} · ${trialStepLabel}`)}
          <h1 className="title title--trial">{trial.productName}</h1>
          <p className="subtext subtext--trial">{trial.productDescription}</p>
          {trial.part === "B" ? (
            <p className="subtext compact-text trial-hint">Part B — no AI feedback for these trials.</p>
          ) : null}
        </header>

        {!selectedOption ? (
          <div className="choice-grid choice-grid--trial">
            {trial.options.map((option) => (
              <article className="choice-card" key={option.id}>
                <div className="product-image-wrap">
                  <img
                    src={option.imagePath}
                    alt={`${trial.productName} packaging option ${option.optionCode}`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
                <h4>Option {option.optionCode}</h4>
                <ul>
                  <li>Price: €{option.price.toFixed(2)}</li>
                </ul>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => chooseOption(option)}
                >
                  {saving ? "Saving..." : "Select this option"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="post-choice-flow">
            <div className="feedback-layout">
              {pickPanel}
              <div className="feedback-box">
                <div className="form-grid">
                  <label className="question-label">How confident are you in this choice?</label>
                  <div className="confidence-slider">
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={confidence}
                      onChange={(e) => setConfidence(Number(e.target.value))}
                    />
                    <div className="confidence-ticks" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((point) => (
                        <span key={point} className={`tick ${confidence === point ? "is-active" : ""}`} />
                      ))}
                    </div>
                  </div>
                  <div className="scale-labels">
                    <span>Not at all</span>
                    <span>A little</span>
                    <span>Somewhat</span>
                    <span>Confident</span>
                    <span>Very confident</span>
                  </div>

                  <label className="question-label">What mattered most in your decision?</label>
                  <div className="reason-card-grid">
                    {REASON_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={`reason-card ${reason === item.value ? "is-selected" : ""}`}
                        onClick={() => setReason(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <label className="field-label">
                    Reflection (optional)
                    <textarea
                      value={reflection}
                      rows={3}
                      onChange={(e) => setReflection(e.target.value)}
                      placeholder="Short note about your choice process..."
                    />
                  </label>

                  <div className="button-row">
                    <button type="button" className="btn-primary" disabled={saving} onClick={finishTrialQuestions}>
                      {saving
                        ? "Saving..."
                        : trialIndex === partAEndIndex
                          ? "Finish Part A"
                          : trialIndex === TRIALS.length - 1
                            ? "Finish study"
                            : "Continue to next trial"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error ? <p className="subtext error-text">{error}</p> : null}
      </section>
    </main>
  );
}
