// Tackling (docs/TACKLING_RULES.md) — Build 1: the normal defensive action
// only. Reactive proximity-entry and Marking-delayed Tackling (sections 1.2,
// 1.3 of the original doc) are NOT implemented — see
// docs/IMPLEMENTATION_STATUS.md. The eligibility/foul/card design here
// supersedes the original doc text in several places (confirmed live with
// the user); the doc itself still needs a rewrite pass to match.
import { teamKeyForPiece, defensiveCellsForPiece, cardStat } from "../rules/passEngine.mjs";
import { getMovementGeometry } from "../board/movementState.mjs";
import { firstPlayerBlockingMovementPath } from "./movementPathRules.mjs";
import { isBenchReservePiece } from "../board/formationUtils.mjs";
import { activateTrackerAction, createEmptyTrackerTurnState } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";
import { ACTION_FLOW_STAGE, createPendingRoll, createRollEvent, consumeActionEvent, withPendingRoll } from "../match/actionResolutionEngine.mjs";
import { createSinglePlayerRollResultHold } from "../match/delayedResolution.mjs";
import { resolveDiceModifierStacks } from "../rules/ruleSets.mjs";
import { sumAndCapRollModifier } from "../rules/rollModifierMath.mjs";
import { consumeTeamModifierToken, grantTeamModifierToken, pruneTeamModifierTokens, effectiveCurrentTurnForRollOpportunity } from "./rollModifierOpportunities.mjs";
import { opponentTeamOf, markingTurnResetFields } from "./markingRules.mjs";
import { createBonusCardActionContinuation } from "../match/actionContinuation.mjs";
import { naturalRollOutcome } from "./rollOutcomeEffects.mjs";
import { buildRestartSetup, clearCellForPlacement, moveBallTo } from "./restartSetupRules.mjs";

// Maps Tackling's own Rule Set vocabulary ("bonusAction"/"av"/"avm"/"none")
// onto naturalRollOutcome's shared effect vocabulary, so the result screen
// can use the exact same "Natural 20 — ..." line every other mechanic uses
// (confirmed live with the user).
const NATURAL_20_EFFECT_BY_BONUS = { bonusAction: "bonus-action", av: "current-turn-roll-advantage", avm: "current-turn-roll-major-advantage", none: "none" };

export function tacklingTurnResetFields() {
  return { tacklingEligibility: [] };
}

// docs/GAMEPLAY_RULES_FOUNDATIONS.md section 3, trigger "the numbered turn
// ends": reactivates every player Tackling made inactive. Call this at every
// real turn-advance site, same as markingTurnResetFields() — needs the
// current pieces to know who to reactivate, so it is a function of state.
export function clearTacklingInactivityForNewTurn(state) {
  const entries = state.tacklingInactivePlayers || [];
  if (!entries.length) return state;
  const ids = new Set(entries.map(entry => entry.pieceId));
  const pieces = state.pieces.map(piece => ids.has(String(piece.id)) ? { ...piece, inactive: false } : piece);
  return { ...state, pieces, tacklingInactivePlayers: [] };
}

function pieceById(state, pieceId) {
  return (state.pieces || []).find(piece => String(piece?.id || "") === String(pieceId)) || null;
}

function ballCarrier(state) {
  const ball = (state.pieces || []).find(piece => piece?.team === "BALL");
  if (!ball) return null;
  return (state.pieces || []).find(piece => piece && piece.team !== "BALL"
    && Number(piece.x) === Number(ball.x) && Number(piece.y) === Number(ball.y)) || null;
}

// The card's own listed offsets never include the piece's own cell (see
// markingRules.mjs's defenderOwnAreaCells for why every defensive-area
// consumer that treats "standing on top of the piece" as inside the area
// must add that cell back in itself).
function defenderAreaCells(piece, context) {
  const cells = defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece?.cardId || "")], context.boardSettings) || [];
  const ownX = Number(piece?.x);
  const ownY = Number(piece?.y);
  if (cells.some(cell => Number(cell.x) === ownX && Number(cell.y) === ownY)) return cells;
  return [...cells, { id: `${piece?.id}-area-self`, x: ownX, y: ownY }];
}

function isInsideArea(cells, point) {
  return cells.some(cell => Number(cell.x) === Number(point.x) && Number(cell.y) === Number(point.y));
}

