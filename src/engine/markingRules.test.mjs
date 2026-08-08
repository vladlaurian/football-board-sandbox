import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../game/gameState.mjs";
import { applyGameCommand } from "./gameEngine.mjs";
import { firstMarkingEntryCell } from "./markingRules.mjs";

// Marking Build A (docs/MARKING_RULES.md sections 1.2/2/4): the core
// accept/decline flow only — no fast exit (section 7), no Marking switch
// (section 8), no passive tracking response yet.
//
// Fixture geometry: red-1 stands at (5,6), off the y=5 movement row used by
// every test here; its card's defensive-area offset {dx:1, dy:0} (team B
// transform: boardDx = dy = 0, boardDy = -dx = -1) projects its defensive
// area onto (5,5) — a cell on that row, but not the defender's own cell, so
// a mover can land there without an ordinary occupancy rejection.

function state(overrides = {}) {
  return createGameState({
    gameMode: "match",
    // The ball starts away from blue-1 on purpose: blue-1 must NOT be
    // carrying it, since the ball carrier can never trigger or receive a
    // Marking (confirmed with the user) and most tests here are about
    // ordinary off-the-ball Marking behaviour. Ball-carrier exclusion gets
    // its own dedicated test with the ball placed on blue-1 explicitly.
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
    tracker: {
      gameStarted: true, startingTeam: "blue", currentTurn: 1,
      usedActions: { blue: 0, red: 0 }, actionLog: { blue: [], red: [] }, matchActionState: {},
      turnPhase: "attack", settings: { attackActions: 5, defenseActions: 4, turns: 20 },
    },
    ...overrides,
  });
}

function context(overrides = {}) {
  return {
    boardSettings: { cols: 20, rows: 12 },
    gameplayCards: [
      { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }] },
      { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: [{ dx: 1, dy: 0 }] },
    ],
    ...overrides,
  };
}

function startAndCommit(rawState, matchContext, target) {
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  return applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "move-commit", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: target.x, y: target.y } } });
}

test("firstMarkingEntryCell queues every defender whose area the whole path touches", () => {
  const rawState = state();
  const matchContext = { boardSettings: context().boardSettings, gameplayCardsById: { "card-red-1": { defensiveArea: [{ dx: 1, dy: 0 }] } } };
  const mover = rawState.pieces.find(piece => piece.id === "blue-1");
  const result = firstMarkingEntryCell(rawState, matchContext, { mover, moverTeam: "blue", path: [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }] });
  assert.deepEqual(result.queue, [{ defenderId: "red-1", startedInside: false }]);
});

test("a move that lands exactly on the entry cell still offers the Marking decision", () => {
  const dispatched = startAndCommit(state(), context(), { x: 5, y: 5 });
  assert.equal(dispatched.accepted, true);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 5);
  assert.equal(piece.y, 5);
  assert.ok(dispatched.nextState.pendingMarking);
  assert.equal(dispatched.nextState.pendingMarking.team, "red");
  assert.equal(dispatched.nextState.pendingMarking.attackerId, "blue-1");
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [{ defenderId: "red-1", startedInside: false }]);
});

test("Marking never fires for the defending team's own move, even into an attacker's own defensive area (regression, reported live)", () => {
  // firstMarkingEntryCell itself is purely geometric/symmetric — whoever
  // moves is "the mover", the opponent is offered to mark — so this is
  // gated in commitNormalMove to only ever fire for the team attacking THIS
  // numbered turn (tracker.startingTeam). Reported live: without that gate,
  // the DEFENDING team's own legitimate repositioning during its own
  // defense phase could wander into an ATTACKER's defensive area and get
  // the attacking team offered a marking choice — backwards, since marking
  // is exclusively a defensive action.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 10, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 10, y: 8 },
    ],
    tracker: { ...state().tracker, turnPhase: "defense" },
  });
  const matchContext = context({ gameplayCards: [
    // Team A's own transform of {dx:1, dy:0} projects to (boardDx:0,
    // boardDy:1) — one cell straight "below" blue-1 on the board, i.e.
    // (10,6), well inside red-1's legal reach from (10,8).
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }], defensiveArea: [{ dx: 1, dy: 0 }] },
    { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }] },
  ] });
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "red-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "red-1" } } });
  assert.equal(started.accepted, true, `red should be authorized to move during its own defense phase: ${started.reason}`);
  const committed = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "red-move-commit", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "red-1", x: 10, y: 6 } } });
  assert.equal(committed.accepted, true);
  assert.equal(committed.nextState.pieces.find(item => item.id === "red-1").y, 6, "the move itself is legal and completes normally");
  assert.equal(committed.nextState.pendingMarking, null, "blue (the attacking team) must never be offered a marking choice from red's own move");
});

test("the attacker's move is never truncated — it lands wherever requested, and the decision opens only after", () => {
  // Reported live: the OLD behaviour stopped the piece dead at the first
  // entered cell, which read as broken. Speed difference is kept below the
  // fast-exit threshold (section 7 needs >=2) so this is purely about
  // movement completing, not about fast exit skipping the decision.
  const matchContext = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] },
    context().gameplayCards[1],
  ] });
  const dispatched = startAndCommit(state(), matchContext, { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 8, "the piece completes the full requested move, never stopping early for Marking");
  assert.equal(piece.y, 5);
  // The full 5 cells (3,5)->(8,5) are charged, not a truncated 2.
  assert.equal(dispatched.nextState.movementStateByPieceId["blue-1"].distance, 5);
  assert.ok(dispatched.nextState.pendingMarking, "the decision still opens, just after landing rather than mid-move");
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [{ defenderId: "red-1", startedInside: false }]);
});

test("no Marking opportunity left AND fast exit already ruled out the only candidate: only \"no marking left\" shows, never also the fast-exit notice", () => {
  // Confirmed with the user (point 5): when the team already has 0
  // opportunities, "no marking left" is the ONLY notice shown for this
  // route, even if fast exit also happened to rule out the same candidate —
  // the fast-exit distinction is moot once there were never any
  // opportunities left to spend on it either way.
  const dispatched = startAndCommit(state({ markingOpportunities: { blue: 2, red: 0 } }), context(), { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 8);
  assert.deepEqual(dispatched.nextState.markingEndedNotices, [
    { id: "marking_no_opportunities_blue-1_turn1", team: "red", attackerId: "blue-1", reason: "no-marking-left" },
  ]);
});

test("a route that WOULD offer a decision announces \"no marking left\" instead when the team has 0 opportunities", () => {
  const matchContext = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] },
    context().gameplayCards[1],
  ] });
  const dispatched = startAndCommit(state({ markingOpportunities: { blue: 2, red: 0 } }), matchContext, { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 8, "the move still completes fully");
  assert.equal(dispatched.nextState.pendingMarking, null, "no opportunities means no decision, even though the route touched an area");
  assert.deepEqual(dispatched.nextState.markingEndedNotices, [
    { id: "marking_no_opportunities_blue-1_turn1", team: "red", attackerId: "blue-1", reason: "no-marking-left" },
  ]);
});

