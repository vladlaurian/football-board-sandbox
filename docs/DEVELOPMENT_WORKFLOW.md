# Development Workflow — mandatory project contract

This document is mandatory reading for every new chat or engineer before any implementation. The Football Board Sandbox is the application; its two operating modes are **Editor Mode** and **Match Mode**.

## 1. Project objective

The Sandbox is not only a visual testing tool. A primary project objective is to produce a complete, reliable AI Analysis Export from Match Mode so an AI can reconstruct what happened, distinguish relevant player decisions, and analyze a recorded match.

The Match Timeline is the canonical gameplay record. AI Analysis Export is the semantic analysis representation derived from that record.

## 2. Required startup procedure

Before proposing or implementing any change:

1. Read `README.md` completely.
2. Read this document completely.
3. Read `docs/ARCHITECTURE_DECISIONS.md`.
4. Read the permanent technical document for the system being changed.
5. For multiplayer work, also read both `MULTIPLAYER_ARCHITECTURE.md` and `MULTIPLAYER_CHANGELOG.md`.
6. Inspect the relevant code and tests.
7. Identify the existing architecture, reusable logic, stable boundaries, previous failed approaches, and current source of truth.
8. Explain what was understood, the exact files proposed for modification, the reason for each modification, the solution, and the risks.
9. Do not implement until the user approves.

Do not assume a feature is absent because it is not visible in the UI. Search documentation and code first. Do not recreate a solution that already exists.

## 3. Approval and execution rule

When the user approves the proposed work, begin immediately in that same turn.

After approval:

- do not repeat the plan;
- do not summarize again what will be done;
- do not request another confirmation;
- do not answer only with an acknowledgement;
- perform the approved work and return the completed result.

Stop only for a genuine unresolved ambiguity that materially changes the approved scope, a direct conflict with a documented invariant, or a new architectural decision outside the approval.

## 4. Scope control

- Implement only the approved scope.
- Do not change game design or rules unless explicitly requested.
- Do not modify unrelated engines, modes, interfaces, or documentation.
- Do not refactor stable systems merely because another design is possible.
- Do not bundle cleanup, optimization, or additional fixes into an approved task without approval.
- When a new bug is discovered during implementation, document and report it. Do not silently repair it unless it blocks the approved work and the repair is strictly necessary; in that case, explain the dependency before proceeding.
- A documentation-only build must not modify runtime code, gameplay behavior, tests, or configuration except documentation metadata explicitly included in the approved scope.

## 5. Implementation rules

- Do not change architecture without explicit approval.
- Keep modifications isolated to the requested system.
- Reuse existing logic and sources of truth.
- Do not create parallel engines, parallel state, parallel rendering paths, or parallel documentation.
- Do not stack code over failed code.
- Remove failed implementations, obsolete branches, dead code, hidden fallbacks, and abandoned experiments before release.
- Do not use workarounds to bypass the intended architecture.
- Fix the root cause where it belongs.
- Extract shared logic only when the architectural impact has been explained and approved.
- If a better solution is discovered, explain its advantages, disadvantages, and architectural impact. The user decides whether scope changes.
- When evidence is insufficient, inspect further instead of guessing.

## 6. Mode and ownership boundaries

- **Football Board Sandbox** is the application name.
- **Editor Mode** is the unrestricted setup/editing environment.
- **Match Mode** is governed by Tracker, Timeline, action rules, replay, multiplayer, and AI export contracts.
- A Match-only change must not restrict Editor Mode unless explicitly requested.
- A UI-only change must not alter a game engine.
- A rule-engine change must not be implemented only as UI validation.

## 7. AI Analysis Export rule

Every new or modified Match Mode feature must include an explicit AI-export review before the build is complete.

Determine whether the feature represents:

- a gameplay action;
- a player decision relevant to analysis;
- a roll or resolution;
- a movement reason;
- a possession change;
- an action-economy change;
- a meaningful correction or administrative intervention.

