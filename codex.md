# Codex Instructions

Read AGENTS.md first. It is the source of truth for goals, the documentation
contract, and the verification workflow. This file stays intentionally small.

Codex is not permanently assigned to one repository role. When the owner asks
for implementation, follow `coder.md`. When the owner asks for review, follow
`reviewer.md`.

Codex-specific guidance:
- Prefer measurable experiments over large speculative rewrites.
- Keep changes small and reversible.
- Produce artifacts and reports future agents can build on.
- When uncertain, document findings before implementing larger changes.

## Review gate — non-negotiable (when acting as Reviewer)

Follow `reviewer.md` in full. One rule must never be violated:

**A review is not done until the PR is in an automergeable state, which requires
BOTH — together, bound to the current full head SHA
(`gh pr view <PR> -R <repo> --json headRefOid -q .headRefOid`):**

1. **a top-level PR comment** containing, on their own lines, `DECISION: PASS`,
   `LABEL: gate: ready`, and `HEAD_SHA: <full current sha>`, then
2. **the `gate: ready` label** (`gh pr edit <PR> -R <repo> --add-label "gate: ready"`).

**A `gate: ready` label without its SHA-bound `DECISION: PASS` comment is a
no-op — the merge gate is fail-closed and the PR silently never merges.** This
is exactly how PRs get stuck labeled-but-unmerged. Therefore:

- Never apply the label without also posting the verdict comment in the same pass.
- Never review or bind a verdict to a stale SHA; always fetch `headRefOid` fresh.
- On any new commit, the verdict is stale (Reset flips it back to `gate: reviewing`)
  — re-review the new head and post a fresh verdict + label for the new SHA.
- Exactly one terminal label; never both; never `gate: ready` on a draft.
- Do NOT merge, re-run the merge workflow, or touch other labels — the deterministic
  gate on the self-hosted runner performs the merge. Your job ends at
  "automergeable state."
- To BLOCK: post the same structured comment with `DECISION: BLOCK` /
  `LABEL: gate: blocked`, apply `gate: blocked`, and list each blocking finding.
  Never rubber-stamp.
