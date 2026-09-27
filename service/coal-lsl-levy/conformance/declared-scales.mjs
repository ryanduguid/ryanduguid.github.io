// Does every value a response carries match the fixed-scale pattern the
// OpenAPI schema declares for it? Absent values pass, because a branch reports
// only its own workings. A present value must have the declared shape: a
// pattern needs a matching string, and an array schema needs an array.
export function declaredScalesHold(schema, value) {
  if (value === undefined) return true;
  if (typeof schema?.pattern === 'string') return typeof value === 'string' && new RegExp(schema.pattern).test(value);
  if (schema?.items) return Array.isArray(value) && value.every((item) => declaredScalesHold(schema.items, item));
  return Object.entries(schema?.properties ?? {}).every(([key, child]) => declaredScalesHold(child, value?.[key]));
}
