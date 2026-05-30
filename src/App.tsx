import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TabBar from './components/TabBar'
import Dashboard from './pages/Dashboard'
import Workouts from './pages/Workouts'
import Money from './pages/Money'
import Games from './pages/Games'
import Revision from './pages/Revision'
import Settings from './pages/Settings'
import type { Tab } from './types'

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -5 },
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="relative h-full" style={{ background: 'var(--loft-bg)', color: 'var(--loft-text)' }}>
      {showSettings ? (
        <Settings onBack={() => setShowSettings(false)} />
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="h-full"
            >
              {tab === 'dashboard' && (
                <Dashboard onTabChange={setTab} onSettings={() => setShowSettings(true)} />
              )}
              {tab === 'workouts' && <Workouts />}
              {tab === 'money'    && <Money />}
              {tab === 'games'    && <Games />}
              {tab === 'revision' && <Revision />}
            </motion.div>
          </AnimatePresence>
          <TabBar activeTab={tab} onTabChange={setTab} />
        </>
      )}
    </div>
  )
}
