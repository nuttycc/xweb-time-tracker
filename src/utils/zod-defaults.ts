import { ZodObject, ZodType } from 'zod/v4';

/**
 * Recursively extracts default values from a Zod schema.
 *
 * This function traverses a Zod schema and constructs an object containing all
 * defined default values. It handles nested objects and ensures that only
 * fields with explicit defaults are included in the output.
 *
 * @param schema The Zod schema to extract defaults from.
 * @returns An object representing the default values of the schema.
 */
export function getDefaults<T extends ZodType>(schema: T): T['_output'] {
  // Handle ZodObject schemas
  if (schema instanceof ZodObject) {
    const shape = schema.shape;
    const defaults: Record<string, unknown> = {};

    for (const key in shape) {
      if (!Object.hasOwn(shape, key)) continue;

      const fieldSchema = shape[key];
      const fieldDefault = getDefaults(fieldSchema);

      if (fieldDefault !== undefined) {
        defaults[key] = fieldDefault;
      }
    }
    return defaults;
  }

  // Handle Zod schemas with a defined default value
  // This uses internal Zod properties (`_def`) which might change in future versions,
  // but it's a common pattern for this use case.
  if ('defaultValue' in schema.def) {
    const defaultValue = schema.def.defaultValue;
    // If the default value is a function, execute it to get the value.
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  }

  // Return undefined for schemas without a default value
  return undefined;
} 