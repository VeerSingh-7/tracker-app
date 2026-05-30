import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronRight, GraduationCap } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { getRevSubjects, getRevSubjectStats, saveRevSubject, deleteRevSubject } from '../db'
import { uid } from '../utils'
import type { RevSubject, RevTopic } from '../types'
import { SUBJECT_COLOURS, EXAM_BOARDS, TIERS, boardTierLabel } from '../revision/shared'
import TopicList from '../revision/TopicList'
import CardList from '../revision/CardList'
import PasteSplit from '../revision/PasteSplit'
import StudyMode from '../revision/StudyMode'

// Internal navigation within the Revision tab.
type View =
  | { screen: 'subjects' }
  | { screen: 'topics'; subject: RevSubject }
  | { screen: 'cards'; subject: RevSubject; topic: RevTopic }
  | { screen: 'study'; subject: RevSubject; topic: RevTopic }
  | { screen: 'paste'; subject: RevSubject; topic: RevTopic }

export default function Revision() {
  const [view, setView] = useState<View>({ screen: 'subjects' })
  const [subjects, setSubjects] = useState<RevSubject[]>([])
  const [stats, setStats] = useState<Record<string, { topics: number; cards: number }>>({})

  // Subject add/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editSubject, setEditSubject] = useState<RevSubject | null>(null)
  const [form, setForm] = useState({ name: '', examBoard: 'AQA', tier: 'Higher', colour: SUBJECT_COLOURS[0] })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadSubjects = () => {
    getRevSubjects().then(setSubjects)
    getRevSubjectStats().then(setStats)
  }
  useEffect(() => { if (view.screen === 'subjects') loadSubjects() }, [view.screen])

  const openAdd = () => {
    setEditSubject(null)
    setForm({ name: '', examBoard: 'AQA', tier: 'Higher', colour: SUBJECT_COLOURS[subjects.length % SUBJECT_COLOURS.length] })
    setConfirmDelete(false); setModalOpen(true)
  }
  const openEdit = (s: RevSubject) => {
    setEditSubject(s)
    setForm({ name: s.name, examBoard: s.examBoard, tier: s.tier, colour: s.colour })
    setConfirmDelete(false); setModalOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    if (editSubject) {
      const updated = { ...editSubject, name: form.name.trim(), examBoard: form.examBoard, tier: form.tier, colour: form.colour }
      await saveRevSubject(updated)
      // Keep any open child screen's subject reference in sync.
      setView(v => v.screen === 'topics' ? { ...v, subject: updated } : v)
    } else {
      await saveRevSubject({
        id: uid(), name: form.name.trim(), examBoard: form.examBoard, tier: form.tier, colour: form.colour,
        createdAt: new Date().toISOString(),
      })
    }
    setModalOpen(false)
    loadSubjects()
  }

  const remove = async () => {
    if (!editSubject) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteRevSubject(editSubject.id)
    setModalOpen(false)
    setView({ screen: 'subjects' })
    loadSubjects()
  }

  // ── Nested screens ──────────────────────────────────────────────────────────
  if (view.screen === 'topics') {
    return (
      <>
        <TopicList
          subject={view.subject}
          onBack={() => setView({ screen: 'subjects' })}
          onOpenTopic={topic => setView({ screen: 'cards', subject: view.subject, topic })}
          onEditSubject={() => openEdit(view.subject)}
        />
        {renderSubjectModal()}
      </>
    )
  }
  if (view.screen === 'cards') {
    return (
      <CardList
        subject={view.subject}
        topic={view.topic}
        onBack={() => setView({ screen: 'topics', subject: view.subject })}
        onStudy={() => setView({ screen: 'study', subject: view.subject, topic: view.topic })}
        onPaste={() => setView({ screen: 'paste', subject: view.subject, topic: view.topic })}
      />
    )
  }
  if (view.screen === 'study') {
    return (
      <StudyMode subject={view.subject} topic={view.topic}
        onBack={() => setView({ screen: 'cards', subject: view.subject, topic: view.topic })} />
    )
  }
  if (view.screen === 'paste') {
    return (
      <PasteSplit subject={view.subject} topic={view.topic}
        onBack={() => setView({ screen: 'cards', subject: view.subject, topic: view.topic })}
        onDone={() => setView({ screen: 'cards', subject: view.subject, topic: view.topic })} />
    )
  }

  // ── Subject list (home) ───────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <PageHeader
        title="Revision"
        right={
          <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold loft-btn-accent">
            <Plus size={16} /> Subject
          </button>
        }
      />

      <div className="scroll-area flex-1 pb-tab-bar">
        <div className="px-5 pt-4 space-y-2.5">
          {subjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20">
              <GraduationCap size={40} style={{ color: 'var(--loft-faint)' }} />
              <p className="text-sm mt-3 mb-1" style={{ color: 'var(--loft-text)' }}>No subjects yet</p>
              <p className="text-xs mb-5" style={{ color: 'var(--loft-muted)' }}>Add a subject to start revising.</p>
              <button onClick={openAdd} className="px-5 py-2.5 rounded-xl text-sm font-semibold loft-btn-accent">+ Add Subject</button>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {subjects.map(s => {
                const st = stats[s.id] ?? { topics: 0, cards: 0 }
                return (
                  <motion.button key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => setView({ screen: 'topics', subject: s })}
                    className="w-full text-left rounded-3xl flex items-stretch overflow-hidden"
                    style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
                    <div className="w-1.5 flex-shrink-0" style={{ background: s.colour }} />
                    <div className="flex-1 min-w-0 p-4 flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${s.colour}22` }}>
                        <GraduationCap size={20} style={{ color: s.colour }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold truncate" style={{ color: 'var(--loft-text)' }}>{s.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${s.colour}22`, color: s.colour }}>
                            {boardTierLabel(s.examBoard, s.tier)}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--loft-muted)' }}>
                            {st.topics} topic{st.topics === 1 ? '' : 's'} · {st.cards} card{st.cards === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--loft-muted)' }} />
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          )}

          {/* STAGE 2 (quizzes) & STAGE 3 (spaced repetition) HOOK:
              A dashboard / "Due for review today" summary and a quiz launcher will
              live on this Revision home in later stages, driven by the RevCard
              review-tracking fields. Not built in stage 1. */}
        </div>
      </div>

      {renderSubjectModal()}
    </div>
  )

  function renderSubjectModal() {
    return (
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editSubject ? 'Edit Subject' : 'New Subject'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subject name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Biology"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Exam board</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {EXAM_BOARDS.map(b => (
                <button key={b} onClick={() => setForm(f => ({ ...f, examBoard: b }))}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${form.examBoard === b ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tier</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {TIERS.map(t => (
                <button key={t.label} onClick={() => setForm(f => ({ ...f, tier: t.value }))}
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${form.tier === t.value ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Colour</label>
            <div className="flex flex-wrap gap-2.5 mt-2">
              {SUBJECT_COLOURS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, colour: c }))}
                  className="w-9 h-9 rounded-full transition-transform"
                  style={{ background: c, outline: form.colour === c ? '2px solid #fff' : 'none', outlineOffset: 2, transform: form.colour === c ? 'scale(1.1)' : 'none' }} />
              ))}
            </div>
          </div>

          <button onClick={save} disabled={!form.name.trim()}
            className="w-full text-white py-3.5 rounded-xl font-semibold text-base" style={{ background: form.colour, opacity: form.name.trim() ? 1 : 0.5 }}>
            {editSubject ? 'Save Changes' : 'Add Subject'}
          </button>
          {editSubject && (
            <button onClick={remove}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', background: confirmDelete ? 'rgba(239,68,68,0.12)' : 'transparent' }}>
              {confirmDelete ? 'Tap again to delete (removes all its topics & cards)' : 'Delete Subject'}
            </button>
          )}
        </div>
      </Modal>
    )
  }
}
