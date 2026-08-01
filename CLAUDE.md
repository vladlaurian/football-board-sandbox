# CLAUDE.md — Football Board Sandbox

React + Vite football board game. Editor Mode + Match Mode.
We work locally only. No publishing, no GitHub, no Vercel, no git worktree.

## Budget rules — read this first

This repo is large. `src/main.jsx` is ~13,700 lines and `docs/` is ~400 KB.
Reading it all wastes the user's usage limit and is never necessary.

- **Never read `src/main.jsx` in full.** Grep for the line you need, then read
  at most ~50 lines around it.
- **Never read a `docs/*.md` file in full** unless the user asks. Grep for the
  section you need.
- Do not re-read a file you already read in this session.
- Do not summarize back what you read. Go straight to the answer.
- While iterating, run only the affected test file
  (`node --test src/engine/<name>.test.mjs`). Run the full `npm test` once, at
  the end, before building the archive.
- If the user's request is already a precise contract, do not re-investigate it.
  Verify the specific claims it makes, then propose.

## Commands

```bash
npm run dev     # user runs this and tests in the browser
npm test        # full suite — end of build only
npm run build   # required before delivery
```

## Absolute rules

1. No code before you present analysis + contract and the user says approved.
2. Once approved, execute in the same turn. No second confirmation.
3. Do not invent new UI when an approved flow already exists.
4. UI only projects state and sends commands. Engine/MatchState is the sole
   gameplay authority.
5. Timeline, Undo/Redo, Replay and AI Export use the same canonical state.
6. MatchContext is frozen at Match start. Never read the editable Rule Set for a
   running match.
7. **Manual Multiplayer is frozen.** Do not modify, extend or "fix" it.
8. **Firebase / Automated Multiplayer are frozen.** Same.
9. No refactors, renames, moves or reformatting outside the approved scope.
10. A problem found outside scope is **reported, not fixed**.
11. No fake controls. A gameplay label must trigger the real canonical action.
12. Small, locally testable builds.

## Key invariants

- ADR-049: offline Match UI reads previews, availability and results only
  through `src/engine/matchPresentationSelectors.mjs`.
- ADR-058: the Shot result screen is terminal — no acknowledge, close, continue
  or restart control. Undo/Redo or a new match is the only exit.
- Every gameplay roll is a canonical `actionResolution.pendingRoll` answered by a
  unique RollEvent. Never identify a roll by its number.
- Every mechanic with an automatic post-roll consequence must write canonical
  `state.dice` and create the shared 1000 ms roll-result hold.

## Where things live

| Need | File |
|---|---|
| Shot rules | `src/engine/shotRules.mjs` |
| Pass / interception lifecycle | `src/engine/passStartRules.mjs` |
| Lofted Through Ball | `src/engine/loftedThroughBallRules.mjs` |
| Command routing | `src/engine/gameEngine.mjs`, `gameCommands.mjs` |
| Offline UI projections | `src/engine/matchPresentationSelectors.mjs` |
| Roll hold | `src/match/delayedResolution.mjs` |
| All UI | `src/main.jsx` — grep only, never read whole |

Deeper contracts, only when actually needed:
`docs/ACTION_RESOLUTION_ENGINE.md`, `docs/GAME_ENGINE_ARCHITECTURE.md`,
`docs/SHOOTING_RULES.md`, `docs/ARCHITECTURE_DECISIONS.md`,
`docs/DEVELOPMENT_WORKFLOW.md`.

## Approved programme

| Build | Scope |
|---|---|
| v20.56.29 | Shot roll parity: canonical `state.dice`, shared hold, `plan.rollPreview`, result via selector. Delete the "Resolving interception…" prompt. |
| v20.56.30 | Uniform hold on every mechanic; Lofted Through Ball gains it. |
| v20.56.31 | One shared result component (replaces 5) + one shared decision component (replaces 3). |
| v20.56.32 | One shared pre-roll prompt component (replaces 3) + permanent contract in `ACTION_RESOLUTION_ENGINE.md` and a new Mechanic Integration Gate row. |

Each build needs its own explicit approval.

## Delivery

Version must match in `src/main.jsx`, `index.html`, `package.json` and the
`README.md` build name / base build. Update only the permanent docs actually
affected, plus `README.md` and `docs/CHANGELOG.md`. Build the next consecutive
ZIP with no wrapper folder and no `node_modules`, `dist`, `.git` or
`package-lock.json`; verify with `unzip -t`. Do not create a NEXT_CHAT_PROMPT
unless asked. Never claim a test or build passed unless it actually ran.
