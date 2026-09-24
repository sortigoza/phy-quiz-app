import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Library } from './Library';
import { encodeBankKey, encryptBank, generateBankKey } from '../domain/private-bank';
import { db } from '../storage/db';
import { addBankFromText } from '../library';

function bankText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
    ...overrides,
  });
}

function bankFile(overrides: Record<string, unknown> = {}, filename = 'kinematics.json'): File {
  return new File([bankText(overrides)], filename, { type: 'application/json' });
}

function rawFile(contents: string, filename = 'broken.json'): File {
  return new File([contents], filename, { type: 'application/json' });
}

async function uploadFile(file: File): Promise<void> {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText(/bank file/i), file);
}

/** The list of banks, as distinct from the list of validation problems. */
function bankList(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: /question banks/i });
}

/** Bank cards only, ignoring the list items used to report validation problems. */
function bankCards(): HTMLElement[] {
  return screen
    .queryAllByRole('listitem')
    .filter((element) => element.closest('[aria-label="Question banks"]') !== null);
}

/** Makes every fetch answer with the given response, or fail with the given error. */
function stubFetch(outcome: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Answers each URL from a table; anything missing is a 404. */
function serveFiles(files: Record<string, string>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const body = files[input instanceof Request ? input.url : input.toString()];
      return Promise.resolve(
        body === undefined ? new Response('', { status: 404 }) : new Response(body),
      );
    }),
  );
}

function repositoryText(urls: string[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    title: 'Mechanics, autumn term',
    banks: urls.map((url) => ({ url })),
    ...overrides,
  });
}

async function loadUrl(url: string): Promise<void> {
  const user = userEvent.setup();
  const field = screen.getByLabelText(/repository url/i);
  await user.clear(field);
  await user.type(field, url);
  await user.click(screen.getByRole('button', { name: /load from url/i }));
}

