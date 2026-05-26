import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ShoppingBag, Check } from 'lucide-react'
import { getUserProgress, saveUserProgress } from '../db'
import { shopItems } from '../data/shopItems'
import type { UserProgress, ShopItem } from '../types'

type Category = 'all' | 'theme' | 'icon' | 'frame'
const CAT_LABELS: Record<Category, string> = { all: 'All', theme: 'Themes', icon: 'Icons', frame: 'Frames' }

export default function ShopTab() {
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [category, setCategory] = useState<Category>('all')
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [justBought, setJustBought] = useState<string | null>(null)

  useEffect(() => { getUserProgress().then(setProgress) }, [])

  const owned = new Set(progress?.unlockedCosmetics ?? [])

  const filtered = shopItems.filter(item => category === 'all' || item.category === category)

  async function purchase(item: ShopItem) {
    if (!progress || purchasing) return
    if (owned.has(item.id)) return
    if (progress.coins < item.price) return

    setPurchasing(item.id)
    try {
      const updated: UserProgress = {
        ...progress,
        coins: progress.coins - item.price,
        unlockedCosmetics: [...progress.unlockedCosmetics, item.id],
      }
      await saveUserProgress(updated)
      setProgress(updated)
      setJustBought(item.id)
      setTimeout(() => setJustBought(null), 2000)
    } finally { setPurchasing(null) }
  }

  async function setActiveTheme(themeId: string) {
    if (!progress || !owned.has(themeId)) return
    const updated = { ...progress, activeTheme: themeId }
    await saveUserProgress(updated)
    setProgress(updated)
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Coin balance */}
      <div className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-yellow-900 text-xs font-bold uppercase tracking-wider">Coin Balance</p>
          <p className="text-3xl font-black text-white">{progress?.coins ?? 0}</p>
        </div>
        <div className="text-4xl">💰</div>
      </div>

      {/* How to earn */}
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400">
        <p className="font-semibold mb-1">How to earn coins</p>
        <p>+1 per completed set · +2 per PR · +5 per workout · +10 for daily quest</p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2">
        {(Object.keys(CAT_LABELS) as Category[]).map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              category === c ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {CAT_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map(item => {
          const isOwned = owned.has(item.id)
          const canAfford = (progress?.coins ?? 0) >= item.price
          const isActive = item.category === 'theme' && progress?.activeTheme === item.id
          const isBuying = purchasing === item.id
          const wasBought = justBought === item.id

          return (
            <motion.div
              key={item.id}
              layout
              className={`rounded-2xl p-4 border transition-all ${
                isOwned
                  ? 'bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900/50 shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm'
              }`}
            >
              {/* Preview */}
              <div className={`text-3xl mb-3 text-center ${!isOwned && !canAfford ? 'grayscale opacity-40' : ''}`}>
                {item.preview}
              </div>

              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-0.5">{item.name}</p>
              <p className="text-xs text-slate-400 mb-3 leading-tight">{item.description}</p>

              {isOwned ? (
                item.category === 'theme' ? (
                  <button
                    onClick={() => setActiveTheme(item.id)}
                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {isActive ? '✓ Active' : 'Set Active'}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-semibold">
                    <Check size={13} /> Owned
                  </div>
                )
              ) : (
                <button
                  onClick={() => purchase(item)}
                  disabled={!canAfford || isBuying}
                  className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    canAfford
                      ? 'bg-yellow-400 hover:bg-yellow-500 text-yellow-900 active:bg-yellow-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isBuying ? '...' : wasBought ? '✓ Bought!' : (
                    <>
                      <ShoppingBag size={11} />
                      {item.price === 0 ? 'Free' : `${item.price} 💰`}
                    </>
                  )}
                </button>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
