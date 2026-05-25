import { useMemo, useState } from "react";
import { aiApi, studyApi } from "../../lib/api";
import { REASON_OPTIONS, TRIALS, type ReasonValue, type TrialOption } from "./trials";

type Stage = "consent" | "baseline" | "trial" | "break" | "final";

type FeedbackEntry = {
  reason: ReasonValue;
  part: "A";
};

type ImpactInsight = {
  selected: TrialOption;
  best: TrialOption;
  worst: TrialOption;
  selectedRank: number;
  isFinalTrial: boolean;
  isEndOfPartA: boolean;
  nextEntries: FeedbackEntry[];
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
  const [baseline, setBaseline] = useState<"always" | "often" | "sometimes" | "rarely" | "never">("sometimes");
  const [selectedOption, setSelectedOption] = useState<TrialOption | null>(null);
  const [reason, setReason] = useState<ReasonValue>("price");
  const [confidence, setConfidence] = useState(3);
  const [reflection, setReflection] = useState("");
  const [aiExplanation, setAiExplanation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [impactInsight, setImpactInsight] = useState<ImpactInsight | null>(null);

  const trial = TRIALS[trialIndex];

  const progressText = useMemo(() => {
    const partTotal = TRIALS.length;
    const inPart = trial ? trial.indexInPart + 1 : TRIALS.length;
    const part = trial?.part ?? "A";
    return `Part ${part} - Trial ${inPart}/${partTotal}`;
  }, [trial]);

  async function startStudy() {
    setError("");
    try {
      setSaving(true);
      const data = await studyApi.startSession(participantCode.trim() || undefined);
      setSessionId(data.sessionId);
      setStage("baseline");
    } catch {
      setError("Could not start session. Check backend server and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submitBaseline() {
    setError("");
    try {
      setSaving(true);
      await studyApi.submitBaseline(sessionId, baseline);
      setStage("trial");
    } catch {
      setError("Could not save baseline response.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseOption(option: TrialOption) {
    if (!trial) return;
    setError("");
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
      setSelectedOption(option);

      if (trial.part === "A") {
        const ai = await aiApi.getExplanation({
          sessionId,
          part: trial.part,
          trialIndex: trial.indexInPart,
          productName: trial.productName,
          productImageUrl: option.imagePath,
          packagingType: option.packagingType,
          hasGreenLabel: option.hasGreenLabel,
          price: option.price,
        });
        setAiExplanation(ai.explanation);
      } else {
        setAiExplanation("");
      }
    } catch {
      setError("Could not save your choice. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPostChoice() {
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

      const nextEntries: FeedbackEntry[] = [...feedbackEntries, { reason, part: "A" }];
      setFeedbackEntries(nextEntries);

      const isEndOfPartA = trialIndex === TRIALS.length - 1;
      const isFinalTrial = trialIndex === TRIALS.length - 1;
      const sorted = [...trial.options].sort((a, b) => b.sustainabilityScore - a.sustainabilityScore);
      const selectedRank = sorted.findIndex((option) => option.id === selectedOption.id) + 1;

      setImpactInsight({
        selected: selectedOption,
        best: sorted[0],
        worst: sorted[sorted.length - 1],
        selectedRank,
        isFinalTrial,
        isEndOfPartA,
        nextEntries,
      });
    } catch {
      setError("Could not save post-choice response.");
    } finally {
      setSaving(false);
    }
  }

  async function continueAfterImpact() {
    if (!impactInsight) return;
    setError("");
    try {
      setSaving(true);
      if (impactInsight.isFinalTrial) {
        const summaryCounts = {
          priceFocusCount: impactInsight.nextEntries.filter((e) => e.reason === "price").length,
          sustainabilityFocusCount: impactInsight.nextEntries.filter((e) => e.reason === "sustainability").length,
          labelFocusCount: impactInsight.nextEntries.filter((e) => e.reason === "label").length,
          gutFocusCount: impactInsight.nextEntries.filter((e) => e.reason === "gut").length,
        };
        await studyApi.submitSummary({
          sessionId,
          ...summaryCounts,
        });
        setImpactInsight(null);
        setStage("final");
        return;
      }

      setImpactInsight(null);
      moveToNextTrial();
    } catch {
      setError("Could not continue to the next trial.");
    } finally {
      setSaving(false);
    }
  }

  function moveToNextTrial() {
    setSelectedOption(null);
    setAiExplanation("");
    setReason("price");
    setConfidence(3);
    setReflection("");
    setImpactInsight(null);
    setTrialIndex((v) => v + 1);
  }

  const headerMeta =
    stage === "trial"
      ? trial
        ? `ROUND ${trial.indexInPart + 1} / 10\nSTEP ${selectedOption ? "2" : "1"} OF 2`
        : "ROUND 10 / 10"
      : stage === "baseline"
        ? "BEFORE WE START · 1 QUESTION"
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
                <li>Pre-survey and baseline attitudes</li>
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

  if (stage === "baseline") {
    return (
      <main className="study-shell">
        {layoutHeader}
        <section className="study-card">
          <header className="study-header">
            <p className="eyebrow">Baseline Question</p>
            <h1 className="title">When you go shopping, how often do you think about packaging sustainability?</h1>
            <p className="subtext">A baseline check. Pick the answer that feels closest to your normal behavior.</p>
          </header>
          <div className="baseline-card-list">
            {(
              [
                { value: "never", hint: "I don't think about it." },
                { value: "rarely", hint: "Only on a special purchase." },
                { value: "sometimes", hint: "Maybe once a week." },
                { value: "often", hint: "Most shopping trips." },
                { value: "always", hint: "It is one of my main criteria." },
              ] as const
            ).map((item) => (
              <button
                type="button"
                className={`baseline-card ${baseline === item.value ? "is-selected" : ""}`}
                onClick={() => setBaseline(item.value)}
                key={item.value}
              >
                <span className="baseline-card-title">
                  {item.value.charAt(0).toUpperCase()}
                  {item.value.slice(1)}
                </span>
                <span className="baseline-card-hint">{item.hint}</span>
              </button>
            ))}
          </div>
          <div className="button-row baseline-actions">
            <button type="button" className="btn-primary" disabled={saving} onClick={submitBaseline}>
              {saving ? "Saving..." : "Continue to Trials"}
            </button>
          </div>
          {error ? <p className="subtext">{error}</p> : null}
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
            <p className="subtext">
              Part B is currently paused for this phase of testing.
            </p>
          </header>
          <div className="button-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setStage("final");
              }}
            >
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
          <>
            <div className="choice-grid">
              {trial.options.map((option) => (
                <article className="choice-card" key={option.id}>
                  <div className="product-image-wrap">
                    <img
                      src={option.imagePath}
                      alt={`${trial.productName} packaging option ${option.optionCode}`}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
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
                    Select this option
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="feedback-layout">
            <aside className="pick-panel">
              <p className="eyebrow">Your Pick</p>
              <h3>Option {selectedOption.optionCode}</h3>
              <div className="product-image-wrap is-pick">
                <img
                  src={selectedOption.imagePath}
                  alt={`${trial.productName} selected option`}
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = "none";
                  }}
                />
              </div>
              <div className="pick-box">
                <p>Price: €{selectedOption.price.toFixed(2)}</p>
                <p>Packaging profile: Recorded for impact analysis</p>
              </div>
            </aside>

            <div className="feedback-box">
              {trial.part === "A" ? (
                <p className="ai-note">
                  <strong>AI trade-off note:</strong> {aiExplanation || "Generating explanation..."}
                </p>
              ) : (
                <p className="ai-note">
                  <strong>AI trade-off note:</strong> Hidden in Part B.
                </p>
              )}

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
                  <button type="button" className="btn-primary" disabled={saving} onClick={submitPostChoice}>
                    {saving ? "Saving..." : "See impact"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {impactInsight ? (
          <section className="impact-panel">
            <h3>Impact analysis for this choice</h3>
            <p>
              Your selected option ranks <strong>#{impactInsight.selectedRank}</strong> out of 3 for sustainability in this
              trial.
            </p>
            <ul>
              <li>
                <strong>Chosen option:</strong> {impactInsight.selected.sustainabilityScore}/100 (
                {scoreLabel(impactInsight.selected.sustainabilityScore)})
              </li>
              <li>
                <strong>Most sustainable in this trial:</strong> Option {impactInsight.best.optionCode} (
                {impactInsight.best.sustainabilityScore}/100)
              </li>
              <li>
                <strong>Least sustainable in this trial:</strong> Option {impactInsight.worst.optionCode} (
                {impactInsight.worst.sustainabilityScore}/100)
              </li>
            </ul>
            <div className="button-row">
              <button type="button" className="btn-primary" disabled={saving} onClick={continueAfterImpact}>
                {saving ? "Continuing..." : "Continue to next trial"}
              </button>
            </div>
          </section>
        ) : null}
        {error ? <p className="subtext">{error}</p> : null}
      </section>
    </main>
  );
}
