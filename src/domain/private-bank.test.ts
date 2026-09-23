import { describe, expect, it } from 'vitest';
import {
  PRIVATE_BANK_CONTENT_TYPE,
  bankKeyId,
  bankLink,
  decodeBankKey,
  decryptBank,
  encodeBankKey,
  encryptBank,
  generateBankKey,
  importBankKey,
  parseBankLink,
  readPrivateBankHeader,
} from './private-bank';

const plaintext = JSON.stringify({
  formatVersion: 1,
  id: 'kth.secret-exam-prep',
  version: '1.0.0',
  title: 'SK1104 exam preparation, spring 2027',
  author: 'A. Teacher',
  questions: [
    {
      id: 'q1',
      prompt: 'A ball falls from rest for one second. What is its speed?',
      options: [
        { id: 'a', text: '4.91 m/s' },
        { id: 'b', text: '9.81 m/s' },
      ],
      answer: 'b',
      explanation: 'From rest, v = gt.',
    },
  ],
});

function decodeProtectedHeader(jwe: string): Record<string, unknown> {
  const { protected: header } = JSON.parse(jwe) as { protected: string };
  return JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('the encrypted file', () => {
  it('is a General JSON JWE with every header field protected', async () => {
    const key = generateBankKey();
    const jwe = await encryptBank(plaintext, key);
    const document = JSON.parse(jwe) as Record<string, unknown>;

    expect(document).toHaveProperty('protected');
    expect(document).toHaveProperty('iv');
    expect(document).toHaveProperty('ciphertext');
    expect(document).toHaveProperty('tag');
    expect(document).toHaveProperty('recipients');
    expect(document).not.toHaveProperty('unprotected');
    expect(decodeProtectedHeader(jwe)).toEqual({
      alg: 'dir',
      enc: 'A256GCM',
      cty: PRIVATE_BANK_CONTENT_TYPE,
      kid: await bankKeyId(key),
    });
  });

  it('gives nothing about the bank away without the key', async () => {
    const jwe = await encryptBank(plaintext, generateBankKey());
    for (const secret of [
      'kth.secret-exam-prep',
      'SK1104',
      'A. Teacher',
      'falls from rest',
      '1.0.0',
    ]) {
      expect(jwe).not.toContain(secret);
    }
  });

  it('is different every time, so its fingerprint cannot identify a bank', async () => {
    const key = generateBankKey();
    expect(await encryptBank(plaintext, key)).not.toBe(await encryptBank(plaintext, key));
  });
});

describe('the bank key', () => {
  it('is 32 random bytes', () => {
    const key = generateBankKey();
    expect(key).toHaveLength(32);
    expect(encodeBankKey(key)).not.toBe(encodeBankKey(generateBankKey()));
  });

  it('is identified by its RFC 7638 thumbprint', async () => {
    // RFC 7638 over {"k":...,"kty":"oct"}, computed independently here.
    const key = new Uint8Array(32).fill(7);
    const canonical = `{"k":"${Buffer.from(key).toString('base64url')}","kty":"oct"}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    expect(await bankKeyId(key)).toBe(Buffer.from(digest).toString('base64url'));
  });

  it('round trips through its link encoding, which is 43 characters of base64url', () => {
    const key = generateBankKey();
    const encoded = encodeBankKey(key);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(decodeBankKey(encoded)).toEqual(key);
  });

  it.each([
    ['empty', ''],
    ['too short', encodeBankKey(new Uint8Array(16))],
    ['not base64url', '!'.repeat(43)],
  ])('refuses a link key that is %s', (_, encoded) => {
    expect(decodeBankKey(encoded)).toBeNull();
  });

  it('can be imported so that no script can read it back', async () => {
    const key = await importBankKey(generateBankKey());
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });
});

describe('decryptBank', () => {
  it('returns the exact plaintext bytes that were encrypted', async () => {
    const key = generateBankKey();
    const jwe = await encryptBank(plaintext, key);
    expect(await decryptBank(jwe, await importBankKey(key))).toEqual({ ok: true, plaintext });
  });

  it('refuses the wrong key', async () => {
    const jwe = await encryptBank(plaintext, generateBankKey());
    expect(await decryptBank(jwe, await importBankKey(generateBankKey()))).toEqual({ ok: false });
  });

  it('rejects a tampered ciphertext outright rather than returning part of it', async () => {
    const key = generateBankKey();
    const document = JSON.parse(await encryptBank(plaintext, key)) as { ciphertext: string };
    const bytes = Buffer.from(document.ciphertext, 'base64url');
    bytes[10] = (bytes[10] ?? 0) ^ 0x01;
    const tampered = JSON.stringify({ ...document, ciphertext: bytes.toString('base64url') });

    expect(await decryptBank(tampered, await importBankKey(key))).toEqual({ ok: false });
  });

  it('rejects a file whose protected header was changed', async () => {
    const key = generateBankKey();
    const document = JSON.parse(await encryptBank(plaintext, key)) as { protected: string };
    const header = { ...decodeProtectedHeader(JSON.stringify(document)), kid: 'someone-else' };
    const tampered = JSON.stringify({
      ...document,
      protected: Buffer.from(JSON.stringify(header)).toString('base64url'),
    });

    expect(await decryptBank(tampered, await importBankKey(key))).toEqual({ ok: false });
  });
});

describe('readPrivateBankHeader', () => {
  it('recognises a private bank by its content and reads its key id', async () => {
    const key = generateBankKey();
    expect(readPrivateBankHeader(await encryptBank(plaintext, key))).toEqual({
      kid: await bankKeyId(key),
    });
  });

  it.each([
    ['a plaintext bank', plaintext],
    ['text that is not JSON', '{ not json'],
    ['a JSON array', '[]'],
    ['a JWE with no ciphertext', JSON.stringify({ protected: 'e30', iv: 'AA' })],
  ])('passes over %s', (_, text) => {
    expect(readPrivateBankHeader(text)).toBeNull();
  });

  it('passes over a JWE that is not one of ours', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'dir', enc: 'A256GCM' })).toString(
      'base64url',
    );
    const jwe = JSON.stringify({ protected: header, iv: 'AA', ciphertext: 'AA', tag: 'AA' });
    expect(readPrivateBankHeader(jwe)).toBeNull();
  });
});

describe('the bank link', () => {
  const fileUrl = 'https://a-teacher.github.io/banks/exam prep.bank.jwe.json?ref=main';

  it('carries the file address and the key in the fragment only', () => {
    const key = generateBankKey();
    const link = new URL(bankLink('https://sortigoza.github.io/phy-quiz-app/', fileUrl, key));

    expect(link.origin + link.pathname).toBe('https://sortigoza.github.io/phy-quiz-app/');
    expect(link.search).toBe('');
    expect(link.hash).toBe(`#bank=${encodeURIComponent(fileUrl)}&key=${encodeBankKey(key)}`);
  });

  it('replaces any fragment the app address already had', () => {
    const link = bankLink('https://example.org/app/#share=x', fileUrl, generateBankKey());
    expect(link.match(/#/g)).toHaveLength(1);
  });

  it('parses back to the same address and key', () => {
    const key = generateBankKey();
    const { hash } = new URL(bankLink('https://example.org/', fileUrl, key));
    expect(parseBankLink(hash)).toEqual({ kind: 'bank-link', url: fileUrl, key });
  });

  it.each([
    ['empty', ''],
    ['a share link', '#share=abc'],
    ['a lone hash', '#'],
  ])('ignores a fragment that is %s', (_, hash) => {
    expect(parseBankLink(hash)).toEqual({ kind: 'none' });
  });

  it.each([
    ['has no key', `#bank=${encodeURIComponent(fileUrl)}`],
    ['has a truncated key', `#bank=${encodeURIComponent(fileUrl)}&key=abc`],
    ['has no file address', `#bank=&key=${encodeBankKey(generateBankKey())}`],
  ])('calls a bank link broken when it %s', (_, hash) => {
    expect(parseBankLink(hash)).toEqual({ kind: 'broken' });
  });
});
