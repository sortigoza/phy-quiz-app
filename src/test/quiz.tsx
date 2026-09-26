import { render, screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import type { AttemptMode, Confidence } from '../domain/attempt';

/**
 * Driving the attempt flow through the whole app, the way a participant uses it.
 *
 * The selection is shuffled, so the bank is written to make every question
 * recognisable by its prompt and every option recognisable by its text.
 */

export const prompts = {
  q1: 'What is the SI unit of force?',
  q2: 'What is the SI unit of energy?',
  q3: 'What is the SI unit of power?',
};

export function bankFile(overrides: Record<string, unknown> = {}): File {
  const question = (id: keyof typeof prompts, right: string) => ({
    id,
    prompt: prompts[id],
    options: [
      { id: 'a', text: `${right}, the right one` },
      { id: 'b', text: `Pascal, wrong for ${id}`, why: `Pascal is pressure, not what ${id} asks.` },
      { id: 'c', text: `Kelvin, wrong for ${id}` },
    ],
    answer: 'a',
    explanation: `The answer to ${id} is ${right}.`,
  });

  const bank = {
    formatVersion: 1,
    id: 'test.units',
    version: '1.0.0',
    title: 'SI units',
    questions: [question('q1', 'Newton'), question('q2', 'Joule'), question('q3', 'Watt')],
    ...overrides,
  };
  return new File([JSON.stringify(bank)], 'units.json', { type: 'application/json' });
}

export type Plan = Partial<Record<keyof typeof prompts, 'right' | 'wrong'>>;

/** Which question is on screen, by its prompt. */
export function currentQuestion(): keyof typeof prompts {
  const legend = screen.getByRole('group', { name: /SI unit/ });
  const entry = Object.entries(prompts).find(([, prompt]) => legend.textContent?.includes(prompt));
  if (!entry) throw new Error('No known question on screen');
  return entry[0] as keyof typeof prompts;
}

/** The confidence given with each answer. Missing means Sure; null means none is given. */
export type ConfidencePlan = Partial<Record<keyof typeof prompts, Confidence | null>>;

const confidenceLabel: Record<Confidence, string> = {
  sure: 'Sure',
  unsure: 'Unsure',
  guess: 'Guess',
};

/** The Sure / Unsure / Guess control of the question on screen. */
export function confidenceGroup(): HTMLElement {
  return screen.getByRole('group', { name: /how sure/i });
}

export async function chooseConfidence(user: UserEvent, confidence: Confidence): Promise<void> {
  await user.click(
    within(confidenceGroup()).getByRole('radio', { name: confidenceLabel[confidence] }),
  );
}

export async function answerCurrent(
  user: UserEvent,
  plan: Plan,
  confidence: ConfidencePlan = {},
): Promise<void> {
  const question = currentQuestion();
  const choice = plan[question];
  if (choice === undefined) return;
  await user.click(
    screen.getByRole('radio', { name: choice === 'right' ? /right one/ : /Pascal/ }),
  );
  const given = confidence[question] === undefined ? 'sure' : confidence[question];
  if (given !== null) await chooseConfidence(user, given);
}

export async function loadBankAndOpenStart(user: UserEvent, file = bankFile()): Promise<void> {
  render(<App />);
  await user.upload(screen.getByLabelText(/bank file/i), file);
  await user.click(await screen.findByRole('button', { name: /start SI units/i }));
  await screen.findByRole('heading', { name: /SI units/ });
}

export async function startQuiz(
  user: UserEvent,
  name = 'Anna',
  mode: AttemptMode = 'standard',
): Promise<void> {
  await loadBankAndOpenStart(user);
  const nameField = screen.getByLabelText(/your name/i);
  await user.clear(nameField);
  await user.type(nameField, name);
  await user.click(screen.getByRole('radio', { name: /all/i }));
  await user.click(
    screen.getByRole('radio', { name: mode === 'standard' ? /^standard/i : /^answer first/i }),
  );
  await user.click(screen.getByRole('button', { name: /begin/i }));
  // Beginning saves the name first, so the attempt screen arrives asynchronously.
  await screen.findByText(/question 1 of/i);
}

/** Answers every question according to the plan, then presses submit. */
export async function answerAllAndSubmit(
  user: UserEvent,
  plan: Plan,
  confidence: ConfidencePlan = {},
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await answerCurrent(user, plan, confidence);
    if (i < 2) await user.click(screen.getByRole('button', { name: /next/i }));
  }
  await user.click(screen.getByRole('button', { name: /submit/i }));
}

/** In answer-first mode, writes a response to the question on screen and reveals its options. */
export async function writeAndReveal(user: UserEvent, response: string): Promise<void> {
  await user.type(screen.getByRole('textbox', { name: /your answer or reasoning/i }), response);
  await user.click(screen.getByRole('button', { name: /reveal options/i }));
}
