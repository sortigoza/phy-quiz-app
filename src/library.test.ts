import { beforeEach, describe, expect, it } from 'vitest';
import { bankKeyId, encryptBank, generateBankKey } from './domain/private-bank';
import { addBankFromText, storeBankKey } from './library';
import { db, listBanks } from './storage/db';

const validBankText = JSON.stringify({
  formatVersion: 1,
  id: 'kth.kinematics',
  version: '1.0.0',
  title: 'Kinematics in one dimension',
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

const upload = { kind: 'upload', filename: 'kinematics.json' } as const;

beforeEach(async () => {
  await db.banks.clear();
});

describe('addBankFromText', () => {
  it('stores a valid bank and reports it as added', async () => {
    const result = await addBankFromText(validBankText, upload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('added');
    expect(result.bank.title).toBe('Kinematics in one dimension');
    expect(result.bank.author).toBe('A. Teacher');
    expect(result.bank.questionCount).toBe(1);
    expect(result.bank.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(result.bank.source).toEqual(upload);
    expect(await listBanks()).toHaveLength(1);
  });

  it('keeps the exact text it was given, so the fingerprint stays checkable', async () => {
    const result = await addBankFromText(validBankText, upload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.raw).toBe(validBankText);
  });

  it('stores a YAML bank as the YAML it was given', async () => {
    const yaml = [
      'formatVersion: 1',
      'id: kth.kinematics',
      'version: 1.0.0',
      'title: Kinematics in one dimension',
      'questions:',
      '  - id: q1',
      "    prompt: 'A ball falls from rest for $1\\,\\mathrm{s}$. What is its speed?'",
      '    options: [{ id: a, text: 4.91 m/s }, { id: b, text: 9.81 m/s }]',
      '    answer: b',
      '    explanation: From rest, v = gt.',
    ].join('\n');
    const result = await addBankFromText(yaml, { kind: 'upload', filename: 'kinematics.yaml' });
    expect(result).toMatchObject({
      ok: true,
      status: 'added',
      bank: { raw: yaml, questionCount: 1 },
    });
  });

  it('recognises a byte-identical bank it already holds', async () => {
    await addBankFromText(validBankText, upload);
    const again = await addBankFromText(validBankText, upload);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.status).toBe('unchanged');
    expect(await listBanks()).toHaveLength(1);
  });

  it('holds back a bank whose id and version match but whose bytes differ, until told to replace', async () => {
    const first = await addBankFromText(validBankText, upload);
    const edited = validBankText.replace('Kinematics in one dimension', 'Kinematics, revised');
    const result = await addBankFromText(edited, upload);
    expect(result).toMatchObject({ ok: true, status: 'conflict' });
    if (!result.ok || result.status !== 'conflict' || !first.ok) return;
    expect(result.existing.fingerprint).toBe(first.bank.fingerprint);
    expect(result.bank.title).toBe('Kinematics, revised');
    expect((await listBanks())[0]?.title).toBe('Kinematics in one dimension');
  });

  it('replaces the held bank when told to', async () => {
    await addBankFromText(validBankText, upload);
    const edited = validBankText.replace('Kinematics in one dimension', 'Kinematics, revised');
    const result = await addBankFromText(edited, upload, { replace: true });
    expect(result).toMatchObject({ ok: true, status: 'replaced' });
    const banks = await listBanks();
    expect(banks).toHaveLength(1);
    expect(banks[0]?.title).toBe('Kinematics, revised');
  });

  it('records a bank loaded by URL with the URL it came from', async () => {
    const source = { kind: 'url', url: 'https://example.org/kinematics.json' } as const;
    const result = await addBankFromText(validBankText, source);
    expect(result).toMatchObject({ ok: true, status: 'added', bank: { source } });
  });

  it('stores nothing at all when the bank is invalid', async () => {
    const result = await addBankFromText('{"formatVersion": 1}', upload);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'invalid') return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(await listBanks()).toHaveLength(0);
  });

  it('reports malformed JSON without storing anything', async () => {
    const result = await addBankFromText('{ not json', upload);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'invalid') return;
    expect(result.issues[0]?.message).toMatch(/not valid json/i);
    expect(await listBanks()).toHaveLength(0);
  });
});

describe('addBankFromText with a private bank', () => {
  const key = generateBankKey();
  const encrypted = () => encryptBank(validBankText, key);

  beforeEach(async () => {
    await db.bankKeys.clear();
  });

  it('opens it with the stored key whose kid matches, and stores the plaintext', async () => {
    const { kid } = await storeBankKey(key);
    const result = await addBankFromText(await encrypted(), upload);

    expect(result).toMatchObject({ ok: true, status: 'added' });
    if (!result.ok) return;
    expect(result.bank.raw).toBe(validBankText);
    expect(result.bank.kid).toBe(kid);
    expect(result.bank.title).toBe('Kinematics in one dimension');
  });

  it('fingerprints the plaintext, so a re-encrypted copy of the same bank changes nothing', async () => {
    await storeBankKey(key);
    const plain = await addBankFromText(validBankText, upload);
    await db.banks.clear();

    const first = await addBankFromText(await encrypted(), upload);
    const second = await addBankFromText(await encrypted(), upload);
    expect(first.ok && second.ok && plain.ok).toBe(true);
    if (!first.ok || !second.ok || !plain.ok) return;
    expect(first.bank.fingerprint).toBe(plain.bank.fingerprint);
    expect(second.status).toBe('unchanged');
  });

  it('records the key on a bank already held when the same bank arrives private', async () => {
    await addBankFromText(validBankText, upload);
    const { kid } = await storeBankKey(key);

    const result = await addBankFromText(await encrypted(), upload);
    expect(result).toMatchObject({ ok: true, status: 'unchanged', bank: { kid } });
    expect((await listBanks())[0]?.kid).toBe(kid);
  });

  it('keeps the key on a private bank when its plaintext is uploaded again', async () => {
    const { kid } = await storeBankKey(key);
    await addBankFromText(await encrypted(), upload);

    await addBankFromText(validBankText, upload);
    expect((await listBanks())[0]?.kid).toBe(kid);
  });

  it('asks for the link when no stored key matches', async () => {
    const result = await addBankFromText(await encrypted(), upload);
    expect(result).toEqual({ ok: false, reason: 'no-key' });
    expect(await listBanks()).toHaveLength(0);
  });

  it('refuses a file that fails to decrypt, storing nothing', async () => {
    await storeBankKey(key);
    const document = JSON.parse(await encrypted()) as { ciphertext: string };
    const flipped = document.ciphertext.startsWith('A') ? 'B' : 'A';
    const tampered = JSON.stringify({
      ...document,
      ciphertext: flipped + document.ciphertext.slice(1),
    });

    expect(await addBankFromText(tampered, upload)).toEqual({ ok: false, reason: 'undecryptable' });
    expect(await listBanks()).toHaveLength(0);
  });

  it('refuses a file when the key it is given belongs to a different bank', async () => {
    const otherKey = await storeBankKey(generateBankKey());
    const result = await addBankFromText(await encrypted(), upload, { key: otherKey });
    expect(result).toEqual({ ok: false, reason: 'undecryptable' });
  });

  it('reports the bank problems of one that decrypts but is not valid, marked as private', async () => {
    await storeBankKey(key);
    const result = await addBankFromText(await encryptBank('{"formatVersion": 1}', key), upload);
    expect(result).toMatchObject({ ok: false, reason: 'invalid', private: true });
    if (result.ok || result.reason !== 'invalid') return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(await listBanks()).toHaveLength(0);
  });

  it('does not mark the problems of a plaintext bank as private', async () => {
    const result = await addBankFromText('{"formatVersion": 1}', upload);
    expect(result).toMatchObject({ ok: false, reason: 'invalid', private: false });
  });
});

describe('storeBankKey', () => {
  it('holds the key under its thumbprint, where no script can read it back', async () => {
    const key = generateBankKey();
    const stored = await storeBankKey(key);
    expect(stored.kid).toBe(await bankKeyId(key));

    const held = await db.bankKeys.get(stored.kid);
    expect(held?.key.extractable).toBe(false);
  });
});
