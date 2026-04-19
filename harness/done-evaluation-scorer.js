const crypto = require('node:crypto');

const SCORE_STATUS_SUCCESS = 'success';
const SCORE_STATUS_NOT_APPLICABLE = 'not_applicable';
const SCORE_STATUS_ERROR = 'error';

const SCORER_VERSION_V1 = 'v1';

const SCORE_WEIGHTS_V1 = {
  quality: 50,
  workflow_compliance: 30,
  evidence_completeness: 20
};

const SCORE_BAND_STRONG = 'strong';
const SCORE_BAND_ACCEPTABLE = 'acceptable';
const SCORE_BAND_BELOW_THRESHOLD = 'below_threshold';

const BAND_STRONG_MINIMUM = 90;
const BAND_ACCEPTABLE_MINIMUM = 70;
const SCORE_MINIMUM = 0;
const SCORE_MAXIMUM = 100;

const RETRY_DELAYS_MINUTES = [1, 5, 30];
const INITIAL_ATTEMPT = 1;
const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + INITIAL_ATTEMPT;

const NA_REASON_ADMIN_ONLY = 'NA_ADMIN_ONLY';
const NA_REASON_NO_EXECUTION_EVIDENCE = 'NA_NO_EXECUTION_EVIDENCE';
const NA_REASON_POLICY_EXEMPT = 'NA_POLICY_EXEMPT';

const PENALTY_MISSING_TEST_EVIDENCE = 'PENALTY_MISSING_TEST_EVIDENCE';
const PENALTY_MISSING_REVIEW_EVIDENCE = 'PENALTY_MISSING_REVIEW_EVIDENCE';
const PENALTY_MISSING_EXECUTION_TRACE = 'PENALTY_MISSING_EXECUTION_TRACE';

const PENALTY_POINTS = {
  [PENALTY_MISSING_TEST_EVIDENCE]: 35,
  [PENALTY_MISSING_REVIEW_EVIDENCE]: 20,
  [PENALTY_MISSING_EXECUTION_TRACE]: 35
};

const BASE_QUALITY_SCORE = 90;
const BASE_WORKFLOW_SCORE = 90;
const BASE_EVIDENCE_SCORE = 100;
const QUALITY_PENALTY_WITH_MISSING_CRITICAL_EVIDENCE = 25;
const WORKFLOW_PENALTY_WITH_MISSING_CRITICAL_EVIDENCE = 15;

const REASON_CODE_SCORE_COMPUTED = 'SCORE_COMPUTED';
const REASON_CODE_SCORING_ERROR = 'ERROR_SCORING_ATTEMPT_FAILED';

const STATUS_DONE = 'done';
const PRIORITY_LOW = 'low';

const ARTIFACT_TEST_REPORT = 'test_report';
const ARTIFACT_REVIEW = 'review';
const ARTIFACT_PR = 'pr';
const ARTIFACT_LOG = 'log';

const NON_DONE_STATUS_ERROR = 'processDoneEvent requires issue.status to be "done"';

function clampScore(value) {
  if (value < SCORE_MINIMUM) {
    return SCORE_MINIMUM;
  }

  if (value > SCORE_MAXIMUM) {
    return SCORE_MAXIMUM;
  }

  return value;
}

function roundScore(value) {
  return Math.round(clampScore(value));
}

function hasArrayItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function normalizeIssue(issue) {
  const normalized = issue || {};
  return {
    id: normalized.id,
    identifier: normalized.identifier,
    title: normalized.title,
    status: normalized.status,
    priority: normalized.priority || PRIORITY_LOW,
    labels: Array.isArray(normalized.labels) ? normalized.labels : [],
    started_at: normalized.startedAt,
    completed_at: normalized.completedAt
  };
}

function createDefaultCommentMetadata() {
  return {
    total_count: SCORE_MINIMUM,
    agent_count: SCORE_MINIMUM,
    user_count: SCORE_MINIMUM,
    latest_comment_at: null
  };
}

function buildSnapshot(input, capturedAt) {
  return {
    source_issue_id: input.issue.id,
    captured_at: capturedAt,
    issue: normalizeIssue(input.issue),
    execution_stage_history: input.executionStageHistory || [],
    run_summaries: input.runSummaries || [],
    comment_metadata: input.commentMetadata || createDefaultCommentMetadata(),
    linked_artifacts: input.linkedArtifacts || []
  };
}

function stableSortValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = stableSortValue(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function computeSnapshotHash(snapshot) {
  const normalized = stableSortValue(snapshot);
  const payload = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function pickNotApplicableReason(snapshot) {
  if (snapshot.issue.priority === PRIORITY_LOW) {
    return NA_REASON_POLICY_EXEMPT;
  }

  if (!hasArrayItems(snapshot.run_summaries) || !hasArrayItems(snapshot.execution_stage_history)) {
    return NA_REASON_NO_EXECUTION_EVIDENCE;
  }

  if (snapshot.issue.title && snapshot.issue.title.toLowerCase().includes('admin')) {
    return NA_REASON_ADMIN_ONLY;
  }

  return null;
}

function hasArtifact(snapshot, artifactType) {
  return snapshot.linked_artifacts.some((artifact) => artifact.artifactType === artifactType);
}

function hasReviewArtifact(snapshot) {
  return hasArtifact(snapshot, ARTIFACT_REVIEW) || hasArtifact(snapshot, ARTIFACT_PR);
}

function computePenaltyReasonCodes(snapshot) {
  const reasonCodes = [];

  if (!hasArtifact(snapshot, ARTIFACT_TEST_REPORT)) {
    reasonCodes.push(PENALTY_MISSING_TEST_EVIDENCE);
  }

  if (!hasReviewArtifact(snapshot)) {
    reasonCodes.push(PENALTY_MISSING_REVIEW_EVIDENCE);
  }

  if (!hasArtifact(snapshot, ARTIFACT_LOG)) {
    reasonCodes.push(PENALTY_MISSING_EXECUTION_TRACE);
  }

  return reasonCodes;
}

function sumPenalty(reasonCodes) {
  return reasonCodes.reduce((total, code) => total + PENALTY_POINTS[code], SCORE_MINIMUM);
}

function computeSubscores(snapshot, penaltyReasonCodes) {
  const successfulRuns = snapshot.run_summaries.filter((run) => run.status === SCORE_STATUS_SUCCESS);
  const runCount = snapshot.run_summaries.length || INITIAL_ATTEMPT;
  const runHealth = successfulRuns.length / runCount;
  const hasPenalty = penaltyReasonCodes.length > SCORE_MINIMUM;

  const qualityBase = BASE_QUALITY_SCORE * runHealth;
  const quality = roundScore(qualityBase - (hasPenalty ? QUALITY_PENALTY_WITH_MISSING_CRITICAL_EVIDENCE : SCORE_MINIMUM));
  const workflowBase = BASE_WORKFLOW_SCORE * (hasArrayItems(snapshot.execution_stage_history) ? INITIAL_ATTEMPT : SCORE_MINIMUM);
  const workflowCompliance = roundScore(workflowBase - (hasPenalty ? WORKFLOW_PENALTY_WITH_MISSING_CRITICAL_EVIDENCE : SCORE_MINIMUM));
  const evidenceCompleteness = roundScore(BASE_EVIDENCE_SCORE - sumPenalty(penaltyReasonCodes));

  return {
    quality,
    workflow_compliance: workflowCompliance,
    evidence_completeness: evidenceCompleteness
  };
}

function weightedOverall(subscores) {
  const weighted =
    (subscores.quality * SCORE_WEIGHTS_V1.quality +
      subscores.workflow_compliance * SCORE_WEIGHTS_V1.workflow_compliance +
      subscores.evidence_completeness * SCORE_WEIGHTS_V1.evidence_completeness) /
    SCORE_MAXIMUM;

  return roundScore(weighted);
}

function determineScoreBand(overallScore) {
  if (overallScore >= BAND_STRONG_MINIMUM) {
    return SCORE_BAND_STRONG;
  }

  if (overallScore >= BAND_ACCEPTABLE_MINIMUM) {
    return SCORE_BAND_ACCEPTABLE;
  }

  return SCORE_BAND_BELOW_THRESHOLD;
}

function summarizeResult(status, scoreBand, reasonCodes) {
  if (status === SCORE_STATUS_NOT_APPLICABLE) {
    return 'Issue is not eligible for scoring under v1 contract.';
  }

  if (status === SCORE_STATUS_ERROR) {
    return 'Scoring attempt failed and was persisted for retry visibility.';
  }

  if (reasonCodes.length === INITIAL_ATTEMPT && reasonCodes[0] === REASON_CODE_SCORE_COMPUTED) {
    return `Scoring completed with ${scoreBand} completion quality.`;
  }

  return `Scoring completed with ${scoreBand} completion quality and evidence penalties.`;
}

function createNotApplicableResult(base, reasonCode) {
  return {
    ...base,
    status: SCORE_STATUS_NOT_APPLICABLE,
    reason_codes: [reasonCode],
    summary: summarizeResult(SCORE_STATUS_NOT_APPLICABLE, null, [reasonCode])
  };
}

function createSuccessResult(base, snapshot) {
  const penaltyReasonCodes = computePenaltyReasonCodes(snapshot);
  const reasonCodes = penaltyReasonCodes.length > SCORE_MINIMUM ? penaltyReasonCodes : [REASON_CODE_SCORE_COMPUTED];
  const subscores = computeSubscores(snapshot, penaltyReasonCodes);
  const overallScore = weightedOverall(subscores);
  const scoreBand = determineScoreBand(overallScore);

  return {
    ...base,
    status: SCORE_STATUS_SUCCESS,
    overall_score: overallScore,
    subscores,
    score_band: scoreBand,
    reason_codes: reasonCodes,
    summary: summarizeResult(SCORE_STATUS_SUCCESS, scoreBand, reasonCodes)
  };
}

function createErrorResult(base, attempt, errorReason) {
  return {
    ...base,
    status: SCORE_STATUS_ERROR,
    reason_codes: [REASON_CODE_SCORING_ERROR],
    summary: summarizeResult(SCORE_STATUS_ERROR, null, []),
    error_reason: errorReason,
    next_retry_delay_minutes: attempt < MAX_ATTEMPTS ? RETRY_DELAYS_MINUTES[attempt - INITIAL_ATTEMPT] : null
  };
}

function createScorerState(options = {}) {
  return {
    failScoring: options.failScoring === true,
    records: new Map(),
    latestByIssue: new Map()
  };
}

function buildIdempotencyKey(sourceIssueId, snapshotHash, scorerVersion) {
  return `${sourceIssueId}:${snapshotHash}:${scorerVersion}`;
}

function buildBaseResult(snapshot, snapshotHash, scoredAt, attempt) {
  return {
    source_issue_id: snapshot.source_issue_id,
    snapshot_hash: snapshotHash,
    scorer_version: SCORER_VERSION_V1,
    scored_at: scoredAt,
    attempt,
    idempotency_key: buildIdempotencyKey(snapshot.source_issue_id, snapshotHash, SCORER_VERSION_V1)
  };
}

function scoreSnapshot(state, input, attempt) {
  const scoredAt = new Date().toISOString();
  const capturedAt = input.transitionedAt || scoredAt;
  const snapshot = buildSnapshot(input, capturedAt);
  const snapshotHash = computeSnapshotHash(snapshot);
  const baseResult = buildBaseResult(snapshot, snapshotHash, scoredAt, attempt);

  const notApplicableReason = pickNotApplicableReason(snapshot);
  if (notApplicableReason) {
    return { result: createNotApplicableResult(baseResult, notApplicableReason), idempotencyKey: baseResult.idempotency_key };
  }

  if (state.failScoring) {
    return { result: createErrorResult(baseResult, attempt, 'SCORER_FAILURE'), idempotencyKey: baseResult.idempotency_key };
  }

  return { result: createSuccessResult(baseResult, snapshot), idempotencyKey: baseResult.idempotency_key };
}

function persistResult(state, idempotencyKey, result) {
  state.records.set(idempotencyKey, result);
  state.latestByIssue.set(result.source_issue_id, result);
  return result;
}

function assertDoneStatus(input) {
  if (!input || !input.issue || input.issue.status !== STATUS_DONE) {
    throw new Error(NON_DONE_STATUS_ERROR);
  }
}

function findDuplicateResult(state, input) {
  const existing = state.latestByIssue.get(input.issue.id);
  if (!existing || existing.status === SCORE_STATUS_ERROR) {
    return null;
  }

  const duplicateAttempt = scoreSnapshot(state, input, existing.attempt);
  if (duplicateAttempt.idempotencyKey === existing.idempotency_key) {
    return existing;
  }

  return null;
}

function processDoneEvent(state, input) {
  assertDoneStatus(input);

  const duplicate = findDuplicateResult(state, input);
  if (duplicate) {
    return duplicate;
  }

  const attempted = scoreSnapshot(state, input, INITIAL_ATTEMPT);
  if (state.records.has(attempted.idempotencyKey)) {
    return state.records.get(attempted.idempotencyKey);
  }

  return persistResult(state, attempted.idempotencyKey, attempted.result);
}

function retryErroredResult(state, idempotencyKey) {
  const current = state.records.get(idempotencyKey);
  const cannotRetry = !current || current.status !== SCORE_STATUS_ERROR || current.attempt >= MAX_ATTEMPTS;
  if (cannotRetry) {
    return current || null;
  }

  const attempt = current.attempt + INITIAL_ATTEMPT;
  const retried = {
    ...current,
    attempt,
    scored_at: new Date().toISOString(),
    next_retry_delay_minutes: attempt < MAX_ATTEMPTS ? RETRY_DELAYS_MINUTES[attempt - INITIAL_ATTEMPT] : null
  };

  return persistResult(state, idempotencyKey, retried);
}

function getLatestScoreByIssue(state, issueId) {
  return state.latestByIssue.get(issueId) || null;
}

function getStoredResultCount(state) {
  return state.records.size;
}

function isScoreInWindow(result, query, fromTime, toTime) {
  const scoredAt = Date.parse(result.scored_at);
  const inWindow = scoredAt >= fromTime && scoredAt <= toTime;
  const versionMatches = !query.scorer_version || result.scorer_version === query.scorer_version;
  return inWindow && versionMatches;
}

function countByStatus(values, status) {
  return values.filter((result) => result.status === status).length;
}

function buildRateTotals(values) {
  const total = values.length;
  const successCount = countByStatus(values, SCORE_STATUS_SUCCESS);
  const errorCount = countByStatus(values, SCORE_STATUS_ERROR);
  const notApplicableCount = countByStatus(values, SCORE_STATUS_NOT_APPLICABLE);

  return {
    evaluated: total,
    success_rate: total > SCORE_MINIMUM ? successCount / total : SCORE_MINIMUM,
    failure_rate: total > SCORE_MINIMUM ? errorCount / total : SCORE_MINIMUM,
    not_applicable_rate: total > SCORE_MINIMUM ? notApplicableCount / total : SCORE_MINIMUM
  };
}

function buildDistribution(values) {
  return {
    strong_90_100: values.filter((result) => result.score_band === SCORE_BAND_STRONG).length,
    acceptable_70_89: values.filter((result) => result.score_band === SCORE_BAND_ACCEPTABLE).length,
    below_70: values.filter((result) => result.score_band === SCORE_BAND_BELOW_THRESHOLD).length
  };
}

function getScoreAggregates(state, query) {
  const fromTime = Date.parse(query.from);
  const toTime = Date.parse(query.to);
  const values = Array.from(state.latestByIssue.values()).filter((result) => isScoreInWindow(result, query, fromTime, toTime));

  return {
    window: { from: query.from, to: query.to },
    scorer_version: query.scorer_version,
    totals: buildRateTotals(values),
    distribution: buildDistribution(values)
  };
}

function createDoneEvaluationScorer(options = {}) {
  const state = createScorerState(options);
  return {
    processDoneEvent: (input) => processDoneEvent(state, input),
    retryErroredResult: (idempotencyKey) => retryErroredResult(state, idempotencyKey),
    getLatestScoreByIssue: (issueId) => getLatestScoreByIssue(state, issueId),
    getStoredResultCount: () => getStoredResultCount(state),
    getScoreAggregates: (query) => getScoreAggregates(state, query)
  };
}

module.exports = {
  createDoneEvaluationScorer,
  RETRY_DELAYS_MINUTES,
  SCORE_BAND_STRONG,
  SCORE_BAND_ACCEPTABLE,
  SCORE_BAND_BELOW_THRESHOLD,
  SCORE_STATUS_SUCCESS,
  SCORE_STATUS_NOT_APPLICABLE,
  SCORE_STATUS_ERROR,
  SCORER_VERSION_V1
};
