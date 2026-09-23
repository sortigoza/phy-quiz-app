import { describe, expect, it, vi } from 'vitest';
import { fetchBankText, fetchFailureMessage, rawUrlFor, type FetchFailure } from './bank-url';

/**
 * Fetching a bank from a URL. The failure path is most of the job: every way a
 * link can fail must come back as a reason the person can act on.
 */

type Fetch = typeof fetch;

function respond(body: string, init: ResponseInit = {}): Fetch {
  return vi.fn<Fetch>(() => Promise.resolve(new Response(body, init)));
}

function failWith(error: Error): Fetch {
  return vi.fn<Fetch>(() => Promise.reject(error));
}

async function failureOf(url: string, fetchImpl: Fetch, online = true): Promise<FetchFailure> {
  const result = await fetchBankText(url, { fetch: fetchImpl, online: () => online });
  if (result.ok) throw new Error('Expected the fetch to fail');
  return result.failure;
}

describe('rawUrlFor', () => {
  it('turns a GitHub file page into its raw file, which allows cross-origin reads', () => {
    expect(
      rawUrlFor('https://github.com/sortigoza/phy-quiz-app/blob/main/examples/kinematics.json'),
    ).toBe(
      'https://raw.githubusercontent.com/sortigoza/phy-quiz-app/main/examples/kinematics.json',
    );
  });

  it('handles the /raw/ form of a GitHub link too, and keeps nested paths', () => {
    expect(rawUrlFor('https://github.com/a/b/raw/v1.0.0/banks/mechanics/x.json')).toBe(
      'https://raw.githubusercontent.com/a/b/v1.0.0/banks/mechanics/x.json',
    );
  });

  it('turns a GitHub link written with www into its raw file too', () => {
    expect(rawUrlFor('https://www.github.com/a/b/blob/main/x.json')).toBe(
      'https://raw.githubusercontent.com/a/b/main/x.json',
    );
  });

  it('turns a gist page into its raw file', () => {
    expect(rawUrlFor('https://gist.github.com/a-teacher/0123abcd')).toBe(
      'https://gist.githubusercontent.com/a-teacher/0123abcd/raw',
    );
  });

  it('leaves every other URL as it was', () => {
    for (const url of [
      'https://raw.githubusercontent.com/a/b/main/x.json',
      'https://example.org/github.com/a/b/blob/main/x.json',
      'https://github.com/a/b',
    ]) {
      expect(rawUrlFor(url)).toBe(url);
    }
  });
});

describe('fetchBankText', () => {
  it('returns the body and the URL it was read from', async () => {
    const fetchImpl = respond('{"formatVersion": 1}', { status: 200 });
    const result = await fetchBankText('  https://github.com/a/b/blob/main/x.json ', {
      fetch: fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      text: '{"formatVersion": 1}',
      url: 'https://raw.githubusercontent.com/a/b/main/x.json',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/a/b/main/x.json',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('rejects something that is not a web address before fetching', async () => {
    const fetchImpl = respond('');
    expect(await failureOf('kinematics.json', fetchImpl)).toEqual({ kind: 'not-a-url' });
    expect(await failureOf('file:///home/me/bank.json', fetchImpl)).toEqual({ kind: 'not-a-url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses plain http from a secure page, which the browser would block anyway', async () => {
    const result = await fetchBankText('http://example.org/bank.json', {
      fetch: respond(''),
      pageProtocol: 'https:',
    });
    expect(result).toEqual({ ok: false, failure: { kind: 'insecure' } });
  });

  it('reads an opaque network failure while online as a likely cross-origin refusal', async () => {
    expect(
      await failureOf('https://example.org/b.json', failWith(new TypeError('Failed to fetch'))),
    ).toEqual({
      kind: 'blocked',
    });
  });

  it('reads the same failure while offline as being offline', async () => {
    expect(
      await failureOf(
        'https://example.org/b.json',
        failWith(new TypeError('Failed to fetch')),
        false,
      ),
    ).toEqual({ kind: 'offline' });
  });

  it('reports a timeout as its own failure', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    expect(await failureOf('https://example.org/b.json', failWith(timeout))).toEqual({
      kind: 'timeout',
    });
  });

  it('distinguishes not found from other HTTP errors', async () => {
    expect(await failureOf('https://example.org/b.json', respond('', { status: 404 }))).toEqual({
      kind: 'not-found',
    });
    expect(await failureOf('https://example.org/b.json', respond('', { status: 503 }))).toEqual({
      kind: 'http',
      status: 503,
    });
  });

  it('recognises a web page where a bank file was expected', async () => {
    const page = respond('<!DOCTYPE html><html><body>Hi</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    expect(await failureOf('https://example.org/b.json', page)).toEqual({ kind: 'web-page' });

    const unlabelled = respond('\n  <html><body>Hi</body></html>', { status: 200 });
    expect(await failureOf('https://example.org/b.json', unlabelled)).toEqual({ kind: 'web-page' });
  });

  it('accepts a bank file even when the server mislabels it as HTML', async () => {
    const mislabelled = respond('{"formatVersion": 1}', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    const result = await fetchBankText('https://example.org/b.json', { fetch: mislabelled });
    expect(result.ok).toBe(true);
  });

  it('refuses a file far larger than any bank', async () => {
    const huge = respond('x', { status: 200, headers: { 'Content-Length': String(50_000_000) } });
    expect(await failureOf('https://example.org/b.json', huge)).toEqual({ kind: 'too-large' });
  });
});

describe('fetchFailureMessage', () => {
  it('names cross-origin restrictions and both ways round them', () => {
    expect(fetchFailureMessage({ kind: 'blocked' })).toBe(
      'Could not load that URL. The server may not allow cross-origin requests. Try a raw GitHub or GitHub Pages link, or download the file and use Upload.',
    );
  });

  it('gives every failure its own message', () => {
    const failures: FetchFailure[] = [
      { kind: 'not-a-url' },
      { kind: 'insecure' },
      { kind: 'blocked' },
      { kind: 'offline' },
      { kind: 'timeout' },
      { kind: 'not-found' },
      { kind: 'http', status: 503 },
      { kind: 'web-page' },
      { kind: 'too-large' },
    ];
    const messages = failures.map(fetchFailureMessage);
    expect(new Set(messages).size).toBe(failures.length);
    expect(fetchFailureMessage({ kind: 'http', status: 503 })).toContain('503');
    expect(fetchFailureMessage({ kind: 'web-page' })).toMatch(/raw/i);
  });
});
