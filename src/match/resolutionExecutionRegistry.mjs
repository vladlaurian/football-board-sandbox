export function createResolutionExecutionRegistry() {
  const active = new Set();

  function keyFor({ entryId, actionId } = {}) {
    const entry = String(entryId || "").trim();
    const action = String(actionId || "").trim();
    return entry && action ? `${entry}::${action}` : "";
  }

  return {
    isActive(context) {
      const key = keyFor(context);
      return Boolean(key && active.has(key));
    },
    run(context, execute) {
      const key = keyFor(context);
      if (!key || typeof execute !== "function") {
        return { status: "invalid", value: undefined };
      }
      if (active.has(key)) {
        return { status: "already-active", value: undefined };
      }
      active.add(key);
      try {
        return { status: "completed", value: execute() };
      } catch (error) {
        return { status: "failed", error };
      } finally {
        active.delete(key);
      }
    },
  };
}
