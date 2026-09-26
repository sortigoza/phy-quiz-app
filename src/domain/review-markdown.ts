import { SELF_GRADES, type Attempt, type AttemptAnswer, type AttemptMode } from './attempt';
import type { BankOption, BankQuestion } from './bank';
import {
  calibrationLine,
  confidenceLabel,
  confidenceRecorded,
  confidentErrors,
} from './confidence';
import { formatDuration } from './duration';
import type { AttemptReview } from './review';
import { outcome, percentage, type Outcome } from './scoring';
import { answeredFirst, asksSelfGrade, selfGradeLabel, selfGradeTally } from './self-grade';
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

const outcomeLabel: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  unanswered: 'Not answered',
};

const modeLabel: Record<AttemptMode, string> = {
  standard: 'Standard',
  'answer-first': 'Answer first',
};

/** The review of an attempt as Markdown, questions in attempt order, ending in a newline. */
export function reviewMarkdown(attempt: Attempt, review: AttemptReview): string {
  const blocks = [`# Review: ${attempt.bankTitle}`, header(attempt), editionNote(attempt, review)];

  if (review.edition === 'none') {
    attempt.answers.forEach((answer, index) => {
      blocks.push(
        ...unshownQuestion(
          index,
          answer,
          'Question not shown: its bank is not in the library.',
          'unavailable',
        ),
      );
    });
  } else {
    review.questions.forEach((reviewed, index) => {
      blocks.push(
        ...(reviewed.kind === 'question'
          ? shownQuestion(index, reviewed.question, reviewed.options, reviewed.answer)
          : unshownQuestion(
              index,
              reviewed.answer,
              'Archived question: this edition of the bank no longer has it as it was answered.',
              'archived',
            )),
      );
    });
  }

  blocks.push(...summary(attempt));
  return `${blocks.filter((block) => block !== '').join('\n\n')}\n`;
}

function header(attempt: Attempt): string {
  const score = `${attempt.correctCount} of ${attempt.questionCount} correct (${percentage(attempt.correctCount, attempt.questionCount)}%)`;
  return list([
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
    attempt.mode && ['Mode', modeLabel[attempt.mode]],
    attempt.tagFilter && ['Tag filter', tagFilterText(attempt.tagFilter)],
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
    list([['Tags', tags], confidenceItem(answer)]),
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
function unshownQuestion(
  index: number,
  answer: AttemptAnswer,
  reason: string,
  label: 'archived' | 'unavailable',
): string[] {
  const chosen =
    answer.chosenOptionId === null ? '' : ` The chosen option was \`${answer.chosenOptionId}\`.`;
  const heading = `## Question ${index + 1}: ${outcomeLabel[outcome(answer)]}`;
  return [
    label === 'archived' ? `${heading} (archived)` : heading,
    list([confidenceItem(answer)]),
    `${reason}${chosen} The correct option was \`${answer.correctOptionId}\`.`,
    ...responseBlocks(answer),
  ];
}

function confidenceItem(answer: AttemptAnswer): ListItem {
  return answer.confidence && ['Confidence', confidenceLabel[answer.confidence]];
}

/** "1. text **(correct, chosen)**", continuation lines indented to stay in the item. */
function optionItem(option: BankOption, position: number, answer: AttemptAnswer): string {
  const marks = [
    option.id === answer.correctOptionId && 'correct',
    option.id === answer.chosenOptionId && 'chosen',
  ].filter(Boolean);
  const marked = marks.length > 0 ? `${option.text} **(${marks.join(', ')})**` : option.text;
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
function summary(attempt: Attempt): string[] {
  const items: ListItem[] = [];
  if (confidenceRecorded(attempt.answers)) {
    const errors = confidentErrors(attempt.answers).map(
      (error) => attempt.answers.indexOf(error) + 1,
    );
    items.push(['Calibration', calibrationLine(attempt.answers)]);
    items.push([
      'Confident errors',
      errors.length === 0
        ? 'none'
        : `${errors.length === 1 ? 'Question' : 'Questions'} ${errors.join(', ')}`,
    ]);
  }
  if (attempt.mode === 'answer-first' || attempt.answers.some(answeredFirst)) {
    items.push(['Self-grade', selfGradeText(attempt.answers)]);
  }
  return items.length === 0 ? [] : ['## Summary', list(items)];
}

function selfGradeText(answers: readonly AttemptAnswer[]): string {
  if (!answers.some(asksSelfGrade)) return 'no responses written';
  const tally = selfGradeTally(answers);
  const counts = SELF_GRADES.map((grade) => `${selfGradeLabel[grade]} ${tally[grade]}`);
  if (tally.ungraded > 0) counts.push(`${tally.ungraded} not graded`);
  return counts.join(' · ');
}

/** A bold-labelled bullet, or a falsy value for one the attempt did not record. */
type ListItem = readonly [label: string, value: string] | undefined | false | '';

function list(items: readonly ListItem[]): string {
  return items
    .filter((item) => !!item)
    .map(([label, value]) => `- **${label}:** ${value}`)
    .join('\n');
}
