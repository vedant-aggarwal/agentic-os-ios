// Today (Gem) tokens. One light source in the scene; colour only where it carries an aspect.
export const C = {
  scene: '#0A0C10',
  sceneTop: '#161A21',
  sheet: '#111317',
  raised: '#1F2228',
  glass: 'rgba(255,255,255,0.06)',
  text: '#F3F4F6',
  textSoft: '#E5E7EB',
  muted: '#A1A6AE',
  faint: '#8E939B',
  divider: '#22252B',
  danger: '#F87171',
} as const;

export type AspectKey =
  | 'body' | 'mind' | 'soul'
  | 'mission' | 'money' | 'growth'
  | 'family' | 'romance' | 'friends';
export type FamilyKey = 'self' | 'work' | 'people';

export const ASPECT_COLOR: Record<AspectKey, string> = {
  body: '#FF8A5B', mind: '#FFB547', soul: '#FFD27A',
  mission: '#3DDC97', money: '#2EC4B6', growth: '#7EE787',
  family: '#FF7AB6', romance: '#F472D0', friends: '#B79CFF',
};

export const FAMILY_ASPECTS: Record<FamilyKey, AspectKey[]> = {
  self: ['body', 'mind', 'soul'],
  work: ['mission', 'money', 'growth'],
  people: ['family', 'romance', 'friends'],
};

export const FAMILY_LABEL: Record<FamilyKey, string> = { self: 'Self', work: 'Work', people: 'People' };

// Geist weights as loaded in _layout.tsx
export const F = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
} as const;

// Strong ease-out spring for state changes; no bounce unless a gesture carried momentum.
export const SPRING = { duration: 700, dampingRatio: 0.9 } as const;