// docs/TACKLING_RULES.md section 1.1 (superseded, confirmed live with the
// user): the ONLY eligibility condition is that the ball carrier stands
// inside the defender's own defensive area at the moment the defense phase
// starts. The former separate "3 orthogonal / 2 diagonal" distance route no
// longer exists — every Tackling attempt now reaches its target only via
// the automatic movement in startTackling below. Frozen for the whole
// phase: moving during the phase can never grant a NEW eligibility, but an
// already-eligible defender that repositions is re-checked fresh at
// execution time (see startTackling) — the frozen flag only gates whether
// the button is offered at all.
export function computeTacklingEligibility(state, context, defendingTeam) {
  const carrier = ballCarrier(state);
  if (!carrier) return [];
  const attackingTeam = opponentTeamOf(defendingTeam);
  if (teamKeyForPiece(carrier) !== attackingTeam) return [];
  const defenders = (state.pieces || []).filter(piece => piece && piece.team !== "BALL" && !piece.inactive
    && !isBenchReservePiece(piece) && teamKeyForPiece(piece) === defendingTeam);
  return defenders
    .filter(defender => isInsideArea(defenderAreaCells(defender, context), carrier))
    .map(defender => ({ defenderId: String(defender.id) }));
}

function tacklingStat(context, piece) {
  return Math.max(0, Number(cardStat(context.gameplayCardsById[String(piece?.cardId || "")], "stat:tackling")) || 0);
}

// "Ball Control" has no stable stat:id anywhere in the codebase yet (same
// situation as "1vs1 Defending" in markingRules.mjs) — name-matching
// fallback until one is assigned.
function ballControlStat(context, piece) {
  return Math.max(0, Number(cardStat(context.gameplayCardsById[String(piece?.cardId || "")], "Ball Control")) || 0);
}

