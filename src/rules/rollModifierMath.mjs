// Shared roll-modifier arithmetic for every manual D20 mechanic. Sums every
// source it is given, then caps the combined total symmetrically exactly
// once.
//
// Corrected live (confirmed with the user): only AV/AVM/DV/DVM-style
// situational modifiers are ever meant to be capped — never the rolling
// subject's own base card stat. A caller must sum and cap ITS situational
// sources through this function, then add its own base stat back in
// uncapped afterward; it must never include the base stat in the array
// passed here. (An earlier version of this file instructed the opposite —
// every one of its callers had the bug this describes until it was found
// and fixed across Tackling, Shot, Lofted Through Ball and Interception.)
//
// Confirmed live with the user: a cap of 0 (or unset) means NO maximum —
// situational sources add up uncapped — not "clamp everything to zero" (the
// old meaning). Nobody actually wants the latter; a real cap is any value
// > 0, still applied symmetrically as before.
export function sumAndCapRollModifier(sources, modifierCap) {
  const rawModifier = (Array.isArray(sources) ? sources : [])
    .reduce((total, source) => total + (Number(source?.value) || 0), 0);
  const cap = Math.max(0, Number(modifierCap) || 0);
  const modifier = cap > 0 ? Math.max(-cap, Math.min(cap, rawModifier)) : rawModifier;
  return { modifier, rawModifier, modifierCap: cap, capped: modifier !== rawModifier };
}