test("multiple defensive areas touched along one route are queued in path order, ties broken by higher 1vs1 Defending", () => {
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 0, y: 5 },
      { id: "red-a", team: "B", cardId: "card-a", x: 2, y: 6 },
      { id: "red-b", team: "B", cardId: "card-b", x: 4, y: 6 },
      { id: "red-c", team: "B", cardId: "card-c", x: 2, y: 8 },
    ],
  });
  const matchContext = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }] },
    // card-a's area lands on (2,5) — reached first (path index 1) — with a
    // LOW 1vs1 Defending, tied on order with card-c.
    { id: "card-a", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }, { id: "stat:1v1a", name: "1vs1 Defending", value: 3 }], defensiveArea: [{ dx: 1, dy: 0 }] },
    // card-b's area lands on (4,5) — reached later (path index 3), no tie.
    { id: "card-b", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }], defensiveArea: [{ dx: 1, dy: 0 }] },
    // card-c's area ALSO lands on (2,5) (offset {dx:3,dy:0} from (2,8) ->
    // team B transform -> (2, 8-3) = (2,5)) with a HIGHER 1vs1 Defending, so
    // it must be asked before card-a despite being defined after it.
    { id: "card-c", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }, { id: "stat:1v1c", name: "1vs1 Defending", value: 7 }], defensiveArea: [{ dx: 3, dy: 0 }] },
  ] });
  const dispatched = startAndCommit(rawState, matchContext, { x: 6, y: 5 });
  assert.equal(dispatched.accepted, true);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 6, "the move completes fully to the requested destination, never truncated");
  assert.equal(piece.y, 5);
  assert.ok(dispatched.nextState.pendingMarking);
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [
    { defenderId: "red-c", startedInside: false },
    { defenderId: "red-a", startedInside: false },
    { defenderId: "red-b", startedInside: false },
  ]);
});

test("the defending coach picks exactly one defender from the whole eligible list; declining rejects all of them at once", () => {
  // Reverted from an earlier one-at-a-time Yes/No queue (confirmed with the
  // user this was a course-correction on the engineer's own design, not a
  // rule change): every eligible defender is offered together, and the
  // coach selects ONE by id — there is no cascading follow-up for the rest.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 0, y: 5 },
      { id: "red-a", team: "B", cardId: "card-a", x: 2, y: 6 },
      { id: "red-b", team: "B", cardId: "card-b", x: 4, y: 6 },
    ],
  });
  const matchContext = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 6 }] },
    { id: "card-a", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }], defensiveArea: [{ dx: 1, dy: 0 }] },
    { id: "card-b", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }], defensiveArea: [{ dx: 1, dy: 0 }] },
  ] });
  const dispatched = startAndCommit(rawState, matchContext, { x: 6, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [
    { defenderId: "red-a", startedInside: false },
    { defenderId: "red-b", startedInside: false },
  ]);
  const invalidAccept = applyGameCommand({
    state: dispatched.nextState,
    context: matchContext,
    command: { id: "accept-invalid", type: "MARKING_ACCEPTED", payload: { defenderId: "not-a-real-candidate" } },
  });
  assert.equal(invalidAccept.accepted, false, "only a defenderId present in the list may be chosen");
  const declined = applyGameCommand({
    state: dispatched.nextState,
    context: matchContext,
    command: { id: "decline-1", type: "MARKING_DECLINED", payload: {} },
  });
  assert.equal(declined.accepted, true);
  assert.equal(declined.nextState.pendingMarking, null, "declining rejects every candidate at once — no partial queue is left");
  assert.equal(declined.nextState.activeMarkings.length, 0);
  assert.equal(declined.nextState.markingOpportunities.red, 2, "declining never spends an opportunity");

  const redone = startAndCommit(rawState, matchContext, { x: 6, y: 5 });
  const accepted = applyGameCommand({
    state: redone.nextState,
    context: matchContext,
    command: { id: "accept-1", type: "MARKING_ACCEPTED", payload: { defenderId: "red-b" } },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.nextState.pendingMarking, null, "accepting clears the whole list — nobody else is asked");
  assert.equal(accepted.nextState.activeMarkings.length, 1);
  assert.equal(accepted.nextState.activeMarkings[0].markerId, "red-b", "the SPECIFIC chosen defender becomes the marker, not just the first in the list");
  assert.equal(accepted.nextState.activeMarkings[0].attackerId, "blue-1");
  // Deferred opportunity accounting (confirmed with the user): the team's
  // opportunity is charged only once this marking's first movement actually
  // resolves. blue-1 is NOT yet inside red-b's own defensive area purely by
  // having triggered the entry (its area check is what queued it), so a
  // tracking response opens instead of settling immediately here — the
  // opportunity is not yet spent.
  assert.equal(accepted.nextState.markingOpportunities.red, 2, "not yet consumed — no movement has resolved for this marking yet");
});

test("an attacker already marked does not trigger a second Marking decision (Build A scope)", () => {
  // red-2 is a real, already-tracking marker (its defensive area, offset
  // {dx:1,dy:-2} from (5,6), sits exactly on blue-1's starting cell (3,5)) so
  // the passive tracking sweep that now runs on every NORMAL_MOVE_STARTED
  // finds it already containing its attacker and leaves it untouched, rather
  // than silently dropping a marking whose marker piece doesn't exist.
  const rawState = state({ activeMarkings: [{ id: "existing", team: "red", markerId: "red-2", attackerId: "blue-1", speedBudget: 4, speedSpent: 0 }] });
  const withSecondDefender = { ...rawState, pieces: [...rawState.pieces, { id: "red-2", team: "B", cardId: "card-red-2", x: 5, y: 6 }] };
  const matchContext = context({
    gameplayCards: [
      ...context().gameplayCards,
      { id: "card-red-2", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: [{ dx: 1, dy: -2 }] },
    ],
  });
  const dispatched = startAndCommit(withSecondDefender, matchContext, { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null);
});

test("the ball carrier can never trigger a Marking decision", () => {
  const rawState = state({ pieces: [
    { id: "ball", team: "BALL", x: 3, y: 5 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
    { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
  ] });
  const dispatched = startAndCommit(rawState, context(), { x: 5, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null, "landing exactly on the entry cell must not offer Marking when the mover carries the ball");
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 5);
  assert.equal(piece.y, 5);
});

test("starting a movement already inside an eligible area triggers the decision at the first step, regardless of where that step lands", () => {
  // Speed diff kept below the fast-exit threshold so only the start-inside
  // trigger is being exercised here.
  const matchContext = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] },
    context().gameplayCards[1],
  ] });
  const rawState = state({ pieces: [
    { id: "ball", team: "BALL", x: 0, y: 0 },
    { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
    { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
  ] });
  const dispatched = startAndCommit(rawState, matchContext, { x: 6, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.ok(dispatched.nextState.pendingMarking, "leaving the area on the very first step must still offer Marking, since the mover started inside it");
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [{ defenderId: "red-1", startedInside: true }]);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 6);
  assert.equal(piece.y, 5);
});

test("fast exit (Speed difference >=2, <=2 orthogonal cells) skips the Marking prompt entirely for an unmarked attacker", () => {
  const dispatched = startAndCommit(state(), context(), { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null);
  const piece = dispatched.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 8);
  assert.equal(piece.y, 5);
});

