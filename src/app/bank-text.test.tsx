import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { db } from '../storage/db';

/**
 * Bank text as it appears in the app: maths and Markdown rendered on every
 * screen that shows it, in the bank's language, and never a way in for a
 * hostile bank.
 */

const injection =
  '<script>window.__pwned = true</script><img src=x onerror="window.__pwned = true">';

const fixture = {
  formatVersion: 1,
  id: 'test.rendering',
  version: '1.0.0',
  title: 'Rendering',
  description: 'Energy, *mostly*: $E = mc^2$.',
  language: 'sv',
  questions: [
    {
      id: 'kinetic',
      prompt: [
        'Which expression gives kinetic energy?',
        '',
        '| Quantity | Symbol |',
        '| --- | --- |',
        '| mass | $m$ |',
        '| speed | $v$ |',
        '',
        injection,
      ].join('\n'),
      options: [
        { id: 'a', text: '$\\frac{1}{2}mv^2$' },
        { id: 'b', text: '$mv$', why: 'That is **momentum**, $p = mv$.' },
        { id: 'c', text: 'Broken $\\frac{1}{$ formula' },
      ],
      answer: 'a',
      explanation: `Integrate $F\\,dx$ from rest:\n\n$$E_k = \\tfrac{1}{2}mv^2$$\n\n${injection}`,
    },
  ],
};

async function loadAndStart(user: UserEvent): Promise<void> {
  render(<App />);
  await user.upload(
    screen.getByLabelText(/bank file/i),
    new File([JSON.stringify(fixture)], 'rendering.json', { type: 'application/json' }),
  );
  await user.click(await screen.findByRole('button', { name: /start rendering/i }));
  await screen.findByRole('heading', { name: /rendering/i });
}

async function takeQuizUntilQuestion(user: UserEvent): Promise<void> {
  await loadAndStart(user);
  await user.type(screen.getByLabelText(/your name/i), 'Anna');
  await user.click(screen.getByRole('button', { name: /begin/i }));
  await screen.findByText(/question 1 of 1/i);
}

async function takeQuiz(user: UserEvent, chosen: RegExp): Promise<void> {
  await takeQuizUntilQuestion(user);
  await user.click(screen.getByRole('radio', { name: chosen }));
  await user.click(screen.getByRole('button', { name: /submit/i }));
  await screen.findByRole('heading', { name: /review/i });
}

function expectNothingInjected(): void {
  expect(document.querySelector('main script, main img, main [onerror]')).toBeNull();
  expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('bank text', () => {
  it('renders the bank description with its maths on the start screen, in the bank language', async () => {
    await loadAndStart(userEvent.setup());
    const description = screen.getByText(/Energy,/).closest('[lang]');
    expect(description).toHaveAttribute('lang', 'sv');
    expect(description?.querySelector('em')).toHaveTextContent('mostly');
    expect(description?.querySelector('.katex')).not.toBeNull();
  });

  it('renders the prompt table and option maths during the attempt, safely', async () => {
    const user = userEvent.setup();
    await takeQuizUntilQuestion(user);

    const group = screen.getByRole('group', { name: /kinetic energy/i });
    expect(within(group).getByRole('table')).toBeInTheDocument();
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(group.querySelectorAll('label .katex').length).toBeGreaterThanOrEqual(2);

    const prompt = within(group)
      .getByText(/which expression/i)
      .closest('[lang]');
    expect(prompt).toHaveAttribute('lang', 'sv');
    // The injection is shown to the participant as text, not run.
    expect(prompt).toHaveTextContent('<script>');
    expectNothingInjected();
  });

  it('shows a malformed formula as marked source without losing the question', async () => {
    await takeQuizUntilQuestion(userEvent.setup());
    const broken = screen.getByRole('radio', { name: /broken/i }).closest('label');
    expect(broken?.querySelector('.math-error')).toHaveTextContent('$\\frac{1}{$');
    expect(screen.getByRole('group', { name: /kinetic energy/i })).toBeInTheDocument();
  });

  it('renders maths and Markdown in the review, explanation and distractor note included', async () => {
    // The MathML of $mv$ reads "m v"; jsdom also appends the TeX annotation.
    await takeQuiz(userEvent.setup(), /^m v\b/);

    const reviewed = screen.getByRole('article', { name: /kinetic energy/i });
    expect(within(reviewed).getByRole('table')).toBeInTheDocument();
    expect(reviewed.querySelector('.reviewed__why strong')).toHaveTextContent('momentum');
    expect(reviewed.querySelector('.reviewed__why .katex')).not.toBeNull();
    expect(reviewed.querySelector('.reviewed__explanation .katex-display')).not.toBeNull();
    for (const text of reviewed.querySelectorAll('.bank-text')) {
      expect(text).toHaveAttribute('lang', 'sv');
    }
    expectNothingInjected();
  });
});
