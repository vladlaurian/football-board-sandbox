import { teamKeyForPiece, defensiveCellsForPiece, cardStat } from "../rules/passEngine.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { getMovementGeometry, diagonalCostForDistance } from "../board/movementState.mjs";

// Command types that always mean "the coach is starting a brand new action" —
// the trigger docs/MARKING_RULES.md section 5 calls "the attacker's movement
// fully ends" (confirmed with the user: the moment anyone tries to start a
// different action, the previous mover's turn at moving is over and any
// tracking response owed becomes due, interrupting that new action's start
// until it's resolved).
export const MARKING_TRACKING_TRIGGER_COMMAND_TYPES = [
  "PASS_STARTED",
  "SHOT_STARTED",
  "THROUGH_BALL_STARTED",
  "LOFTED_THROUGH_BALL_STARTED",
  "NORMAL_MOVE_STARTED",
  "BONUS_MOVE_STARTED",
  "FREE_MOVE_STARTED",
];

// Marking (docs/MARKING_RULES.md) — sections 1-8 implemented.

export function opponentTeamOf(team) {
  return team === "blue" ? "red" : "blue";
}

function pieceSpeed(context, piece) {
  return Math.max(0, Number(cardStat(context.gameplayCardsById[String(piece?.cardId || "")], "stat:speed")) || 0);
}

// "1vs1 Defending" has no stable stat: id yet anywhere in the codebase (see
// docs/DRIBBLING_RULES.md, which documents it for a mechanic that isn't
// implemented) — cardStat's name-matching fallback finds it by its default
// attribute name instead, same as every other not-yet-canonical stat.
function pieceOneVOneDefending(context, piece) {
  return Math.max(0, Number(cardStat(context.gameplayCardsById[String(piece?.cardId || "")], "1vs1 Defending")) || 0);
}

// docs/MARKING_RULES.md section 7: a move only qualifies for fast exit
// against ONE particular defender if the contiguous run of cells (starting
// point included) that fall inside THAT defender's area is at most 2 cells
// for an orthogonal move or at most 1 cell for a diagonal move, with the
// very next cell in the route lying outside that area, AND the attacker's
// Speed is at least 2 higher than that defender's.
// `countOrigin` distinguishes the two section-7 cases. An already-marked
// attacker escaping (checkMarkingFastExit, case 2) has genuinely been
// standing tracked on its current cell, so that cell counts fully as part of
// the route it must cross to get out. A first-time entry check (firstMarking-
// EntryCell, covering the section-3 "started already inside" trigger) has no
// active tracker yet — the mover's starting cell is just where it happened to
// already be, not a cell it is "escaping through" — so when the qualifying
// run starts right at that cell, the cell itself is not counted toward the
// crossed-cell threshold (only the cells the current movement actually moves
// INTO are), though it still anchors where the run begins.
//
// Besides the plain yes/no, this also reports a "near miss" — the Speed edge
// was there but the attacker's route stayed inside the defender's own area
// for MORE than the allowed brief crossing before actually exiting it — so
// the UI can explain why fast exit did not apply, instead of the attacker
// just staying marked with no visible reason. `nearMiss` reports the LAST
// such over-length exit found in the route.
function fastExitCheck(context, mover, path, defender, attackerSpeed, defenderSpeed, countOrigin = true) {
  if (!path.length) return { qualifies: false, nearMiss: null };
  if (attackerSpeed - defenderSpeed < 2) return { qualifies: false, nearMiss: null };
  const last = path[path.length - 1];
  const geometry = getMovementGeometry(mover, last);
  const maxAllowed = geometry.kind === "diagonal" ? 1 : 2;
  const areaCells = defenderOwnAreaCells(defender, context);
  const isInArea = cell => areaCells.some(area => Number(area.x) === cell.x && Number(area.y) === cell.y);
  const sequence = [{ x: Number(mover.x), y: Number(mover.y) }, ...path];
  let nearMiss = null;
  for (let index = 0; index < sequence.length; index += 1) {
    if (!isInArea(sequence[index])) continue;
    let runEnd = index;
    while (runEnd + 1 < sequence.length && isInArea(sequence[runEnd + 1])) runEnd += 1;
    const runLength = runEnd - index + 1 - (!countOrigin && index === 0 ? 1 : 0);
    const next = sequence[runEnd + 1];
    if (next && !isInArea(next)) {
      if (runLength <= maxAllowed) return { qualifies: true, nearMiss: null };
      nearMiss = { runLength, maxAllowed, geometryKind: geometry.kind };
    }
    index = runEnd;
  }
  return { qualifies: false, nearMiss };
}