test("fast exit ends an already-active Marking when the attacker leaves through the qualifying route", () => {
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0 }],
  });
  const started = applyGameCommand({ state: rawState, context: context(), command: { id: "move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  const committed = applyGameCommand({ state: started.nextState, context: context(), command: { id: "move-commit", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 7, y: 5 } } });
  assert.equal(committed.accepted, true);
  assert.equal(committed.nextState.activeMarkings.length, 0, "the Marking must end, not just let the move through");
  assert.equal(committed.nextState.pendingMarking, null, "already marked, so no NEW decision is offered either");
  assert.deepEqual(committed.nextState.markingEndedNotices, [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", reason: "fast-exit" }], "the state must carry why the Marking ended, for the UI's explanation screen");
});

test("an already-marked attacker's move that ends WITHOUT qualifying for fast exit opens the tracking response immediately, in the same commit (regression)", () => {
  // Reported live: the marker's next check only opened once some OTHER
  // action started afterward — the old "wait for the next action" trigger,
  // which the whole Build 1+2 redesign was supposed to remove everywhere,
  // not just for a marking's very first response. blue-1 starts inside
  // red-1's area (already marked) and moves out to (6,5); the Speed
  // difference (1) is below the fast-exit threshold (2), so this must NOT
  // silently escape — it must immediately owe a tracking response.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: false, opportunityConsumed: true }],
  });
  const matchContext = context({ gameplayCards: [
    { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 5 }] },
    context().gameplayCards[1],
  ] });
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  const committed = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "move-commit", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 6, y: 5 } } });
  assert.equal(committed.accepted, true);
  const piece = committed.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 6, "the attacker's own move still completes fully");
  assert.equal(piece.y, 5);
  assert.ok(committed.nextState.pendingMarkingTrack, "the marker's tracking response must open in this SAME commit, not wait for another action to start");
  assert.equal(committed.nextState.pendingMarkingTrack.markerId, "red-1");
  const blocked = applyGameCommand({
    state: committed.nextState,
    context: matchContext,
    command: { id: "other-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "red-1" } },
  });
  assert.equal(blocked.accepted, false, "the tracking decision already blocks other commands, exactly as if it had opened via the old trigger");
  assert.equal(blocked.reason, "MARKING_DECISION_PENDING");
});

test("fast exit is judged against the WHOLE movement action, not per fragmented commit (regression)", () => {
  // card-red-1 here covers 3 consecutive cells on row y=5 — (5,5), (6,5),
  // (7,5) — rather than the file's usual single-cell area, so a genuinely
  // long pass-through can be disguised as two short segments if the fix
  // regresses. blue-1 starts already inside (marking pre-accepted) and the
  // full route to (8,5) crosses all 3 area cells before exiting: 3 > the
  // section 7 orthogonal limit of 2, so fast exit must NOT apply, no matter
  // how the move is split into commits.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0 }],
  });
  const matchContext = context({ gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }] },
  ] });
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  // Segment 1: (5,5) -> (6,5). Still inside the area at the end, no exit yet.
  const segment1 = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "move-commit-1", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 6, y: 5 } } });
  assert.equal(segment1.accepted, true);
  assert.equal(segment1.nextState.activeMarkings.length, 1, "no exit happened yet, the Marking must still be active");
  // Segment 2: (6,5) -> (8,5), continuing the SAME movement action. Judged
  // on its own this segment only crosses 2 area cells before exiting — the
  // exploit the user found — but the cumulative route since (5,5) crosses 3.
  const segment2 = applyGameCommand({ state: segment1.nextState, context: matchContext, command: { id: "move-commit-2", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 8, y: 5 } } });
  assert.equal(segment2.accepted, true);
  assert.equal(segment2.nextState.activeMarkings.length, 1, "fragmenting the move must not let the attacker sneak past the cell-count threshold");
  // The Speed edge WAS there (diff 2) — this is a "near miss", not a plain
  // non-event, so it gets an explanatory notice instead of ending silently.
  assert.equal(segment2.nextState.markingEndedNotices.length, 1);
  assert.deepEqual(segment2.nextState.markingEndedNotices[0], {
    id: "marking_fast_exit_attempted_blue-1_turn1_own",
    team: "red",
    markerId: "red-1",
    attackerId: "blue-1",
    reason: "fast-exit-attempted",
    runLength: 3,
    maxAllowed: 2,
    geometryKind: "straight",
  });
});

test("a first-time entry that resembles fast exit but crosses too many cells still offers the ordinary Marking decision, with an explanatory notice", () => {
  // Same 3-cell area as the fragmented-commit regression above, but this
  // time nobody was marking yet (section 3, not section 7 case 2): the Speed
  // edge (blue 6 vs red 4) is there, but the route crosses all 3 area cells
  // before exiting to (8,5) — 3 > the orthogonal limit of 2 — so it still
  // doesn't count as fast exit, and the ordinary Marking offer stands.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
  });
  const matchContext = context({ gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }] },
  ] });
  const dispatched = startAndCommit(rawState, matchContext, { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.ok(dispatched.nextState.pendingMarking, "a near miss does not prevent the ordinary decision");
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [{ defenderId: "red-1", startedInside: false }]);
  assert.deepEqual(dispatched.nextState.markingEndedNotices, [{
    id: "marking_fast_exit_attempted_blue-1_turn1_red-1",
    team: "red",
    markerId: "red-1",
    attackerId: "blue-1",
    reason: "fast-exit-attempted",
    runLength: 3,
    maxAllowed: 2,
    geometryKind: "straight",
  }]);
});

test("fast exit on a first-time entry does not count the attacker's own starting cell toward the crossed-cell threshold (regression)", () => {
  // Reported live: the attacker's own starting cell already sat inside a
  // defender's area (never previously marked there), and moving through 2
  // MORE cells before exiting still opened a Marking decision — because the
  // starting cell was being counted as a 3rd "crossed" cell. Unlike the
  // already-marked-escaping case above (where the attacker really has been
  // standing tracked on that cell), a first-time, not-yet-marked entry has no
  // tracker to escape from: only cells the move actually crosses into count.
  // Same 3-consecutive-cell area shape as the regression above — (5,5),
  // (6,5), (7,5) — attacker starts on the first cell, unmarked, and moves to
  // (8,5): 2 cells actually crossed ((6,5) and (7,5)), which must qualify.
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
  });
  const matchContext = context({ gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }] },
  ] });
  const dispatched = startAndCommit(rawState, matchContext, { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null, "2 crossed cells (not counting the starting cell) must qualify for fast exit, so no Marking decision opens");
});