When it does, the event must be represented semantically in AI Analysis Export and covered by regression tests. The export must identify **why** something happened when that distinction matters. Identical board outcomes caused by different decisions must not collapse into an ambiguous generic event.

Pure presentation state is not exported: hover, focus, open panels, visual selection, animations, and a mode activated then cancelled without gameplay change.

When AI export cannot represent a feature correctly, that is unresolved work and must be recorded before release.

## 8. Documentation ownership and single-source rule

Each fact must have one authoritative home. Other documents should link to that source instead of copying the same explanation.

| Information | Authoritative document |
|---|---|
| Current build identity, quick start, project map, current release summary | `README.md` |
| Mandatory working method, approval rules, release procedure | `DEVELOPMENT_WORKFLOW.md` |
| Durable cross-system architectural decisions and invariants | `ARCHITECTURE_DECISIONS.md` |
| Current multiplayer authority model and flows | `MULTIPLAYER_ARCHITECTURE.md` |
| Historical multiplayer fixes and rejected approaches | `MULTIPLAYER_CHANGELOG.md` |
| Generic action-resolution lifecycle | `ACTION_RESOLUTION_ENGINE.md` |
| Interception resolver contract | `INTERCEPTION_ENGINE.md` |
| Rule Set schema and editor behavior | `RULE_SETS_EDITOR.md` |
| Global back-card stat schema and card-local values | `GLOBAL_BACK_STATS.md` |

Rules:

- Update an existing authoritative document whenever it fits.
- Do not create a document for a single patch or version.
- A new permanent document is allowed only for a genuinely independent subsystem with its own stable contract.
- Temporary `*_PLAN.md` files are allowed only for a genuinely open large migration. Delete them after completion and preserve permanent consequences in the appropriate source of truth.
- Changelogs contain history; architecture documents describe the current model; ADRs contain durable decisions. Do not mix these roles.
- The README or an ADR may summarize and link, but must not become a second full copy of a subsystem specification.

## 9. Build identity and version synchronization

Every runtime release must synchronize all of the following:

- visible Sandbox version in `src/main.jsx`;
- browser title in `index.html`;
- Git/package version in `package.json`;
- current version, build name, and base build in `README.md`;
- release archive name.

These values must agree before delivery. Updating only one of them is not a completed version update.

A documentation-only consolidation may keep the current Sandbox and package versions because runtime behavior did not change. It must still update the README build name/base build and archive name so the delivered artifact is identifiable. It must also verify that runtime-code hashes are unchanged.

## 10. Testing and validation

Before delivery:

1. Run focused regression tests for the changed system.
2. Run the full available test suite.
3. Run the production build when dependencies are available.
4. Review Timeline and AI Analysis Export for every affected Match Mode feature.
5. Verify documentation links and references.
6. Verify version/build metadata.
7. For documentation-only work, compare runtime-code hashes before and after.
8. Inspect the final archive contents.

Do not claim a test or build passed unless it was actually executed successfully.

## 11. Release archive rules

The final ZIP must not contain:

- `node_modules`;
- `dist`;
- `package-lock.json`;
- caches, logs, temporary inspection files, backups, or generated artifacts;
- secrets or local environment files.

The archive must contain the complete runnable source and the current documentation set.

## 12. Stable systems

The following systems are stable unless a request explicitly targets them or a proven root-cause fix requires a reviewed change:

- Match Timeline, History, Undo/Redo, and Replay contract;
- generic Action Resolution Engine;
- Pass geometry and interception engine;
- Tracker action economy and movement authorization;
- host-authoritative multiplayer resolution;
- shared Editor/Inspector/Export card-rendering truth;
- AI Analysis Export semantic contract.

New features integrate with these systems rather than bypassing or duplicating them.

## Canonical documentation rule

Every project fact, rule, architectural contract, workflow requirement, or historical change must have exactly one canonical document. Other documents may link to that canonical source, but must not duplicate or independently restate the same information. Before creating a new document, inspect the existing documentation and extend the correct canonical document whenever possible.
