/**
 * Reusable fake Supabase client — no network, no real Supabase project.
 *
 * Mirrors just the chainable query-builder shape actually used by this
 * project's services (.from().select().eq().order()... awaited at the end)
 * plus the auth.* methods used by auth.js. Each table gets a canned
 * response (or a queue of responses, consumed one per `.from(table)` call —
 * this is what lets tests like getEventsByRange, which issues two parallel
 * `.from("events")` queries, return different data for each).
 */

function toQueue(responses) {
  return Array.isArray(responses) ? responses.slice() : [responses];
}

const CHAIN_METHODS = [
  "select", "insert", "update", "delete", "upsert",
  "eq", "neq", "gte", "lte", "lt", "gt", "or", "order", "in",
];

function createQueryBuilder(table, result, calls) {
  const builder = { table };
  for (const method of CHAIN_METHODS) {
    builder[method] = (...args) => {
      calls.push({ table, method, args });
      return builder;
    };
  }
  builder.single = (...args) => {
    calls.push({ table, method: "single", args });
    return builder;
  };
  builder.maybeSingle = (...args) => {
    calls.push({ table, method: "maybeSingle", args });
    return builder;
  };
  // Thenable — `await supabase.from(x).select()...` resolves to the canned result.
  builder.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

/**
 * createSupabaseMock({
 *   tableResponses: { events: { data: [...], error: null } },
 *   authResponses:  { signInWithPassword: async () => ({ data: {...}, error: null }) },
 * })
 */
export function createSupabaseMock({ tableResponses = {}, authResponses = {} } = {}) {
  const calls = [];
  const queues = {};

  const supabase = {
    _calls: calls,
    from(table) {
      if (!queues[table]) queues[table] = toQueue(tableResponses[table]);
      const queue = queues[table];
      const result = queue.length > 1 ? queue.shift() : queue[0];
      return createQueryBuilder(table, result, calls);
    },
    auth: {
      signInWithPassword: authResponses.signInWithPassword
        ?? (async () => ({ data: {}, error: null })),
      signUp: authResponses.signUp
        ?? (async () => ({ data: {}, error: null })),
      signOut: authResponses.signOut
        ?? (async () => ({ error: null })),
      getSession: authResponses.getSession
        ?? (async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: authResponses.onAuthStateChange
        ?? (() => ({ data: { subscription: { unsubscribe() {} } } })),
      resetPasswordForEmail: authResponses.resetPasswordForEmail
        ?? (async () => ({ error: null })),
      updateUser: authResponses.updateUser
        ?? (async () => ({ data: {}, error: null })),
    },
  };

  return supabase;
}

export function createCurrentUserIdMock(userId = "user-123") {
  return async () => userId;
}