test("reversing direction on the same locked axis mid-session does not corrupt fast exit (regression — reported live as \"WTF, same players, same conditions, only went back\")", () => {
  // Reported live: an attacker correctly fast-exits crossing ONE diagonal
  // cell of a defender's area going one way, but reversing back through the
  // very same cell on the very same locked-axis session — landing exactly
  // back on the original starting cell — incorrectly opened (and even
  // completed) a brand new Marking decision. Root cause: the cumulative
  // route used for the fast-exit check was reconstructed as a straight line
  // from the session's origin to the piece's current position — and a
  // round trip back to the exact origin geometrically collapses to zero
  // distance, silently erasing the detour through the defender's area.
  // blue-1 (4,6) -> (6,4) crosses exactly one diagonal cell of red-1's area,
  // (5,5), then reverses along the same diagonal all the way back to (4,6).
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 4, y: 6 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
  });
  const matchContext = context();
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } } });
  assert.equal(started.accepted, true);
  const forward = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "move-forward", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 6, y: 4 } } });
  assert.equal(forward.accepted, true);
  assert.equal(forward.nextState.pendingMarking, null, "the forward crossing correctly fast-exits");
  assert.equal(forward.nextState.activeMarkings.length, 0);
  const reverse = applyGameCommand({ state: forward.nextState, context: matchContext, command: { id: "move-reverse", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "blue-1", x: 4, y: 6 } } });
  assert.equal(reverse.accepted, true);
  const piece = reverse.nextState.pieces.find(item => item.id === "blue-1");
  assert.equal(piece.x, 4);
  assert.equal(piece.y, 6);
  assert.equal(reverse.nextState.pendingMarking, null, "the reverse crossing over the exact same cell must ALSO fast-exit, not open a fresh Marking decision");
  assert.equal(reverse.nextState.activeMarkings.length, 0, "no Marking may ever get created purely from walking back the way it came");
});

test("fast exit that silently prevents a first-time Marking decision still announces \"can't be marked\"", () => {
  // Reported live: crossing a defender's area too briefly to ever trigger a
  // Marking decision left NO announcement at all, so the defending coach had
  // no idea fast exit even happened (docs section 7: "the defender may not
  // consume a Marking unnecessarily" — but the coach still needs to be told
  // why nothing was offered).
  const dispatched = startAndCommit(state(), context(), { x: 8, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null);
  assert.deepEqual(dispatched.nextState.markingEndedNotices, [
    { id: "marking_prevented_blue-1_turn1", team: "red", markerIds: ["red-1"], attackerId: "blue-1", reason: "fast-exit-prevented" },
  ]);
});

test("MARKING_ACCEPTED creates the active marking and consumes one team opportunity", () => {
  const dispatched = startAndCommit(state(), context(), { x: 5, y: 5 });
  assert.equal(dispatched.accepted, true);
  const accepted = applyGameCommand({
    state: dispatched.nextState,
    context: context(),
    command: { id: "marking-accept", type: "MARKING_ACCEPTED", payload: { defenderId: "red-1" } },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.nextState.pendingMarking, null);
  assert.equal(accepted.nextState.activeMarkings.length, 1);
  assert.equal(accepted.nextState.activeMarkings[0].markerId, "red-1");
  assert.equal(accepted.nextState.activeMarkings[0].attackerId, "blue-1");
  assert.equal(accepted.nextState.activeMarkings[0].speedBudget, 4);
  assert.equal(accepted.nextState.markingOpportunities.red, 1);
});

test("MARKING_DECLINED clears the decision without creating a marking or consuming an opportunity", () => {
  const dispatched = startAndCommit(state(), context(), { x: 5, y: 5 });
  assert.equal(dispatched.accepted, true);
  const declined = applyGameCommand({
    state: dispatched.nextState,
    context: context(),
    command: { id: "marking-decline", type: "MARKING_DECLINED", payload: {} },
  });
  assert.equal(declined.accepted, true);
  assert.equal(declined.nextState.pendingMarking, null);
  assert.equal(declined.nextState.activeMarkings.length, 0);
  assert.equal(declined.nextState.markingOpportunities.red, 2);
});

test("a pending Marking decision blocks every other command for both teams", () => {
  const dispatched = startAndCommit(state(), context(), { x: 5, y: 5 });
  assert.equal(dispatched.accepted, true);
  const blocked = applyGameCommand({
    state: dispatched.nextState,
    context: context(),
    command: { id: "other-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "red-1" } },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "MARKING_DECISION_PENDING");
});

// Passive tracking response (docs/MARKING_RULES.md section 5): opens the
// moment any new action starts (confirmed with the user — not at phase end),
// and is a coach-driven move restricted to the shortest axis toward the
// attacker, never an engine-driven walk. A tie between 2+ axes is folded
// into one combined set of legal cells, not a separate decision.

function trackingState(overrides = {}) {
  return state({
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 8, y: 5 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 0, y: 0 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0 }],
    ...overrides,
  });
}

function triggerTrackMove(rawState, matchContext) {
  return applyGameCommand({
    state: rawState,
    context: matchContext,
    command: { id: "trigger-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-2" } },
  });
}

// Build 2 (confirmed with the user, an intentional rule change): every
// legal single-axis cell is offered regardless of whether it would achieve
// containment — there is no more "prefer a containing cell" or multi-axis
// bending. Containment is judged only at commit time: a commit that doesn't
// achieve it is REJECTED outright (no movement, no Speed spent, the
// decision stays open so the coach can try a different cell/axis), and one
// that does achieve it applies immediately, like a normal move.

// A single-axis-only fixture: red-1 (5,6) and blue-1 (9,6) share a row, so
// besides the horizontal axis, axisCandidatesTowardAttacker also offers the
// two vertical directions and both diagonals once aligned on a row/column —
// each is blocked at its very first cell by a placed piece here, leaving
// horizontal as the only surviving candidate. card-red-1's area offset
// {dx:0,dy:1} projects to (marker.x+1, marker.y) (team B transform), so
// landing exactly 3 cells right, on (8,6), is the only cell whose resulting
// area — (9,6) — actually contains the attacker; the attacker's own
// occupied cell also caps the horizontal reach at 3.
function singleAxisTrackingState() {
  return trackingState({
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 9, y: 6 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 0, y: 0 },
      { id: "blue-block-up", team: "A", cardId: "card-blue-1", x: 5, y: 5 },
      { id: "blue-block-down", team: "A", cardId: "card-blue-1", x: 5, y: 7 },
      { id: "blue-block-diag-up", team: "A", cardId: "card-blue-1", x: 6, y: 5 },
      { id: "blue-block-diag-down", team: "A", cardId: "card-blue-1", x: 6, y: 7 },
      // Also block every axis-switch candidate reachable from ANY blocked
      // axis's own 45°-neighbors — the horizontal axis's own blocker here
      // is the attacker itself (blue-1, at (9,6)), and every vertical/
      // diagonal candidate is blocked at the marker's own first step, both
      // of which would otherwise let this fixture accidentally exercise
      // the axis-switch feature too. These keep this fixture testing ONLY
      // the flat single-axis enumeration; the axis-switch feature gets its
      // own dedicated fixtures below.
      { id: "blue-block-pivot-up", team: "A", cardId: "card-blue-1", x: 8, y: 5 },
      { id: "blue-block-pivot-down", team: "A", cardId: "card-blue-1", x: 8, y: 7 },
      { id: "blue-block-pivot-diag-up", team: "A", cardId: "card-blue-1", x: 9, y: 5 },
      { id: "blue-block-pivot-diag-down", team: "A", cardId: "card-blue-1", x: 9, y: 7 },
      { id: "blue-block-vert-switch-up", team: "A", cardId: "card-blue-1", x: 4, y: 7 },
      { id: "blue-block-vert-switch-down", team: "A", cardId: "card-blue-1", x: 4, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
  });
}

function singleAxisMatchContext() {
  return context({ gameplayCards: [
    context().gameplayCards[0],
    { id: "card-red-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: [{ dx: 0, dy: 1 }] },
  ] });
}

test("every legal cell on every candidate axis is offered, not only the ones that would achieve containment", () => {
  const dispatched = triggerTrackMove(singleAxisTrackingState(), singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  assert.ok(dispatched.nextState.pendingMarkingTrack);
  assert.equal(dispatched.nextState.pendingMarkingTrack.team, "red");
  assert.equal(dispatched.nextState.pendingMarkingTrack.markerId, "red-1");
  // Asserted as a subset, not a full deepEqual: with the axis-switch rule
  // (up to 2 chained 45° pivots per response), a body blocking one axis can
  // legitimately open up cells on other axes too — this test only cares
  // that the horizontal axis's own partial cells (before the attacker
  // blocks it) are present with the right cost, not that they are the ONLY
  // cells offered (axis-switch itself has its own dedicated tests below).
  const cells = dispatched.nextState.pendingMarkingTrack.cells;
  const costOf = (x, y) => cells.find(cell => cell.x === x && cell.y === y)?.distance;
  assert.equal(costOf(6, 6), 1);
  assert.equal(costOf(7, 6), 2);
  assert.equal(costOf(8, 6), 3);
  // The triggering command itself must not have gone through yet.
  assert.equal(dispatched.nextState.tracker.matchActionState.activeMovement?.pieceId ?? null, null);

  const blocked = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "other-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-2" } },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "MARKING_DECISION_PENDING");
});

test("committing a cell that does not achieve containment is rejected — no movement, no cost, decision stays open", () => {
  const dispatched = triggerTrackMove(singleAxisTrackingState(), singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  const rejected = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "track-move-short", type: "MARKING_TRACK_MOVE_COMMITTED", payload: { x: 6, y: 6 } },
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "MARKING_TRACK_NOT_CONTAINED");
  // Nothing changed — the coach is free to try a different cell/axis next.
  assert.equal(rejected.nextState, undefined);
});

