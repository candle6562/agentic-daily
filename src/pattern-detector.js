const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const HIGH_RISK_WINDOW_DAYS = 7;
const COOLDOWN_DAYS = 21;
const TRIGGER_COUNT_MINIMUM = 3;
const DISTINCT_ISSUE_MINIMUM = 2;
const HIGH_RISK_COUNT_MINIMUM = 5;
const HIGH_RISK_AFFECTED_AGENTS_MINIMUM = 3;

const EVENT_TYPES = {
  BLOCKED_TRANSITION: 'blocked_transition',
  REVIEW_BACKFLOW: 'review_backflow',
  REOPENED_FROM_DONE: 'reopened_from_done'
};
const EVENT_TYPE_VALUES = new Set(Object.values(EVENT_TYPES));

const STATUSES = {
  BLOCKED: 'blocked',
  IN_REVIEW: 'in_review',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

const DECISIONS = {
  TRIGGERED: 'triggered',
  DEDUPED: 'deduped',
  ENRICHED: 'enriched',
  SUPPRESSED: 'suppressed'
};

const OPEN_LEARNING_STATUSES = new Set([
  'todo',
  'in_progress',
  'in_review',
  'blocked'
]);

const TERMINAL_STATUSES = new Set([
  STATUSES.DONE,
  STATUSES.CANCELLED
]);

const PROGRAM_RELATED_ISSUE_ID = 'AGE-18';
const DEFAULT_ASSIGNEE_ROLE = 'Architect';

function toMs(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsedMs = Date.parse(value);
  return Number.isNaN(parsedMs) ? null : parsedMs;
}

function normalizeText(value, fallbackValue) {
  if (!value || typeof value !== 'string') {
    return fallbackValue;
  }

  return value.trim();
}

function normalizeReason(reason) {
  const normalizedReason = normalizeText(reason, 'unknown');
  return normalizedReason.toLowerCase().replace(/\s+/g, '_');
}

function normalizePatternKeyFields(eventType, event) {
  const failureReason = normalizeReason(event.failureReason || event.reason);
  const responsibleRole = normalizeText(event.responsibleRole || event.actorRole, 'UnknownRole');
  const workspaceScope = normalizeText(event.workspaceScope || event.workspaceId, 'global');

  return {
    eventType,
    failureReason,
    responsibleRole,
    workspaceScope
  };
}

function buildPatternKey(fields) {
  return [fields.eventType, fields.failureReason, fields.responsibleRole, fields.workspaceScope].join('|');
}

function isWithinDays(newerMs, olderMs, dayCount) {
  if (!newerMs || !olderMs) {
    return false;
  }

  const maxAgeMs = dayCount * DAY_IN_MS;
  const ageMs = newerMs - olderMs;

  return ageMs >= 0 && ageMs <= maxAgeMs;
}

function classifyFromTransition(event, nowMs) {
  const transition = event.transition || {};
  const fromStatus = normalizeText(transition.from, '');
  const toStatus = normalizeText(transition.to, '');

  if (toStatus === STATUSES.BLOCKED) {
    return EVENT_TYPES.BLOCKED_TRANSITION;
  }

  if (fromStatus === STATUSES.IN_REVIEW && toStatus === STATUSES.IN_PROGRESS) {
    return EVENT_TYPES.REVIEW_BACKFLOW;
  }

  if (fromStatus !== STATUSES.DONE || TERMINAL_STATUSES.has(toStatus)) {
    return null;
  }

  if (event.reopenedWithinDays != null) {
    return event.reopenedWithinDays <= HIGH_RISK_WINDOW_DAYS
      ? EVENT_TYPES.REOPENED_FROM_DONE
      : null;
  }

  const doneAtMs = toMs(event.doneAt);
  const eventAtMs = toMs(event.timestamp);
  const effectiveNowMs = eventAtMs || nowMs;

  if (!doneAtMs || !effectiveNowMs) {
    return EVENT_TYPES.REOPENED_FROM_DONE;
  }

  return isWithinDays(effectiveNowMs, doneAtMs, HIGH_RISK_WINDOW_DAYS)
    ? EVENT_TYPES.REOPENED_FROM_DONE
    : null;
}

function normalizeEvent(event, nowMs) {
  const timestampMs = toMs(event.timestamp);
  if (!timestampMs) {
    return null;
  }

  const eventType = event.eventType || classifyFromTransition(event, nowMs);
  if (!eventType || !EVENT_TYPE_VALUES.has(eventType)) {
    return null;
  }

  const fields = normalizePatternKeyFields(eventType, event);

  return {
    id: normalizeText(event.id, 'unknown-event'),
    issueId: normalizeText(event.issueId, 'unknown-issue'),
    actorId: normalizeText(event.actorId, 'unknown-agent'),
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    patternFields: fields,
    patternKey: buildPatternKey(fields)
  };
}

function hashText(text) {
  const HASH_BASE = 31;
  const HASH_MOD = 2147483647;
  let accumulator = 0;

  for (const char of text) {
    accumulator = (accumulator * HASH_BASE + char.charCodeAt(0)) % HASH_MOD;
  }

  return accumulator.toString(36);
}

function toEvidence(events) {
  return [...events]
    .sort((left, right) => left.timestampMs - right.timestampMs || left.id.localeCompare(right.id))
    .map((event) => ({
      eventId: event.id,
      issueId: event.issueId,
      timestamp: event.timestamp
    }));
}

function formatEvidenceLines(evidence) {
  return evidence.map((entry) => `- ${entry.issueId} @ ${entry.timestamp} (${entry.eventId})`).join('\n');
}

function createLearningIssue(patternKey, patternFields, evidence, highRisk) {
  const riskLine = highRisk ? 'High-risk trigger: yes\nNotify: @Architect @PM\n' : 'High-risk trigger: no\n';
  const bodyLines = [
    `Pattern Key: ${patternKey}`,
    `Event Type: ${patternFields.eventType}`,
    `Failure Reason: ${patternFields.failureReason}`,
    `Responsible Role: ${patternFields.responsibleRole}`,
    `Workspace Scope: ${patternFields.workspaceScope}`,
    riskLine.trimEnd(),
    'Evidence:',
    formatEvidenceLines(evidence),
    '',
    `Suggested Owner Role: ${DEFAULT_ASSIGNEE_ROLE}`,
    'Next Action Checklist:',
    '- Validate root cause with affected team',
    '- Define prevention guardrail and owner',
    '- Add regression check to governance harness',
    '- Confirm closure criteria with PM',
    '- If high-risk remains unacknowledged for 1 business day, escalate to CEO'
  ];

  return {
    id: `learning-${hashText(patternKey)}`,
    title: `Learning: ${patternKey}`,
    body: bodyLines.join('\n'),
    patternKey,
    relatedIssueId: PROGRAM_RELATED_ISSUE_ID,
    assigneeRole: DEFAULT_ASSIGNEE_ROLE
  };
}

function buildAuditEntry(patternKey, stats, decision, highRisk, nowMs) {
  const windowStartMs = nowMs - (WINDOW_DAYS * DAY_IN_MS);

  return {
    patternKey,
    decision,
    triggered: decision !== DECISIONS.SUPPRESSED,
    highRisk,
    eventCount: stats.count14,
    issueCount: stats.distinctIssues,
    affectedAgentCount: stats.affectedAgents,
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(nowMs).toISOString()
  };
}

function toLatestIssue(issues) {
  return [...issues].sort((left, right) => (toMs(right.updatedAt) || 0) - (toMs(left.updatedAt) || 0))[0] || null;
}

function buildDecision(patternKey, highRisk, evidence, decision, stats, nowMs, extras) {
  return {
    decision,
    patternKey,
    highRisk,
    evidence,
    learningIssue: null,
    targetLearningIssueId: null,
    ...extras,
    audit: buildAuditEntry(patternKey, stats, decision, highRisk, nowMs)
  };
}

function computePatternStats(events, nowMs) {
  const sevenDayEvents = events.filter((event) => isWithinDays(nowMs, event.timestampMs, HIGH_RISK_WINDOW_DAYS));
  const distinctIssueIds = new Set(events.map((event) => event.issueId));
  const distinctAgentIds = new Set(events.map((event) => event.actorId));

  return {
    count14: events.length,
    count7: sevenDayEvents.length,
    distinctIssues: distinctIssueIds.size,
    affectedAgents: distinctAgentIds.size
  };
}

function isTriggerEligible(stats) {
  return stats.count14 >= TRIGGER_COUNT_MINIMUM && stats.distinctIssues >= DISTINCT_ISSUE_MINIMUM;
}

function isHighRisk(stats) {
  return (
    stats.count7 >= HIGH_RISK_COUNT_MINIMUM ||
    stats.affectedAgents >= HIGH_RISK_AFFECTED_AGENTS_MINIMUM
  );
}

function resolveExistingLearningIssue(patternKey, existingLearningIssues) {
  const matchingIssues = existingLearningIssues.filter((issue) => issue.patternKey === patternKey);
  const openIssue = toLatestIssue(matchingIssues.filter((issue) => OPEN_LEARNING_STATUSES.has(issue.status)));
  if (openIssue) {
    return { decision: DECISIONS.DEDUPED, targetLearningIssueId: openIssue.id };
  }

  const terminalIssue = toLatestIssue(matchingIssues.filter((issue) => TERMINAL_STATUSES.has(issue.status)));
  return { decision: DECISIONS.ENRICHED, targetLearningIssueId: terminalIssue ? terminalIssue.id : null };
}

function isRecentTerminalIssue(existingLearningIssues, patternKey, nowMs) {
  const matchingIssues = existingLearningIssues.filter((issue) => issue.patternKey === patternKey);
  const terminalIssue = toLatestIssue(matchingIssues.filter((issue) => TERMINAL_STATUSES.has(issue.status)));
  if (!terminalIssue) {
    return false;
  }

  return isWithinDays(nowMs, toMs(terminalIssue.updatedAt), COOLDOWN_DAYS);
}

function evaluateSinglePattern(patternKey, events, existingLearningIssues, nowMs) {
  const evidence = toEvidence(events);
  const stats = computePatternStats(events, nowMs);
  const highRisk = isHighRisk(stats);

  if (!isTriggerEligible(stats)) {
    return buildDecision(patternKey, highRisk, evidence, DECISIONS.SUPPRESSED, stats, nowMs);
  }

  const existingOpen = resolveExistingLearningIssue(patternKey, existingLearningIssues);
  if (existingOpen.targetLearningIssueId && existingOpen.decision === DECISIONS.DEDUPED) {
    return buildDecision(patternKey, highRisk, evidence, DECISIONS.DEDUPED, stats, nowMs, {
      targetLearningIssueId: existingOpen.targetLearningIssueId
    });
  }

  if (isRecentTerminalIssue(existingLearningIssues, patternKey, nowMs)) {
    return buildDecision(patternKey, highRisk, evidence, DECISIONS.ENRICHED, stats, nowMs, {
      targetLearningIssueId: existingOpen.targetLearningIssueId
    });
  }

  const patternFields = events[0].patternFields;
  return buildDecision(patternKey, highRisk, evidence, DECISIONS.TRIGGERED, stats, nowMs, {
    learningIssue: createLearningIssue(patternKey, patternFields, evidence, highRisk)
  });
}

function filterEventsInWindow(events, nowMs, dayCount) {
  return events.filter((event) => isWithinDays(nowMs, event.timestampMs, dayCount));
}

function groupByPattern(events) {
  return events.reduce((accumulator, event) => {
    const existing = accumulator.get(event.patternKey) || [];
    existing.push(event);
    accumulator.set(event.patternKey, existing);
    return accumulator;
  }, new Map());
}

function evaluatePatternWindows({ now, events, existingLearningIssues }) {
  const nowMs = toMs(now) || Date.now();
  const normalizedEvents = events
    .map((event) => normalizeEvent(event, nowMs))
    .filter((event) => event !== null);

  const windowEvents = filterEventsInWindow(normalizedEvents, nowMs, WINDOW_DAYS);
  const grouped = groupByPattern(windowEvents);
  const keys = [...grouped.keys()].sort((left, right) => left.localeCompare(right));

  const decisions = keys.map((key) =>
    evaluateSinglePattern(
      key,
      grouped.get(key),
      existingLearningIssues || [],
      nowMs
    )
  );

  return {
    decisions: decisions.map(({ audit, ...decision }) => decision),
    auditLog: decisions.map((decision) => decision.audit)
  };
}

module.exports = {
  DECISIONS,
  EVENT_TYPES,
  evaluatePatternWindows
};
