import type { ImageSource } from 'expo-image';

export type Platform = 'youtube' | 'instagram';

export type Slot = {
  channelId: string;
  platform: Platform;
  name: string;
  image?: ImageSource | number;
  initials?: string;
  /** Overrides the engine's status while a channel is being set up or repurposed. */
  setupNote?: string;
};

// The home grid: left column YouTube, right column Instagram, top to bottom.
export const YOUTUBE: Slot[] = [
  { channelId: 'kikai-lab', platform: 'youtube', name: 'Kyren', image: require('../../assets/channels/kyren.jpg') },
  { channelId: 'horror-yt', platform: 'youtube', name: 'Hollowick', image: require('../../assets/channels/hollowick.jpg') },
  { channelId: 'history-cartoon-yt', platform: 'youtube', name: 'Barnaby Bean', image: require('../../assets/channels/barnaby.jpg') },
  { channelId: 'bible-yt', platform: 'youtube', name: 'Jericho Epics', image: require('../../assets/channels/jericho.jpg') },
];

export const INSTAGRAM: Slot[] = [
  { channelId: 'ai-stories-mazedar', platform: 'instagram', name: 'Sheru', image: require('../../assets/channels/sheru.jpg') },
  { channelId: 'norritadigital', platform: 'instagram', name: 'Norrita Digital', initials: 'ND' },
  { channelId: 'naisha', platform: 'instagram', name: 'Naisha', image: require('../../assets/channels/naisha.jpg'), setupNote: 'Horror, not started' },
  { channelId: 'mythology-ig', platform: 'instagram', name: 'Mythology', setupNote: 'No account yet' },
];

export const ALL: Slot[] = [...YOUTUBE, ...INSTAGRAM];

export const slotFor = (id: string) => ALL.find((s) => s.channelId === id);
