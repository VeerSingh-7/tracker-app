import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '../components/Modal'
import { getRevTopics, getRevCardsBySubject, saveRevTopic, saveRevTopics, deleteRevTopic } from '../db'
import { uid } from '../utils'
import type { RevSubject, RevTopic } from '../types'
import RevHeader from './RevHeader'
import { boardTierLabel } from './shared'

export default function TopicList({ subject, onBack, onOpenTopic, onEditSubject }: {
  subject: RevSubject
  onBack: () => void
  onOpenTopic: (topic: RevTopic) => void
  onEditSubject: () => void
}) {
  const [topics, setTopics] = useState<RevTopic[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editTopic, setEditTopic] = useState<RevTopic | null>(null)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = () => {
    Promise.all([getRevTopics(subject.id), getRevCardsBySubject(subject.id)]).then(([t, cards]) => {
      const c: Record<string, number> = {}
      for (const card of cards) c[card.topicId] = (c[card.topicId] ?? 0) + 1
      setTopics(t); setCounts(c)
    })
  }
  useEffect(() => { load() }, [subject.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => { setEditTopic(null); setName(''); setConfirmDelete(false); setModalOpen(true) }
  const openEdit = (t: RevTopic) => { setEditTopic(t); setName(t.name); setConfirmDelete(false); setModalOpen(true) }

  const save = async () => {
    if (!name.trim()) return
    if (editTopic) {
      await saveRevTopic({ ...editTopic, name: name.trim() })
    } else {
      const order = topics.length ? Math.max(...topics.map(t => t.order)) + 1 : 0
      await saveRevTopic({ id: uid(), subjectId: subject.id, name: name.trim(), order, createdAt: new Date().toISOString() })
    }
    setModalOpen(false); load()
  }

  const remove = async () => {
    if (!editTopic) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteRevTopic(editTopic.id)
    setModalOpen(false); load()
  }

  // Move a topic up/down by swapping order values with its neighbour.
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= topics.length) return
    const a = topics[index], b = topics[target]
    await saveRevTopics([{ ...a, order: b.order }, { ...b, order: a.order }])
    load()
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <RevHeader
        title={subject.name}
        subtitle={boardTierLabel(subject.examBoard, subject.tier)}
        accent={subject.colour}
        onBack={onBack}
        right={
          <>
            <button onClick={onEditSubject} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
              <Pencil size={16} style={{ color: 'var(--loft-text)' }} />
            </button>
            <button onClick={openAdd} className="p-2 rounded-xl" style={{ background: subject.colour }}>
              <Plus size={18} className="text-white" />
            </button>
          </>
        }
      />

      <div className="scroll-area flex-1 pb-tab-bar">
        <div className="px-5 pt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>
            {topics.length} topic{topics.length === 1 ? '' : 's'}
          </p>

          {topics.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <p className="text-sm mb-1" style={{ color: 'var(--loft-text)' }}>No topics yet</p>
              <p className="text-xs mb-5" style={{ color: 'var(--loft-muted)' }}>Add a topic to start building flashcards.</p>
              <button onClick={openAdd} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: subject.colour }}>
                + Add Topic
              </button>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {topics.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl flex items-center" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
                  {/* Reorder arrows */}
                  <div className="flex flex-col py-1.5 pl-2">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5" style={{ opacity: i === 0 ? 0.25 : 1 }}>
                      <ChevronUp size={16} style={{ color: 'var(--loft-muted)' }} />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === topics.length - 1} className="p-0.5" style={{ opacity: i === topics.length - 1 ? 0.25 : 1 }}>
                      <ChevronDown size={16} style={{ color: 'var(--loft-muted)' }} />
                    </button>
                  </div>
                  <button onClick={() => onOpenTopic(t)} className="flex-1 min-w-0 text-left py-3.5 pl-1 pr-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--loft-text)' }}>{t.name}</p>
                      <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>{counts[t.id] ?? 0} card{(counts[t.id] ?? 0) === 1 ? '' : 's'}</p>
                    </div>
                    <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--loft-muted)' }} />
                  </button>
                  <button onClick={() => openEdit(t)} className="p-3 flex-shrink-0">
                    <Pencil size={15} style={{ color: 'var(--loft-muted)' }} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Add / edit topic modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTopic ? 'Edit Topic' : 'New Topic'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Topic name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cell Biology"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={save} disabled={!name.trim()}
            className="w-full text-white py-3.5 rounded-xl font-semibold text-base" style={{ background: subject.colour, opacity: name.trim() ? 1 : 0.5 }}>
            {editTopic ? 'Save Changes' : 'Add Topic'}
          </button>
          {editTopic && (
            <button onClick={remove}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', background: confirmDelete ? 'rgba(239,68,68,0.12)' : 'transparent' }}>
              {confirmDelete ? 'Tap again to delete (removes its cards)' : 'Delete Topic'}
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
