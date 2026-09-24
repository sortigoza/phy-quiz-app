import { describe, expect, it } from 'vitest';
import { isBankRepository, parseBankRepository } from './bank-repository';
import { encodeBankKey } from './private-bank';

/**
 * A bank repository: one file listing the URLs of several banks. SPEC section 3.5.
 */

const base = 'https://raw.githubusercontent.com/a-teacher/banks/main/mechanics/index.json';

function repositoryText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    title: 'Mechanics, autumn term',
    banks: [{ url: 'kinematics.json' }, { url: 'https://example.org/forces.json' }],
    ...overrides,
  });
}

describe('isBankRepository', () => {
  it('recognises a repository by its banks array', () => {
    expect(isBankRepository(repositoryText())).toBe(true);
  });

  it('leaves a bank, other JSON and non-JSON to the bank path', () => {
    const bank = JSON.stringify({ formatVersion: 1, id: 'x', questions: [], banks: [] });
    expect(isBankRepository(bank)).toBe(false);
    expect(isBankRepository('{"protected":"x","ciphertext":"y","iv":"z"}')).toBe(false);
    expect(isBankRepository('[1, 2]')).toBe(false);
    expect(isBankRepository('not json')).toBe(false);
  });
});

describe('parseBankRepository', () => {
  it('resolves relative entries against the address the repository was read from', () => {
    const result = parseBankRepository(repositoryText(), base);
    expect(result).toEqual({
      ok: true,
      repository: {
        title: 'Mechanics, autumn term',
        entries: [
          {
            given: 'kinematics.json',
            url: 'https://raw.githubusercontent.com/a-teacher/banks/main/mechanics/kinematics.json',
          },
          { given: 'https://example.org/forces.json', url: 'https://example.org/forces.json' },
        ],
      },
    });
  });

  it('keeps a relative entry unresolved when there is no address to resolve it against', () => {
    const result = parseBankRepository(repositoryText());
    expect(result.ok && result.repository.entries).toEqual([
      { given: 'kinematics.json', url: null },
      { given: 'https://example.org/forces.json', url: 'https://example.org/forces.json' },
    ]);
  });

  it('rejects unknown keys anywhere, naming the path', () => {
    const result = parseBankRepository(
      repositoryText({ titel: 'x', banks: [{ url: 'a.json', label: 'A' }] }),
      base,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['', 'banks[0]']),
    );
    expect(result.issues.map((issue) => issue.message).join(' ')).toMatch(/titel/);
    expect(result.issues.map((issue) => issue.message).join(' ')).toMatch(/label/);
  });

  it('rejects an empty list and an unknown format version', () => {
    const result = parseBankRepository(repositoryText({ formatVersion: 2, banks: [] }), base);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path).sort()).toEqual(['banks', 'formatVersion']);
  });

  it('rejects two entries that resolve to the same address', () => {
    const result = parseBankRepository(
      repositoryText({
        banks: [
          { url: 'kinematics.json' },
          {
            url: 'https://raw.githubusercontent.com/a-teacher/banks/main/mechanics/kinematics.json',
          },
        ],
      }),
      base,
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: 'banks[1].url',
          message: expect.stringMatching(/same bank as banks\[0\]/) as unknown,
        },
      ],
    });
  });

  it('treats a GitHub file page and its raw file as the same bank', () => {
    const result = parseBankRepository(
      repositoryText({
        banks: [
          { url: 'https://github.com/t/banks/blob/main/a.json' },
          { url: 'https://raw.githubusercontent.com/t/banks/main/a.json' },
        ],
      }),
      base,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a relative entry listed twice, even with nothing to resolve it against', () => {
    const result = parseBankRepository(
      repositoryText({ banks: [{ url: 'a.json' }, { url: 'a.json' }] }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts an id, and ignores the bank id an author notes on an entry', () => {
    const result = parseBankRepository(
      repositoryText({ id: 'kth.mechanics', banks: [{ url: 'qm.json', bank: 'physics.qm' }] }),
      base,
    );
    expect(result.ok && result.repository).toMatchObject({
      id: 'kth.mechanics',
      entries: [{ given: 'qm.json', key: undefined }],
    });
  });

  it('rejects an id a bank could not have', () => {
    const result = parseBankRepository(repositoryText({ id: 'Not An Id' }), base);
    expect(result.ok || result.issues.map((issue) => issue.path)).toEqual(['id']);
  });
});

describe('bank keys in a repository', () => {
  const key = new Uint8Array(32).fill(7);
  const withKey = repositoryText({ banks: [{ url: 'qm.json', key: encodeBankKey(key) }] });

  it('decodes each entry key when the repository arrived encrypted', () => {
    const result = parseBankRepository(withKey, base, { encrypted: true });
    expect(result.ok && result.repository.entries[0]?.key).toEqual(key);
  });

  it('refuses a plaintext repository carrying keys, since they are now public', () => {
    const result = parseBankRepository(withKey, base);
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: 'banks[0].key',
          message: expect.stringMatching(/plain text.*public.*rotate/i) as unknown,
        },
      ],
    });
  });

  it('rejects a key that is not 32 bytes of base64url', () => {
    const result = parseBankRepository(
      repositoryText({ banks: [{ url: 'qm.json', key: 'short' }] }),
      base,
      { encrypted: true },
    );
    expect(result.ok || result.issues.map((issue) => issue.path)).toEqual(['banks[0].key']);
  });
});