// The 8 cells directly adjacent to `point` (docs/GAMEPLAY_RULES_FOUNDATIONS.md
// section 1.1's proximity area), clipped to the board.
function proximityCells(point, boardSettings) {
  const cols = Number(boardSettings.cols);
  const rows = Number(boardSettings.rows);
  const cells = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (!dx && !dy) continue;
      const x = Number(point.x) + dx;
      const y = Number(point.y) + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

// Confirmed live with the user: the automatic pre-roll movement is part of
// every Tackling attempt (there is only one eligibility route now). Among
// the carrier's 8 proximity cells, find every one that is currently empty
// AND reachable from the defender's current position by a single straight
// or 45-degree-diagonal move (this engine's only legal movement shape — see
// getMovementGeometry) with no cost cap ("oricat e nevoie", confirmed).
// Returns { landing, blockerIds } — `landing` is the closest legal,
// unoccupied, unblocked candidate (or null if none qualify). `blockerIds`
// collects every distinct piece standing in the way of every OTHER
// geometrically-reachable candidate — whether that piece occupies the
// candidate cell itself (reported live: a body squatting on the only other
// candidate wasn't being named at all, since it was silently dropped before
// ever being checked) or blocks the path to it. Empty when no candidate
// exists on any legal axis at all, a different, "no path at all" case the
// caller reports with its own generic message.
function findTacklingApproach(state, context, defender, attacker) {
  const pieceAt = (x, y) => (state.pieces || []).find(piece => piece && piece.team !== "BALL"
    && String(piece.id) !== String(defender.id) && Number(piece.x) === x && Number(piece.y) === y) || null;
  const candidates = proximityCells(attacker, context.boardSettings)
    .map(cell => ({ cell, geometry: getMovementGeometry(defender, cell) }))
    .filter(({ geometry }) => geometry.kind !== "mixed")
    .sort((a, b) => a.geometry.cost - b.geometry.cost);
  if (!candidates.length) return { landing: null, blockerIds: [], reachable: false };
  const blockerIds = [];
  const addBlocker = piece => { if (piece && !blockerIds.includes(String(piece.id))) blockerIds.push(String(piece.id)); };
  for (const candidate of candidates) {
    const occupant = pieceAt(candidate.cell.x, candidate.cell.y);
    if (occupant) { addBlocker(occupant); continue; }
    if (candidate.geometry.kind === "same") return { landing: candidate.cell, blockerIds: [], reachable: true };
    // docs/GAMEPLAY_RULES_FOUNDATIONS.md section 3: an inactive piece "has no
    // body that blocks a route or movement path" — only its own cell stays
    // unavailable as a destination (the occupancy check above already covers
    // that, inactive or not).
    const blocking = firstPlayerBlockingMovementPath({ pieces: state.pieces, movingPieceId: defender.id, from: defender, to: candidate.cell });
    if (!blocking) return { landing: candidate.cell, blockerIds: [], reachable: true };
    addBlocker(blocking.piece);
  }
  return { landing: null, blockerIds, reachable: true };
}

// docs/TACKLING_RULES.md section 1.1: starts the normal-action form. The
// defending coach picks a defender that was eligible at the frozen
// defense-phase-start snapshot; the target is always whichever player
// currently holds the ball. Uses the same shared state.actionResolution
// single-flight slot as Shot/Pass (gameEngine.mjs already blocks every
// other command while it is set) — the normal action is a full Tracker
// action exactly like those, once it actually reaches the roll.
//
// Before that, this command may instead open a small canonical notice
// (status "out-of-range" or "blocked") if the carrier is no longer in the
// defender's defensive area, or if every legal approach to its proximity is
// occupied — confirmed live: neither case consumes any Tracker/personal
// action; a dedicated acknowledgement command (acknowledgeTacklingBlocked)
// closes the notice as its own Timeline step, mirroring every other
// multi-step canonical flow in this engine (Marking accept/decline, Shot
// roll -> resolve -> consequence).
export function startTackling(state, context, command) {
  if (state.gameMode !== "match") return { accepted: false, reason: "MATCH_MODE_REQUIRED" };
  if (state.actionResolution) return { accepted: false, reason: "ACTION_RESOLUTION_ACTIVE" };
  const defender = pieceById(state, command.payload?.pieceId);
  if (!defender || defender.inactive || isBenchReservePiece(defender)) return { accepted: false, reason: "TACKLING_DEFENDER_INVALID" };
  const team = teamKeyForPiece(defender);
  if (!team) return { accepted: false, reason: "TACKLING_DEFENDER_INVALID" };
  const snapshot = (state.tacklingEligibility || []).some(entry => entry.defenderId === String(defender.id));
  if (!snapshot) return { accepted: false, reason: "TACKLING_NOT_ELIGIBLE" };
  const carrier = ballCarrier(state);
  if (!carrier || teamKeyForPiece(carrier) !== opponentTeamOf(team)) return { accepted: false, reason: "TACKLING_NO_BALL_CARRIER" };

  if (!isInsideArea(defenderAreaCells(defender, context), carrier)) {
    return {
      accepted: true,
      nextState: { ...state, actionResolution: { kind: "tackling", status: "out-of-range", team, defenderId: String(defender.id), attackerId: String(carrier.id) } },
      event: { type: "TACKLING_OUT_OF_RANGE", team, metadata: { defenderId: defender.id, attackerId: carrier.id } },
      timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
    };
  }
  const approach = findTacklingApproach(state, context, defender, carrier);
  if (!approach.landing) {
    return {
      accepted: true,
      nextState: { ...state, actionResolution: { kind: "tackling", status: "blocked", team, defenderId: String(defender.id), attackerId: String(carrier.id), blockerIds: approach.blockerIds } },
      event: { type: "TACKLING_BLOCKED", team, metadata: { defenderId: defender.id, attackerId: carrier.id, blockerIds: approach.blockerIds } },
      timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
    };
  }

  const tracker = normalizeTrackerSnapshot(state.tracker);
  const activation = activateTrackerAction(tracker, { type: "TACKLING", pieceId: defender.id, team, entryId: command.id, enforcePersonalActions: true });
  if (!activation.allowed) return { accepted: false, reason: activation.reason || "TACKLING_NOT_ALLOWED" };
  const pieces = state.pieces.map(piece => String(piece.id) === String(defender.id) ? { ...piece, x: approach.landing.x, y: approach.landing.y } : piece);
  const pendingRoll = createPendingRoll({ requestId: `tackling_roll_${command.id}`, actionId: `tackling_${command.id}`, team, subjectId: defender.id, context: { actionType: "TACKLING" } });
  const pending = withPendingRoll({
    id: `tackling_${command.id}`,
    kind: "tackling",
    team,
    defenderId: String(defender.id),
    attackerId: String(carrier.id),
    consumedEventIds: [],
  }, pendingRoll);
  return {
    accepted: true,
    nextState: {
      ...state,
      pieces,
      actionResolution: pending,
      tracker: {
        ...state.tracker,
        actionLog: activation.actionLog,
        usedActions: activation.usedActions,
        personalActionsByPieceId: activation.personalActionsByPieceId,
        matchActionState: activation.matchActionState,
      },
    },
    event: { type: "TACKLING_STARTED", team, metadata: { defenderId: defender.id, attackerId: carrier.id, landing: approach.landing } },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: false },
  };
}

