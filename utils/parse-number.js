/**
 * Safely parse a value (string | string[] | qs.ParsedQs | undefined) to a number.
 * If value is an array, use the first element. If parsing fails, return the provided
 * fallback (which may be undefined).
 * @param {any} v
 * @param {number|undefined} [fallback]
 * @returns {number|undefined}
 */
function parseNumber(v, fallback) {
  if (v === undefined || v === null) return fallback;
  if (Array.isArray(v)) v = v[0];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { parseNumber };
