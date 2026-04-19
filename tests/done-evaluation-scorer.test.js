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
  it('scores eligible done issue and persists required snake_case output metadata', () => {
    const scorer = createDoneEvaluationScorer();

    const result = scorer.processDoneEvent(buildDoneInput());

    expect(result.status).toBe(SCORE_STATUS_SUCCESS);
    expect(result.source_issue_id).toBe('issue-1');
    expect(result.scorer_version).toBe(SCORER_VERSION_V1);
    expect(Number.isInteger(result.overall_score)).toBe(true);
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(100);
    expect(result.subscores).toEqual(
      expect.objectContaining({
        quality: expect.any(Number),
        workflow_compliance: expect.any(Number),
        evidence_completeness: expect.any(Number)
      })
    );
    expect(result.reason_codes.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.scored_at).toBeTruthy();
    expect(result.snapshot_hash).toBeTruthy();
    expect(result.score_band).toBeTruthy();
  });

  it('uses pr artifacts as review evidence and avoids false review penalties', () => {
    const scorer = createDoneEvaluationScorer();

    const result = scorer.processDoneEvent(buildDoneInput());

    expect(result.status).toBe(SCORE_STATUS_SUCCESS);
    expect(result.reason_codes).not.toContain('PENALTY_MISSING_REVIEW_EVIDENCE');
  });

  it('applies explicit penalty reason codes for missing critical evidence', () => {
    const scorer = createDoneEvaluationScorer();

    const result = scorer.processDoneEvent(
      buildDoneInput({
        linkedArtifacts: [{ artifactType: 'pr', uri: 'https://example.com/pr/2' }]
      })
    );

    expect(result.status).toBe(SCORE_STATUS_SUCCESS);
    expect(result.reason_codes).toEqual(
      expect.arrayContaining([
        'PENALTY_MISSING_TEST_EVIDENCE',
        'PENALTY_MISSING_EXECUTION_TRACE'
      ])
    );
    expect(result.reason_codes).not.toContain('PENALTY_MISSING_REVIEW_EVIDENCE');
    expect(result.overall_score).toBeLessThan(70);
    expect(result.score_band).toBe(SCORE_BAND_BELOW_THRESHOLD);
  });

  it('rejects non-done issue events at the process boundary', () => {
    const scorer = createDoneEvaluationScorer();
    const input = buildDoneInput({
      issue: {
        id: 'issue-1',
        identifier: 'AGE-108',
        title: 'Implement scorer',
        status: 'in_progress',
        priority: 'high',
        labels: ['automation'],
        completedAt: ISO_TRANSITION
      }
    });

    expect(() => scorer.processDoneEvent(input)).toThrow('processDoneEvent requires issue.status to be "done"');
    expect(scorer.getStoredResultCount()).toBe(0);
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
    expect(result.reason_codes).toEqual(['NA_NO_EXECUTION_EVIDENCE']);
    expect(result.overall_score).toBeUndefined();
    expect(result.subscores).toBeUndefined();
  });

  it('is idempotent for duplicate done events on same snapshot and version', () => {
    const scorer = createDoneEvaluationScorer();
    const input = buildDoneInput();

    const first = scorer.processDoneEvent(input);
    const second = scorer.processDoneEvent(input);

    expect(second.snapshot_hash).toBe(first.snapshot_hash);
    expect(second.scorer_version).toBe(first.scorer_version);
    expect(scorer.getStoredResultCount()).toBe(1);
  });

  it('retries failed scoring with 1m, 5m, and 30m backoff then stays terminal error', () => {
    const scorer = createDoneEvaluationScorer({ failScoring: true });

    const first = scorer.processDoneEvent(buildDoneInput());
    expect(first.status).toBe(SCORE_STATUS_ERROR);
    expect(first.attempt).toBe(1);
    expect(first.next_retry_delay_minutes).toBe(RETRY_DELAYS_MINUTES[0]);

    const second = scorer.retryErroredResult(first.idempotency_key);
    expect(second.attempt).toBe(2);
    expect(second.next_retry_delay_minutes).toBe(RETRY_DELAYS_MINUTES[1]);

    const third = scorer.retryErroredResult(first.idempotency_key);
    expect(third.attempt).toBe(3);
    expect(third.next_retry_delay_minutes).toBe(RETRY_DELAYS_MINUTES[2]);

    const fourth = scorer.retryErroredResult(first.idempotency_key);
    expect(fourth.attempt).toBe(4);
    expect(fourth.status).toBe(SCORE_STATUS_ERROR);
    expect(fourth.next_retry_delay_minutes).toBeNull();
  });

  it('returns latest-by-issue and version-filtered aggregate rates and distribution', () => {
    const scorer = createDoneEvaluationScorer();

    const strong = scorer.processDoneEvent(buildDoneInput());
    expect([SCORE_BAND_STRONG, SCORE_BAND_ACCEPTABLE, SCORE_BAND_BELOW_THRESHOLD]).toContain(strong.score_band);

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
    expect(latest.source_issue_id).toBe('issue-1');

    const aggregates = scorer.getScoreAggregates({
      from: ISO_START,
      to: ISO_END,
      scorer_version: SCORER_VERSION_V1
    });

    expect(aggregates.totals.success_rate).toBeGreaterThan(0);
    expect(aggregates.totals.not_applicable_rate).toBeGreaterThan(0);
    expect(aggregates.distribution).toEqual(
      expect.objectContaining({
        strong_90_100: expect.any(Number),
        acceptable_70_89: expect.any(Number),
        below_70: expect.any(Number)
      })
    );
  });
});
