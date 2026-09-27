import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { fullExample, minimalExample } from './bank-reference';
import { BANK_SCHEMA_PATH, bankJsonSchema } from './bank-json-schema';

/**
 * The published JSON Schema is what an editor checks a bank against while it
 * is being written. It is read here by a real JSON Schema validator, the way
 * an editor would, not inspected field by field.
 */

const schema = bankJsonSchema();
const validate = new Ajv({ strict: false }).compile(schema);

/** A bank loose enough to break on purpose. */
type LooseBank = {
  questions: [
    {
      options: [Record<string, unknown>, ...Record<string, unknown>[]];
      explanation?: unknown;
      [field: string]: unknown;
    },
  ];
  [field: string]: unknown;
};

const minimal = () => JSON.parse(minimalExample) as LooseBank;

describe('bankJsonSchema', () => {
  it('lives at a stable path', () => {
    expect(BANK_SCHEMA_PATH).toBe('schema/bank-v1.schema.json');
  });

  it.each([
    ['minimal', minimalExample],
    ['full', fullExample],
  ])('accepts the %s example bank', (_, text) => {
    expect(validate(JSON.parse(text)), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts a bank that declares the schema', () => {
    expect(
      validate({ ...minimal(), $schema: `https://example.org/quiz/${BANK_SCHEMA_PATH}` }),
    ).toBe(true);
  });

  it('rejects a misspelled field, as the app does', () => {
    const bank = minimal();
    bank.questions[0].explaination = bank.questions[0].explanation;
    delete bank.questions[0].explanation;
    expect(validate(bank)).toBe(false);
  });

  it('rejects an unknown option field', () => {
    const bank = minimal();
    bank.questions[0].options[0].correct = true;
    expect(validate(bank)).toBe(false);
  });

  it.each([
    ['a formatVersion other than 1', { formatVersion: 2 }],
    ['an id with capitals', { id: 'Example.Bank' }],
    ['a version that is not semver', { version: '1.0' }],
    ['a fractional question count', { defaultQuestionCount: 2.5 }],
    ['no questions', { questions: [] }],
  ])('rejects %s', (_, overrides) => {
    expect(validate({ ...minimal(), ...overrides })).toBe(false);
  });

  it('rejects a question with one option', () => {
    const bank = minimal();
    bank.questions[0].options = [bank.questions[0].options[0]];
    expect(validate(bank)).toBe(false);
  });

  it('rejects an unknown difficulty', () => {
    const bank = minimal();
    bank.questions[0].difficulty = 'impossible';
    expect(validate(bank)).toBe(false);
  });

  it('does not require a question type, which defaults to single-choice', () => {
    expect(minimal().questions[0].type).toBeUndefined();
    expect(validate(minimal())).toBe(true);
  });

  it('describes each field, so an editor can show it on hover', () => {
    const question = schema.properties?.questions?.items;
    expect(schema.properties?.id?.description).toMatch(/lowercase letters/);
    expect(question?.properties?.explanation?.description).toMatch(/Shown in the review/);
    expect(question?.properties?.options?.items?.properties?.why?.description).toMatch(/wrong/);
  });
});