// Closes the "out-of-range" or "blocked" notice with no other effect — no
// Tracker/personal/team action was ever consumed for either, so there is
// nothing to revert.
export function acknowledgeTacklingBlocked(state, context, command) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "tackling" || !["out-of-range", "blocked"].includes(pending.status)) {
    return { accepted: false, reason: "NO_PENDING_TACKLING_NOTICE" };
  }
  return {
    accepted: true,
    nextState: { ...state, actionResolution: null },
    event: { type: "TACKLING_NOTICE_ACKNOWLEDGED", team: pending.team, metadata: { defenderId: pending.defenderId, status: pending.status } },
    timeline: { groupId: command.id, undoMode: "step", allowNoop: true },
  };
}

function tacklingActionsConfig(ruleSet) {
  const config = ruleSet?.actions?.tackling || {};
  const clampInterval = (value, min, max, fallback) => {
    const num = Math.floor(Number(value));
    return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
  };
  return {
    freeKickInterval: clampInterval(config.freeKickInterval, 1, 7, 1),
    yellowCardInterval: clampInterval(config.yellowCardInterval, 1, 7, 1),
    redCardInterval: clampInterval(config.redCardInterval, 1, 7, 1),
    equalityInterval: clampInterval(config.equalityInterval, 1, 5, 1),
    equalityResult: config.equalityResult === "succeeds" ? "succeeds" : "outOfPlay",
    natural20Result: ["bonusAction", "none", "av", "avm"].includes(config.natural20Result) ? config.natural20Result : "av",
  };
}

// docs/GAMEPLAY_RULES_FOUNDATIONS.md section 3 + TACKLING_RULES.md section 5,
// plus the fourth trigger confirmed with the user: any stoppage of play
// (a foul, or the ball going out at equality) ends Tackling inactivity
// immediately — implemented by simply never creating the inactivity entry
// on a stoppage-producing outcome, rather than creating then clearing one.
function inactivityEntry(state, context, piece, reason) {
  const ball = (state.pieces || []).find(item => item?.team === "BALL");
  const areaCells = defenderAreaCells(piece, context);
  return {
    pieceId: String(piece.id),
    reason,
    turn: Number(state.tracker?.currentTurn) || 0,
    possessionTeam: state.tracker?.startingTeam || null,
    ballInsideAreaAtStart: ball ? isInsideArea(areaCells, ball) : false,
  };
}

function inactivityExpired(state, context, entry) {
  const piece = pieceById(state, entry.pieceId);
  if (!piece) return true;
  if (Number(state.tracker?.currentTurn) !== Number(entry.turn)) return true;
  if (String(state.tracker?.startingTeam || "") !== String(entry.possessionTeam || "")) return true;
  if (entry.ballInsideAreaAtStart) {
    const ball = (state.pieces || []).find(item => item?.team === "BALL");
    if (ball && !isInsideArea(defenderAreaCells(piece, context), ball)) return true;
  }
  return false;
}

export function pruneExpiredTacklingInactivity(state, context) {
  const entries = state.tacklingInactivePlayers || [];
  if (!entries.length) return state;
  const stillInactive = entries.filter(entry => !inactivityExpired(state, context, entry));
  if (stillInactive.length === entries.length) return state;
  const expiredIds = new Set(entries.filter(entry => !stillInactive.includes(entry)).map(entry => entry.pieceId));
  const pieces = state.pieces.map(piece => expiredIds.has(String(piece.id)) ? { ...piece, inactive: false } : piece);
  return { ...state, pieces, tacklingInactivePlayers: stillInactive };
}

function markPieceInactive(state, context, pieceId, reason) {
  const piece = pieceById(state, pieceId);
  if (!piece) return state;
  const pieces = state.pieces.map(item => String(item.id) === String(pieceId) ? { ...item, inactive: true } : item);
  const entry = inactivityEntry(state, context, piece, reason);
  const tacklingInactivePlayers = [...(state.tacklingInactivePlayers || []).filter(item => item.pieceId !== String(pieceId)), entry];
  return { ...state, pieces, tacklingInactivePlayers };
}

