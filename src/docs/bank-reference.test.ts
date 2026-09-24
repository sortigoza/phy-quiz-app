import { describe, expect, it } from 'vitest';
import { bankSchema, optionSchema, parseBank, questionSchema } from '../domain/bank';
import { parseBankRepository } from '../domain/bank-repository';
import { fieldReference, minimalExample, repositoryExample } from './bank-reference';

/**
 * The field reference is hand-written prose, but the field names in it are held
 * to the validator: adding, removing or renaming a field in the schema fails
 * here until the documentation says so too.
 */
describe('fieldReference', () => {
  it.each([
    ['bank', fieldReference.bank, bankSchema],
    ['question', fieldReference.question, questionSchema],
    ['option', fieldReference.option, optionSchema],
  ] as const)('documents exactly the fields the %s schema accepts', (_, fields, schema) => {
    expect(fields.map((field) => field.name).sort()).toEqual(Object.keys(schema.shape).sort());
  });

  it('marks as required exactly the fields the validator requires', () => {
    const required = (schema: { shape: Record<string, { isOptional(): boolean }> }) =>
      Object.entries(schema.shape)
        .filter(([, field]) => !field.isOptional())
        .map(([name]) => name)
        .sort();

    expect(
      fieldReference.bank
        .filter((f) => f.required)
        .map((f) => f.name)
        .sort(),
    ).toEqual(required(bankSchema));
    expect(
      fieldReference.question
        .filter((f) => f.required)
        .map((f) => f.name)
        .sort(),
    ).toEqual(required(questionSchema));
    expect(
      fieldReference.option
        .filter((f) => f.required)
        .map((f) => f.name)
        .sort(),
    ).toEqual(required(optionSchema));
  });
});

describe('minimalExample', () => {
  it('is a valid bank', () => {
    expect(parseBank(minimalExample)).toMatchObject({ ok: true });
  });
});

describe('repositoryExample', () => {
  it('is a valid bank repository', () => {
    expect(
      parseBankRepository(repositoryExample, 'https://example.org/banks/index.json'),
    ).toMatchObject({
      ok: true,
    });
  });
});