// Checks an already-active Marking's own marker for fast exit (docs section
// 7, case 2) — evaluated regardless of whether this move also happens to
// enter some OTHER defender's area. Returns null when there is nothing to
// report (no active marking for this attacker, or the check was a plain
// non-event); otherwise `qualifies: true` (the marking ends) or
// `qualifies: false` with a `nearMiss` detail for the UI to explain.
export function checkMarkingFastExit(state, context, { mover, path }) {
  const marking = (state.activeMarkings || []).find(item => String(item.attackerId) === String(mover.id));
  if (!marking) return null;
  const marker = pieceById(state, marking.markerId);
  if (!marker) return null;
  const check = fastExitCheck(context, mover, path, marker, pieceSpeed(context, mover), pieceSpeed(context, marker));
  if (!check.qualifies) {
    return check.nearMiss ? { qualifies: false, nearMiss: { team: marking.team, markerId: marking.markerId, attackerId: marking.attackerId, ...check.nearMiss } } : null;
  }
  return {
    qualifies: true,
    activeMarkings: (state.activeMarkings || []).filter(item => item.id !== marking.id),
    endedMarking: { id: marking.id, team: marking.team, markerId: marking.markerId, attackerId: marking.attackerId, reason: "fast-exit" },
  };
}

// Every field a numbered turn resets, folded into one object so every
// turn-advance call site (trackerPhaseRules.mjs's normal path, and every
// mechanic that starts an immediate new turn — Pass/Through Ball/Lofted
// Through Ball interception, Goal, Goal Kick) spreads the same reset.
export function markingTurnResetFields() {
  return { pendingMarking: null, activeMarkings: [], markingOpportunities: { blue: 2, red: 2 }, pendingMarkingTrack: null, pendingMarkingContinue: null, pendingMarkingSwitch: null, markingEndedNotices: [] };
}

// The card's own listed offsets never include the defender's own cell (every
// other consumer of defensiveCellsForPiece — Shot, Through Ball, Lofted
// Through Ball — handles "a body is standing here" as its own separate
// mechanic, deliberately independent of the area). Marking has no such
// separate body-blocking layer, so its own area must count the defender's
// own cell too — otherwise a route that passes exactly through wherever the
// marker is CURRENTLY standing (e.g. after its own tracking move landed it
// on a cell the attacker's earlier path already crossed) gets split into two
// shorter "runs" by that one missing cell, letting a long crossing wrongly
// look like a brief one and qualify for fast exit (reported live, confirmed
// via debug trace: Speed Connor 7 vs Jamal 4, a 4-cell diagonal crossing
// broke into a 2-cell run + a false 1-cell run because Jamal's own H28 cell
// — sitting mid-route — read as "outside" its own area).
function defenderOwnAreaCells(defender, context) {
  const cells = defensiveCellsForPiece(defender, context.gameplayCardsById[String(defender?.cardId || "")], context.boardSettings) || [];
  const ownX = Number(defender?.x);
  const ownY = Number(defender?.y);
  if (cells.some(cell => Number(cell.x) === ownX && Number(cell.y) === ownY)) return cells;
  return [...cells, { id: `${defender?.id}-area-self`, x: ownX, y: ownY }];
}