// docs/TACKLING_RULES.md section 4 (superseded): since the pre-roll
// automatic movement (findTacklingApproach above) already lands the
// defender adjacent to the carrier before the roll ever happens, a
// successful Tackling needs no further movement at all — the defender is
// already standing in the correct cell.
//
// docs/TACKLING_RULES.md section 6: a Natural 20 additionally grants the
// recovering team the frozen Rule Set result — actually granting it was
// missing until reported live (it was computed into the result for display
// only, never applied). Mirrors resolveLoftedThroughBall's own granting
// pattern: an AV/AVM team modifier token usable this (the new) turn, or a
// Bonus Card Action continuation that resumes straight into the new turn
// already set up below.
function applyTacklingSuccess(state, context, pending, outcome) {
  const defender = pieceById(state, pending.defenderId);
  const attacker = pieceById(state, pending.attackerId);
  const pieces = state.pieces.map(piece => piece.team === "BALL" ? { ...piece, x: defender.x, y: defender.y } : piece);
  const tracker = normalizeTrackerSnapshot(state.tracker);
  const nextTurn = Math.min(tracker.settings.turns, Math.max(1, tracker.currentTurn + 1));
  const emptyTurn = createEmptyTrackerTurnState();
  const bonus = outcome?.natural20Bonus || null;
  const tokenTurn = effectiveCurrentTurnForRollOpportunity(state, nextTurn);
  const grant = (bonus === "av" || bonus === "avm")
    ? grantTeamModifierToken(state.teamModifierTokens, {
        id: `roll_bonus_tackling_${pending.id}`, team: pending.team,
        modifierType: bonus === "avm" ? "majorAdvantage" : "advantage",
        availableFromTurn: tokenTurn, expiresAfterTurn: tokenTurn,
        source: "natural-20-tackling", sourceActionId: pending.id,
      }, { capacity: context.teamModifierCapacity })
    : null;
  const teamModifierTokens = pruneTeamModifierTokens(grant ? grant.tokens : state.teamModifierTokens, nextTurn);
  const actionContinuation = bonus === "bonusAction"
    ? createBonusCardActionContinuation({
        id: `continuation_tackling_${pending.id}`, team: pending.team, nextTurn,
        resumePolicy: { type: "resume-phase", team: pending.team, nextTurn, phase: "attack" },
        source: "natural-20-tackling", sourceEntryId: pending.id,
        origin: { actionType: "TACKLING", outcome: "SUCCESS", reason: "NATURAL_20", sourceEntryId: pending.id },
      })
    : null;
  const stateAfterTurnAdvance = {
    ...state,
    pieces,
    movementStateByPieceId: {},
    actionResolution: null,
    actionContinuation,
    teamModifierTokens,
    ...markingTurnResetFields(),
    ...tacklingTurnResetFields(),
    tracker: {
      ...tracker,
      startingTeam: pending.team,
      currentTurn: nextTurn,
      usedActions: emptyTurn.usedActions,
      actionLog: emptyTurn.actionLog,
      personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
      matchActionState: emptyTurn.matchActionState,
      turnPhase: "attack",
    },
  };
  return markPieceInactive(stateAfterTurnAdvance, context, attacker.id, "tackling-dispossessed");
}

function penaltyAreaContains(settings, point) {
  const top = Math.floor((Number(settings.rows) - Number(settings.boxWidth)) / 2);
  return Number(point.y) >= top && Number(point.y) < top + Number(settings.boxWidth)
    && (Number(point.x) < Number(settings.boxDepth) || Number(point.x) >= Number(settings.cols) - Number(settings.boxDepth));
}

// docs/TACKLING_RULES.md section 6 (superseded — see resolveTacklingOutcome):
// Free Kick / Yellow / Red are independent thresholds. At their default
// value (1) each checks the natural roll directly (natural === 1) — the
// baseline, bonus-blind "critical fumble" reading. At 2 or higher each
// checks the total instead (after the bonus), confirmed live: a strong
// enough Tackling stat can then let a defender avoid a card even on a bad
// natural roll. Red wins a Yellow/Red overlap.
function faultResult(natural, total, config) {
  const met = interval => interval <= 1 ? natural === 1 : total <= interval;
  const foul = met(config.freeKickInterval);
  const red = met(config.redCardInterval);
  const yellow = met(config.yellowCardInterval);
  return { foul, cardType: red ? "red" : yellow ? "yellow" : null };
}

