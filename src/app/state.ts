import type { Attempt } from '../domain/attempt';
import type { Selection } from '../domain/selection';
import type { InProgressAttempt } from '../quiz';
import type { StoredBank } from '../storage/db';

/**
 * Which screen is showing, and the data it needs.
 *
 * There is no router: the app reads no URL but the share fragment, which is
 * what lets one build run unchanged at any subpath. Every transition is an
 * action here, so the flow can be read in one place.
 */
export type AppState =
  | { screen: 'library' }
  | { screen: 'start'; bank: StoredBank }
  | { screen: 'attempt'; inProgress: InProgressAttempt; index: number }
  | { screen: 'review'; attempt: Attempt; selection: Selection };

export type AppAction =
  | { type: 'open-library' }
  | { type: 'open-start'; bank: StoredBank }
  | { type: 'begin'; inProgress: InProgressAttempt }
  | { type: 'choose'; questionId: string; optionId: string }
  | { type: 'go-to'; index: number }
  | { type: 'submitted'; attempt: Attempt };

export const initialState: AppState = { screen: 'library' };

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'open-library':
      return { screen: 'library' };

    case 'open-start':
      return { screen: 'start', bank: action.bank };

    case 'begin':
      return { screen: 'attempt', inProgress: action.inProgress, index: 0 };

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

    case 'submitted':
      if (state.screen !== 'attempt') return state;
      return {
        screen: 'review',
        attempt: action.attempt,
        selection: state.inProgress.selection,
      };
  }
}
