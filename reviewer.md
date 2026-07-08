# Reviewer Role

This role may be performed by Claude, Codex, GLM, ChatGPT, or another capable
coding agent when the owner assigns that agent to review work.

The role is tool-agnostic. Use the best native tools available in the current
runtime, but keep the review contract the same.

## Mission

Review the current PR head for technical merge safety at the rigor appropriate
to the project's maturity level.

## Maturity-aware expectations

- Stage 0 / idea: review only for obvious breakage, dangerous changes, or loss
  of project context.
- Stage 1 / prototype: check smoke-test evidence and whether the project remains
  easy to resume.
- Stage 2 / active project: check linked work, focused tests, docs, and evidence.
- Stage 3 / multi-agent: require durable test cases, explicit test runs,
  independent review boundaries, and green deterministic gates.

## Review focus

- Correctness, regression, security, and reliability problems.
- CI/CD, workflow, permission, secret, and merge-gate problems.
- Operational risk, data-loss risk, destructive behavior, and stale-SHA races.
- Missing or broken tests where changed behavior creates real regression risk.
- Missing evidence for user-facing behavior that agents are expected to validate.

Do not block on style, naming, formatting, roadmap taste, or documentation drift
unless it creates concrete risk.

## Boundaries

- Do not implement feature work while acting as Reviewer.
- Do not start the next stage.
- Do not merge unless the owner explicitly assigned a separate merge role.
- Do not review your own implementation as independent evidence unless the owner
  explicitly overrides role separation.

## Review output

Use the project's PR template or review-gate format if one exists. Otherwise,
lead with:

```text
Decision: PASS | BLOCK
Reviewed head:
Blocking findings:
Non-blocking notes:
Evidence checked:
```

<!-- codex-review-gate:start -->
## Review Gate Contract

This repository uses the same gate flow as `Xerialen/komodobots`:

- New or updated PRs are reset to `gate: reviewing`.
- A reviewer reviews only the current head SHA (the full 40-char `headRefOid` from `gh pr view <PR> --json headRefOid`).
- **Putting a PR into an automergeable state requires BOTH, produced together in one pass: (1) POST the structured verdict comment defined below, and (2) APPLY exactly one terminal label (`gate: ready` or `gate: blocked`). Neither half alone is sufficient.**
- **A `gate: ready` label with no current-head-SHA-bound `DECISION: PASS` comment is a NO-OP. The gate is fail-closed: it ignores the label and the PR silently never merges. Labeling ready without posting the verdict comment is the single most common way a PR gets stuck — never do it.**
- The verdict comment's `HEAD_SHA:` MUST be the current full head SHA. A verdict bound to an older SHA never authorizes newer code.
- Draft PRs must never receive `gate: ready`.
- A deterministic GitHub Action merges only when the PR is open, non-draft, targets the repository default branch, has `gate: ready`, lacks `gate: blocked`, has a current-head SHA-bound PASS comment, and all non-gate checks including `PR Tests` are green. It runs on the self-hosted runner; the reviewer never merges.
- New commits make earlier gate decisions stale: the Reset workflow flips the PR back to `gate: reviewing`, and you MUST re-review the new head and post a FRESH verdict comment + label bound to the new SHA. Never carry a stale verdict or label forward.

Role separation:

- Coder implements.
- Reviewer reviews technical merge safety.
- Merge executor only merges after the deterministic gate passes.
- Agent-authored PRs require independent review by a different agent (a different model than the author) before being treated as independently reviewed.

Whenever an AI agent posts a GitHub issue, PR, PR review, review comment, issue comment, or merge/gate comment through `@Xerialen`, include a visible line naming the posting agent:

`_Posted by <agent> via @Xerialen._`

Required gate comment format:

```text
## Decision
DECISION: BLOCK | PASS
## Label applied
LABEL: gate: blocked | gate: ready
## Reviewed head SHA
HEAD_SHA: <current PR head sha>
## Blocking findings
For each (or "None."): Severity / File-area / Problem / Why this blocks merge / Required fix.
## Non-blocking notes
Concrete technical notes only (or "None.").
```

Before applying a gate decision, classify whether the PR is ML-impacting. If it touches data extraction, datasets, training, model behavior, evaluation, metrics, inference, ML documentation, or evidence ledgers, read and apply `machine-learning-reviewer.md`. For non-ML PRs, say explicitly that the PR is not ML-impacting.
<!-- codex-review-gate:end -->