function applyTacklingFailure(state, context, pending, outcome) {
  const defender = pieceById(state, pending.defenderId);
  const attacker = pieceById(state, pending.attackerId);
  // Confirmed with the user: a stoppage of play (a foul, or equality's ball
  // going out) ends Tackling inactivity immediately, so the defender is
  // never frozen through the dead-ball sequence that follows. Only the
  // ordinary, play-continues failure actually creates inactivity.
  const base = outcome.stoppage ? state : markPieceInactive(state, context, defender.id, "tackling-failed");
  if (outcome.foul) {
    // applyTacklingConsequence's own gate already rejected a penalty-area
    // foul before this ever runs, so a foul reaching here is always outside
    // the box — a Direct Free Kick, exactly like Corner/Goal Kick's own
    // consequence functions, goes straight into the shared restart-setup
    // engine (docs/FINALISATION_AND_RESTARTS_RULES.md section 7) rather than
    // recording a frozen, not-yet-executable fact.
    const spot = { x: Number(attacker.x), y: Number(attacker.y) };
    const attackingTeam = opponentTeamOf(pending.team);
    const cardEntry = {
      id: `card_${pending.id}`,
      pieceId: String(defender.id),
      team: pending.team,
      type: outcome.cardType,
      turn: Number(state.tracker?.currentTurn) || 0,
      reason: "tackling-foul",
    };
    // Same pattern as Corner/Goal Kick's own consequence functions
    // (shotRules.mjs): clear whoever stands on the spot, then move the ball
    // there — the foul usually happens right on the ball, but not always
    // (e.g. a mistimed tackle a cell away), so this must never be skipped.
    const clearedPieces = clearCellForPlacement(base.pieces, spot, context.boardSettings, null);
    const pieces = moveBallTo({ ...base, pieces: clearedPieces }, spot.x, spot.y) || clearedPieces;
    // A foul never changes possession — the fouled (attacking) team already
    // had the ball and keeps it — so this stays the SAME numbered turn,
    // exactly like Corner: only the Tracker action economy and individual
    // movement state reset, with turnPhase forced back to "attack" so the
    // entitled team (always this turn's own startingTeam, since Tackling
    // only ever happens during the defending team's own sub-phase) is
    // recognized as active again. Confirmed live with the user as the
    // general rule: no change of possession → no turn change, tracker-only
    // reset; a change of possession (Indirect Free Kick, Goal Kick) gets a
    // real turn advance instead — see confirmOffsideRestart's own comment.
    const emptyTurn = createEmptyTrackerTurnState();
    return {
      ...base,
      pieces,
      actionResolution: null,
      actionContinuation: null,
      movementStateByPieceId: {},
      restartSetup: buildRestartSetup(context.ruleSet, "freeKickDirect", attackingTeam, spot, pieces, context.boardSettings),
      disciplinaryCards: outcome.cardType ? [...(state.disciplinaryCards || []), cardEntry] : state.disciplinaryCards || [],
      tracker: {
        ...base.tracker,
        usedActions: emptyTurn.usedActions,
        actionLog: emptyTurn.actionLog,
        personalActionsByPieceId: emptyTurn.personalActionsByPieceId,
        matchActionState: emptyTurn.matchActionState,
        turnPhase: "attack",
      },
    };
  }
  if (outcome.outOfPlay) {
    const attackingTeam = opponentTeamOf(pending.team);
    const restart = { type: "outOfPlay", team: attackingTeam, spot: { x: Number(attacker.x), y: Number(attacker.y) }, executable: false };
    return { ...base, actionResolution: null, pendingRestartResult: restart };
  }
  return { ...base, actionResolution: null };
}

// docs/TACKLING_RULES.md sections 3 and 6, both superseded per the live
// design session: Natural 20 always succeeds; Natural 1 always fails and is
// NEVER reclassified as equality regardless of total (equality is strictly
// a total-vs-Ball-Control band, evaluated only for an ordinary roll).
// Equality wins any overlap with the fault bands (confirmed: written this
// way even though sensible interval configs should rarely make it matter).
function resolveTacklingOutcome({ natural, total, ballControl, ruleSet }) {
  const config = tacklingActionsConfig(ruleSet);
  if (natural === 20) return { success: true, natural20Bonus: config.natural20Result };
  if (natural === 1) {
    const { foul, cardType } = faultResult(natural, total, config);
    return { success: false, foul, cardType, stoppage: foul };
  }
  const equalityFloor = ballControl - config.equalityInterval;
  if (total > equalityFloor && total <= ballControl) {
    if (config.equalityResult === "succeeds") return { success: true, equality: true };
    return { success: false, outOfPlay: true, stoppage: true };
  }
  if (total > ballControl) return { success: true };
  const { foul, cardType } = faultResult(natural, total, config);
  return { success: false, foul, cardType, stoppage: foul };
}

