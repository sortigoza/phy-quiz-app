import type { Attempt, AttemptAnswer, AttemptMode } from './attempt';
import type { BankOption, BankQuestion } from './bank';
import {
  calibrationLine,
  confidenceLabel,
  confidenceRecorded,
  confidentErrorPositions,
} from './confidence';
import { formatDuration } from './duration';
import type { AttemptReview } from './review';
import { outcome, outcomeLabel, percentage } from './scoring';
import { answeredFirst, reportsSelfGrades, selfGradeCounts, selfGradeLabel } from './self-grade';
import type { TagFilter } from './tags';

/**
 * A review as self-contained Markdown, for the participant to paste into a note
 * or hand to an AI assistant that does not have the bank.
 *
 * The history file stays lean and never carries question text (SPEC §5); this
 * is where the text goes instead, on demand. Bank text is copied as its
 * source, so maths stays `$...$` and survives the paste. Only what the attempt
 * recorded is written: a field it never had is left out rather than guessed.
 */

const modeLabel: Record<AttemptMode, string> = {
  standard: 'Standard',
  'answer-first': 'Answer first',
};

/** Why a question's text is not in the copy. */
type Unshown = 'archived' | 'bank-not-held';

const unshownReason: Record<Unshown, string> = {
  archived: 'Archived question: this edition of the bank no longer has it as it was answered.',
  'bank-not-held': 'Question not shown: its bank is not in the library.',
};

/** The review of an attempt as Markdown, questions in attempt order, ending in a newline. */
export function reviewMarkdown(attempt: Attempt, review: AttemptReview): string {
  const questions =
    review.edition === 'none'
      ? attempt.answers.map((answer, index) => unshownQuestion(index, answer, 'bank-not-held'))
      : review.questions.map((reviewed, index) =>
          reviewed.kind === 'question'
            ? shownQuestion(index, reviewed.question, reviewed.options, reviewed.answer)
            : unshownQuestion(index, reviewed.answer, 'archived'),
        );
  const blocks = [
    `# Review: ${attempt.bankTitle}`,
    header(attempt),
    editionNote(attempt, review),
    ...questions.flat(),
    ...summary(attempt, review),
  ];
  return `${blocks.filter((block) => block !== '').join('\n\n')}\n`;
}

function header(attempt: Attempt): string {
  const score = `${attempt.correctCount} of ${attempt.questionCount} correct (${percentage(attempt.correctCount, attempt.questionCount)}%)`;
  return labelledList([
    ['Bank', `${attempt.bankTitle}, version ${attempt.bankVersion}`],
    ['Participant', attempt.name],
    ['Date', formatDate(attempt.submittedAt)],
    [
      'Score',
      attempt.origin === 'imported'
        ? `${score}, unverified: imported, not taken in this browser`
        : score,
    ],
    ['Duration', formatDuration(attempt.durationMs)],
    ['Attempt code', attempt.code],
    attempt.mode ? ['Mode', modeLabel[attempt.mode]] : null,
    attempt.tagFilter ? ['Tag filter', tagFilterText(attempt.tagFilter)] : null,
  ]);
}

/** In UTC, so the copy reads the same wherever it is pasted: "2026-09-23 10:03 UTC". */
function formatDate(iso: string): string {
  const utc = new Date(iso).toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
}

function tagFilterText(filter: TagFilter): string {
  return [...filter.tags, ...(filter.untagged ? ['untagged'] : [])].join(', ');
}

/** Which edition the questions come from, when it is not the one the attempt was taken on. */
function editionNote(attempt: Attempt, review: AttemptReview): string {
  if (review.edition === 'same') return '';
  if (review.edition === 'none') {
    return `${attempt.bankTitle} is not in the library, so only what the attempt recorded is shown.`;
  }
  if (review.mismatch) {
    return `The answers of this attempt do not match version ${review.version} of the bank in the library, though it names that edition. Questions are shown by id.`;
  }
  const shown =
    review.version === attempt.bankVersion
      ? `a changed copy of version ${review.version}`
      : `version ${review.version}`;
  const archived = review.questions.some((reviewed) => reviewed.kind === 'archived')
    ? ' Questions that edition cannot show as they were answered are marked archived.'
    : '';
  return `Questions are shown from ${shown} of the bank, as the edition this attempt was taken on is not in the library.${archived}`;
}