// Every defender whose area this WHOLE completed movement touched (confirmed
// with the user: the attacker's move is never truncated any more — it lands
// wherever the coach requested first, and only THEN does the engine work out
// who along that route gets a chance to mark). Two ways a defender's area
// counts as touched: it already contained the mover's cell before this move
// started, or the move's path enters it partway through — matching docs
// section 3's "start inside" case and its ordinary entry case respectively.
//
// Ordered by where each defender was FIRST touched (start-inside sorts
// before every path index); ties at the same point (several areas overlap
// the same cell) are broken by the higher "1vs1 Defending" card stat
// (confirmed with the user). The defending coach is asked about each queued
// defender ONE AT A TIME in this order — accepting stops the whole queue
// immediately (an attacker can only ever have one marker; see docs section
// 2), declining moves on to the next. Eligible meaning: the mover doesn't
// have the ball, that defender isn't already marking anyone, the mover isn't
// already marked by anyone, and the route doesn't qualify for fast exit
// against that specific defender (section 7) — the defending team's
// remaining Marking-opportunity COUNT is deliberately NOT checked here; the
// caller decides what to do when the queue is non-empty but no opportunity
// remains (docs section 6's "no marking left" case), since declining never
// spends an opportunity and so can never make one run out mid-queue.
//
// Always returns { queue, preventedDefenderIds, switchFromMarkingId }:
// `queue` is the ordered list of { defenderId, startedInside } entries
// still eligible after fast exit; `preventedDefenderIds` lists every
// defender whose area this route actually touched but who was filtered out
// purely by fast exit (section 7's "no Marking prompt appears... the
// defender may not consume a Marking unnecessarily") — the caller bundles
// these into one "X can't be marked by Y, Z" announcement even when the
// route never opens a single decision.
//
// `switchFromMarkingId` (docs section 8): if the mover already has an
// active marking when this route completes, `queue`/`preventedDefenderIds`
// describe **switch** candidates instead of fresh ones — every OTHER
// defender (never the mover's own current marker, which is already
// excluded since it's in `markingDefenderIds` like any other busy
// defender) whose area this route touched, still subject to the exact
// same fast-exit filtering as a fresh entry. The caller uses this id to
// open a pending Marking-switch decision instead of a fresh one. If the
// mover has no active marking, this is always null and behaviour is
// unchanged from a first-time entry check.
export function firstMarkingEntryCell(state, context, { mover, moverTeam, path, fastExitOrigin = mover, fastExitPath = path }) {
  const none = { queue: [], preventedDefenderIds: [], switchFromMarkingId: null, fastExitNearMisses: [] };
  if (!path.length) return none;
  const ball = (state.pieces || []).find(piece => piece?.team === "BALL");
  if (ball && Number(ball.x) === Number(mover.x) && Number(ball.y) === Number(mover.y)) {
    return none;
  }
  const defendingTeam = opponentTeamOf(moverTeam);
  const existingMarking = (state.activeMarkings || []).find(marking => String(marking.attackerId) === String(mover.id)) || null;
  const markingDefenderIds = new Set((state.activeMarkings || []).map(marking => String(marking.markerId)));
  const attackerSpeed = pieceSpeed(context, mover);
  const defenders = (state.pieces || []).filter(piece => piece && piece.team !== "BALL" && !piece.inactive && !isBenchReservePiece(piece)
    && teamKeyForPiece(piece) === defendingTeam && !markingDefenderIds.has(String(piece.id)));
  const preventedDefenderIds = [];
  const fastExitNearMisses = [];
  const touched = [];
  for (const defender of defenders) {
    const areaCells = defenderOwnAreaCells(defender, context);
    const inArea = cell => areaCells.some(area => Number(area.x) === cell.x && Number(area.y) === cell.y);
    const startedInside = inArea({ x: Number(mover.x), y: Number(mover.y) });
    const order = startedInside ? -1 : path.findIndex(step => inArea(step));
    if (!startedInside && order === -1) continue; // never touched this route at all
    // Fast exit (section 7) is judged against fastExitPath/fastExitOrigin —
    // the WHOLE movement action's cumulative route through each defender's
    // area, not just this segment (see normalMoveRules.mjs's
    // commitNormalMove for why: a fragmented series of small commits must
    // not be able to sneak under the cell-count threshold piece by piece).
    const fastExit = fastExitCheck(context, fastExitOrigin, fastExitPath, defender, attackerSpeed, pieceSpeed(context, defender), false);
    if (fastExit.qualifies) {
      preventedDefenderIds.push(String(defender.id));
      continue;
    }
    // A "near miss" (the Speed edge was there, but the crossing through this
    // defender's own area was too long to count as brief) does NOT prevent
    // the ordinary Marking offer below — it only adds an explanatory notice
    // for why fast exit itself did not also apply here.
    if (fastExit.nearMiss) {
      fastExitNearMisses.push({ defenderId: String(defender.id), ...fastExit.nearMiss });
    }
    touched.push({ defenderId: String(defender.id), startedInside, order, oneVOneDefending: pieceOneVOneDefending(context, defender) });
  }
  touched.sort((a, b) => a.order - b.order || b.oneVOneDefending - a.oneVOneDefending);
  return {
    queue: touched.map(({ defenderId, startedInside }) => ({ defenderId, startedInside })),
    preventedDefenderIds,
    switchFromMarkingId: existingMarking ? existingMarking.id : null,
    fastExitNearMisses,
  };
}

function pieceById(state, pieceId) {
  return (state.pieces || []).find(piece => String(piece?.id || "") === String(pieceId)) || null;
}

// What happens next for ONE freshly-relevant marking (confirmed with the
// user): if the attacker is already inside the marker's own area, there is
// nothing to decide — settled silently, no question asked, whether this is
// the marking's first check or a later one. Otherwise, the very FIRST check
// ever for a marking opens its free-move decision directly — accepting the
// Marking already signalled "yes, track them", so no extra permission is
// asked for that first attempt. Every check AFTER that first one asks
// "Continue Marking?" first, since the coach may have changed their mind or
// want to save the marker's remaining Speed instead of chasing.
function resolveMarkingCheck(state, context, marking) {
  const marker = pieceById(state, marking.markerId);
  const attacker = pieceById(state, marking.attackerId);
  if (!marker || !attacker) return { kind: "ended", reason: "no-legal-move" };
  if (attackerContained(marker, attacker, context)) return { kind: "settled" };
  if (marking.respondedOnce) return { kind: "ask-continue" };
  const result = markingTrackLegalCells(state, context, marking);
  if (result.ended) return { kind: "ended", reason: result.reason };
  return { kind: "open-track", cells: result.cells };
}

