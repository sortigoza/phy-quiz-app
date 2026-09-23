import { beforeEach, describe, expect, it } from 'vitest';
import { addBankFromText } from './library';
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
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(await listBanks()).toHaveLength(0);
  });

  it('reports malformed JSON without storing anything', async () => {
    const result = await addBankFromText('{ not json', upload);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toMatch(/not valid json/i);
    expect(await listBanks()).toHaveLength(0);
  });
});