function shownQuestion(
  index: number,
  question: BankQuestion,
  options: readonly BankOption[],
  answer: AttemptAnswer,
): string[] {
  const result = outcome(answer);
  const tags = question.tags && question.tags.length > 0 ? question.tags.join(', ') : 'none';
  const chosenWrong =
    result === 'wrong' ? options.find((option) => option.id === answer.chosenOptionId) : undefined;
  return [
    `## Question ${index + 1}: ${outcomeLabel[result]}`,
    labelledList([['Tags', tags], confidenceItem(answer)]),
    question.prompt,
    '**Options:**',
    options.map((option, position) => optionItem(option, position, answer)).join('\n'),
    ...responseBlocks(answer),
    '**Explanation:**',
    question.explanation,
    ...(chosenWrong?.why ? ['**About the chosen option:**', chosenWrong.why] : []),
  ];
}

/** A question whose text cannot be shown: only what the attempt recorded for it. */
function unshownQuestion(index: number, answer: AttemptAnswer, why: Unshown): string[] {
  const chosen =
    answer.chosenOptionId === null ? '' : ` The chosen option was \`${answer.chosenOptionId}\`.`;
  const heading = `## Question ${index + 1}: ${outcomeLabel[outcome(answer)]}`;
  return [
    why === 'archived' ? `${heading} (archived)` : heading,
    labelledList([confidenceItem(answer)]),
    `${unshownReason[why]}${chosen} The correct option was \`${answer.correctOptionId}\`.`,
    ...responseBlocks(answer),
  ];
}

function confidenceItem(answer: AttemptAnswer): LabelledItem | null {
  return answer.confidence ? ['Confidence', confidenceLabel[answer.confidence]] : null;
}

/**
 * "1. **(correct, chosen)** text", continuation lines indented to stay in the
 * item. The marks go first so they cannot land inside maths that ends the text.
 */
function optionItem(option: BankOption, position: number, answer: AttemptAnswer): string {
  const marks = [
    option.id === answer.correctOptionId && 'correct',
    option.id === answer.chosenOptionId && 'chosen',
  ].filter(Boolean);
  const marked = marks.length > 0 ? `**(${marks.join(', ')})** ${option.text}` : option.text;
  const prefix = `${position + 1}. `;
  return prefix + marked.split('\n').join(`\n${' '.repeat(prefix.length)}`);
}

/** The response written or skipped in answer-first mode, and its self-grade. */
function responseBlocks(answer: AttemptAnswer): string[] {
  if (!answeredFirst(answer)) return [];
  if (answer.response === undefined) return ['**Response:** skipped'];
  const quoted = answer.response
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
  const grade = answer.selfGrade ? selfGradeLabel[answer.selfGrade] : 'not graded';
  return ['**Response:**', quoted, `**Self-grade:** ${grade}`];
}

/** Calibration, confident errors and self-grade counts, each only when the attempt recorded them. */
function summary(attempt: Attempt, review: AttemptReview): string[] {
  const items: LabelledItem[] = [];
  if (confidenceRecorded(attempt.answers)) {
    const errors = confidentErrorPositions(attempt.answers);
    items.push(['Calibration', calibrationLine(attempt.answers)]);
    items.push([
      'Confident errors',
      errors.length === 0
        ? 'none'
        : `${errors.length === 1 ? 'Question' : 'Questions'} ${errors.join(', ')}`,
    ]);
  }
  if (reportsSelfGrades(attempt)) items.push(['Self-grade', selfGradeCounts(attempt, review)]);
  return items.length === 0 ? [] : ['## Across the attempt', labelledList(items)];
}

type LabelledItem = readonly [label: string, value: string];

/** "- **Label:** value" per item, leaving out the ones the attempt did not record. */
function labelledList(items: ReadonlyArray<LabelledItem | null>): string {
  return items
    .filter((item) => item !== null)
    .map(([label, value]) => `- **${label}:** ${value}`)
    .join('\n');
}
