import { PASS_CORNERS, bodyBlockingPassOrigin, defensiveCellsForPiece, pointForPassOrigin, pointForPassTarget, segmentIntersectsOpenRect, teamKeyForPiece } from "../rules/passEngine.mjs";
import { activateTrackerAction, isTeamActiveForTrackerPhase } from "../tracker/actionRules.mjs";
import { normalizeTrackerSnapshot } from "../tracker/trackerState.mjs";

const otherTeam = team => team === "blue" ? "red" : "blue";
const hasBall = (state, piece) => state.pieces.some(item => item?.team === "BALL" && Number(item.x) === Number(piece.x) && Number(item.y) === Number(piece.y));
const distance = (a, b) => Math.hypot((Number(a.x) + .5) - (Number(b.x) + .5), (Number(a.y) + .5) - (Number(b.y) + .5));
const speed = (context, piece) => {
  const card = context.gameplayCardsById[String(piece.cardId || "")];
  const stat = [...(card?.passiveAttributes || []), ...(card?.bonuses || [])].find(value => value?.id === "stat:speed" || String(value?.name || "").toLowerCase() === "speed");
  return Number(stat?.value || 0);
};
function areaContains(piece, context, target) {
  return defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece.cardId || "")], context.boardSettings)
    .some(cell => cell.x === Number(target.x) && cell.y === Number(target.y));
}
export function planThroughBall(state, context, passer, target, cornerId) {
  const team = teamKeyForPiece(passer); const enemy = otherTeam(team);
  const origin = pointForPassOrigin(passer, context.ruleSet.actions.pass.pathMode, cornerId);
  const endpoint = pointForPassTarget(target); const maxDistance = context.ruleSet.actions.throughBall.maxDistance;
  const originBlocked = Boolean(bodyBlockingPassOrigin(origin, passer, state.pieces));
  const occupied = state.pieces.some(piece => piece?.team !== "BALL" && Number(piece.x) === Number(target.x) && Number(piece.y) === Number(target.y));
  const enemyPieces = state.pieces.filter(piece => teamKeyForPiece(piece) === enemy && !piece.inactive);
  const areaBlocked = enemyPieces.some(piece => areaContains(piece, context, passer) || areaContains(piece, context, target) || defensiveCellsForPiece(piece, context.gameplayCardsById[String(piece.cardId || "")], context.boardSettings).some(cell => segmentIntersectsOpenRect(origin, endpoint, cell)));
  const bodyBlocked = state.pieces.some(piece => piece?.id !== passer.id && piece?.team !== "BALL" && !piece.inactive && segmentIntersectsOpenRect(origin, endpoint, piece));
  return { origin, endpoint, maxDistance, distance: distance(passer, target), originBlocked, occupied, areaBlocked, bodyBlocked, legal: !originBlocked && !occupied && !areaBlocked && !bodyBlocked && distance(passer, target) <= maxDistance };
}
export function selectThroughBallTarget(state, context, command) {
  const pending = state.actionResolution;
  const target = { x: Number(command.payload?.x), y: Number(command.payload?.y) };
  const passer = state.pieces.find(item => String(item?.id) === String(pending?.passerId)) || null;
  if (!pending || pending.kind !== "through-ball" || pending.status !== "targeting" || !passer || !Number.isInteger(target.x) || !Number.isInteger(target.y)) return { accepted: false, reason: "THROUGH_BALL_NOT_TARGETING" };
  const cols = Number(context.boardSettings?.cols), rows = Number(context.boardSettings?.rows);
  if (target.x < 0 || target.y < 0 || (cols > 0 && target.x >= cols) || (rows > 0 && target.y >= rows)) return { accepted: false, reason: "THROUGH_BALL_INVALID" };
  const routes = PASS_CORNERS.map(corner => ({ cornerId: corner.id, ...planThroughBall(state, context, passer, target, corner.id) }));
  return { accepted: true, nextState: { ...state, actionResolution: { ...pending, status: "route-selection", target, routes } }, event: { type: "THROUGH_BALL_TARGET_SELECTED", team: pending.team, metadata: { target } }, timeline: { allowNoop: true } };
}
export function startThroughBall(state, command) {
  const piece = state.pieces.find(item => String(item?.id) === String(command.payload?.pieceId)) || null;
  const team = teamKeyForPiece(piece); const tracker = normalizeTrackerSnapshot(state.tracker);
  if (!piece || !team || !hasBall(state, piece) || !isTeamActiveForTrackerPhase(tracker, team)) return { accepted:false, reason:"THROUGH_BALL_NOT_AVAILABLE" };
  return { accepted:true, nextState:{...state, actionResolution:{ id:String(command.payload?.throughBallId || command.id), kind:"through-ball", status:"targeting", passerId:piece.id, team }}, event:{type:"THROUGH_BALL_TARGETING_STARTED",team}, timeline:{allowNoop:true} };
}
export function cancelThroughBall(state) {
  const pending = state.actionResolution;
  if (!pending || pending.kind !== "through-ball" || !["targeting", "route-selection"].includes(pending.status)) return { accepted: false, reason: "THROUGH_BALL_NOT_TARGETING" };
  return { accepted: true, nextState: { ...state, actionResolution: null }, event: { type: "THROUGH_BALL_CANCELLED", team: pending.team }, timeline: { allowNoop: true } };
}
export function commitThroughBall(state, context, command) {
  const pending=state.actionResolution; if (!pending || pending.kind!=="through-ball" || pending.status!=="route-selection") return {accepted:false,reason:"THROUGH_BALL_NOT_ROUTE_SELECTION"};
  const target={x:Number(pending.target?.x),y:Number(pending.target?.y)}; const passer=state.pieces.find(item=>item.id===pending.passerId); const cornerId=String(command.payload?.cornerId||"top-left");
  const cols=Number(context.boardSettings?.cols), rows=Number(context.boardSettings?.rows);
  if (!passer || !Number.isInteger(target.x)||!Number.isInteger(target.y)||!PASS_CORNERS.some(c=>c.id===cornerId) || target.x < 0 || target.y < 0 || (cols > 0 && target.x >= cols) || (rows > 0 && target.y >= rows)) return {accepted:false,reason:"THROUGH_BALL_INVALID"};
  const route=planThroughBall(state,context,passer,target,cornerId); if(!route.legal) return {accepted:false,reason:"THROUGH_BALL_ROUTE_BLOCKED"};
  const activation=activateTrackerAction(state.tracker,{type:"THROUGH_BALL",pieceId:passer.id,team:pending.team,entryId:command.id,enforcePersonalActions:true}); if(!activation.allowed)return{accepted:false,reason:activation.reason};
  const attackers=state.pieces.filter(p=>teamKeyForPiece(p)===pending.team&&!p.inactive&&p.id!==passer.id); const defenders=state.pieces.filter(p=>teamKeyForPiece(p)===otherTeam(pending.team)&&!p.inactive);
  const best=list=>list.map(p=>({p,d:distance(p,target),s:speed(context,p)})).sort((a,b)=>a.d-b.d||b.s-a.s||String(a.p.id).localeCompare(String(b.p.id)))[0]||null; const attack=best(attackers), defend=best(defenders);
  const tiedDistance = attack && defend && Math.abs(defend.d - attack.d) < 1e-9;
  const defenseWins=defend && (!attack || defend.d < attack.d - 1e-9 || (tiedDistance && defend.s >= attack.s));
  const pieces=state.pieces.map(p=>p.team==="BALL"?{...p,x:defenseWins?defend.p.x:target.x,y:defenseWins?defend.p.y:target.y}:p);
  const tracker = { ...state.tracker, actionLog: activation.actionLog, usedActions: activation.usedActions, personalActionsByPieceId: activation.personalActionsByPieceId, matchActionState: activation.matchActionState };
  return {accepted:true,nextState:{...state,pieces,actionResolution:null,throughBallOpportunity:defenseWins?null:{team:pending.team,passerId:passer.id,target,turn:normalizeTrackerSnapshot(state.tracker).currentTurn},tracker},event:{type:defenseWins?"THROUGH_BALL_AUTO_RECOVERED":"THROUGH_BALL_COMPLETED",team:defenseWins?otherTeam(pending.team):pending.team,metadata:{passerId:passer.id,target,cornerId,automaticRecovery:defenseWins?defend.p.id:null,attackDistance:attack?.d ?? null,defenseDistance:defend?.d ?? null}},timeline:{allowNoop:false}};
}