// Charges the team's Marking-opportunity count exactly once per marking —
// the moment it is first "real" (confirmed with the user): either because
// the attacker was already inside the marker's area the instant it
// settled (nothing to move for), or because the marker's first tracking
// movement was actually committed successfully (see commitMarkingTrackMove).
// Before that point the marking is provisional; Cancel MRK or an immediate
// no-legal-move unwinds it as if it had never been accepted, at no cost to
// the team — this is the ONLY place markingOpportunities is ever decreased.
function consumeMarkingOpportunity(state, team) {
  return {
    ...state,
    markingOpportunities: { ...state.markingOpportunities, [team]: Math.max(0, (state.markingOpportunities?.[team] ?? 2) - 1) },
  };
}

// The defending coach picks exactly ONE defender from the whole ordered
// list (docs section 3) — every other queued defender is simply not chosen,
// with no cascading follow-up questions for them.
export function acceptMarking(state, context, command) {
  const pending = state.pendingMarking;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING" };
  const defenderId = String(command.payload?.defenderId || "");
  const chosen = (pending.queue || []).find(entry => entry.defenderId === defenderId);
  if (!chosen) return { accepted: false, reason: "MARKING_DEFENDER_INVALID" };
  const defender = pieceById(state, defenderId);
  if (!defender || defender.inactive || isBenchReservePiece(defender)) return { accepted: false, reason: "MARKING_DEFENDER_INVALID" };
  const speed = pieceSpeed(context, defender);
  const marking = { id: `marking_${command.id}`, team: pending.team, markerId: defender.id, attackerId: pending.attackerId, speedBudget: speed, speedSpent: 0, respondedOnce: false, opportunityConsumed: false };
  const withMarking = { ...state, pendingMarking: null, activeMarkings: [...(state.activeMarkings || []), marking] };
  const baseEvent = { type: "MARKING_ACCEPTED", team: pending.team, metadata: { markingId: marking.id, markerId: defender.id, attackerId: pending.attackerId } };
  const check = resolveMarkingCheck(withMarking, context, marking);
  if (check.kind === "settled") {
    const settled = consumeMarkingOpportunity(withMarking, marking.team);
    return {
      accepted: true,
      nextState: { ...settled, activeMarkings: settled.activeMarkings.map(item => item.id === marking.id ? { ...item, opportunityConsumed: true } : item) },
      event: baseEvent,
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  if (check.kind === "ended") {
    // Never got a chance to move at all — as if it had never been
    // accepted; the team's opportunity is untouched.
    return {
      accepted: true,
      nextState: {
        ...withMarking,
        activeMarkings: withMarking.activeMarkings.filter(item => item.id !== marking.id),
        markingEndedNotices: [{ id: `marking_ended_${command.id}`, team: pending.team, markerId: defender.id, attackerId: pending.attackerId, reason: check.reason }],
      },
      event: baseEvent,
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  // check.kind === "open-track": the first free-move decision, opened
  // directly with no "Continue Marking?" gate.
  return {
    accepted: true,
    nextState: {
      ...withMarking,
      activeMarkings: withMarking.activeMarkings.map(item => item.id === marking.id ? { ...item, respondedOnce: true } : item),
      pendingMarkingTrack: { id: `marking_track_${marking.id}`, team: marking.team, markingId: marking.id, markerId: marking.markerId, attackerId: marking.attackerId, cells: check.cells },
    },
    event: baseEvent,
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// Declining rejects every queued defender at once — no marking is created
// for any of them, and no team opportunity is spent (docs section 2).
export function declineMarking(state, context, command) {
  const pending = state.pendingMarking;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING" };
  return {
    accepted: true,
    nextState: { ...state, pendingMarking: null },
    event: { type: "MARKING_DECLINED", team: pending.team, metadata: { attackerId: pending.attackerId } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// Marking switch (docs/MARKING_RULES.md section 8): the defending coach
// picks exactly one NEW defender from the whole eligible switch list, same
// selection shape as a fresh entry decision. Accepting ends the previous
// Marking (no refund — its opportunity, if ever charged, stays spent) and
// creates a brand new Marking for the chosen defender with its own full
// Speed budget, following the exact same acceptance/timing rules as any
// other fresh Marking: deferred opportunity charging (settled immediately
// if the attacker already sits in the new area, otherwise on the new
// marker's first successful movement) and an immediate first tracking
// response with no "Continue Marking?" gate.
export function acceptMarkingSwitch(state, context, command) {
  const pending = state.pendingMarkingSwitch;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING_SWITCH" };
  const defenderId = String(command.payload?.defenderId || "");
  const chosen = (pending.queue || []).find(entry => entry.defenderId === defenderId);
  if (!chosen) return { accepted: false, reason: "MARKING_DEFENDER_INVALID" };
  const defender = pieceById(state, defenderId);
  if (!defender || defender.inactive || isBenchReservePiece(defender)) return { accepted: false, reason: "MARKING_DEFENDER_INVALID" };
  const previousMarking = (state.activeMarkings || []).find(item => item.id === pending.currentMarkingId) || null;
  const remainingAfterOld = (state.activeMarkings || []).filter(item => item.id !== pending.currentMarkingId);
  const speed = pieceSpeed(context, defender);
  const marking = { id: `marking_${command.id}`, team: pending.team, markerId: defender.id, attackerId: pending.attackerId, speedBudget: speed, speedSpent: 0, respondedOnce: false, opportunityConsumed: false };
  const endedNotice = previousMarking
    ? { id: `marking_switched_${command.id}`, team: previousMarking.team, markerId: previousMarking.markerId, attackerId: previousMarking.attackerId, reason: "switched" }
    : null;
  const withMarking = {
    ...state,
    pendingMarkingSwitch: null,
    activeMarkings: [...remainingAfterOld, marking],
    markingEndedNotices: endedNotice ? [endedNotice] : [],
  };
  const baseEvent = { type: "MARKING_SWITCH_ACCEPTED", team: pending.team, metadata: { markingId: marking.id, markerId: defender.id, attackerId: pending.attackerId, previousMarkingId: pending.currentMarkingId } };
  const check = resolveMarkingCheck(withMarking, context, marking);
  if (check.kind === "settled") {
    const settled = consumeMarkingOpportunity(withMarking, marking.team);
    return {
      accepted: true,
      nextState: { ...settled, activeMarkings: settled.activeMarkings.map(item => item.id === marking.id ? { ...item, opportunityConsumed: true } : item) },
      event: baseEvent,
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  if (check.kind === "ended") {
    return {
      accepted: true,
      nextState: {
        ...withMarking,
        activeMarkings: withMarking.activeMarkings.filter(item => item.id !== marking.id),
        markingEndedNotices: [...withMarking.markingEndedNotices, { id: `marking_ended_${command.id}`, team: pending.team, markerId: defender.id, attackerId: pending.attackerId, reason: check.reason }],
      },
      event: baseEvent,
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  return {
    accepted: true,
    nextState: {
      ...withMarking,
      activeMarkings: withMarking.activeMarkings.map(item => item.id === marking.id ? { ...item, respondedOnce: true } : item),
      pendingMarkingTrack: { id: `marking_track_${marking.id}`, team: marking.team, markingId: marking.id, markerId: marking.markerId, attackerId: marking.attackerId, cells: check.cells },
    },
    event: baseEvent,
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// Declining a Marking switch keeps the existing marker untouched — no
// second marker is ever created, and no opportunity is spent (docs section
// 8: "if the coach keeps the existing marker, no second marker is
// created").
export function declineMarkingSwitch(state, context, command) {
  const pending = state.pendingMarkingSwitch;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING_SWITCH" };
  return {
    accepted: true,
    nextState: { ...state, pendingMarkingSwitch: null },
    event: { type: "MARKING_SWITCH_DECLINED", team: pending.team, metadata: { attackerId: pending.attackerId, currentMarkingId: pending.currentMarkingId } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// Cancel MRK (confirmed with the user): the defending coach may voluntarily
// end an active Marking at any time it is active — mid-response (abandoning
// an attempt before ever committing a valid cell) or idle between
// responses (simply changing their mind about continuing to track). If this
// marking's opportunity was never actually consumed yet (see
// consumeMarkingOpportunity), it is removed as if it had never been
// accepted at all — the team's opportunity count is untouched, since
// nothing was ever charged. Once consumed, canceling behaves like any other
// section-6 ending: the opportunity stays spent.
export function cancelMarkingTrack(state, context, command) {
  const markerId = String(command.payload?.markerId || "");
  const marking = (state.activeMarkings || []).find(item => String(item.markerId) === markerId);
  if (!marking) return { accepted: false, reason: "NO_ACTIVE_MARKING" };
  const activeMarkings = (state.activeMarkings || []).filter(item => item.id !== marking.id);
  const pendingMarkingTrack = state.pendingMarkingTrack?.markingId === marking.id ? null : state.pendingMarkingTrack;
  const pendingMarkingContinue = state.pendingMarkingContinue?.markingId === marking.id ? null : state.pendingMarkingContinue;
  const notice = { id: `marking_canceled_${command.id}`, team: marking.team, markerId: marking.markerId, attackerId: marking.attackerId, reason: "canceled" };
  return {
    accepted: true,
    nextState: { ...state, activeMarkings, pendingMarkingTrack, pendingMarkingContinue, markingEndedNotices: [notice] },
    event: { type: "MARKING_TRACK_CANCELED", team: marking.team, metadata: { markingId: marking.id, markerId: marking.markerId, attackerId: marking.attackerId } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

// "Continue Marking?" (confirmed with the user): every tracking check after
// a marking's first one asks permission before doing anything else. Yes
// proceeds to the same free-move computation the first check would have
// used; No ends the Marking right here — the opportunity was already spent
// on an earlier successful commit by this point (respondedOnce only becomes
// true once this marking has had a real, resolved first response), so it
// simply stays spent, same as any other section-6 ending.
export function acceptMarkingContinue(state, context, command) {
  const pending = state.pendingMarkingContinue;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING_CONTINUE" };
  const marking = (state.activeMarkings || []).find(item => item.id === pending.markingId);
  if (!marking) return { accepted: false, reason: "NO_PENDING_MARKING_CONTINUE" };
  const result = markingTrackLegalCells(state, context, marking);
  if (result.ended) {
    return {
      accepted: true,
      nextState: {
        ...state,
        activeMarkings: state.activeMarkings.filter(item => item.id !== marking.id),
        pendingMarkingContinue: null,
        markingEndedNotices: [{ id: `marking_ended_${command.id}`, team: marking.team, markerId: marking.markerId, attackerId: marking.attackerId, reason: result.reason }],
      },
      event: { type: "MARKING_CONTINUE_ACCEPTED", team: pending.team, metadata: { markingId: marking.id } },
      timeline: { allowNoop: true, undoMode: "step" },
    };
  }
  return {
    accepted: true,
    nextState: {
      ...state,
      pendingMarkingContinue: null,
      pendingMarkingTrack: { id: `marking_track_${marking.id}`, team: marking.team, markingId: marking.id, markerId: marking.markerId, attackerId: marking.attackerId, cells: result.cells },
    },
    event: { type: "MARKING_CONTINUE_ACCEPTED", team: pending.team, metadata: { markingId: marking.id } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

export function declineMarkingContinue(state, context, command) {
  const pending = state.pendingMarkingContinue;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING_CONTINUE" };
  const marking = (state.activeMarkings || []).find(item => item.id === pending.markingId);
  const activeMarkings = (state.activeMarkings || []).filter(item => item.id !== pending.markingId);
  const notices = marking
    ? [{ id: `marking_declined_continue_${command.id}`, team: marking.team, markerId: marking.markerId, attackerId: marking.attackerId, reason: "declined-continue" }]
    : [];
  return {
    accepted: true,
    nextState: { ...state, activeMarkings, pendingMarkingContinue: null, markingEndedNotices: notices },
    event: { type: "MARKING_CONTINUE_DECLINED", team: pending.team, metadata: { markingId: pending.markingId } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}

function attackerContained(marker, attacker, context) {
  return defenderOwnAreaCells(marker, context).some(cell => Number(cell.x) === Number(attacker.x) && Number(cell.y) === Number(attacker.y));
}

// The legal single-axis movement candidates toward — or, once already
// aligned with the attacker on one coordinate, sideways along — the
// attacker. Movement in this engine only ever happens on 4 lines —
// horizontal, vertical, or a perfect 45° diagonal (see getMovementGeometry;
// anything else is "mixed" and illegal).
//
// Once a coordinate exactly matches the attacker's (dx or dy === 0), moving
// EITHER way along that coordinate is equally "toward" the attacker in the
// only sense that matters here — the resulting cell is exactly as close.
// Both signs are offered rather than the axis silently vanishing.
function axisCandidatesTowardAttacker(marker, attacker) {
  const dx = Number(attacker.x) - Number(marker.x);
  const dy = Number(attacker.y) - Number(marker.y);
  const xSigns = dx !== 0 ? [Math.sign(dx)] : dy !== 0 ? [1, -1] : [];
  const ySigns = dy !== 0 ? [Math.sign(dy)] : dx !== 0 ? [1, -1] : [];
  const candidates = [];
  for (const sx of xSigns) candidates.push({ direction: { dx: sx, dy: 0 } });
  for (const sy of ySigns) candidates.push({ direction: { dx: 0, dy: sy } });
  if (dx !== 0 && dy !== 0) {
    candidates.push({ direction: { dx: Math.sign(dx), dy: Math.sign(dy) } });
  } else if (dx !== 0) {
    for (const sy of [1, -1]) candidates.push({ direction: { dx: Math.sign(dx), dy: sy } });
  } else if (dy !== 0) {
    for (const sx of [1, -1]) candidates.push({ direction: { dx: sx, dy: Math.sign(dy) } });
  }
  return candidates;
}

// How many cells a marker could legally travel along one direction — bounded
// by the board, by bodies blocking the line (ordinary movement-path
// legality, exactly like every other piece's movement), and by the
// marker's remaining Speed budget for this response (using the same
// diagonal 3-for-2 cost as every other move in this engine).
function maxLegalDistanceAlong(state, context, marker, direction, remainingSpeed) {
  const cols = Number(context.boardSettings.cols);
  const rows = Number(context.boardSettings.rows);
  const isDiagonal = Boolean(direction.dx && direction.dy);
  const occupied = new Set((state.pieces || [])
    .filter(item => item && item.team !== "BALL" && String(item.id) !== String(marker.id))
    .map(item => `${Number(item.x)},${Number(item.y)}`));
  let distance = 0;
  while (true) {
    const nextDistance = distance + 1;
    const x = Number(marker.x) + direction.dx * nextDistance;
    const y = Number(marker.y) + direction.dy * nextDistance;
    if (x < 0 || y < 0 || x >= cols || y >= rows) break;
    if (occupied.has(`${x},${y}`)) break;
    const cost = isDiagonal ? diagonalCostForDistance(nextDistance) : nextDistance;
    if (cost > remainingSpeed) break;
    distance = nextDistance;
  }
  return distance;
}

// How far a single straight/diagonal hop of `distance` cells along
// `direction` costs, using the same diagonal 3-for-2 cost as every other
// move in this engine.
function hopCost(direction, distance) {
  return direction.dx && direction.dy ? diagonalCostForDistance(distance) : distance;
}

// The full set of legal destination cells for one marking's tracking
// response, or why it ends instead (docs section 6), and the real Speed
// cost of each one.
//
// Confirmed with the user (final revision, after live testing showed the
// earlier free-pathfinding version let a marker reposition too freely —
// including landing squarely in front of the attacker's own path with no
// real constraint, something the attacker itself, locked to one straight/
// diagonal axis per move, could never do to a marker): the marker's
// tracking response follows the EXACT SAME rule as ordinary piece
// movement — a single straight or diagonal axis, chosen freely toward the
// attacker, blocked by any body exactly like any other move, with no
// bending and no exception. If a body happens to block every legal axis
// this response, the marker simply can't move this response — the same
// way an attacker can be boxed in by opponents during a normal move. This
// keeps the marker and the attacker under the same movement rule, rather
// than giving the defending side unlimited pathfinding freedom the
// attacking side never has.
//
// Every legal cell on every legal axis is offered, with NO preference for
// ones that would leave the attacker contained — containment is judged
// only at commit time (commitMarkingTrackMove), never restricting which
// cells are offered here.
function markingTrackLegalCells(state, context, marking) {
  const marker = pieceById(state, marking.markerId);
  const attacker = pieceById(state, marking.attackerId);
  if (!marker || !attacker) return { ended: true, reason: "no-legal-move" };
  if (attackerContained(marker, attacker, context)) return { ended: false, cells: [] };
  const remainingSpeed = marking.speedBudget - marking.speedSpent;
  if (remainingSpeed <= 0) return { ended: true, reason: "insufficient-speed" };
  const axisCandidates = axisCandidatesTowardAttacker(marker, attacker)
    .map(candidate => ({ direction: candidate.direction, maxDistance: maxLegalDistanceAlong(state, context, marker, candidate.direction, remainingSpeed) }))
    .filter(candidate => candidate.maxDistance > 0);
  if (!axisCandidates.length) return { ended: true, reason: "no-legal-move" };
  const cells = axisCandidates.flatMap(candidate => Array.from({ length: candidate.maxDistance }, (_, index) => {
    const distance = index + 1;
    const x = Number(marker.x) + candidate.direction.dx * distance;
    const y = Number(marker.y) + candidate.direction.dy * distance;
    return { x, y, distance: hopCost(candidate.direction, distance), maxDistance: remainingSpeed };
  }));
  return { ended: false, cells };
}

// Finds every active marking (in order) that owes a tracking response after
// its attacker's movement ended, and opens exactly one pending decision for
// the first one found — either state.pendingMarkingContinue ("Continue
// Marking?", for any marking that has already had its first response) or
// state.pendingMarkingTrack directly (a marking's very first response, no
// permission needed — see resolveMarkingCheck). A marking whose attacker is
// already contained is left untouched (settled silently); one with no legal
// move at all is dropped (docs section 6 — the opportunity, if it was ever
// actually consumed, stays spent).
export function beginMarkingTrackMove(state, context) {
  const markings = state.activeMarkings || [];
  const nextMarkings = [];
  const endedMarkings = [];
  for (let index = 0; index < markings.length; index += 1) {
    const marking = markings[index];
    const check = resolveMarkingCheck(state, context, marking);
    if (check.kind === "settled") {
      nextMarkings.push(marking);
      continue;
    }
    if (check.kind === "ended") {
      endedMarkings.push({ id: marking.id, team: marking.team, markerId: marking.markerId, attackerId: marking.attackerId, reason: check.reason });
      continue;
    }
    nextMarkings.push(marking, ...markings.slice(index + 1));
    const nextState = check.kind === "ask-continue"
      ? { ...state, activeMarkings: nextMarkings, pendingMarkingContinue: { id: `marking_continue_${marking.id}`, team: marking.team, markingId: marking.id, markerId: marking.markerId, attackerId: marking.attackerId } }
      : {
          ...state,
          activeMarkings: nextMarkings.map(item => item.id === marking.id ? { ...item, respondedOnce: true } : item),
          pendingMarkingTrack: { id: `marking_track_${marking.id}`, team: marking.team, markingId: marking.id, markerId: marking.markerId, attackerId: marking.attackerId, cells: check.cells },
        };
    return { changed: true, endedMarkings, nextState };
  }
  if (!endedMarkings.length) return { changed: false };
  return { changed: true, endedMarkings, nextState: { ...state, activeMarkings: nextMarkings } };
}

// Commit-time containment validation (confirmed Build 2 rule): a clicked
// cell moves the marker immediately, like a normal move, UNLESS doing so
// would fail to leave the attacker inside the marker's resulting area, in
// which case the whole commit is rejected — the piece never moves, no Speed
// is spent, and the UI shows "You have to have X in your defensive area or
// cancel your marking." No auto-continuation loop: exactly one response is
// resolved per commit, matching the removal of multi-axis bending.
export function commitMarkingTrackMove(state, context, command) {
  const pending = state.pendingMarkingTrack;
  if (!pending) return { accepted: false, reason: "NO_PENDING_MARKING_TRACK" };
  const x = Number(command.payload?.x);
  const y = Number(command.payload?.y);
  const chosen = pending.cells.find(cell => Number(cell.x) === x && Number(cell.y) === y);
  if (!chosen) return { accepted: false, reason: "MARKING_TRACK_CELL_INVALID" };
  const marking = (state.activeMarkings || []).find(item => String(item.id) === String(pending.markingId));
  const marker = pieceById(state, pending.markerId);
  const attacker = pieceById(state, pending.attackerId);
  if (!marking || !marker || !attacker) return { accepted: false, reason: "MARKING_TRACK_CELL_INVALID" };
  const landingMarker = { ...marker, x, y };
  if (!attackerContained(landingMarker, attacker, context)) return { accepted: false, reason: "MARKING_TRACK_NOT_CONTAINED" };
  // `chosen.distance` is already the authoritative real movement-point cost
  // computed by markingTrackLegalCells — trusted directly rather than
  // recomputed here, since a one-time axis-switch cell (see
  // markingTrackLegalCells) is not reachable via a single straight/diagonal
  // line from the marker's own position, so getMovementGeometry could never
  // price it correctly.
  const cost = chosen.distance;
  const pieces = state.pieces.map(piece => String(piece.id) === String(pending.markerId) ? { ...piece, x, y } : piece);
  const wasConsumed = marking.opportunityConsumed;
  const updatedMarking = { ...marking, speedSpent: marking.speedSpent + cost, respondedOnce: true, opportunityConsumed: true };
  const activeMarkings = state.activeMarkings.map(item => item.id === marking.id ? updatedMarking : item);
  const withMove = { ...state, pieces, activeMarkings, pendingMarkingTrack: null, markingEndedNotices: [] };
  const nextState = wasConsumed ? withMove : consumeMarkingOpportunity(withMove, marking.team);
  return {
    accepted: true,
    nextState,
    event: { type: "MARKING_TRACK_MOVE_COMMITTED", team: pending.team, metadata: { markingId: pending.markingId, markerId: pending.markerId, to: { x, y } } },
    timeline: { allowNoop: true, undoMode: "step" },
  };
}