// docs/TACKLING_RULES.md section 2: the UI submits the D20 value as a
// RollEvent matching the pendingRoll startTackling opened. Roll only —
// mirrors submitShotRoll: consumes the RollEvent, writes canonical
// state.dice, opens the shared 1000ms result hold. Calculates no outcome.
export function submitTacklingRoll(state, context, command) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "tackling" || pending.status !== ACTION_FLOW_STAGE.AWAIT_ROLL || !pending.pendingRoll) {
    return { accepted: false, reason: "NO_PENDING_TACKLING_ROLL" };
  }
  const rollEvent = createRollEvent(command.payload?.rollEvent);
  const createdAt = Number(command.payload?.createdAt);
  if (!rollEvent || !Number.isFinite(createdAt) || createdAt < 0) return { accepted: false, reason: "TACKLING_ROLL_INVALID" };
  const consumed = consumeActionEvent(pending, rollEvent);
  if (!consumed) return { accepted: false, reason: "TACKLING_ROLL_EVENT_MISMATCH" };

  const ruleSet = context.ruleSet;
  const bonusModifierType = command.payload?.bonusModifierType || null;
  const token = bonusModifierType
    ? consumeTeamModifierToken(state.teamModifierTokens, { team: pending.team, turn: state.tracker.currentTurn, modifierType: bonusModifierType })
    : { accepted: false, tokens: state.teamModifierTokens };
  const resolutionTransaction = { id: `resolution_${pending.id}_${command.id}`, source: "roll-resolution", undoMode: "atomic" };
  const dice = {
    ...state.dice,
    dieType: rollEvent.dieType,
    blueResult: pending.team === "blue" ? rollEvent.natural : state.dice?.blueResult,
    redResult: pending.team === "red" ? rollEvent.natural : state.dice?.redResult,
    blueLastDieType: pending.team === "blue" ? rollEvent.dieType : state.dice?.blueLastDieType,
    redLastDieType: pending.team === "red" ? rollEvent.dieType : state.dice?.redLastDieType,
  };
  const delayedResolution = createSinglePlayerRollResultHold({
    kind: "tackling",
    actionId: pending.id,
    team: pending.team,
    value: rollEvent.natural,
    createdAt,
    payload: { rollEvent, undoTransaction: resolutionTransaction },
  });
  return {
    accepted: true,
    nextState: {
      ...state,
      dice,
      teamModifierTokens: token.accepted ? token.tokens : state.teamModifierTokens,
      actionResolution: {
        ...consumed,
        status: "awaiting-tackling-resolution",
        lastRollEvent: rollEvent,
        bonusModifierType: token.consumed?.modifierType || null,
        resolutionTransaction,
      },
    },
    event: {
      type: "TACKLING_ROLLED",
      team: pending.team,
      metadata: { tacklingId: pending.id, rollEvent, rollSource: rollEvent.source, delayedResolution, undoTransaction: resolutionTransaction },
    },
    timeline: { groupId: pending.id, undoMode: "step", allowNoop: true },
  };
}

