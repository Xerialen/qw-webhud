# Contributing to qw-webhud

Thanks for your interest! This is a small, **zero-dependency** project, so getting set up takes about
a minute.

> **Scope:** qw-webhud is a **streaming / casting** tool. Using it while *playing* is not approved by
> anyone (see the [README](README.md)). Please keep contributions aligned with that intent.

## 1. Get it running

You need **Node.js >= 18** and **git**. There are no runtime dependencies — **no `npm install`**.

```bash
git clone https://github.com/Xerialen/qw-webhud.git
cd qw-webhud
node src/bridge.js --mock
```

Open <http://localhost:7777/overlay.html?bg=check&dbg> and <http://localhost:7777/editor.html>. You
should see the HUD animating from the mock feed. (More detail — including the one-command bootstrap —
in the README's [Getting started](README.md#getting-started).)

You do **not** need the ezQuake engine build to develop. The mock feed (`--mock`) drives the entire
web side — overlay, editor, every HUD element, the kill feed, and the themes.

## 2. Develop

- **Loop:** run `node src/bridge.js --mock`, edit files under `src/`, refresh the browser. There is
  no build step.
- **Where things live:** see the README's [Layout](README.md#layout) section. `PROTOCOL.md` is the
  engine↔web wire contract — if you change the data shape, update it (and the mock) to match.
- **Style:** match the surrounding code — vanilla ES modules, no framework. **Keep the project
  zero-dependency:** don't add an npm package to the core app without discussing it in an issue first.

## 3. Test

```bash
npm test        # runs: node --test tests/*.mjs
```

Add or update a test (`tests/*.mjs`) for any behaviour you change. If your change is user-visible (how
the HUD renders), include evidence in the PR — e.g. a screenshot of the overlay before/after.

## 4. Open a pull request

1. Branch off the latest `main`: `git checkout -b fix/short-description main`.
2. Keep commits focused, and update docs alongside code.
3. Push and open a PR against `main`. Link any issue it closes (`Closes #N`) and summarise the change
   in the body.
4. **CI + review gate.** Every PR runs the checks (`tests`, plus doc/markdown guards) and gets an
   independent review. The repo drives merges with labels — `gate: reviewing` → `gate: ready` (or
   `gate: blocked`) — and a merge automation squash-merges once a PR is reviewed and green. **You do
   not merge, and you do not set the `gate:` labels yourself** — that handoff belongs to the reviewer
   and the automation. A new commit on your branch re-triggers review.

## Deeper context (optional)

The repo also carries an AI-agent workflow (`AGENTS.md`, `coder.md`, `reviewer.md`) and status docs
(`docs/current-stage.md`). Those are the deeper contract for automated contributors — as a human you
don't need them to get started, but they're the source of truth if you want the full picture.

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
