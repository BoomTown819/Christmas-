export const ACTIVITIES = {
  waving: { label: 'Waving', emoji: '👋', prompt: 'waving hello cheerfully with one hand' },
  dancing: { label: 'Dancing', emoji: '💃', prompt: 'doing a happy little dance, bouncing side to side' },
  decorating: { label: 'Decorating the tree', emoji: '🎄', prompt: 'hanging an ornament on a small Christmas tree beside them' },
  presents: { label: 'Carrying presents', emoji: '🎁', prompt: 'walking while carrying a stack of wrapped presents' },
  snowman: { label: 'Building a snowman', emoji: '⛄', prompt: 'building a small snowman beside them, patting snow onto it' },
  cocoa: { label: 'Hot chocolate', emoji: '☕', prompt: 'sipping a steaming mug of hot chocolate' },
  wrapping: { label: 'Wrapping presents', emoji: '🎀', prompt: 'wrapping a present and tying a bow on it' },
  sleigh: { label: 'Riding a sleigh', emoji: '🛷', prompt: 'riding a small red sleigh, gliding and bobbing' },
  candycane: { label: 'Candy cane', emoji: '🍬', prompt: 'holding and swinging a big candy cane' },
  lights: { label: 'Hanging lights', emoji: '💡', prompt: 'hanging a string of twinkling Christmas lights' },
} as const;

export type Activity = keyof typeof ACTIVITIES;
export const isActivity = (a: unknown): a is Activity => typeof a === 'string' && a in ACTIVITIES;

export interface CharacterCard {
  token: string;
  activity: Activity;
  /** true when an AI-made animated GIF exists; otherwise the sprite is animated in the browser */
  anim: boolean;
}

export const characterSrc = (c: CharacterCard, kind: 'png' | 'gif' = c.anim ? 'gif' : 'png') => `/api/character/${c.token}/${kind}`;
