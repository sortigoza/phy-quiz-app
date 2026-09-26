import type { SelfGrade } from '../domain/attempt';

/** How each self-grade is named on screen. */
export const selfGradeLabel: Record<SelfGrade, string> = {
  yes: 'Yes',
  partly: 'Partly',
  no: 'No',
};