// TACKLING_RESOLUTION_DUE: the deterministic Tackling calculation, run only
// after the roll and its hold are already persisted. Computes the result
// for display and does NOT touch the board — mirrors resolveShotResult.
export function resolveTacklingResult(state, context, command) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "tackling" || pending.status !== "awaiting-tackling-resolution") return { accepted: false, reason: "TACKLING_NOT_RESOLVING" };
  const rollEventId = String(command.payload?.rollEventId || "").trim();
  if (!rollEventId || rollEventId !== String(pending.lastRollEvent?.id || "")
    || !Array.isArray(pending.consumedEventIds) || !pending.consumedEventIds.includes(rollEventId)) return { accepted: false, reason: "TACKLING_RESOLUTION_STALE" };

  const defender = pieceById(state, pending.defenderId);
  const attacker = pieceById(state, pending.attackerId);
  const ruleSet = context.ruleSet;
  const modifierCap = Math.max(0, Number(ruleSet.diceModifiers?.stackCap) || 0);
  const baseStat = tacklingStat(context, defender);
  const tokenSource = pending.bonusModifierType
    ? { label: pending.bonusModifierType, value: resolveDiceModifierStacks(ruleSet.diceModifiers, pending.bonusModifierType), source: "team-modifier-token" }
    : null;
  const modifierSources = [{ label: "Tackling", value: baseStat, source: "card" }, ...(tokenSource ? [tokenSource] : [])];
  // Only AV/AVM/DV/DVM ever get capped — never the defender's own Tackling
  // stat (confirmed live: the stack cap is a limit on situational
  // modifiers, not on a player's own base ability).
  const tokenCap = tokenSource ? sumAndCapRollModifier([tokenSource], modifierCap) : { modifier: 0, rawModifier: 0, capped: false };
  const modifier = baseStat + tokenCap.modifier;
  const rawModifier = baseStat + tokenCap.rawModifier;
  const capped = tokenCap.capped;
  const natural = Number(pending.lastRollEvent.natural);
  const total = natural + modifier;
  const ballControl = ballControlStat(context, attacker);
  const outcome = resolveTacklingOutcome({ natural, total, ballControl, ruleSet });
  // Confirmed live with the user: the result screen must name the natural
  // roll that earned any Natural 20 bonus, using the exact same shared line
  // Lofted Through Ball and Pass/Interception already use.
  const naturalOutcome = outcome.natural20Bonus
    ? naturalRollOutcome({ mechanic: "tackling", natural, effect: NATURAL_20_EFFECT_BY_BONUS[outcome.natural20Bonus] || "none", team: pending.team })
    : null;
  // Docs/FINALISATION_AND_RESTARTS_RULES.md section 7/8.1: a foul inside the
  // box is a Penalty, otherwise a (Direct) Free Kick — computed once here so
  // both the result screen and applyTacklingConsequence's freeze gate read
  // the same fact, rather than re-deriving it in two places.
  const restartType = outcome.foul ? (penaltyAreaContains(context.boardSettings, attacker) ? "penalty" : "freeKick") : null;
  const result = { natural, total, modifier, rawModifier, modifierCap, capped, modifierSources, ballControl, ...outcome, naturalOutcome, restartType };
  return {
    accepted: true,
    nextState: { ...state, actionResolution: { ...pending, status: "result-display", result } },
    event: { type: "TACKLING_RESOLVED", team: pending.team, metadata: { tacklingId: pending.id, ...result, consequenceApplied: false, undoTransaction: pending.resolutionTransaction || null } },
    timeline: { groupId: pending.trackerEntryId || pending.id, undoMode: "step", allowNoop: true },
  };
}

// TACKLING_CONSEQUENCE_DUE: applies the already-computed result to the
// board — only reachable via the result screen's Continue button, which is
// omitted whenever the result needs a restart type this build still cannot
// execute (a penalty-area foul, or equality's ball-out — Penalty and
// Throw-in aren't wired yet) — confirmed live: those outcomes freeze the
// screen instead. A foul outside the box now proceeds into a Direct Free
// Kick's own restart setup, exactly like Corner/Goal Kick already do.
export function applyTacklingConsequence(state, context, command) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "tackling" || pending.status !== "result-display") return { accepted: false, reason: "NO_PENDING_TACKLING_RESULT" };
  const rollEventId = String(command.payload?.rollEventId || "").trim();
  if (!rollEventId || rollEventId !== String(pending.lastRollEvent?.id || "")) return { accepted: false, reason: "TACKLING_CONSEQUENCE_STALE" };
  const outcome = pending.result || {};
  if (outcome.outOfPlay || (outcome.foul && outcome.restartType === "penalty")) return { accepted: false, reason: "TACKLING_RESULT_FROZEN" };
  const nextState = outcome.success ? applyTacklingSuccess(state, context, pending, outcome) : applyTacklingFailure(state, context, pending, outcome);
  return {
    accepted: true,
    nextState,
    event: { type: "TACKLING_CONSEQUENCE_APPLIED", team: pending.team, metadata: { tacklingId: pending.id, success: Boolean(outcome.success) } },
    timeline: { groupId: pending.resolutionTransaction?.id || pending.id, undoMode: pending.resolutionTransaction ? "atomic" : "step", allowNoop: false },
  };
}
