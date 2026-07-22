# Workspace persistence boundary

## Purpose

`WorkspaceSnapshot` is the serializable setup for a future Match. It is not a Match save format.

## Workspace data

- board settings and Editor board pieces;
- formation library and selected formations;
- scenario library and selected scenario;
- card library and card-to-piece assignment data;
- Rule Set library and selected Rule Set;
- preferred die type and Tracker settings defaults;
- persisted display preferences: touch mode, coordinates and Tracker visibility.

## Excluded Match Runtime

- Timeline and active cursor;
- MatchContext;
- active Match mode and Tracker progress;
- action log, current phase and consumed actions;
- movement authorization/state;
- pending Pass, interception, delayed resolution and Bonus Action;
- die results.

An active Match is saved/exported only as a Match Recording, whose Timeline and referenced cards are complete and canonical.

## Persistence behavior

- Cloud and full Cards & Board backup write `workspaceProfile` using `WorkspaceSnapshot`.
- Old flat Cloud/backup payloads are still read through a compatibility adapter. Their former Match fields are ignored.
- While an offline Match is active, Cloud Save, autosave and Workspace import are blocked. A Workspace backup export uses the frozen Match-start setup.
- Manual Multiplayer session persistence is separate legacy infrastructure and is outside this contract.

## Workspace operations boundary

`src/workspace/workspaceOperations.mjs` owns the pure planning of structural Workspace mutations: board settings, formations, scenario save, Rule Set commit and card assignment/removal. `main.jsx` supplies application-specific normalizers, then remains responsible only for UI confirmation, React/ref application, History and the frozen Manual Multiplayer branch.

The visual card editor is not moved merely for file organization. Its many controls already pass through `updateCardState`; it is deferred until a later approved UI-focused extraction.
