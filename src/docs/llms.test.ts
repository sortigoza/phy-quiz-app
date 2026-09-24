import { describe, expect, it } from 'vitest';
import { isBankRepository, parseBankRepository } from '../domain/bank-repository';
import { parseBank } from '../domain/bank';
import { fieldReference } from './bank-reference';
import { renderLlmsTxt } from './llms';

const text = renderLlmsTxt('1.2.3');

/** Every fenced ```json block in the document. */
function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1] ?? '');
}

describe('llms.txt', () => {
  it('follows the llmstxt.org shape: an H1, then a blockquote summary', () => {
    const [title, blank, summary] = text.split('\n');
    expect(title).toMatch(/^# \S/);
    expect(blank).toBe('');
    expect(summary).toMatch(/^> \S/);
  });

  it('names the app version it describes', () => {
    expect(text).toContain('1.2.3');
  });

  it.each([
    ['bank', fieldReference.bank],
    ['question', fieldReference.question],
    ['option', fieldReference.option],
  ] as const)('documents every %s field', (_, fields) => {
    for (const field of fields) expect(text).toContain(`\`${field.name}\``);
  });

  it('carries at least one complete example, and every example is a valid bank or repository', () => {
    const blocks = jsonBlocks(text);
    expect(blocks.filter((block) => !isBankRepository(block)).length).toBeGreaterThan(0);
    for (const block of blocks) {
      const parsed = isBankRepository(block)
        ? parseBankRepository(block, 'https://example.org/index.json')
        : parseBank(block);
      expect(parsed).toMatchObject({ ok: true });
    }
  });

  it('says how to load many banks with one bank repository', () => {
    expect(text).toMatch(/## Bank repositories/);
    expect(jsonBlocks(text).some(isBankRepository)).toBe(true);
    expect(text).toMatch(/never list a bank link/i);
  });

  it('says one link can open a whole private course, and that an agent never writes keys', () => {
    expect(text).toMatch(/private repository/i);
    expect(text).toMatch(/one link opens the whole course/i);
    expect(text).toMatch(/never write a key/i);
  });

  it('warns that LaTeX backslashes must be doubled in JSON', () => {
    expect(text).toMatch(/\\\\times/);
    expect(text).toMatch(/double/i);
  });

  it('says that private banks exist, how a student opens one, and that an agent writes plaintext', () => {
    expect(text).toMatch(/## Private banks/);
    expect(text).toMatch(/bank link/i);
    expect(text).toMatch(/write the plaintext bank/i);
  });

  it('ends with a checklist an agent can run before handing back a bank', () => {
    expect(text).toMatch(/## Checklist[\s\S]*- \[ \]/);
  });
});
