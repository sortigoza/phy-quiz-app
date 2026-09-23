import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Library } from './Library';
import { encryptBank, generateBankKey } from '../domain/private-bank';
import { db } from '../storage/db';

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

async function loadUrl(url: string): Promise<void> {
  const user = userEvent.setup();
  const field = screen.getByLabelText(/bank url/i);
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
});
