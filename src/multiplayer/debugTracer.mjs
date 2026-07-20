const TRACE_PREFIX = "[MultiplayerTrace]";
let sequence = 0;

export function multiplayerDebugEnabled(env = globalThis) {
  const explicit = env?.DEBUG_MULTIPLAYER ?? env?.__DEBUG_MULTIPLAYER__;
  if (explicit === true || explicit === "true" || explicit === "1") return true;
  try {
    return env?.localStorage?.getItem("DEBUG_MULTIPLAYER") === "true";
  } catch {
    return false;
  }
}

export function createMultiplayerTraceId(action = "ACTION") {
  sequence += 1;
  return `${String(action || "ACTION").toUpperCase()}_${Date.now()}_${sequence}`;
}

export function createMultiplayerTracer({ enabled = multiplayerDebugEnabled(), sink = console } = {}) {
  function emit(level, event, details = {}) {
    if (!enabled) return;
    const payload = {
      at: new Date().toISOString(),
      event: String(event || "UNKNOWN"),
      ...details,
    };
    const method = typeof sink?.[level] === "function" ? sink[level].bind(sink) : sink?.log?.bind(sink);
    method?.(TRACE_PREFIX, payload);
  }
  return {
    enabled,
    multiplayer(event, details) { emit("info", event, details); },
    guard(event, reason, details = {}) { emit("warn", event, { reason, ...details }); },
    error(event, error, details = {}) {
      emit("error", event, { code: error?.code || "", message: error?.message || String(error || ""), ...details });
    },
  };
}