test("committing a cell that achieves containment applies the move, spends Speed, consumes the team's opportunity and closes the decision", () => {
  const dispatched = triggerTrackMove(singleAxisTrackingState(), singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  const committed = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "track-move-full", type: "MARKING_TRACK_MOVE_COMMITTED", payload: { x: 8, y: 6 } },
  });
  assert.equal(committed.accepted, true);
  const marker = committed.nextState.pieces.find(piece => piece.id === "red-1");
  assert.equal(marker.x, 8);
  assert.equal(marker.y, 6);
  assert.equal(committed.nextState.activeMarkings[0].speedSpent, 3);
  assert.equal(committed.nextState.activeMarkings[0].respondedOnce, true);
  assert.equal(committed.nextState.activeMarkings[0].opportunityConsumed, true);
  assert.equal(committed.nextState.pendingMarkingTrack, null, "one response is resolved per commit, no auto-continuation");
  // Deferred opportunity accounting (confirmed with the user): this is the
  // marking's first successful movement, so the team's opportunity is
  // charged only now, not back when MARKING_ACCEPTED fired.
  assert.equal(committed.nextState.markingOpportunities.red, 1);
});

test("a body blocking the only candidate axis leaves nothing else offered — no bending, exactly like ordinary piece movement", () => {
  // Confirmed with the user (final revision, after live testing showed the
  // free-pathfinding version let a marker reposition too freely — including
  // ending up squarely in front of the attacker's own path with no real
  // constraint, a freedom the attacker itself never has under its own
  // single-axis-locked movement). The tracking response now follows the
  // EXACT SAME rule as an ordinary move: pick one of the legal
  // straight/diagonal axes toward the attacker, blocked by any body,
  // never routed around. red-1 (0,0) toward blue-1 (5,0), aligned on the
  // same row: horizontal is blocked at (2,0), but the aligned-row
  // candidates (vertical, diagonal, both signs) are still separately
  // offered — this is not about a SINGLE axis toward the attacker, but
  // about none of the offered axes ever bending once chosen.
  const rawState = trackingState({
    pieces: [
      { id: "ball", team: "BALL", x: 10, y: 10 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 5, y: 0 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 15, y: 10 },
      { id: "blue-block", team: "A", cardId: "card-blue-1", x: 2, y: 0 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 0, y: 0 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 5, speedSpent: 0 }],
  });
  const dispatched = triggerTrackMove(rawState, context());
  assert.equal(dispatched.accepted, true);
  const cells = dispatched.nextState.pendingMarkingTrack.cells;
  const costOf = (x, y) => cells.find(cell => cell.x === x && cell.y === y)?.distance;
  assert.equal(costOf(1, 0), 1, "the one legal cell on the blocked horizontal axis itself is still offered");
  assert.equal(costOf(2, 0), undefined, "the blocked axis never offers a cell past the block");
  // (2,1), (3,2), (1,2) and (1,4) were only reachable before by bending off
  // the blocked horizontal axis — none of them lie on any of the OTHER
  // straight/diagonal candidate axes toward (5,0), so none are offered now.
  assert.equal(costOf(2, 1), undefined, "no bending off the blocked axis onto a diagonal");
  assert.equal(costOf(3, 2), undefined, "no bending two cells deep either");
  assert.equal(costOf(1, 2), undefined, "no bending onto the vertical axis from the blocked point");
  assert.equal(costOf(1, 4), undefined, "the vertical candidate axis is a SEPARATE straight line from (0,0), not reachable via the blocked horizontal one");
});

test("an attacker standing directly adjacent (touching, zero-gap) never silently ends the marking — other candidate axes are still offered", () => {
  // Reported live earlier: when the attacker sits immediately next to the
  // marker (no gap cell at all), the direct axis toward it has ZERO legal
  // cells (occupied) — this must not be treated as "nowhere to go"; every
  // OTHER legal axis toward/alongside the attacker is still its own,
  // separately offered, single-axis candidate.
  const rawState = trackingState({
    pieces: [
      { id: "ball", team: "BALL", x: 3, y: 5 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 6, y: 6 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 0, y: 0 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0 }],
  });
  const dispatched = triggerTrackMove(rawState, context());
  assert.equal(dispatched.accepted, true);
  assert.ok(dispatched.nextState.pendingMarkingTrack, "the touching attacker must not silently end the marking — switching to another axis is still available");
  const cells = dispatched.nextState.pendingMarkingTrack.cells;
  const costOf = (x, y) => cells.find(cell => cell.x === x && cell.y === y)?.distance;
  assert.equal(costOf(6, 6), undefined, "the attacker's own occupied cell is never offered");
  assert.equal(costOf(5, 7), 1, "the vertical axis, unrelated to the blocked horizontal one, is offered from the marker's own position");
});

