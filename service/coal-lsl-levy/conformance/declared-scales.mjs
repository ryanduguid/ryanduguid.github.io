// Does every value a response carries match the fixed-scale pattern the
// OpenAPI schema declares for it? Absent optional values pass, because a
// branch reports only its own workings. A present value must have the
// declared shape: a pattern needs a matching string, an array schema needs an
// array, and an object schema needs an object that carries its required
// members.
export function declaredScalesHold(schema, value) {
  if (value === undefined) return true;
  if (typeof schema?.pattern === 'string') return typeof value === 'string' && new RegExp(schema.pattern).test(value);
  if (schema?.items) return Array.isArray(value) && value.every((item) => declaredScalesHold(schema.items, item));
  if (!schema?.properties) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if ((schema.required ?? []).some((key) => value[key] === undefined)) return false;
  return Object.entries(schema.properties).every(([key, child]) => declaredScalesHold(child, value[key]));
}
