const crypto = require('node:crypto');

const SCORE_STATUS_SUCCESS = 'success';
const SCORE_STATUS_NOT_APPLICABLE = 'not_applicable';
const SCORE_STATUS_ERROR = 'error';

const SCORER_VERSION_V1 = 'v1';

const SCORE_WEIGHTS_V1 = {
  quality: 50,
  workflowCompliance: 30,
  evidenceCompleteness: 20
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
const STATUS_DONE = 'done';
const PRIORITY_LOW = 'low';

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
    startedAt: normalized.startedAt,
    completedAt: normalized.completedAt
  };
}

function buildSnapshot(input, capturedAt) {
  return {
    sourceIssueId: input.issue.id,
    capturedAt,
    issue: normalizeIssue(input.issue),
    executionStageHistory: input.executionStageHistory || [],
    runSummaries: input.runSummaries || [],
    commentMetadata: input.commentMetadata || {
      totalCount: SCORE_MINIMUM,
      agentCount: SCORE_MINIMUM,
      userCount: SCORE_MINIMUM,
      latestCommentAt: null
    },
    linkedArtifacts: input.linkedArtifacts || []
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

  if (!hasArrayItems(snapshot.runSummaries) || !hasArrayItems(snapshot.executionStageHistory)) {
    return NA_REASON_NO_EXECUTION_EVIDENCE;
  }

  if (snapshot.issue.title && snapshot.issue.title.toLowerCase().includes('admin')) {
    return NA_REASON_ADMIN_ONLY;
  }

  return null;
}

function hasArtifact(snapshot, artifactType) {
  return snapshot.linkedArtifacts.some((artifact) => artifact.artifactType === artifactType);
}

function computePenaltyReasonCodes(snapshot) {
  const reasonCodes = [];

  if (!hasArtifact(snapshot, 'test_report')) {
    reasonCodes.push(PENALTY_MISSING_TEST_EVIDENCE);
  }

  if (!hasArtifact(snapshot, 'review')) {
    reasonCodes.push(PENALTY_MISSING_REVIEW_EVIDENCE);
  }

  if (!hasArtifact(snapshot, 'log')) {
    reasonCodes.push(PENALTY_MISSING_EXECUTION_TRACE);
  }

  return reasonCodes;
}

function sumPenalty(reasonCodes) {
  return reasonCodes.reduce((total, code) => total + PENALTY_POINTS[code], SCORE_MINIMUM);
}

function computeSubscores(snapshot, penaltyReasonCodes) {
  const successfulRuns = snapshot.runSummaries.filter((run) => run.status === SCORE_STATUS_SUCCESS);
  const runCount = snapshot.runSummaries.length || INITIAL_ATTEMPT;
  const runHealth = successfulRuns.length / runCount;
  const hasPenalty = penaltyReasonCodes.length > SCORE_MINIMUM;

  const qualityBase = BASE_QUALITY_SCORE * runHealth;
  const quality = roundScore(qualityBase - (hasPenalty ? QUALITY_PENALTY_WITH_MISSING_CRITICAL_EVIDENCE : SCORE_MINIMUM));
  const workflowBase = BASE_WORKFLOW_SCORE * (hasArrayItems(snapshot.executionStageHistory) ? INITIAL_ATTEMPT : SCORE_MINIMUM);
  const workflow = roundScore(workflowBase - (hasPenalty ? WORKFLOW_PENALTY_WITH_MISSING_CRITICAL_EVIDENCE : SCORE_MINIMUM));
  const evidence = roundScore(BASE_EVIDENCE_SCORE - sumPenalty(penaltyReasonCodes));

  return {
    quality,
    workflowCompliance: workflow,
    evidenceCompleteness: evidence
  };
}

function weightedOverall(subscores) {
  const weighted =
    (subscores.quality * SCORE_WEIGHTS_V1.quality +
      subscores.workflowCompliance * SCORE_WEIGHTS_V1.workflowCompliance +
      subscores.evidenceCompleteness * SCORE_WEIGHTS_V1.evidenceCompleteness) /
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
    reasonCodes: [reasonCode],
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
    overallScore,
    subscores,
    scoreBand,
    reasonCodes,
    summary: summarizeResult(SCORE_STATUS_SUCCESS, scoreBand, reasonCodes)
  };
}

function createErrorResult(base, attempt, errorReason) {
  const nextRetryDelayMinutes = attempt < MAX_ATTEMPTS ? RETRY_DELAYS_MINUTES[attempt - INITIAL_ATTEMPT] : null;
  return {
    ...base,
    status: SCORE_STATUS_ERROR,
    reasonCodes: ['ERROR_SCORING_ATTEMPT_FAILED'],
    summary: summarizeResult(SCORE_STATUS_ERROR, null, []),
    errorReason,
    nextRetryDelayMinutes
  };
}

