import { REEL_STAGES, type ReelStage } from './api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const STAGE_INFO: Record<ReelStage, { name: string; what: string }> = {
  idea: { name: 'Idea', what: 'What the reel is about' },
  structure: { name: 'Structure', what: 'The video laid out beat by beat' },
  script: { name: 'Script', what: 'Every line, ready to voice' },
  voice: { name: 'Voiceover', what: 'One take for the whole script' },
  visuals: { name: 'Visuals', what: 'Scenes and footage' },
  edit: { name: 'Edit', what: 'Cut, captions and music' },
  ready: { name: 'Ready to post', what: 'Scheduled for its slot' },
};

/** `stage` is the furthest step finished, so the step after it is what's next. */
export const nextStage = (stage: ReelStage): ReelStage | null => REEL_STAGES[REEL_STAGES.indexOf(stage) + 1] ?? null;

export function dateLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
