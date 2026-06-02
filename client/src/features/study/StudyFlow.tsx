import { useMemo, useState } from "react";
import { aiApi, studyApi } from "../../lib/api";
import { loadImageDataUrl } from "../../lib/productImages";
import { REASON_OPTIONS, TRIALS, type ReasonValue, type TrialOption } from "./trials";

type Stage = "consent" | "trial" | "break" | "final";
type PostChoiceStep = "questions" | "impact";

type FeedbackEntry = {
  reason: ReasonValue;
  part: "A";
};

function scoreLabel(score: number): string {
  if (score >= 75) return "High environmental performance";
  if (score >= 55) return "Moderate environmental performance";
  return "Lower environmental performance";
}

export function StudyFlow() {
  const [stage, setStage] = useState<Stage>("consent");
  const [sessionId, setSessionId] = useState<string>("");
  const [trialIndex, setTrialIndex] = useState(0);
  const [participantCode, setParticipantCode] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [selectedOption, setSelectedOption] = useState<TrialOption | null>(null);
  const [postChoiceStep, setPostChoiceStep] = useState<PostChoiceStep | null>(null);
  const [reason, setReason] = useState<ReasonValue>("price");
  const [confidence, setConfidence] = useState(3);
  const [reflection, setReflection] = useState("");
  const [impactAnalysis, setImpactAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);

  const trial = TRIALS[trialIndex];

  const progressText = useMemo(() => {
    const partTotal = TRIALS.length;
    const inPart = trial ? trial.indexInPart + 1 : TRIALS.length;
    const part = trial?.part ?? "A";
    return `Part ${part} - Trial ${inPart}/${partTotal}`;
  }, [trial]);

  const activePostChoiceStep: PostChoiceStep = postChoiceStep ?? "questions";

  const postChoiceStepLabel = useMemo(() => {
    if (!selectedOption) return "1";
    if (activePostChoiceStep === "questions") return "2";
    return "3";
  }, [selectedOption, activePostChoiceStep]);

  const reasonLabel = useMemo(
    () => REASON_OPTIONS.find((item) => item.value === reason)?.label ?? reason,
    [reason],
  );

  async function startStudy() {
    setError("");
    try {
      setSaving(true);
      const data = await studyApi.startSession(participantCode.trim() || undefined);
      setSessionId(data.sessionId);
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
    setPostChoiceStep("questions");
    setImpactAnalysis("");

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
      setPostChoiceStep(null);
    } finally {
      setSaving(false);
    }
  }

  async function seeImpact() {
    if (!trial || !selectedOption) return;
    setError("");
    setAiLoading(true);

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

      if (trial.part === "A") {
        const optionsPayload = await Promise.all(
          trial.options.map(async (o) => ({
            optionCode: o.optionCode,
            optionId: o.id,
            packagingType: o.packagingType,
            price: o.price,
            hasGreenLabel: o.hasGreenLabel,
            sustainabilityScore: o.sustainabilityScore,
            imageUrl: o.imagePath,
            imageDataUrl: await loadImageDataUrl(o.imagePath),
          })),
        );

        const ai = await aiApi.getTrialFeedback({
          sessionId,
          part: trial.part,
          trialIndex: trial.indexInPart,
          productName: trial.productName,
          productDescription: trial.productDescription,
          selectedOptionId: selectedOption.id,
          confidence,
          reasonLabel,
          reflection: reflection.trim() || undefined,
          options: optionsPayload,
        });
        setImpactAnalysis(ai.impactAnalysis);
        if (ai.usedFallback) {
          setError("Impact summary is based on study data because AI could not run. Check server and API key.");
        }
      } else {
        const sorted = [...trial.options].sort((a, b) => b.sustainabilityScore - a.sustainabilityScore);
        const rank = sorted.findIndex((o) => o.id === selectedOption.id) + 1;
        setImpactAnalysis(
          `You chose Option ${selectedOption.optionCode}. It ranks #${rank} of 3 for sustainability in this trial. Your main reason was "${reasonLabel}" (confidence ${confidence}/5).`,
        );
      }

      setPostChoiceStep("impact");
    } catch {
      setError("Could not load impact analysis. Check that the backend is running on port 4000.");
    } finally {
      setSaving(false);
      setAiLoading(false);
    }
  }

  async function continueToNextTrial() {
    if (!trial || !selectedOption) return;
    setError("");

    const nextEntries: FeedbackEntry[] = [...feedbackEntries, { reason, part: "A" }];
    setFeedbackEntries(nextEntries);

    try {
      setSaving(true);
      if (trialIndex === TRIALS.length - 1) {
        await studyApi.submitSummary({
          sessionId,
          priceFocusCount: nextEntries.filter((e) => e.reason === "price").length,
          sustainabilityFocusCount: nextEntries.filter((e) => e.reason === "sustainability").length,
          labelFocusCount: nextEntries.filter((e) => e.reason === "label").length,
          gutFocusCount: nextEntries.filter((e) => e.reason === "gut").length,
        });
        setStage("final");
        resetTrialState();
        return;
      }

      moveToNextTrial();
    } catch {
      setError("Could not continue to the next trial.");
    } finally {
      setSaving(false);
    }
  }

  function resetTrialState() {
    setSelectedOption(null);
    setPostChoiceStep(null);
    setImpactAnalysis("");
    setReason("price");
    setConfidence(3);
    setReflection("");
    setAiLoading(false);
  }

  function changeChoice() {
    resetTrialState();
    setError("");
  }

  function moveToNextTrial() {
    resetTrialState();
    setTrialIndex((v) => v + 1);
  }

  const sustainabilityRank = useMemo(() => {
    if (!trial || !selectedOption) return null;
    const sorted = [...trial.options].sort((a, b) => b.sustainabilityScore - a.sustainabilityScore);
    return {
      rank: sorted.findIndex((o) => o.id === selectedOption.id) + 1,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [trial, selectedOption]);

  const headerMeta =
    stage === "trial"
      ? trial
        ? selectedOption
          ? `ROUND ${trial.indexInPart + 1} / 10\nSTEP ${postChoiceStepLabel} OF 3`
          : `ROUND ${trial.indexInPart + 1} / 10\nSTEP 1 OF 3`
        : "ROUND 10 / 10"
      : "Scientific Study Build v1";

  const layoutHeader = (
    <header className="layout-topbar">
      <div className="brand">
        <div className="brand-mark">△</div>
        <div>
          <p className="brand-title">Packaging Choice Study</p>
          <p className="brand-meta">RTU PILOT · RIGA · 2026</p>
        </div>
      </div>
      <p className="round-meta">{headerMeta}</p>
    </header>
  );

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
        <button type="button" className="btn-link pick-change" disabled={saving || aiLoading} onClick={changeChoice}>
          Choose a different option
        </button>
      </aside>
    ) : null;

  if (stage === "consent") {
    return (
      <main className="study-shell">
        {layoutHeader}
        <section className="study-card intro-grid">
          <div>
            <p className="eyebrow">Welcome · Pilot Study</p>
            <h1 className="title">How do students evaluate packaging, eco-labels, and purchase decisions?</h1>
            <p className="subtext">
              This RTU pilot focuses on sustainable packaging decisions in student-relevant products.
              The full research protocol links baseline profiling, eco-label stimulus exposure, and behavioral
              response analysis.
            </p>
            <ul className="fact-list">
              <li>10 total choices (Part A active; Part B currently paused)</li>
              <li>Decision behavior capture (choice, confidence, reason, reflection)</li>
              <li>You can stop at any time</li>
            </ul>
            <div className="protocol-summary-card">
              <p className="eyebrow">RTU Research Protocol Context</p>
              <p>This web module is the behavioral decision layer of the wider RTU protocol.</p>
              <ul className="protocol-flow-list">
                <li>Pre-survey and baseline attitudes (separate form)</li>
                <li>Cultural profiling + eco-label stimulus exposure</li>
                <li>Choice behavior analysis, paired with iMotions recordings</li>
              </ul>
            </div>
          </div>
          <aside className="consent-panel">
            <p className="eyebrow">Informed Consent</p>
            <h3>What we record</h3>
            <ul>
              <li>Your product choice per trial</li>
              <li>Reason and confidence after each choice</li>
              <li>Optional reflection notes</li>
            </ul>
            <h3>What we do not record</h3>
            <p>No personal identifiers are required in this app. Eye-tracking/EEG capture is handled in iMotions workflow.</p>
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

  if (stage === "break") {
    return (
      <main className="study-shell">
        {layoutHeader}
        <section className="study-card">
          <header className="study-header">
            <p className="eyebrow">Break</p>
            <h1 className="title">Part A complete</h1>
            <p className="subtext">Part B is currently paused for this phase of testing.</p>
          </header>
          <div className="button-row">
            <button type="button" className="btn-primary" onClick={() => setStage("final")}>
              Continue
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (stage === "final") {
    const counts = {
      price: feedbackEntries.filter((e) => e.reason === "price").length,
      sustainability: feedbackEntries.filter((e) => e.reason === "sustainability").length,
      label: feedbackEntries.filter((e) => e.reason === "label").length,
      gut: feedbackEntries.filter((e) => e.reason === "gut").length,
    };

    const partA = feedbackEntries.filter((e) => e.part === "A" && e.reason === "sustainability").length;

    return (
      <main className="study-shell">
        {layoutHeader}
        <section className="study-card">
          <header className="study-header">
            <p className="eyebrow">Study Complete</p>
            <h1 className="title">Thank you for participating</h1>
            <p className="subtext">Your response patterns are summarized below.</p>
          </header>
          <ul>
            <li>Price-focused choices: {counts.price}</li>
            <li>Sustainability-focused choices: {counts.sustainability}</li>
            <li>Label-driven choices: {counts.label}</li>
            <li>Gut/habit choices: {counts.gut}</li>
            <li>Sustainability-focused choices in Part A: {partA}</li>
          </ul>
        </section>
      </main>
    );
  }

  if (!trial) {
    return null;
  }

  return (
    <main className="study-shell">
      {layoutHeader}
      <section className="study-card">
        <header className="study-header">
          <p className="eyebrow">{progressText}</p>
          <h1 className="title">{trial.productName}</h1>
          <p className="subtext">{trial.productDescription}</p>
        </header>

        {!selectedOption ? (
          <div className="choice-grid">
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
                {activePostChoiceStep === "questions" ? (
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
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={saving || aiLoading}
                        onClick={seeImpact}
                      >
                        {saving || aiLoading ? "Preparing impact..." : "See impact"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {activePostChoiceStep === "impact" ? (
                  <>
                    <section className="impact-panel inline-impact">
                      <h3>Impact analysis</h3>
                      <p className="ai-note-body">
                        {impactAnalysis || "No impact analysis available."}
                      </p>
                      {sustainabilityRank ? (
                        <ul>
                          <li>
                            Your choice ranks <strong>#{sustainabilityRank.rank}</strong> of 3 for sustainability (
                            {scoreLabel(selectedOption.sustainabilityScore)}).
                          </li>
                          <li>
                            Highest in trial: Option {sustainabilityRank.best.optionCode} (
                            {sustainabilityRank.best.sustainabilityScore}/100)
                          </li>
                          <li>
                            Lowest in trial: Option {sustainabilityRank.worst.optionCode} (
                            {sustainabilityRank.worst.sustainabilityScore}/100)
                          </li>
                        </ul>
                      ) : null}
                    </section>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={saving || aiLoading}
                        onClick={() => setPostChoiceStep("questions")}
                      >
                        Back
                      </button>
                      <button type="button" className="btn-primary" disabled={saving || !impactAnalysis} onClick={continueToNextTrial}>
                        {saving
                          ? "Saving..."
                          : trialIndex === TRIALS.length - 1
                            ? "Finish study"
                            : "Continue to next trial"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {error ? <p className="subtext error-text">{error}</p> : null}
      </section>
    </main>
  );
}