function createDoneEvaluationScorer(options = {}) {
  const failScoring = options.failScoring === true;
  const records = new Map();
  const latestByIssue = new Map();

  function scoreSnapshot(input, attempt) {
    const scoredAt = new Date().toISOString();
    const capturedAt = input.transitionedAt || scoredAt;
    const snapshot = buildSnapshot(input, capturedAt);
    const snapshotHash = computeSnapshotHash(snapshot);
    const sourceIssueId = snapshot.sourceIssueId;
    const scorerVersion = SCORER_VERSION_V1;
    const idempotencyKey = `${sourceIssueId}:${snapshotHash}:${scorerVersion}`;
    const baseResult = {
      sourceIssueId,
      snapshotHash,
      scorerVersion,
      scoredAt,
      attempt,
      idempotencyKey
    };

    const notApplicableReason = pickNotApplicableReason(snapshot);
    if (notApplicableReason) {
      return { snapshot, idempotencyKey, result: createNotApplicableResult(baseResult, notApplicableReason) };
    }

    if (failScoring) {
      const error = createErrorResult(baseResult, attempt, 'SCORER_FAILURE');
      return { snapshot, idempotencyKey, result: error };
    }

    return { snapshot, idempotencyKey, result: createSuccessResult(baseResult, snapshot) };
  }

  function persistResult(idempotencyKey, result) {
    records.set(idempotencyKey, result);
    latestByIssue.set(result.sourceIssueId, result);
    return result;
  }

  function processDoneEvent(input) {
    const existing = latestByIssue.get(input.issue.id);
    if (existing && existing.status !== SCORE_STATUS_ERROR) {
      const existingKey = `${existing.sourceIssueId}:${existing.snapshotHash}:${existing.scorerVersion}`;
      const duplicate = scoreSnapshot(input, existing.attempt);
      if (duplicate.idempotencyKey === existingKey) {
        return existing;
      }
    }

    const attempted = scoreSnapshot(input, INITIAL_ATTEMPT);
    if (records.has(attempted.idempotencyKey)) {
      return records.get(attempted.idempotencyKey);
    }

    return persistResult(attempted.idempotencyKey, attempted.result);
  }

  function retryErroredResult(idempotencyKey) {
    const current = records.get(idempotencyKey);
    if (!current || current.status !== SCORE_STATUS_ERROR || current.attempt >= MAX_ATTEMPTS) {
      return current || null;
    }

    const attempt = current.attempt + INITIAL_ATTEMPT;
    const retried = {
      ...current,
      attempt,
      scoredAt: new Date().toISOString(),
      nextRetryDelayMinutes: attempt < MAX_ATTEMPTS ? RETRY_DELAYS_MINUTES[attempt - INITIAL_ATTEMPT] : null
    };
    return persistResult(idempotencyKey, retried);
  }

  function getLatestScoreByIssue(issueId) {
    return latestByIssue.get(issueId) || null;
  }

  function getStoredResultCount() {
    return records.size;
  }

  function getScoreAggregates(query) {
    const fromTime = Date.parse(query.from);
    const toTime = Date.parse(query.to);
    const values = Array.from(latestByIssue.values()).filter((result) => {
      const scoredAt = Date.parse(result.scoredAt);
      const inWindow = scoredAt >= fromTime && scoredAt <= toTime;
      const versionMatches = !query.scorerVersion || result.scorerVersion === query.scorerVersion;
      return inWindow && versionMatches;
    });

    const total = values.length;
    const successCount = values.filter((result) => result.status === SCORE_STATUS_SUCCESS).length;
    const errorCount = values.filter((result) => result.status === SCORE_STATUS_ERROR).length;
    const notApplicableCount = values.filter((result) => result.status === SCORE_STATUS_NOT_APPLICABLE).length;

    return {
      window: { from: query.from, to: query.to },
      scorerVersion: query.scorerVersion,
      totals: {
        evaluated: total,
        successRate: total > SCORE_MINIMUM ? successCount / total : SCORE_MINIMUM,
        failureRate: total > SCORE_MINIMUM ? errorCount / total : SCORE_MINIMUM,
        notApplicableRate: total > SCORE_MINIMUM ? notApplicableCount / total : SCORE_MINIMUM
      },
      distribution: {
        strong_90_100: values.filter((result) => result.scoreBand === SCORE_BAND_STRONG).length,
        acceptable_70_89: values.filter((result) => result.scoreBand === SCORE_BAND_ACCEPTABLE).length,
        below_70: values.filter((result) => result.scoreBand === SCORE_BAND_BELOW_THRESHOLD).length
      }
    };
  }

  return {
    processDoneEvent,
    retryErroredResult,
    getLatestScoreByIssue,
    getStoredResultCount,
    getScoreAggregates
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
