const { evaluateDoneEvidence } = require('../harness/done-evidence-guardrail');

describe('evaluateDoneEvidence', () => {
  it('passes when all required git-backed evidence is present', () => {
    const result = evaluateDoneEvidence({
      issueRef: 'AGE-113',
      prUrl: 'https://github.com/acme/repo/pull/12',
      prText: 'Implements guardrail changes. Closes #AGE-113',
      commitOrMergeEvidence: 'Merge commit abcdef123 landed on main',
      reviewRequired: true,
      reviewerEvidence: 'Approved by reviewer @qe in PR conversation'
    });

    expect(result.pass).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('fails when PR URL is missing', () => {
    const result = evaluateDoneEvidence({
      issueRef: 'AGE-113',
      prText: 'Closes #AGE-113',
      commitOrMergeEvidence: 'Merge commit abcdef123 landed on main',
      reviewRequired: false
    });

    expect(result.pass).toBe(false);
    expect(result.missing).toContain('pr_url');
  });

  it('fails when PR text does not reference the issue', () => {
    const result = evaluateDoneEvidence({
      issueRef: 'AGE-113',
      prUrl: 'https://github.com/acme/repo/pull/12',
      prText: 'Implements guardrail changes without closure reference',
      commitOrMergeEvidence: 'Merge commit abcdef123 landed on main',
      reviewRequired: false
    });

    expect(result.pass).toBe(false);
    expect(result.missing).toContain('issue_reference_in_pr_text');
  });

  it('fails when commit or merge evidence is missing', () => {
    const result = evaluateDoneEvidence({
      issueRef: 'AGE-113',
      prUrl: 'https://github.com/acme/repo/pull/12',
      prText: 'Closes #AGE-113',
      reviewRequired: false
    });

    expect(result.pass).toBe(false);
    expect(result.missing).toContain('commit_or_merge_evidence');
  });

  it('fails when review is required and reviewer evidence is missing', () => {
    const result = evaluateDoneEvidence({
      issueRef: 'AGE-113',
      prUrl: 'https://github.com/acme/repo/pull/12',
      prText: 'Closes #AGE-113',
      commitOrMergeEvidence: 'Merge commit abcdef123 landed on main',
      reviewRequired: true
    });

    expect(result.pass).toBe(false);
    expect(result.missing).toContain('reviewer_path_evidence');
  });
});
