export function paginationRange(page = 1, size = 10) {
  const from = (page - 1) * size;
  const to = from + size - 1;
  return { from, to };
}

// Legacy single-column search — kept for backward compatibility
export function withSearch(query, column, search) {
  if (!search?.trim()) return query;
  return query.ilike(column, `%${search.trim()}%`);
}

/**
 * Apply OR ilike across multiple columns.
 * If search is empty/whitespace, returns query unchanged.
 * @param {object} query - Supabase query builder
 * @param {string[]} columns - column names to search
 * @param {string} search - search term
 */
export function withMultiSearch(query, columns, search) {
  const term = search?.trim();
  if (!term || !columns?.length) return query;
  const orClause = columns.map((col) => `${col}.ilike.%${term}%`).join(",");
  return query.or(orClause);
}

/**
 * Apply exact-match filters with AND logic.
 * Entries with empty/null/undefined values are skipped.
 * @param {object} query - Supabase query builder
 * @param {object} filters - { columnName: value, ... }
 */
export function withFilters(query, filters) {
  if (!filters || typeof filters !== "object") return query;
  let q = query;
  for (const [col, val] of Object.entries(filters)) {
    const v = val == null ? "" : String(val).trim();
    if (v !== "") q = q.eq(col, v);
  }
  return q;
}

/**
 * Apply ORDER BY for one or two columns.
 * If column is empty/null, returns query unchanged.
 * @param {object} query - Supabase query builder
 * @param {string} column - primary column to sort by
 * @param {"asc"|"desc"} direction
 * @param {string} [column2] - optional secondary column
 * @param {"asc"|"desc"} [direction2]
 */
export function withSort(query, column, direction = "desc", column2, direction2) {
  if (!column) return query;
  let q = query.order(column, { ascending: direction === "asc" });
  if (column2) q = q.order(column2, { ascending: (direction2 ?? "asc") === "asc" });
  return q;
}

/**
 * Apply date range filter using gte/lte.
 * Missing from/to values are simply omitted.
 * @param {object} query - Supabase query builder
 * @param {string} column - date column name
 * @param {string|null} from - ISO date string or null
 * @param {string|null} to - ISO date string or null
 */
export function withDateRange(query, column, from, to) {
  if (!column) return query;
  let q = query;
  if (from) q = q.gte(column, from);
  if (to) q = q.lte(column, to);
  return q;
}

export async function withRetry(fn, retries = 2) {
  let lastError;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1) ** 2));
    }
  }
  throw lastError;
}