test("a marking ends only when the marker has no legal cell at all left to move into (every candidate axis blocked or off the board)", () => {
  // red-1 (0,0) toward blue-1 (10,0): every candidate axis toward the
  // attacker (horizontal, the aligned vertical, the aligned diagonal) is
  // blocked at its very first cell by a body; the other two candidates
  // (vertical up, diagonal up-right) are off the board. No axis has a
  // single legal cell, so the Marking correctly ends.
  const rawState = trackingState({
    pieces: [
      { id: "ball", team: "BALL", x: 10, y: 10 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 10, y: 0 },
      { id: "blue-2", team: "A", cardId: "card-blue-1", x: 15, y: 10 },
      { id: "blue-block-1", team: "A", cardId: "card-blue-1", x: 1, y: 0 },
      { id: "blue-block-2", team: "A", cardId: "card-blue-1", x: 1, y: 1 },
      { id: "blue-block-3", team: "A", cardId: "card-blue-1", x: 0, y: 1 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 0, y: 0 },
    ],
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 6, speedSpent: 0 }],
  });
  const dispatched = triggerTrackMove(rawState, context());
  assert.equal(dispatched.accepted, true);
  // Every candidate axis from (0,0) toward (10,0) is now boxed in within 2
  // switches (horizontal/diagonal-up/diagonal-down all blocked at their
  // very first cell, and vertical — reachable only via a 3rd, disallowed
  // pivot off the diagonal — never opens up), so no legal move exists.
  assert.equal(dispatched.nextState.pendingMarkingTrack, null);
  assert.equal(dispatched.nextState.activeMarkings.length, 0);
  assert.deepEqual(dispatched.nextState.markingEndedNotices, [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", reason: "no-legal-move" }]);
});

test("a marking ends when its Speed budget runs out before the attacker is contained", () => {
  const dispatched = triggerTrackMove(trackingState({ activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 0, speedSpent: 0 }] }), context());
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarkingTrack, null);
  assert.equal(dispatched.nextState.activeMarkings.length, 0);
  // The UI must be told why, even when no coach decision was needed (the
  // user flagged this ending silently with no explanation at all).
  assert.deepEqual(dispatched.nextState.markingEndedNotices, [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", reason: "insufficient-speed" }]);
});

// "Continue Marking?" (confirmed with the user): a marking's very first
// tracking response opens directly (already exercised above, since the
// fixtures' default activeMarkings never set respondedOnce). Every response
// AFTER that first one asks this gate first instead of opening the move
// decision immediately.

test("a marking's first tracking response opens directly, but every later response asks \"Continue Marking?\" first", () => {
  const rawState = { ...singleAxisTrackingState(), activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: true, opportunityConsumed: true }] };
  const dispatched = triggerTrackMove(rawState, singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarkingTrack, null, "the move decision must NOT open directly once respondedOnce is true");
  assert.ok(dispatched.nextState.pendingMarkingContinue);
  assert.equal(dispatched.nextState.pendingMarkingContinue.team, "red");
  assert.equal(dispatched.nextState.pendingMarkingContinue.markerId, "red-1");
  assert.equal(dispatched.nextState.pendingMarkingContinue.attackerId, "blue-1");

  const blocked = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "other-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-2" } },
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "MARKING_DECISION_PENDING");
});

test("accepting Continue Marking proceeds to the same free-move decision without spending a second opportunity", () => {
  const rawState = {
    ...singleAxisTrackingState(),
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: true, opportunityConsumed: true }],
    markingOpportunities: { blue: 2, red: 1 },
  };
  const dispatched = triggerTrackMove(rawState, singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  assert.ok(dispatched.nextState.pendingMarkingContinue);
  const accepted = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "continue-accept", type: "MARKING_CONTINUE_ACCEPTED", payload: {} },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.nextState.pendingMarkingContinue, null);
  assert.ok(accepted.nextState.pendingMarkingTrack, "accepting opens the ordinary free-move decision");
  const cells = accepted.nextState.pendingMarkingTrack.cells;
  const costOf = (x, y) => cells.find(cell => cell.x === x && cell.y === y)?.distance;
  assert.equal(costOf(6, 6), 1);
  assert.equal(costOf(7, 6), 2);
  assert.equal(costOf(8, 6), 3);
  assert.equal(accepted.nextState.markingOpportunities.red, 1, "no second opportunity is spent just for continuing");
});

test("declining Continue Marking ends the marking, but the opportunity stays consumed since it was already spent earlier", () => {
  const rawState = {
    ...singleAxisTrackingState(),
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: true, opportunityConsumed: true }],
    markingOpportunities: { blue: 2, red: 1 },
  };
  const dispatched = triggerTrackMove(rawState, singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  const declined = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "continue-decline", type: "MARKING_CONTINUE_DECLINED", payload: {} },
  });
  assert.equal(declined.accepted, true);
  assert.equal(declined.nextState.pendingMarkingContinue, null);
  assert.equal(declined.nextState.activeMarkings.length, 0);
  assert.equal(declined.nextState.markingOpportunities.red, 1, "never refunded once actually consumed");
  assert.deepEqual(declined.nextState.markingEndedNotices, [{ id: "marking_declined_continue_continue-decline", team: "red", markerId: "red-1", attackerId: "blue-1", reason: "declined-continue" }]);
});

// Cancel MRK (confirmed with the user): the defending coach may voluntarily
// end an active Marking at any time it is active. Deferred opportunity
// accounting (confirmed with the user): canceling before the marking's
// opportunity was ever actually consumed is entirely free — the team's
// count is untouched, as if the marking had never been accepted at all.
// Canceling after that point behaves like any other ending: the opportunity
// stays spent.

test("Cancel MRK before any successful movement is free — the team's opportunity is never touched", () => {
  const rawState = {
    ...singleAxisTrackingState(),
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: false, opportunityConsumed: false }],
    markingOpportunities: { blue: 2, red: 2 },
  };
  const canceled = applyGameCommand({
    state: rawState,
    context: singleAxisMatchContext(),
    command: { id: "cancel-1", type: "MARKING_TRACK_CANCELED", payload: { markerId: "red-1" } },
  });
  assert.equal(canceled.accepted, true);
  assert.equal(canceled.nextState.activeMarkings.length, 0);
  assert.equal(canceled.nextState.markingOpportunities.red, 2, "never consumed, so canceling costs nothing");
  assert.deepEqual(canceled.nextState.markingEndedNotices, [{ id: "marking_canceled_cancel-1", team: "red", markerId: "red-1", attackerId: "blue-1", reason: "canceled" }]);
});

test("Cancel MRK after a successful movement stays consumed, same as any other ending", () => {
  const rawState = {
    ...singleAxisTrackingState(),
    activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 3, respondedOnce: true, opportunityConsumed: true }],
    markingOpportunities: { blue: 2, red: 1 },
  };
  const canceled = applyGameCommand({
    state: rawState,
    context: singleAxisMatchContext(),
    command: { id: "cancel-2", type: "MARKING_TRACK_CANCELED", payload: { markerId: "red-1" } },
  });
  assert.equal(canceled.accepted, true);
  assert.equal(canceled.nextState.activeMarkings.length, 0);
  assert.equal(canceled.nextState.markingOpportunities.red, 1, "already spent, so canceling does not refund it");
});

