const {
  createDoneEvaluationScorer,
  RETRY_DELAYS_MINUTES,
  SCORE_BAND_STRONG,
  SCORE_BAND_ACCEPTABLE,
  SCORE_BAND_BELOW_THRESHOLD,
  SCORE_STATUS_SUCCESS,
  SCORE_STATUS_NOT_APPLICABLE,
  SCORE_STATUS_ERROR,
  SCORER_VERSION_V1
} = require('../harness/done-evaluation-scorer');

const ISO_START = '2026-04-19T00:00:00.000Z';
const ISO_END = '2026-04-20T00:00:00.000Z';
const ISO_TRANSITION = '2026-04-19T12:00:00.000Z';

function buildDoneInput(overrides = {}) {
  return {
    transitionedAt: ISO_TRANSITION,
    issue: {
      id: 'issue-1',
      identifier: 'AGE-108',
      title: 'Implement scorer',
      status: 'done',
      priority: 'high',
      labels: ['automation'],
      completedAt: ISO_TRANSITION
    },
    executionStageHistory: [
      {
        stageType: 'execution',
        participantType: 'agent',
        participantId: 'agent-1',
        startedAt: '2026-04-19T11:40:00.000Z',
        finishedAt: ISO_TRANSITION,
        outcome: 'approved'
      }
    ],
    runSummaries: [
      {
        runId: 'run-1',
        startedAt: '2026-04-19T11:45:00.000Z',
        completedAt: ISO_TRANSITION,
        status: 'success',
        commandCount: 10,
        checkCount: 4
      }
    ],
    commentMetadata: {
      totalCount: 4,
      agentCount: 2,
      userCount: 2,
      latestCommentAt: ISO_TRANSITION
    },
    linkedArtifacts: [
      { artifactType: 'test_report', uri: 'https://example.com/test-report' },
      { artifactType: 'pr', uri: 'https://example.com/pr/1' },
      { artifactType: 'log', uri: 'https://example.com/log/1' }
    ],
    ...overrides
  };
}

describe('done-evaluation scorer', () => {
  it('scores eligible done issue and persists required output metadata', () => {
    const scorer = createDoneEvaluationScorer();

    const result = scorer.processDoneEvent(buildDoneInput());

    expect(result.status).toBe(SCORE_STATUS_SUCCESS);
    expect(result.sourceIssueId).toBe('issue-1');
    expect(result.scorerVersion).toBe(SCORER_VERSION_V1);
    expect(Number.isInteger(result.overallScore)).toBe(true);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.subscores).toEqual(
      expect.objectContaining({
        quality: expect.any(Number),
        workflowCompliance: expect.any(Number),
        evidenceCompleteness: expect.any(Number)
      })
    );
    expect(result.reasonCodes.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.scoredAt).toBeTruthy();
    expect(result.snapshotHash).toBeTruthy();
  });

  it('applies explicit penalty reason codes for missing critical evidence', () => {
    const scorer = createDoneEvaluationScorer();

    const result = scorer.processDoneEvent(
      buildDoneInput({
        linkedArtifacts: [{ artifactType: 'pr', uri: 'https://example.com/pr/2' }]
      })
    );

    expect(result.status).toBe(SCORE_STATUS_SUCCESS);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        'PENALTY_MISSING_TEST_EVIDENCE',
        'PENALTY_MISSING_REVIEW_EVIDENCE',
        'PENALTY_MISSING_EXECUTION_TRACE'
      ])
    );
    expect(result.overallScore).toBeLessThan(70);
    expect(result.scoreBand).toBe(SCORE_BAND_BELOW_THRESHOLD);
  });

  it('marks ineligible inputs as not_applicable with one required reason code', () => {
    const scorer = createDoneEvaluationScorer();

    const result = scorer.processDoneEvent(
      buildDoneInput({
        executionStageHistory: [],
        runSummaries: []
      })
    );

    expect(result.status).toBe(SCORE_STATUS_NOT_APPLICABLE);
    expect(result.reasonCodes).toEqual(['NA_NO_EXECUTION_EVIDENCE']);
    expect(result.overallScore).toBeUndefined();
    expect(result.subscores).toBeUndefined();
  });

  it('is idempotent for duplicate done events on same snapshot and version', () => {
    const scorer = createDoneEvaluationScorer();
    const input = buildDoneInput();

    const first = scorer.processDoneEvent(input);
    const second = scorer.processDoneEvent(input);

    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.scorerVersion).toBe(first.scorerVersion);
    expect(scorer.getStoredResultCount()).toBe(1);
  });

  it('retries failed scoring with 1m, 5m, and 30m backoff then stays terminal error', () => {
    const scorer = createDoneEvaluationScorer({ failScoring: true });

    const first = scorer.processDoneEvent(buildDoneInput());
    expect(first.status).toBe(SCORE_STATUS_ERROR);
    expect(first.attempt).toBe(1);
    expect(first.nextRetryDelayMinutes).toBe(RETRY_DELAYS_MINUTES[0]);

    const second = scorer.retryErroredResult(first.idempotencyKey);
    expect(second.attempt).toBe(2);
    expect(second.nextRetryDelayMinutes).toBe(RETRY_DELAYS_MINUTES[1]);

    const third = scorer.retryErroredResult(first.idempotencyKey);
    expect(third.attempt).toBe(3);
    expect(third.nextRetryDelayMinutes).toBe(RETRY_DELAYS_MINUTES[2]);

    const fourth = scorer.retryErroredResult(first.idempotencyKey);
    expect(fourth.attempt).toBe(4);
    expect(fourth.status).toBe(SCORE_STATUS_ERROR);
    expect(fourth.nextRetryDelayMinutes).toBeNull();
  });

  it('returns latest-by-issue and version-filtered aggregate rates and distribution', () => {
    const scorer = createDoneEvaluationScorer();

    const strong = scorer.processDoneEvent(buildDoneInput());
    expect([SCORE_BAND_STRONG, SCORE_BAND_ACCEPTABLE, SCORE_BAND_BELOW_THRESHOLD]).toContain(strong.scoreBand);

    scorer.processDoneEvent(
      buildDoneInput({
        issue: {
          id: 'issue-2',
          identifier: 'AGE-109',
          title: 'No evidence case',
          status: 'done',
          priority: 'medium',
          labels: [],
          completedAt: ISO_TRANSITION
        },
        executionStageHistory: [],
        runSummaries: []
      })
    );

    const latest = scorer.getLatestScoreByIssue('issue-1');
    expect(latest).not.toBeNull();
    expect(latest.sourceIssueId).toBe('issue-1');

    const aggregates = scorer.getScoreAggregates({
      from: ISO_START,
      to: ISO_END,
      scorerVersion: SCORER_VERSION_V1
    });

    expect(aggregates.totals.successRate).toBeGreaterThan(0);
    expect(aggregates.totals.notApplicableRate).toBeGreaterThan(0);
    expect(aggregates.distribution).toEqual(
      expect.objectContaining({
        strong_90_100: expect.any(Number),
        acceptable_70_89: expect.any(Number),
        below_70: expect.any(Number)
      })
    );
  });
});
