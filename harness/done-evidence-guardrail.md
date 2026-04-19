# DONE Evidence Guardrail (Git-backed Issues)

Use this guardrail before moving any git-backed issue to `done`.

## Required evidence

1. `pr_url`: URL to the PR associated with the issue.
2. `issue_reference_in_pr_text`: PR body includes an explicit issue reference in closure format, for example `Closes #AGE-113`.
3. `commit_or_merge_evidence`: Commit hash, squash-merge hash, or equivalent merge confirmation.
4. `reviewer_path_evidence`: Required only when review is required for the issue.

## Blocking behavior

If any required evidence is missing, the issue must not move to `done`. Keep status at `in_progress` or set to `blocked` with the missing keys.

## Automation example

```js
const { evaluateDoneEvidence } = require('./done-evidence-guardrail');

const result = evaluateDoneEvidence({
  issueRef: 'AGE-113',
  prUrl: 'https://github.com/org/repo/pull/123',
  prText: 'Implement guardrail. Closes #AGE-113',
  commitOrMergeEvidence: 'Merge commit 0123abcd',
  reviewRequired: true,
  reviewerEvidence: 'Approved by @reviewer'
});

console.log(result);
```
