import { z } from 'zod';
import { bankSchema } from '../domain/bank';
import { fieldReference, type FieldDoc } from './bank-reference';

/**
 * The bank format as a JSON Schema, for editors. SPEC section 2.3.
 *
 * Generated from the Zod schema the app validates with, so an editor and the
 * app agree on every field, type, limit and pattern. The build serves it at
 * `BANK_SCHEMA_PATH`; see `vite.config.ts`. A bank opts in with a `$schema`
 * key pointing there.
 *
 * What a JSON Schema cannot say, the app still checks on load: that an answer
 * names one of its question's options, that ids are unique, and that no text
 * holds a LaTeX command whose backslash was lost.
 */

/** Where the schema is served, relative to the app. Stable: banks point at it. */
export const BANK_SCHEMA_PATH = 'schema/bank-v1.schema.json';

/** Enough of a JSON Schema to walk into its properties. */
export type JsonSchema = {
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  [keyword: string]: unknown;
};

/** Adds each field's documented rules as its description, shown by editors on hover. */
function describe(schema: JsonSchema | undefined, fields: FieldDoc[]): void {
  for (const field of fields) {
    const property = schema?.properties?.[field.name];
    if (property) property.description = field.rules;
  }
}

/**
 * The JSON Schema of a bank. It carries no `$id`: the build does not know the
 * URL it will be deployed at, and editors find the schema by the bank's
 * `$schema` key anyway.
 */
export function bankJsonSchema(): JsonSchema {
  const schema: JsonSchema = {
    // Draft 7 is the draft every common editor understands.
    ...(z.toJSONSchema(bankSchema, { target: 'draft-7', io: 'input' }) as JsonSchema),
    title: 'Physics Quiz question bank, format version 1',
    description:
      'A question bank for Physics Quiz. The app also checks, on load, that every answer names one of its options, that ids are unique, and that every LaTeX backslash is doubled.',
  };
  const question = schema.properties?.questions?.items;
  describe(schema, fieldReference.bank);
  describe(question, fieldReference.question);
  describe(question?.properties?.options?.items, fieldReference.option);
  return schema;
}
