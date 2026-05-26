import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { getGameScore, saveGameScore } from '../db'

interface Props { onBack: () => void }

// ─── Word list (~220 common 5-letter words) ────────────────────────────────
const WORDS = [
  'about','above','actor','added','admit','adopt','adult','after','again','agent',
  'agree','ahead','alarm','alert','alike','alive','allow','alone','along','alter',
  'angel','anger','angle','angry','apart','apple','apply','arena','argue','arise',
  'asset','avoid','awful','bacon','badge','baker','basic','beach','beard','beast',
  'begin','being','below','bench','berry','blade','blame','blank','blast','blend',
  'block','blood','bloom','board','booth','bound','brave','break','breed','bride',
  'brief','bring','brook','brown','brush','built','bunch','burst','cable','carry',
  'catch','cause','chain','chair','chaos','charm','chart','chase','check','chess',
  'chief','child','class','clean','clear','click','climb','clock','close','cloud',
  'coach','coast','color','count','court','cover','crack','craft','crash','crazy',
  'cream','crowd','crush','curve','daily','dance','death','delay','dense','depth',
  'dirty','doubt','draft','drain','drama','dream','drive','drops','drums','eager',
  'eagle','early','earth','eight','elite','empty','enjoy','enter','entry','equal',
  'essay','event','every','exact','extra','faint','fairy','faith','false','fatal',
  'feast','fiber','field','fifth','fifty','fight','final','first','fixed','flame',
  'flash','flesh','float','flood','floor','flour','focus','force','forge','forth',
  'found','fresh','front','frost','fruit','fully','games','ghost','glass','globe',
  'gloom','glory','glove','going','grace','grade','grain','grand','grant','grasp',
  'grave','great','green','grief','grill','groan','group','grove','grown','guard',
  'guide','guild','guilt','habit','happy','harsh','heart','heavy','hello','hence',
  'herbs','hobby','honor','house','human','humor','hurry','ideal','image','inner',
  'input','irony','issue','joint','judge','juice','jumbo','knife','knock','known',
  'label','large','laser','later','laugh','layer','learn','lease','leave','legal',
  'level','light','limit','liver','local','logic','loose','loved','magic','major',
  'maker','manor','march','mayor','media','mercy','merit','metal','minor','model',
  'money','month','moral','mouse','movie','music','naive','night','noise','noble',
  'north','nurse','ocean','offer','opera','outer','owner','panic','paper','peace',
  'pearl','penny','phase','pilot','pitch','pizza','place','plain','plant','plaza',
  'plead','pluck','quick','queen','query','quote','radar','radio','raise','rapid',
  'ratio','reach','ready','realm','rebel','refer','reign','relax','reply','ridge',
  'rigid','risky','rival','robot','rocky','rough','round','royal','saint','salad',
  'sauce','scale','scene','scent','score','scout','sense','serve','setup','seven',
  'shade','shake','shape','share','sharp','shift','shirt','shock','shore','short',
  'sight','silly','since','sixth','skill','skull','slave','sleep','slice','slide',
  'slope','smash','smoke','snake','solar','solve','sorry','sound','south','space',
  'spare','speak','speed','spend','spill','spoke','sport','squad','stack','staff',
  'stage','stake','stamp','stand','stark','start','state','steal','steam','steel',
  'steep','stick','sting','stock','stone','store','straw','strip','study','stuff',
  'style','sugar','suite','sunny','super','sweet','sword','table','thank','their',
  'theme','there','thick','think','thing','third','threw','three','throw','tiger',
  'tight','tired','title','today','total','touch','tough','trace','track','trade',
  'trail','train','trait','trash','treat','trial','tribe','trick','tried','trove',
  'truly','trunk','trust','truth','twice','twist','ultra','under','unite','until',
  'upper','upset','urban','usage','using','usual','valid','value','valve','venue',
  'verse','video','viper','visit','vital','vivid','vocal','voice','waste','water',
  'weave','wedge','weigh','weird','while','witch','woman','world','worry','worth',
  'would','wound','wrath','write','wrote','yacht','yield','young','youth',
]

type LetterState = 'correct' | 'present' | 'absent' | 'empty'

interface Guess {
  word: string
  result: LetterState[]
}

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
]

const STATE_ORDER: Record<LetterState, number> = { correct: 3, present: 2, absent: 1, empty: 0 }

function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)]
}

function evaluate(guess: string, word: string): LetterState[] {
  const result: LetterState[] = Array(5).fill('absent')
  const remaining = word.split('')
  // Pass 1: correct positions
  for (let i = 0; i < 5; i++) {
    if (guess[i] === word[i]) { result[i] = 'correct'; remaining[i] = '' }
  }
  // Pass 2: present elsewhere
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue
    const idx = remaining.indexOf(guess[i])
    if (idx !== -1) { result[i] = 'present'; remaining[idx] = '' }
  }
  return result
}

function tileColor(state: LetterState, revealed: boolean): string {
  if (!revealed) return 'bg-slate-800 border-slate-600'
  switch (state) {
    case 'correct': return 'bg-emerald-600 border-emerald-600'
    case 'present': return 'bg-amber-500 border-amber-500'
    case 'absent':  return 'bg-slate-600 border-slate-600'
    default:        return 'bg-slate-800 border-slate-600'
  }
}

function keyColor(state: LetterState | undefined): string {
  switch (state) {
    case 'correct': return 'bg-emerald-600 text-white'
    case 'present': return 'bg-amber-500 text-white'
    case 'absent':  return 'bg-slate-600 text-slate-300'
    default:        return 'bg-slate-700 text-white'
  }
}

