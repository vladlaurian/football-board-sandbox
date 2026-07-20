# Development Workflow — mandatory project contract

This document is mandatory reading for every new chat or engineer before any implementation. The Football Board Sandbox is the application; its two operating modes are **Editor Mode** and **Match Mode**.

## Project objective

The Sandbox is not only a visual testing tool. A primary project objective is to produce a complete, reliable AI Analysis Export from Match Mode so an AI can reconstruct what happened, distinguish relevant player decisions, and analyze a recorded match.

The Match Timeline is the canonical gameplay record. AI Analysis Export is the semantic analysis representation derived from that record.

## Required startup procedure

Before proposing or implementing any change:

1. Read `README.md` completely.
2. Read every file in `/docs`.
3. Inspect the relevant code and tests.
4. Identify the existing architecture and reusable logic.
5. Explain what was understood, the exact files proposed for modification, the reason for each modification, the solution, and the risks.
6. Do not implement until the user approves.

Do not assume that a feature is absent merely because it is not visible in the UI. Search documentation and code first. Do not reinvent solutions already present.

## Approval rule

When the user says **“Aprob”**, begin the approved work immediately in that same turn.

After approval:

- do not repeat the plan;
- do not summarize what will be done again;
- do not request another confirmation;
- do not answer only with an acknowledgement or symbol;
- perform the work and return the completed result.

Stop only for a genuine unresolved ambiguity, a conflict with an existing documented rule, or a new architectural decision that was not part of the approval.

## Implementation rules

- Do not change architecture without explicit approval.
- Keep modifications isolated to the requested system.
- Do not modify unrelated engines or modes.
- Do not duplicate logic. Reuse or extract a shared function only after explaining the architectural impact before implementation.
- Do not stack code over failed code.
- Do not keep failed implementations, obsolete branches, dead code, hidden fallbacks, or abandoned experiments in the release.
- If an attempted implementation fails, remove it cleanly before implementing the approved replacement.
- Do not use workarounds to bypass the intended architecture.
- Fix the root cause where it belongs.
- Do not create parallel engines, parallel state, or parallel documentation when an existing source of truth can be extended.
- Do not refactor stable systems merely because a different design is possible.
- If a better solution is discovered, explain its advantages, disadvantages, and architectural impact before implementing it. The user decides.
- If there is genuine doubt, stop and ask instead of guessing.

## Mode and ownership boundaries

- **Football Board Sandbox** is the application name.
- **Editor Mode** is the unrestricted setup/editing environment.
- **Match Mode** is governed by Tracker, Timeline, action rules, replay, multiplayer, and AI export contracts.
- A Match-only change must not restrict Editor Mode unless explicitly requested.
- A UI-only change must not alter a game engine.
- A rule-engine change must not be implemented as UI-only validation.

## AI Analysis Export rule

Every new or modified Match Mode feature must include an explicit AI-export review before the build is considered complete.

For every feature, determine whether it represents:

- a gameplay action;
- a player decision relevant to analysis;
- a roll or resolution;
- a movement reason;
- a possession change;
- an action-economy change;
- a meaningful correction or administrative intervention.

If yes, it must be represented semantically in AI Analysis Export and covered by a regression test. The export must identify **why** something happened when that distinction matters; identical board outcomes from different user decisions must not be collapsed into an ambiguous generic event.

Pure presentation state is not exported: hover, focus, open panels, visual selection, animations, and an activated mode that is cancelled without changing gameplay.

When AI export cannot represent a new feature correctly, that is unresolved work and must be documented in README before release.

## Documentation rules

Every build must update the existing source of truth:

- `README.md` for current version, completed work, current status, unresolved work, and next planned feature;
- the relevant permanent technical document for changed contracts;
- `docs/ARCHITECTURE_DECISIONS.md` for durable architectural decisions;
- this workflow only when the development contract changes.

Do not create parallel documentation if an existing document is suitable. Temporary `*_PLAN.md` documents are allowed only for a genuinely open large migration and must be deleted after completion, as required by ADR-010.

A new chat should be able to learn the current build, completed work, pending work, failed/abandoned approaches, stable boundaries, and working rules by reading README and `/docs`.

## Build and release rules

Every release build must synchronize:

- the visible Sandbox version;
- the version in `README.md`;
- `package.json`;
- the ZIP archive name.

Before delivery:

- run the relevant regression tests;
- run the full available test suite;
- run a production build when dependencies are available;
- verify that AI Analysis Export remains accurate for affected Match functionality;
- remove generated and unnecessary files.

The final ZIP must not contain:

- `node_modules`;
- `dist`;
- `package-lock.json`;
- caches, logs, temporary inspection files, or other generated artifacts.

## Stable systems

The following systems are treated as stable unless a request explicitly targets them or a proven root-cause fix requires a reviewed change:

- Match Timeline, History, Undo/Redo, and Replay contract;
- generic Action Resolution Engine;
- Pass geometry and interception engine;
- Tracker action economy and movement authorization;
- host-authoritative multiplayer resolution;
- shared Editor/Inspector/Export card-rendering truth;
- AI Analysis Export semantic contract.

New features should integrate with these systems rather than bypassing or duplicating them.
