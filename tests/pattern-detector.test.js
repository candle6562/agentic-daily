const { evaluatePatternWindows } = require('../src/pattern-detector');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(baseDate, dayOffset) {
  return new Date(baseDate.getTime() - (dayOffset * ONE_DAY_MS)).toISOString();
}

function blockedEvent(baseDate, id, issueId, dayOffset, actorId) {
  return {
    id,
    issueId,
    actorId,
    timestamp: daysAgo(baseDate, dayOffset),
    workspaceScope: 'ws-main',
    responsibleRole: 'Builder',
    failureReason: 'missing prerequisites',
    transition: { from: 'in_progress', to: 'blocked' }
  };
}

describe('evaluatePatternWindows', () => {
  const now = new Date('2026-04-19T00:00:00.000Z');

  it('triggers learning issue when threshold is met across distinct issues', () => {
    const events = [
      blockedEvent(now, 'ev-1', 'ISSUE-1', 2, 'agent-1'),
      blockedEvent(now, 'ev-2', 'ISSUE-2', 4, 'agent-2'),
      blockedEvent(now, 'ev-3', 'ISSUE-3', 8, 'agent-3')
    ];

    const result = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues: [] });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('triggered');
    expect(result.decisions[0].highRisk).toBe(true);
    expect(result.decisions[0].learningIssue.title.startsWith('Learning:')).toBe(true);
    expect(result.decisions[0].learningIssue.relatedIssueId).toBe('AGE-18');
    expect(result.auditLog[0].decision).toBe('triggered');
  });

  it('suppresses when threshold is missed', () => {
    const events = [
      blockedEvent(now, 'ev-1', 'ISSUE-1', 2, 'agent-1'),
      blockedEvent(now, 'ev-2', 'ISSUE-1', 4, 'agent-1')
    ];

    const result = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues: [] });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('suppressed');
    expect(result.decisions[0].learningIssue).toBeNull();
    expect(result.auditLog[0].decision).toBe('suppressed');
  });

  it('dedupes to an open learning issue and appends evidence', () => {
    const events = [
      blockedEvent(now, 'ev-1', 'ISSUE-1', 2, 'agent-1'),
      blockedEvent(now, 'ev-2', 'ISSUE-2', 4, 'agent-1'),
      blockedEvent(now, 'ev-3', 'ISSUE-3', 6, 'agent-1')
    ];

    const existingLearningIssues = [
      {
        id: 'LI-1',
        patternKey: 'blocked_transition|missing_prerequisites|Builder|ws-main',
        status: 'in_progress',
        updatedAt: '2026-04-18T00:00:00.000Z'
      }
    ];

    const result = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('deduped');
    expect(result.decisions[0].targetLearningIssueId).toBe('LI-1');
    expect(result.decisions[0].learningIssue).toBeNull();
    expect(result.decisions[0].evidence).toHaveLength(3);
  });

  it('enriches latest closed learning issue when inside cooldown window', () => {
    const events = [
      blockedEvent(now, 'ev-1', 'ISSUE-1', 2, 'agent-1'),
      blockedEvent(now, 'ev-2', 'ISSUE-2', 4, 'agent-1'),
      blockedEvent(now, 'ev-3', 'ISSUE-3', 6, 'agent-1')
    ];

    const existingLearningIssues = [
      {
        id: 'LI-2',
        patternKey: 'blocked_transition|missing_prerequisites|Builder|ws-main',
        status: 'done',
        updatedAt: '2026-04-10T00:00:00.000Z'
      }
    ];

    const result = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].decision).toBe('enriched');
    expect(result.decisions[0].targetLearningIssueId).toBe('LI-2');
    expect(result.auditLog[0].decision).toBe('enriched');
  });

  it('flags high risk from seven-day count and notifies Architect + PM', () => {
    const events = [
      blockedEvent(now, 'ev-1', 'ISSUE-1', 1, 'agent-1'),
      blockedEvent(now, 'ev-2', 'ISSUE-2', 2, 'agent-1'),
      blockedEvent(now, 'ev-3', 'ISSUE-3', 3, 'agent-2'),
      blockedEvent(now, 'ev-4', 'ISSUE-4', 4, 'agent-2'),
      blockedEvent(now, 'ev-5', 'ISSUE-5', 5, 'agent-3')
    ];

    const result = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues: [] });

    expect(result.decisions[0].highRisk).toBe(true);
    expect(result.decisions[0].learningIssue.body).toContain('@Architect');
    expect(result.decisions[0].learningIssue.body).toContain('@PM');
  });

  it('replay is deterministic for ids and evidence merge targets', () => {
    const events = [
      blockedEvent(now, 'ev-1', 'ISSUE-1', 2, 'agent-1'),
      blockedEvent(now, 'ev-2', 'ISSUE-2', 4, 'agent-1'),
      blockedEvent(now, 'ev-3', 'ISSUE-3', 6, 'agent-1')
    ];

    const firstRun = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues: [] });
    const secondRun = evaluatePatternWindows({ now: now.toISOString(), events, existingLearningIssues: [] });

    expect(firstRun.decisions[0].learningIssue.id).toBe(secondRun.decisions[0].learningIssue.id);
    expect(firstRun.decisions[0].evidence).toEqual(secondRun.decisions[0].evidence);
  });
});
