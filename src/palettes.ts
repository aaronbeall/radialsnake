export interface Palette {
  name: string; description: string;
  background: string; panel: string; snake: string; highlight: string; apple: string; text: string; muted: string;
}
export const PALETTES: readonly Palette[] = [
  { name: 'Stillwater', description: 'A quiet blue. A softer kind of bright.', background: '#101c20', panel: '#142226', snake: '#91cfc8', highlight: '#d4f2da', apple: '#efbd9a', text: '#d9e4e3', muted: '#809597' },
  { name: 'Afterglow', description: 'Dusty rose meets the last light of day.', background: '#241c26', panel: '#2c2330', snake: '#d9a6c6', highlight: '#f4dacb', apple: '#a9d5dc', text: '#ede0e9', muted: '#a58d9f' },
  { name: 'Sunday Paper', description: 'Warm parchment. A little ink and apricot.', background: '#242521', panel: '#2b2d27', snake: '#d6ceaa', highlight: '#fff1cb', apple: '#bcace3', text: '#e8e5d7', muted: '#a4a28e' },
  { name: 'Blue Hour', description: 'Lavender light, just before the stars.', background: '#191e30', panel: '#21283b', snake: '#a9b7eb', highlight: '#ddd5ff', apple: '#eac495', text: '#e0e4f2', muted: '#919bb5' },
  { name: 'Soft Signal', description: 'Muted coral. An unexpected electric blue.', background: '#292024', panel: '#33272b', snake: '#e9aaa2', highlight: '#fce0c5', apple: '#94c9df', text: '#f0e1dc', muted: '#b09994' },
  { name: 'Daydream', description: 'A little lilac. A little soft gold.', background: '#211d2c', panel: '#2a2536', snake: '#c9b4e5', highlight: '#f5d9ee', apple: '#e3d395', text: '#e8e0f1', muted: '#a494b3' },
];
