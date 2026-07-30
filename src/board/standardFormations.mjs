// Standard starter templates. `starterRoleRecipe` describes formation slots,
// never a player's role; the assigned card remains the sole role authority.
// Keep all default starters outside the centre-circle corridor. Tactical
// variation inside that space belongs to local Adjust, not the initial shape.
const outsideCentreCircle = coordinate => {
  const match = String(coordinate).match(/^([A-Z]+)(\d+)$/);
  if (!match) return coordinate;
  const column = Number(match[2]);
  const safeColumn = column >= 18 && column <= 20 ? 17 : column >= 21 && column <= 25 ? 26 : column;
  return `${match[1]}${safeColumn}`;
};
const f = (id, name, players, starterRoleRecipe) => Object.freeze({ id, name, players: Object.freeze(players.map(outsideCentreCircle)), starterRoleRecipe: Object.freeze(starterRoleRecipe) });
const back4 = ["GK", "LB", "CB", "CB", "RB"];

export const STANDARD_FORMATIONS = Object.freeze([
  f(1, "4-4-2 (2 CM)", ["O1","G8","L7","R7","W8","D16","L13","R13","Z16","M16","Q16"], [...back4,"LM","CM","CM","RM","ST","ST"]),
  f(2, "4-4-2 (2 CDM)", ["O1","G8","L7","R7","W8","D16","L12","R12","Z16","M16","Q16"], [...back4,"LM","CDM","CDM","RM","ST","ST"]),
  f(3, "4-4-2 (2 CAM)", ["O1","G8","L7","R7","W8","D16","M15","Q15","Z16","M18","Q18"], [...back4,"LM","CAM","CAM","RM","ST","ST"]),
  f(4, "4-4-1-1", ["O1","G8","L7","R7","W8","D16","L13","R13","Z16","O17","O20"], [...back4,"LM","CM","CM","RM","CAM","ST"]),
  f(5, "4-2-3-1 Wide", ["O1","G8","L7","R7","W8","L12","R12","D17","O17","Z17","O21"], [...back4,"CDM","CDM","LM","CAM","RM","ST"]),
  f(6, "4-2-1-3 ATT", ["O1","G8","L7","R7","W8","L12","R12","O17","C21","AA21","O22"], [...back4,"CDM","CDM","CAM","LW","RW","ST"]),
  f(7, "4-3-3 Holding", ["O1","G8","L7","R7","W8","O12","L15","R15","C21","AA21","O22"], [...back4,"CDM","CM","CM","LW","RW","ST"]),
  f(8, "4-3-3 Attack", ["O1","G8","L7","R7","W8","L14","R14","O18","C21","AA21","O22"], [...back4,"CM","CM","CAM","LW","RW","ST"]),
  f(9, "4-3-3 Double Pivot", ["O1","G8","L7","R7","W8","L12","R12","O15","C21","AA21","O22"], [...back4,"CDM","CDM","CM","LW","RW","ST"]),
  f(10, "4-1-4-1", ["O1","G8","L7","R7","W8","O12","D16","L16","R16","Z16","O21"], [...back4,"CDM","LM","CM","CM","RM","ST"]),
  f(11, "4-5-1", ["O1","G8","L7","R7","W8","D16","L15","O18","R15","Z16","O21"], [...back4,"LM","CM","CAM","CM","RM","ST"]),
  f(12, "4-1-3-2", ["O1","G8","L7","R7","W8","O12","D16","O16","Z16","M20","Q20"], [...back4,"CDM","LM","CM","RM","ST","ST"]),
  f(13, "4-2-4", ["O1","G8","L7","R7","W8","L13","R13","C20","AA20","M21","Q21"], [...back4,"CDM","CM","LW","RW","ST","ST"]),
  f(14, "3-4-3 Wide", ["O1","K7","O7","S7","D15","L15","R15","Z15","C21","O22","AA21"], ["GK","CB","CB","CB","LM","CM","CM","RM","LW","ST","RW"]),
  f(15, "3-4-1-2", ["O1","K7","O7","S7","D15","L13","R15","Z15","O18","M21","Q21"], ["GK","CB","CB","CB","LM","CDM","CM","RM","CAM","ST","ST"]),
  f(16, "5-4-1", ["O1","G8","K7","O7","S7","W8","D16","L15","R15","Z16","O21"], ["GK","LB","CB","CB","CB","RB","LM","CM","CM","RM","ST"]),
  f(17, "4-2-2-2", ["O1","G8","L7","R7","W8","L13","R13","M17","Q17","M21","Q21"], [...back4,"CM","CM","CAM","CAM","ST","ST"]),
  f(18, "4-1-2-1-2 Narrow", ["O1","G8","L7","R7","W8","O12","L15","R15","O18","M21","Q21"], [...back4,"CDM","CM","CM","CAM","ST","ST"]),
  f(19, "4-3-2-1", ["O1","G8","L7","R7","W8","K14","O14","S14","M18","Q18","O22"], [...back4,"CM","CM","CM","CAM","CAM","ST"]),
  f(20, "3-5-2 Double Pivot", ["O1","K7","O7","S7","B13","Z13","L13","R13","O18","M21","Q21"], ["GK","CB","CB","CB","LWB","RWB","CDM","CDM","CAM","ST","ST"]),
  f(21, "3-5-2 Balanced", ["O1","K7","O7","S7","B13","Z13","L13","O15","O18","M21","Q21"], ["GK","CB","CB","CB","LWB","RWB","CDM","CM","CAM","ST","ST"]),
  f(22, "3-5-2 Midfield Control", ["O1","K7","O7","S7","B13","Z13","L15","R15","O18","M21","Q21"], ["GK","CB","CB","CB","LWB","RWB","CM","CM","CAM","ST","ST"]),
]);

export function formationById(id) {
  return STANDARD_FORMATIONS.find(formation => formation.id === Number(id)) || STANDARD_FORMATIONS[0];
}