test("Cancel MRK also clears whichever Marking decision (track move or Continue?) was pending for that marking", () => {
  const rawState = { ...singleAxisTrackingState(), activeMarkings: [{ id: "m1", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: false, opportunityConsumed: false }] };
  const dispatched = triggerTrackMove(rawState, singleAxisMatchContext());
  assert.equal(dispatched.accepted, true);
  assert.ok(dispatched.nextState.pendingMarkingTrack);
  const canceled = applyGameCommand({
    state: dispatched.nextState,
    context: singleAxisMatchContext(),
    command: { id: "cancel-3", type: "MARKING_TRACK_CANCELED", payload: { markerId: "red-1" } },
  });
  assert.equal(canceled.accepted, true);
  assert.equal(canceled.nextState.pendingMarkingTrack, null);
  assert.equal(canceled.nextState.activeMarkings.length, 0);

  // Cancel is allowed through even while a NEW entry decision is pending for
  // a DIFFERENT marking, since it targets its own markerId regardless.
  const withUnrelatedPending = { ...state(), pendingMarking: { id: "marking_decision_x", team: "red", attackerId: "blue-1", queue: [{ defenderId: "red-1", startedInside: false }] } };
  const blockedOtherCommand = applyGameCommand({
    state: withUnrelatedPending,
    context: singleAxisMatchContext(),
    command: { id: "other-move-start", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "blue-1" } },
  });
  assert.equal(blockedOtherCommand.accepted, false, "the entry decision still blocks unrelated commands");
  const cancelThroughEntryGate = applyGameCommand({
    state: withUnrelatedPending,
    context: singleAxisMatchContext(),
    command: { id: "cancel-4", type: "MARKING_TRACK_CANCELED", payload: { markerId: "nonexistent" } },
  });
  assert.equal(cancelThroughEntryGate.accepted, false, "reason: no active marking for that id — but it was NOT rejected as MARKING_DECISION_PENDING");
  assert.notEqual(cancelThroughEntryGate.reason, "MARKING_DECISION_PENDING");
});

// Marking switch (docs/MARKING_RULES.md section 8): an already-marked
// attacker entering a DIFFERENT eligible defender's area offers a keep/
// switch decision instead of silently doing nothing.

function switchState({ red2 = { x: 9, y: 6 } } = {}) {
  return state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "blue-1", team: "A", cardId: "card-blue-1", x: 3, y: 5 },
      { id: "red-1", team: "B", cardId: "card-red-1", x: 5, y: 6 },
      { id: "red-2", team: "B", cardId: "card-red-2", x: red2.x, y: red2.y },
    ],
  });
}

function switchContext({ blueSpeed = 5, red2Speed = 4 } = {}) {
  return context({
    gameplayCards: [
      { id: "card-blue-1", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: blueSpeed }] },
      context().gameplayCards[1],
      { id: "card-red-2", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: red2Speed }], defensiveArea: [{ dx: 1, dy: 0 }] },
    ],
  });
}

// blue-1 starts already at (5,5), already marked by red-1 (as a settled,
// already-accepted Marking would have left it) — constructed directly, like
// the Cancel MRK tests above, so each switch test needs only ONE movement
// action rather than replaying the whole entry+accept flow first.
function markedState({ red2 = { x: 9, y: 6 } } = {}) {
  const base = switchState({ red2 });
  return {
    ...base,
    pieces: base.pieces.map(piece => (piece.id === "blue-1" ? { ...piece, x: 5, y: 5 } : piece)),
    activeMarkings: [{ id: "existing-marking", team: "red", markerId: "red-1", attackerId: "blue-1", speedBudget: 4, speedSpent: 0, respondedOnce: false, opportunityConsumed: true }],
    markingOpportunities: { blue: 2, red: 1 },
  };
}

