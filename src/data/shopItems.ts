import type { ShopItem } from '../types'

export const shopItems: ShopItem[] = [
  // Themes
  { id: 'theme-ocean', name: 'Ocean', description: 'Default ocean blue theme', category: 'theme', price: 0, preview: '🌊' },
  { id: 'theme-midnight', name: 'Midnight', description: 'Deep indigo night theme', category: 'theme', price: 100, preview: '🌙' },
  { id: 'theme-ember', name: 'Ember', description: 'Warm red and orange tones', category: 'theme', price: 150, preview: '🔥' },
  { id: 'theme-forest', name: 'Forest', description: 'Natural green energy', category: 'theme', price: 150, preview: '🌿' },
  { id: 'theme-neon', name: 'Neon', description: 'Electric neon on dark', category: 'theme', price: 200, preview: '⚡' },

  // Profile Icons
  { id: 'icon-muscle', name: 'Muscle', description: 'Classic flexing muscle', category: 'icon', price: 25, preview: '💪' },
  { id: 'icon-fire', name: 'Fire', description: 'Blazing fire icon', category: 'icon', price: 30, preview: '🔥' },
  { id: 'icon-lightning', name: 'Lightning', description: 'Electric lightning bolt', category: 'icon', price: 30, preview: '⚡' },
  { id: 'icon-trophy', name: 'Trophy', description: 'Champion trophy', category: 'icon', price: 50, preview: '🏆' },
  { id: 'icon-diamond', name: 'Diamond', description: 'Rare diamond icon', category: 'icon', price: 75, preview: '💎' },
  { id: 'icon-crown', name: 'Crown', description: 'Elite status crown', category: 'icon', price: 100, preview: '👑' },

  // Badge Frames
  { id: 'frame-silver', name: 'Silver Frame', description: 'Sleek silver border', category: 'frame', price: 75, preview: '🔲' },
  { id: 'frame-gold', name: 'Gold Frame', description: 'Prestigious gold border', category: 'frame', price: 100, preview: '🟨' },
  { id: 'frame-fire', name: 'Fire Frame', description: 'Blazing fire border', category: 'frame', price: 125, preview: '🟧' },
  { id: 'frame-ice', name: 'Ice Frame', description: 'Cool ice crystal border', category: 'frame', price: 125, preview: '🟦' },
]