export default function Wordle({ onBack }: Props) {
  const [word, setWord] = useState(pickWord)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [current, setCurrent] = useState('')
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [shake, setShake] = useState(false)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  useEffect(() => {
    getGameScore('wordle').then(s => {
      if (s) {
        setBestStreak(s.bestScore)
        setStreak((s.extra?.streak as number | undefined) ?? 0)
      }
    })
  }, [])

  const submitGuess = useCallback(() => {
    if (current.length !== 5) { setShake(true); setTimeout(() => setShake(false), 500); return }
    if (!WORDS.includes(current.toLowerCase())) { setShake(true); setTimeout(() => setShake(false), 500); return }

    const result = evaluate(current.toLowerCase(), word)
    const newGuess: Guess = { word: current.toLowerCase(), result }
    const newGuesses = [...guesses, newGuess]
    setGuesses(newGuesses)
    setCurrent('')

    const didWin = result.every(r => r === 'correct')
    const didLose = !didWin && newGuesses.length === 6

    if (didWin) {
      setWon(true)
      setGameOver(true)
      setStreak(s => {
        const ns = s + 1
        setBestStreak(b => {
          const nb = Math.max(b, ns)
          saveGameScore({
            gameId: 'wordle',
            bestScore: nb,
            lastPlayed: format(new Date(), 'yyyy-MM-dd'),
            extra: { streak: ns },
          })
          return nb
        })
        return ns
      })
    } else if (didLose) {
      setGameOver(true)
      setStreak(0)
      saveGameScore({
        gameId: 'wordle',
        bestScore: bestStreak,
        lastPlayed: format(new Date(), 'yyyy-MM-dd'),
        extra: { streak: 0 },
      })
    }
  }, [current, guesses, word, bestStreak])

  const pressKey = useCallback((key: string) => {
    if (gameOver) return
    if (key === 'ENTER') { submitGuess(); return }
    if (key === '⌫' || key === 'BACKSPACE') { setCurrent(c => c.slice(0, -1)); return }
    if (/^[A-Z]$/.test(key) && current.length < 5) setCurrent(c => c + key)
  }, [gameOver, current, submitGuess])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toUpperCase()
      if (k === 'ENTER' || k === 'BACKSPACE' || /^[A-Z]$/.test(k)) {
        e.preventDefault()
        pressKey(k)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pressKey])

  function newGame() {
    setWord(pickWord())
    setGuesses([])
    setCurrent('')
    setGameOver(false)
    setWon(false)
  }

  // Build letter state map for keyboard
  const letterStates: Record<string, LetterState> = {}
  for (const g of guesses) {
    g.word.split('').forEach((ch, i) => {
      const cur = letterStates[ch]
      const next = g.result[i]
      if ((STATE_ORDER[next] ?? 0) > (STATE_ORDER[cur] ?? 0)) letterStates[ch] = next
    })
  }

  // Build the 6-row grid (filled guesses + current + empty rows)
  const rows: { letters: string[]; results: LetterState[]; revealed: boolean }[] = []
  for (let r = 0; r < 6; r++) {
    if (r < guesses.length) {
      rows.push({ letters: guesses[r].word.split(''), results: guesses[r].result, revealed: true })
    } else if (r === guesses.length && !gameOver) {
      const letters = current.split('')
      while (letters.length < 5) letters.push('')
      rows.push({ letters, results: Array(5).fill('empty'), revealed: false })
    } else {
      rows.push({ letters: Array(5).fill(''), results: Array(5).fill('empty'), revealed: false })
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe py-3 bg-slate-900 border-b border-slate-800">
        <button onClick={onBack} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-white font-bold text-center">Wordle</h2>
          <p className="text-slate-500 text-xs text-center">
            Streak: {streak} · Best: {bestStreak}
          </p>
        </div>
        <button
          onClick={newGame}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-400 border border-blue-700 hover:bg-blue-900/40 transition-colors"
        >
          New word
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between py-4 px-4 overflow-hidden">
        {/* Grid */}
        <div className="flex flex-col gap-1.5 w-full max-w-xs">
          {rows.map((row, ri) => (
            <motion.div
              key={ri}
              animate={shake && ri === guesses.length ? { x: [0, -6, 6, -6, 6, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex gap-1.5"
            >
              {row.letters.map((letter, ci) => (
                <motion.div
                  key={ci}
                  initial={false}
                  animate={row.revealed ? { rotateX: [0, -90, 0], transition: { delay: ci * 0.12, duration: 0.4 } } : {}}
                  className={`flex-1 aspect-square rounded-xl border-2 flex items-center justify-center font-extrabold text-xl text-white transition-colors ${tileColor(row.results[ci], row.revealed)}`}
                >
                  {letter.toUpperCase()}
                </motion.div>
              ))}
            </motion.div>
          ))}
        </div>

        {/* Result banner */}
        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-center py-2 px-6 rounded-2xl ${won ? 'bg-emerald-600' : 'bg-slate-700'}`}
            >
              {won ? (
                <p className="text-white font-bold">🎉 Correct! Streak: {streak}</p>
              ) : (
                <p className="text-white font-bold">The word was <span className="uppercase">{word}</span></p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard */}
        <div className="w-full max-w-sm">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1 mb-1">
              {row.map(key => (
                <button
                  key={key}
                  onClick={() => pressKey(key)}
                  className={`h-12 rounded-lg font-bold text-sm flex items-center justify-center transition-colors active:scale-95 ${
                    key === 'ENTER' || key === '⌫'
                      ? 'px-2 min-w-[52px] bg-slate-600 text-white text-xs'
                      : `w-9 ${keyColor(letterStates[key.toLowerCase()])}`
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
