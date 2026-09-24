import type { Attempt } from '../domain/attempt';
import { bankLanguage, type Bank } from '../domain/bank';
import type { Selection } from '../domain/selection';
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
  | { screen: 'start'; stored: StoredBank; bank: Bank }
  | { screen: 'attempt'; inProgress: InProgressAttempt; index: number }
  | { screen: 'review'; attempt: Attempt; selection: Selection; language: string }
  | { screen: 'history' };

/**
 * Help sits over whichever screen opened it and returns there on close, so
 * reading it mid-attempt loses nothing.
 */
export type AppState = WorkScreen | { screen: 'help'; back: WorkScreen };

export type AppAction =
  | { type: 'open-library' }
  | { type: 'open-history' }
  | { type: 'open-start'; stored: StoredBank; bank: Bank }
  | { type: 'begin'; inProgress: InProgressAttempt }
  | { type: 'resume'; inProgress: InProgressAttempt; index: number }
  | { type: 'choose'; questionId: string; optionId: string }
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
      return { screen: 'history' };

    case 'open-start':
      return { screen: 'start', stored: action.stored, bank: action.bank };

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
        selection: state.inProgress.selection,
        language: bankLanguage(state.inProgress.bank),
      };
  }
}