beforeEach(async () => {
  await db.banks.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Library', () => {
  it('says the library is empty before anything is loaded', async () => {
    render(<Library onStart={() => {}} onResume={() => {}} />);
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });

  it('shows an uploaded bank, with what a teacher needs to recognise it', async () => {
    render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(bankFile());

    const item = within(await bankList()).getByRole('listitem');
    expect(within(item).getByText(/kinematics in one dimension/i)).toBeInTheDocument();
    expect(within(item).getByText(/A\. Teacher/)).toBeInTheDocument();
    expect(within(item).getByText(/1 question/i)).toBeInTheDocument();
    expect(within(item).getByText(/1\.0\.0/)).toBeInTheDocument();
  });

  it('shows banks already held when it opens, so they survive a reload', async () => {
    const { unmount } = render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(bankFile());
    await bankList();
    unmount();

    render(<Library onStart={() => {}} onResume={() => {}} />);
    expect(await screen.findByText(/kinematics in one dimension/i)).toBeInTheDocument();
  });

  it('lists the reasons a bank was rejected, and adds nothing', async () => {
    render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(bankFile({ questions: [] }, 'empty.json'));

    const problems = await screen.findByRole('alert');
    expect(problems).toHaveTextContent(/empty\.json/);
    expect(problems).toHaveTextContent(/questions/);
    expect(bankCards()).toHaveLength(0);
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });

  it('explains a file that is not JSON at all', async () => {
    render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(rawFile('{ not json'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);
  });

  it('clears an earlier rejection once a good bank loads', async () => {
    render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(rawFile('{ not json'));
    await screen.findByRole('alert');

    await uploadFile(bankFile());
    await bankList();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the same bank is loaded twice', async () => {
    render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(bankFile());
    await bankList();

    await uploadFile(bankFile());
    expect(await screen.findByRole('status')).toHaveTextContent(/already in your library/i);
    expect(bankCards()).toHaveLength(1);
  });

  it('removes a bank on request', async () => {
    const user = userEvent.setup();
    render(<Library onStart={() => {}} onResume={() => {}} />);
    await uploadFile(bankFile());
    await bankList();

    await user.click(screen.getByRole('button', { name: /remove kinematics in one dimension/i }));

    await waitFor(() => expect(bankCards()).toHaveLength(0));
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });

  describe('when a bank changed without a version bump', () => {
    async function uploadEdited(): Promise<void> {
      await uploadFile(bankFile());
      await bankList();
      await uploadFile(bankFile({ title: 'Kinematics, revised' }));
    }

    it('warns and asks before replacing, changing nothing yet', async () => {
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadEdited();

      const warning = await screen.findByRole('alert');
      expect(warning).toHaveTextContent(/changed without a version bump/i);
      expect(within(warning).getByRole('button', { name: /replace/i })).toBeInTheDocument();
      expect(within(await bankList()).getByText('Kinematics in one dimension')).toBeInTheDocument();
    });

    it('replaces the held bank on confirmation', async () => {
      const user = userEvent.setup();
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadEdited();

      await user.click(await screen.findByRole('button', { name: /replace/i }));
      expect(await screen.findByRole('status')).toHaveTextContent(/replaced/i);
      expect(await within(await bankList()).findByText('Kinematics, revised')).toBeInTheDocument();
      expect(bankCards()).toHaveLength(1);
    });

    it('keeps the held bank when told to', async () => {
      const user = userEvent.setup();
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadEdited();

      await user.click(await screen.findByRole('button', { name: /keep/i }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(within(await bankList()).getByText('Kinematics in one dimension')).toBeInTheDocument();
    });
  });

  describe('loading from a URL', () => {
    const githubPage = 'https://github.com/a-teacher/banks/blob/main/kinematics.json';
    const githubRaw = 'https://raw.githubusercontent.com/a-teacher/banks/main/kinematics.json';

    it('loads a bank from a GitHub link into the library, reading the raw file', async () => {
      const fetchMock = stubFetch(new Response(bankText(), { status: 200 }));
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(githubPage);

      expect(await screen.findByRole('status')).toHaveTextContent(/added kinematics/i);
      await bankList();
      expect(bankCards()).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith(githubRaw, expect.anything());
      expect((await db.banks.toArray())[0]?.source).toEqual({ kind: 'url', url: githubRaw });
    });

    it('explains a cross-origin refusal and both ways round it', async () => {
      stubFetch(new TypeError('Failed to fetch'));
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl('https://intranet.example.edu/bank.json');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/may not allow cross-origin requests/i);
      expect(alert).toHaveTextContent(/raw GitHub/i);
      expect(alert).toHaveTextContent(/use Upload/i);
      expect(bankCards()).toHaveLength(0);
    });

    it('says when nothing is at the address', async () => {
      stubFetch(new Response('Not found', { status: 404 }));
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(githubRaw);
      expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was found/i);
    });

    it('says when the file is not JSON, and when it is an invalid bank, differently', async () => {
      stubFetch(new Response('{ not json', { status: 200 }));
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(githubRaw);
      expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);

      stubFetch(new Response(bankText({ questions: [] }), { status: 200 }));
      await loadUrl(githubRaw);
      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(alert).toHaveTextContent(/questions/));
      expect(alert).not.toHaveTextContent(/not valid json/i);
    });

    it('says so when the bank at the URL is already held, and adds nothing', async () => {
      stubFetch(new Response(bankText(), { status: 200 }));
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadFile(bankFile());
      await bankList();

      await loadUrl(githubRaw);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/already in your library/i),
      );
      expect(bankCards()).toHaveLength(1);
    });
  });

  describe('private banks', () => {
    const fileUrl = 'https://a-teacher.github.io/banks/kinematics.bank.jwe.json';

    function encryptedFile(jwe: string): File {
      // Named nothing like a private bank: it is recognised by content.
      return rawFile(jwe, 'download.json');
    }

    function linkTo(key: Uint8Array) {
      return { kind: 'bank-link', url: fileUrl, key } as const;
    }

    beforeEach(async () => {
      await db.bankKeys.clear();
    });

    it('opens a bank link into the library, with a lock badge, and says it is done', async () => {
      const key = generateBankKey();
      stubFetch(new Response(await encryptBank(bankText(), key)));
      const handled = vi.fn();
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={linkTo(key)}
          onBankLinkHandled={handled}
        />,
      );

      expect(screen.getByRole('status')).toHaveTextContent(/opening the bank from your link/i);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/added kinematics/i),
      );
      const card = within(await bankList()).getByRole('listitem');
      expect(within(card).getByText(/private/i)).toHaveTextContent('🔒');
      expect(handled).toHaveBeenCalled();
    });

    it('opens a private course from one link, showing what happened to each bank', async () => {
      const courseKey = generateBankKey();
      const bankKey = generateBankKey();
      const courseUrl = 'https://a-teacher.github.io/banks/course.jwe.json';
      serveFiles({
        [courseUrl]: await encryptBank(
          repositoryText(['kinematics.bank.jwe.json', 'intro.json'], {
            banks: [
              { url: 'kinematics.bank.jwe.json', key: encodeBankKey(bankKey) },
              { url: 'intro.json' },
            ],
          }),
          courseKey,
        ),
        [fileUrl]: await encryptBank(bankText(), bankKey),
        'https://a-teacher.github.io/banks/intro.json': bankText({
          id: 'kth.intro',
          title: 'Intro',
        }),
      });
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={{ kind: 'bank-link', url: courseUrl, key: courseKey }}
        />,
      );

      const report = await screen.findByRole('region', { name: /mechanics, autumn term/i });
      expect(report).toHaveTextContent(/🔒/);
      expect(report).toHaveTextContent(/2 added/);
      await waitFor(() => expect(bankCards()).toHaveLength(2));
    });

    it('refuses a course list with its keys in plain text, and says they are now public', async () => {
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadFile(
        rawFile(
          repositoryText([], { banks: [{ url: 'a.json', key: encodeBankKey(generateBankKey()) }] }),
          'course.json',
        ),
      );
      const problems = await screen.findByRole('alert');
      expect(problems).toHaveTextContent(/not a valid bank repository/i);
      expect(problems).toHaveTextContent(/now public/i);
    });

    it('shows no lock on a plaintext bank', async () => {
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadFile(bankFile());
      const card = within(await bankList()).getByRole('listitem');
      expect(within(card).queryByText(/private/i)).not.toBeInTheDocument();
    });

    it('says what went wrong when the link’s file cannot be fetched, then opens an uploaded copy', async () => {
      const key = generateBankKey();
      stubFetch(new TypeError('Failed to fetch'));
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={linkTo(key)}
          onBankLinkHandled={() => {}}
        />,
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(/cross-origin/i);

      await uploadFile(encryptedFile(await encryptBank(bankText(), key)));
      expect(await screen.findByRole('status')).toHaveTextContent(/added kinematics/i);
      expect(bankCards()).toHaveLength(1);
    });

    it('asks for the link when an uploaded private bank has no stored key', async () => {
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadFile(encryptedFile(await encryptBank(bankText(), generateBankKey())));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This is a private bank. Open the link your teacher sent to unlock it.',
      );
      expect(bankCards()).toHaveLength(0);
    });

    it('says a file that fails to decrypt is damaged or has the wrong key', async () => {
      stubFetch(new Response(await encryptBank(bankText(), generateBankKey())));
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={linkTo(generateBankKey())}
          onBankLinkHandled={() => {}}
        />,
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/damaged or was changed/i);
      expect(alert).toHaveTextContent(/different bank/i);
    });

    it('introduces the problems of a private bank that opened but is invalid', async () => {
      const key = generateBankKey();
      stubFetch(new Response(await encryptBank(bankText({ questions: [] }), key)));
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={linkTo(key)}
          onBankLinkHandled={() => {}}
        />,
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/this private bank opened, but it is not a valid bank:/i);
      expect(alert).toHaveTextContent(/questions/);
    });

    it('opens a bank link pasted into the URL field, and clears the key from the field', async () => {
      const key = generateBankKey();
      const fetchMock = stubFetch(new Response(await encryptBank(bankText(), key)));
      render(<Library onStart={() => {}} onResume={() => {}} />);

      await loadUrl(
        `https://sortigoza.github.io/phy-quiz-app/#bank=${encodeURIComponent(fileUrl)}&key=${encodeBankKey(key)}`,
      );

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/added kinematics/i),
      );
      // The file the link points at, never the app's own page.
      expect(fetchMock).toHaveBeenCalledWith(fileUrl, expect.anything());
      expect(screen.getByLabelText(/repository url/i)).toHaveValue('');
    });

    it('says a truncated bank link pasted into the URL field is incomplete', async () => {
      const fetchMock = stubFetch(new Response('<html></html>'));
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(
        `https://sortigoza.github.io/phy-quiz-app/#bank=${encodeURIComponent(fileUrl)}&key=abc`,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(/link is incomplete/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says a truncated bank link is incomplete', async () => {
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={{ kind: 'broken' }}
          onBankLinkHandled={() => {}}
        />,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(/link is incomplete/i);
    });

    it('opens a later edition from the stored key alone, without the link', async () => {
      const key = generateBankKey();
      stubFetch(new Response(await encryptBank(bankText(), key)));
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={linkTo(key)}
          onBankLinkHandled={() => {}}
        />,
      );
      await screen.findByText(/added kinematics/i);

      stubFetch(new Response(await encryptBank(bankText({ version: '1.1.0' }), key)));
      await loadUrl(fileUrl);
      await waitFor(() => expect(bankCards()).toHaveLength(2));
    });

    it('forgets the key once its last bank is removed', async () => {
      const user = userEvent.setup();
      const key = generateBankKey();
      stubFetch(new Response(await encryptBank(bankText(), key)));
      render(
        <Library
          onStart={() => {}}
          onResume={() => {}}
          bankLink={linkTo(key)}
          onBankLinkHandled={() => {}}
        />,
      );
      await bankList();
      expect(await db.bankKeys.count()).toBe(1);

      await user.click(screen.getByRole('button', { name: /remove kinematics in one dimension/i }));
      await waitFor(() => expect(bankCards()).toHaveLength(0));
      expect(await db.bankKeys.count()).toBe(0);
    });
  });

  describe('bank repositories', () => {
    const base = 'https://raw.githubusercontent.com/t/banks/main/';

    it('keeps upload beside Load from URL, so both ways in sit together', () => {
      render(<Library onStart={() => {}} onResume={() => {}} />);
      const load = screen.getByRole('button', { name: /load from url/i });
      expect(load.parentElement).toContainElement(screen.getByText(/upload a bank file/i));
      expect(screen.getByLabelText(/bank file/i)).toHaveAttribute(
        'accept',
        '.json,application/json',
      );
    });

    it('loads every bank a repository lists, and reports each one', async () => {
      await addBankFromText(bankText({ id: 'kth.held', title: 'Held already' }), {
        kind: 'upload',
        filename: 'held.json',
      });
      serveFiles({
        [`${base}index.json`]: repositoryText(['a.json', 'held.json', 'missing.json']),
        [`${base}a.json`]: bankText({ id: 'kth.a', title: 'Forces' }),
        [`${base}held.json`]: bankText({ id: 'kth.held', title: 'Held already' }),
      });
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(`${base}index.json`);

      const report = await screen.findByRole('region', { name: /mechanics, autumn term/i });
      const lines = within(report).getAllByRole('listitem');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toHaveTextContent(/added forces/i);
      expect(lines[1]).toHaveTextContent(/already in your library/i);
      expect(lines[2]).toHaveTextContent(/missing\.json/);
      expect(lines[2]).toHaveTextContent(/404/);
      expect(report).toHaveTextContent(/1 added, 1 already held, 1 failed/i);
      await waitFor(() => expect(bankCards()).toHaveLength(2));
    });

    it('offers to replace a listed bank that changed without a version bump', async () => {
      await addBankFromText(bankText(), { kind: 'upload', filename: 'k.json' });
      serveFiles({
        [`${base}index.json`]: repositoryText(['k.json']),
        [`${base}k.json`]: bankText({ title: 'Kinematics, edited' }),
      });
      const user = userEvent.setup();
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(`${base}index.json`);

      const report = await screen.findByRole('region', { name: /mechanics/i });
      expect(report).toHaveTextContent(/changed without a version bump/i);
      await user.click(within(report).getByRole('button', { name: /replace/i }));

      await waitFor(() => expect(report).toHaveTextContent(/replaced kinematics, edited/i));
      expect(within(await bankList()).getByText(/kinematics, edited/i)).toBeInTheDocument();
    });

    it('rejects an invalid repository whole, fetching none of its banks', async () => {
      serveFiles({ [`${base}index.json`]: repositoryText(['a.json'], { titel: 'typo' }) });
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(`${base}index.json`);

      const problems = await screen.findByRole('alert');
      expect(problems).toHaveTextContent(/not a valid bank repository/i);
      expect(problems).toHaveTextContent(/titel/);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('loads the absolute entries of an uploaded repository, and explains the relative ones', async () => {
      serveFiles({ 'https://x.org/a.json': bankText({ id: 'kth.a', title: 'Forces' }) });
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await uploadFile(rawFile(repositoryText(['https://x.org/a.json', 'b.json']), 'index.json'));

      const report = await screen.findByRole('region', { name: /mechanics/i });
      const lines = within(report).getAllByRole('listitem');
      expect(lines[0]).toHaveTextContent(/added forces/i);
      expect(lines[1]).toHaveTextContent(/relative/i);
    });

    it('reads the entries of a repository pasted as a GitHub file page from the raw host', async () => {
      serveFiles({
        [`${base}index.json`]: repositoryText(['a.json']),
        [`${base}a.json`]: bankText({ id: 'kth.a', title: 'Forces' }),
      });
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl('https://github.com/t/banks/blob/main/index.json');

      const report = await screen.findByRole('region', { name: /mechanics/i });
      expect(report).toHaveTextContent(/added forces/i);
    });

    it('refuses a repository listed inside a repository', async () => {
      serveFiles({
        [`${base}index.json`]: repositoryText(['more.json']),
        [`${base}more.json`]: repositoryText(['a.json']),
      });
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(`${base}index.json`);

      const report = await screen.findByRole('region', { name: /mechanics/i });
      expect(report).toHaveTextContent(/not followed/i);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('holds off other loads until a repository has finished, and clears its report on remove', async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = input instanceof Request ? input.url : input.toString();
          if (url === `${base}index.json`) return new Response(repositoryText(['a.json']));
          await gate;
          return new Response(bankText({ id: 'kth.a', title: 'Forces' }));
        }),
      );
      const user = userEvent.setup();
      render(<Library onStart={() => {}} onResume={() => {}} />);
      await loadUrl(`${base}index.json`);

      expect(await screen.findByText(/loading 0 of 1/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
      expect(screen.getByLabelText(/bank file/i)).toBeDisabled();

      release();
      await screen.findByRole('region', { name: /mechanics/i });
      expect(screen.getByRole('button', { name: /load from url/i })).toBeEnabled();

      await user.click(await screen.findByRole('button', { name: /remove forces/i }));
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: /mechanics/i })).not.toBeInTheDocument(),
      );
    });
  });
});
