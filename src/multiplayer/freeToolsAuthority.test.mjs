import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("guest Free Move uses host-authoritative intents for start, move, and end", () => {
  assert.match(source, /sessionRuntimeRef\(sessionCode\.toUpperCase\(\), "freeModeIntent"\)/);
  assert.match(source, /operation: "move"/);
  assert.match(source, /requestHostFreeMode\(piece, isSameFreePiece \? "end" : "start"\)/);
  assert.match(source, /commitPieceMove\(piece, Number\(intent\.x\), Number\(intent\.y\).*authorizationOverride: \{ allowed: true, mode: "free" \}/s);
});

test("Match Mode ball selection requires Free Ball and remains one-shot", () => {
  assert.match(source, /gameMode === "match" && piece\.team === "BALL" && !freeBallActive\) return/);
  assert.match(source, /sessionRuntimeRef\(sessionCode\.toUpperCase\(\), "freeBallMoveIntent"\)/);
  assert.match(source, /void requestHostFreeBallMove\(x, y\);\n      cancelFreeBall\(\);/);
  assert.match(source, /if \(gameMode === "editor"\) return \{ legal: true, geometry \}/);
});
