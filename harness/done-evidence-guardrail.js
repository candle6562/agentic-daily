const CLOSING_VERB_PATTERN = /(closes|fixes|resolves)\s+#/i;

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasIssueReference(prText, issueRef) {
  if (!hasText(prText) || !hasText(issueRef)) {
    return false;
  }

  const normalizedText = prText.toLowerCase();
  const normalizedIssueRef = issueRef.toLowerCase();
  return CLOSING_VERB_PATTERN.test(prText) && normalizedText.includes(normalizedIssueRef);
}

function evaluateDoneEvidence(evidence) {
  const missing = [];

  if (!hasText(evidence.prUrl)) {
    missing.push('pr_url');
  }

  if (!hasIssueReference(evidence.prText, evidence.issueRef)) {
    missing.push('issue_reference_in_pr_text');
  }

  if (!hasText(evidence.commitOrMergeEvidence)) {
    missing.push('commit_or_merge_evidence');
  }

  if (evidence.reviewRequired === true && !hasText(evidence.reviewerEvidence)) {
    missing.push('reviewer_path_evidence');
  }

  return {
    pass: missing.length === 0,
    missing
  };
}

module.exports = {
  evaluateDoneEvidence
};
