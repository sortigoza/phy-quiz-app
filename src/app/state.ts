import type { Attempt, Confidence } from '../domain/attempt';
import { bankLanguage, type Bank } from '../domain/bank';
import { reviewSelection, type AttemptReview } from '../domain/review';
import type { TagFilter } from '../domain/tags';
import type { HistoryFilter } from '../history';
import type { InProgressAttempt } from '../quiz';
import type { StoredBank } from '../storage/db';

/**
 * Which screen is showing, and the data it needs.
 *
 * There is no router: the app reads no URL but the share fragment and, once
 * on boot, a bank link (`main.tsx`), which is what lets one build run
 * unchanged at any subpath. Every transition is an
 * action here, so the flow can be read in one place.
 */
type WorkScreen =
  | { screen: 'library' }
  /** `tagFilter` presets the filter, when the tag breakdown opened the screen. */
  | { screen: 'start'; stored: StoredBank; bank: Bank; tagFilter?: TagFilter }
  | { screen: 'attempt'; inProgress: InProgressAttempt; index: number }
  | { screen: 'review'; attempt: Attempt; review: AttemptReview; back: ReviewBack }
  | HistoryScreen;

/** History keeps its filters while one of its attempts is reviewed. */
type HistoryScreen = { screen: 'history'; filter: HistoryFilter };

/** Where a review returns to: the library after submission, or the history it was opened from. */
export type ReviewBack = { screen: 'library' } | HistoryScreen;

/**
 * Help sits over whichever screen opened it and returns there on close, so
 * reading it mid-attempt loses nothing.
 */
export type AppState = WorkScreen | { screen: 'help'; back: WorkScreen };

export type AppAction =
  | { type: 'open-library' }
  | { type: 'open-history' }
  | { type: 'filter-history'; filter: HistoryFilter }
  | { type: 'open-review'; attempt: Attempt; review: AttemptReview }
  | { type: 'close-review' }
  | { type: 'open-start'; stored: StoredBank; bank: Bank; tagFilter?: TagFilter }
  | { type: 'begin'; inProgress: InProgressAttempt }
  | { type: 'resume'; inProgress: InProgressAttempt; index: number }
  /** `at` is when the option was chosen, ISO 8601, passed in to keep the reducer pure. */
  | { type: 'choose'; questionId: string; optionId: string; at: string }
  | { type: 'set-confidence'; questionId: string; confidence: Confidence }
  | { type: 'go-to'; index: number }
  | { type: 'submitted'; attempt: Attempt }
  | { type: 'open-help' }
  | { type: 'close-help' };

export const initialState: AppState = { screen: 'library' };

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'open-library':
      return { screen: 'library' };

    case 'open-history':
      return { screen: 'history', filter: {} };

    case 'filter-history':
      return state.screen === 'history' ? { ...state, filter: action.filter } : state;

    case 'open-review':
      if (state.screen !== 'history') return state;
      return { screen: 'review', attempt: action.attempt, review: action.review, back: state };

    case 'close-review':
      return state.screen === 'review' ? state.back : state;

    case 'open-start':
      return {
        screen: 'start',
        stored: action.stored,
        bank: action.bank,
        ...(action.tagFilter && { tagFilter: action.tagFilter }),
      };

    case 'begin':
      return { screen: 'attempt', inProgress: action.inProgress, index: 0 };

    case 'resume': {
      const last = action.inProgress.selection.length - 1;
      return {
        screen: 'attempt',
        inProgress: action.inProgress,
        index: Math.min(Math.max(action.index, 0), last),
      };
    }

    case 'choose':
      if (state.screen !== 'attempt') return state;
      return {
        ...state,
        inProgress: {
          ...state.inProgress,
          chosen: { ...state.inProgress.chosen, [action.questionId]: action.optionId },
          answeredAt: { ...state.inProgress.answeredAt, [action.questionId]: action.at },
        },
      };

    case 'set-confidence':
      if (state.screen !== 'attempt') return state;
      // Confidence belongs to a chosen option; an unanswered question has none.
      if (!(action.questionId in state.inProgress.chosen)) return state;
      return {
        ...state,
        inProgress: {
          ...state.inProgress,
          confidence: { ...state.inProgress.confidence, [action.questionId]: action.confidence },
        },
      };

    case 'go-to': {
      if (state.screen !== 'attempt') return state;
      const last = state.inProgress.selection.length - 1;
      return { ...state, index: Math.min(Math.max(action.index, 0), last) };
    }

    case 'open-help':
      return state.screen === 'help' ? state : { screen: 'help', back: state };

    case 'close-help':
      return state.screen === 'help' ? state.back : state;

    case 'submitted':
      if (state.screen !== 'attempt') return state;
      return {
        screen: 'review',
        attempt: action.attempt,
        review: {
          edition: 'same',
          language: bankLanguage(state.inProgress.bank),
          questions: reviewSelection(action.attempt, state.inProgress.selection),
        },
        back: { screen: 'library' },
      };
  }
}