test("an already-marked attacker entering a different eligible defender's area offers a switch decision, not a silent no-op", () => {
  const matchContext = switchContext();
  const dispatched = startAndCommit(markedState(), matchContext, { x: 9, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarking, null, "a switch, not a fresh entry, is offered while already marked");
  assert.ok(dispatched.nextState.pendingMarkingSwitch);
  assert.equal(dispatched.nextState.pendingMarkingSwitch.team, "red");
  assert.equal(dispatched.nextState.pendingMarkingSwitch.attackerId, "blue-1");
  assert.equal(dispatched.nextState.pendingMarkingSwitch.currentMarkingId, "existing-marking");
  assert.equal(dispatched.nextState.pendingMarkingSwitch.currentMarkerId, "red-1");
  assert.deepEqual(dispatched.nextState.pendingMarkingSwitch.queue, [{ defenderId: "red-2", startedInside: false }]);
  assert.equal(dispatched.nextState.activeMarkings.length, 1, "the old marking stays active until the coach actually decides");
});

test("declining a Marking switch keeps the current marker untouched and spends no opportunity", () => {
  const matchContext = switchContext();
  const dispatched = startAndCommit(markedState(), matchContext, { x: 9, y: 5 });
  assert.ok(dispatched.nextState.pendingMarkingSwitch);
  const opportunitiesBefore = dispatched.nextState.markingOpportunities.red;
  const declined = applyGameCommand({
    state: dispatched.nextState,
    context: matchContext,
    command: { id: "switch-decline-1", type: "MARKING_SWITCH_DECLINED", payload: {} },
  });
  assert.equal(declined.accepted, true);
  assert.equal(declined.nextState.pendingMarkingSwitch, null);
  assert.equal(declined.nextState.activeMarkings.length, 1);
  assert.equal(declined.nextState.activeMarkings[0].markerId, "red-1", "the original marker is untouched");
  assert.equal(declined.nextState.markingOpportunities.red, opportunitiesBefore, "declining costs nothing");
});

test("accepting a Marking switch ends the old marking (no refund, 'switched' notice) and starts a fresh one with a full Speed budget", () => {
  const matchContext = switchContext();
  const dispatched = startAndCommit(markedState(), matchContext, { x: 9, y: 5 });
  assert.ok(dispatched.nextState.pendingMarkingSwitch);
  const opportunitiesBefore = dispatched.nextState.markingOpportunities.red;
  const accepted = applyGameCommand({
    state: dispatched.nextState,
    context: matchContext,
    command: { id: "switch-accept-1", type: "MARKING_SWITCH_ACCEPTED", payload: { defenderId: "red-2" } },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.nextState.pendingMarkingSwitch, null);
  assert.equal(accepted.nextState.activeMarkings.length, 1, "the old marking ends, replaced by exactly one new one");
  assert.equal(accepted.nextState.activeMarkings[0].markerId, "red-2");
  assert.equal(accepted.nextState.activeMarkings[0].attackerId, "blue-1");
  assert.equal(accepted.nextState.activeMarkings[0].speedBudget, 4, "the new marker gets a full, fresh Speed budget");
  assert.equal(accepted.nextState.activeMarkings[0].speedSpent, 0);
  // Landing exactly on red-2's own area cell settles it immediately — the
  // "settle immediately" branch of deferred accounting (docs section 2),
  // not a spend triggered merely by clicking Switch.
  assert.equal(accepted.nextState.markingOpportunities.red, opportunitiesBefore - 1);
  assert.ok(accepted.nextState.markingEndedNotices.some(notice => notice.markerId === "red-1" && notice.reason === "switched"), "the old marker's ending is announced");
});

test("accepting a Marking switch that does not achieve containment opens tracking instead, deferring the opportunity spend", () => {
  // red-2's area sits mid-route (7,5), not on the landing cell (9,5), so the
  // new marking does not settle immediately.
  const matchContext = switchContext();
  const dispatched = startAndCommit(markedState({ red2: { x: 7, y: 6 } }), matchContext, { x: 9, y: 5 });
  assert.ok(dispatched.nextState.pendingMarkingSwitch);
  const opportunitiesBefore = dispatched.nextState.markingOpportunities.red;
  const accepted = applyGameCommand({
    state: dispatched.nextState,
    context: matchContext,
    command: { id: "switch-accept-2", type: "MARKING_SWITCH_ACCEPTED", payload: { defenderId: "red-2" } },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.nextState.activeMarkings[0].markerId, "red-2");
  assert.ok(accepted.nextState.pendingMarkingTrack, "not yet contained, so the new marker's tracking response opens right away");
  assert.equal(accepted.nextState.markingOpportunities.red, opportunitiesBefore, "not spent yet — deferred until the new marker's first successful move");
});

test("fast exit ending the current marking within the same move is a fresh entry (section 3), not a switch (section 8)", () => {
  // A wide Speed gap against red-1 (diff 2): leaving its single-cell area
  // qualifies for fast exit, so by the time the new area is checked the
  // attacker is no longer marked by anyone.
  const matchContext = switchContext({ blueSpeed: 6 });
  const dispatched = startAndCommit(markedState(), matchContext, { x: 9, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarkingSwitch, null, "no switch is offered — the attacker is unmarked by the time the new area is checked");
  assert.ok(dispatched.nextState.pendingMarking, "a fresh entry decision is offered instead");
  assert.deepEqual(dispatched.nextState.pendingMarking.queue, [{ defenderId: "red-2", startedInside: false }]);
  assert.equal(dispatched.nextState.activeMarkings.length, 0, "the old marking already ended by fast exit, and no new one exists until this decision is resolved");
  assert.ok(dispatched.nextState.markingEndedNotices.some(notice => notice.markerId === "red-1" && notice.reason === "fast-exit"));
});

test("fast exit against the new candidate defender prevents the switch offer for that candidate, same as a fresh entry", () => {
  // red-1 stays attached (diff 1, no fast exit against it); red-2 sits on a
  // single-cell area the route only crosses through (diff 2, qualifies).
  const matchContext = switchContext({ blueSpeed: 5, red2Speed: 3 });
  const dispatched = startAndCommit(markedState({ red2: { x: 7, y: 6 } }), matchContext, { x: 9, y: 5 });
  assert.equal(dispatched.accepted, true);
  assert.equal(dispatched.nextState.pendingMarkingSwitch, null, "the only candidate was fast-exit-prevented, so nothing is offered");
  assert.equal(dispatched.nextState.activeMarkings.length, 1);
  assert.equal(dispatched.nextState.activeMarkings[0].markerId, "red-1", "the original marking is untouched");
  assert.ok(dispatched.nextState.markingEndedNotices.some(notice => notice.reason === "fast-exit-prevented" && notice.markerIds.includes("red-2")));
});

// Regression: reported live (K25 -> J26 -> I27 -> H28 -> G29 -> F30, marker
// tracking H27 -> H28 in between). H28 sits exactly on the attacker's own
// historical path AND becomes the marker's own current cell after it tracks
// there — since a defender's own cell was never counted as part of its own
// area, that one cell used to split an otherwise-continuous 4-cell crossing
// (J26,I27,H28,G29) into a false "2-cell run" + a false "1-cell run",
// letting the second fragment wrongly qualify for fast exit.
test("a marker's own current cell counts as inside its own area, so passing through it does not split an otherwise-continuous crossing (regression)", () => {
  const K25 = { x: 24, y: 10 };
  const H27 = { x: 26, y: 7 };
  const H28 = { x: 27, y: 7 };
  const G29 = { x: 28, y: 6 };
  const F30 = { x: 29, y: 5 };
  // Matches the real reported card exactly: every offset in the rectangle
  // EXCEPT (0,0) — a defender's own cell is never part of its card-defined
  // area (confirmed live: 19 cells, not the full 20-cell rectangle).
  const jamalArea = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 1; dy++) { if (dx !== 0 || dy !== 0) jamalArea.push({ dx, dy }); }
  const rawState = state({
    pieces: [
      { id: "ball", team: "BALL", x: 0, y: 0 },
      { id: "connor", team: "A", cardId: "card-connor", x: K25.x, y: K25.y },
      { id: "jamal", team: "B", cardId: "card-jamal", x: H27.x, y: H27.y },
    ],
  });
  // The default 20x12 test board is too small for these letter-coordinates
  // (x reaches 29) — needs a board sized like the real reported match.
  const matchContext = context({
    boardSettings: { cols: 40, rows: 20 },
    gameplayCards: [
      { id: "card-connor", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 7 }] },
      { id: "card-jamal", passiveAttributes: [{ id: "stat:speed", name: "Speed", value: 4 }], defensiveArea: jamalArea },
    ],
  });
  const started = applyGameCommand({ state: rawState, context: matchContext, command: { id: "s1", type: "NORMAL_MOVE_STARTED", payload: { pieceId: "connor" } } });
  assert.equal(started.accepted, true);
  const entered = applyGameCommand({ state: started.nextState, context: matchContext, command: { id: "c1", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "connor", x: G29.x, y: G29.y } } });
  assert.equal(entered.accepted, true);
  const accepted = applyGameCommand({ state: entered.nextState, context: matchContext, command: { id: "acc", type: "MARKING_ACCEPTED", payload: { defenderId: "jamal" } } });
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.nextState.pendingMarkingTrack);
  const trackCell = accepted.nextState.pendingMarkingTrack.cells.find(c => c.x === H28.x && c.y === H28.y);
  assert.ok(trackCell, "H28 must be offered as a legal tracking cell");
  const tracked = applyGameCommand({ state: accepted.nextState, context: matchContext, command: { id: "trk", type: "MARKING_TRACK_MOVE_COMMITTED", payload: { markerId: "jamal", x: trackCell.x, y: trackCell.y } } });
  assert.equal(tracked.accepted, true);
  const finalMove = applyGameCommand({ state: tracked.nextState, context: matchContext, command: { id: "c2", type: "NORMAL_MOVE_COMMITTED", payload: { pieceId: "connor", x: F30.x, y: F30.y } } });
  assert.equal(finalMove.accepted, true);
  assert.equal(finalMove.nextState.activeMarkings.length, 1, "the marking must stay active — the whole crossing was 4 cells, never a brief 1-cell pass-through");
  assert.equal(finalMove.nextState.activeMarkings[0].markerId, "jamal");
  assert.ok(finalMove.nextState.markingEndedNotices.some(notice => notice.reason === "fast-exit-attempted" && notice.runLength === 4),
    "the near-miss explanation must report the full 4-cell run, not a false short one");
});
