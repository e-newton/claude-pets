import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PetsPet, PetsSpecies } from '../types'
import { BAND_ROWS, COLORS, SPRITE_W, getFrames, renderBand } from './render'
import type { Placed, Pose } from './render'
import { TICK_MS, makeRng, pat, spawn, step } from './sim'
import type { Mode, PetRuntime } from './sim'

const MAX_PETS = 6
const SLEEP_AFTER_TICKS = Math.round(120_000 / TICK_MS)
/** After this many refused blits in a row the timer stops; the next render restarts it. */
const MAX_DENIES = 16
/** Width of one click target of the invisible press grid, in columns. */
const PRESS_SEGMENT = 8
const BAND_KEY = 'band'
const POSES: readonly Pose[] = ['walk', 'run', 'sit', 'sleep']

const NAMES = [
  'Mochi', 'Biscuit', 'Pumpkin', 'Waffles', 'Pickles', 'Noodle', 'Peanut', 'Muffin', 'Bean', 'Cookie',
  'Sprout', 'Maple', 'Olive', 'Pixel', 'Clover', 'Nugget', 'Pretzel', 'Truffle', 'Ziggy', 'Daisy',
  'Toast', 'Marble', 'Button', 'Cinnamon', 'Poppy', 'Ginger', 'Fudge', 'Tofu', 'Pebble', 'Sesame',
]

const revision = atom({ plugin: 'pets', key: 'revision' } as const, 0)

const USAGE = [
  'Usage: /pet <command>',
  '  add <cat|dog> [color] [name]   adopt a pet (max 6)',
  '  remove <name>                  say goodbye to a pet',
  '  clear                          remove every pet',
  '  list                           show your pets',
  '  hide | show                    hide or show the band',
  '  pat [name]                     give a pet some love',
].join('\n')

type Dollar = EngineInterface
type Roster = { roster: PetsPet[]; hidden: boolean }

const pick = <T,>(items: readonly T[], r: number): T => items[Math.floor(r * items.length) % items.length]!
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isSpecies = (s: string): s is PetsSpecies => s === 'cat' || s === 'dog'

function isPet(v: unknown): v is PetsPet {
  const p = v as PetsPet | null
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.id === 'string' &&
    isSpecies(p.species) &&
    typeof p.color === 'string' &&
    typeof p.name === 'string'
  )
}

// Module state lives in this environment only: a hot reload drops it and its timers together.
const rng = makeRng(Math.floor(Math.random() * 2 ** 32))
const sims = new Map<string, PetRuntime>()
let current: Roster | null = null
let loading: Promise<Roster> | null = null
let band: { requestId: string; columns: number } | null = null
let timer: { cancel: () => void } | null = null
let isWorking = false
let idleTicks = 0
let denies = 0
let isTicking = false
let isCommandRegistered = false
let idCounter = 0

const newId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(rng.next() * 1296).toString(36)}`

function randomPet(taken: readonly PetsPet[], species?: PetsSpecies, color?: string, name?: string): PetsPet {
  const kind = species ?? (rng.next() < 0.5 ? 'cat' : 'dog')
  const used = new Set(taken.map(p => p.name.toLowerCase()))
  const free = NAMES.filter(n => !used.has(n.toLowerCase()))
  return {
    id: newId(),
    species: kind,
    color: color ?? pick(COLORS[kind], rng.next()),
    name: name ?? pick(free.length > 0 ? free : NAMES, rng.next()),
  }
}

/** Reads the roster from `$.store`; a new user gets one random cat, saved at once. */
function load($: Dollar): Promise<Roster> {
  loading ??= (async () => {
    const raw = await $.store.get('roster')
    let roster: PetsPet[]
    if (Array.isArray(raw)) {
      roster = raw.filter(isPet)
    } else {
      roster = [randomPet([], 'cat')]
      await $.store.set('roster', roster)
    }
    const hidden = (await $.store.get('hidden')) === true
    current = { roster, hidden }
    return current
  })().finally(() => {
    loading = null
  })
  return loading
}

async function save($: Dollar, next: Roster) {
  await $.store.set('roster', next.roster)
  await $.store.set('hidden', next.hidden)
  current = next
  await update($, revision, n => (n ?? 0) + 1)
}

function stopTimer() {
  timer?.cancel()
  timer = null
  denies = 0
}

const mode = (): Mode => (isWorking ? 'working' : idleTicks >= SLEEP_AFTER_TICKS ? 'sleeping' : 'idle')

function markActive() {
  idleTicks = 0
}

function frameCounts(pet: PetsPet): Record<Pose, number> {
  const counts = {} as Record<Pose, number>
  for (const pose of POSES) counts[pose] = getFrames(pet.species, pet.color, pose).length
  return counts
}

/** Keeps one runtime state per roster pet; new pets appear at a random x. */
function syncSims(roster: readonly PetsPet[], columns: number) {
  const ids = new Set(roster.map(p => p.id))
  for (const id of [...sims.keys()]) if (!ids.has(id)) sims.delete(id)
  for (const pet of roster) if (!sims.has(pet.id)) sims.set(pet.id, spawn(rng, columns, mode()))
}

function compose(): string | null {
  if (!band || !current) return null
  const placed: Placed[] = []
  const m = mode()
  for (const pet of current.roster) {
    const s = sims.get(pet.id)
    if (!s) continue
    const frames = getFrames(pet.species, pet.color, s.pose)
    const frame = frames[s.frameIndex % frames.length]
    if (!frame) continue
    placed.push({
      frame,
      x: Math.round(s.x),
      facingLeft: s.dir < 0,
      overlay: s.heartTicks > 0 ? 'heart' : m === 'sleeping' ? 'zzz' : null,
    })
  }
  return renderBand(band.columns, placed)
}

async function tick($: Dollar) {
  if (isTicking || !band || !current) return
  isTicking = true
  try {
    const m = mode()
    if (m === 'idle') idleTicks += 1
    for (const pet of current.roster) {
      const s = sims.get(pet.id) ?? spawn(rng, band.columns, m)
      sims.set(pet.id, step(s, { width: band.columns, mode: m, frameCounts: frameCounts(pet) }, rng))
    }
    const cells = compose()
    if (cells === null) return
    const result = await $.ui.blit({
      requestId: band.requestId,
      key: BAND_KEY,
      cells,
      columns: band.columns,
      rows: BAND_ROWS,
    })
    if (result?.deny) {
      denies += 1
      if (denies >= MAX_DENIES) stopTimer()
    } else {
      denies = 0
    }
  } catch {
    denies += 1
    if (denies >= MAX_DENIES) stopTimer()
  } finally {
    isTicking = false
  }
}

function ensureTimer($: Dollar) {
  timer ??= $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

async function ensureCommand($: Dollar) {
  if (isCommandRegistered) return
  isCommandRegistered = true
  try {
    await $.command.register({
      name: 'pet',
      description: 'Cats and dogs that wander above your prompt',
      argumentHint: 'add|remove|clear|list|hide|show|pat',
    })
  } catch {
    isCommandRegistered = false
  }
}

/** Hearts the pet whose sprite is nearest the center of press segment `column`. */
function patNear(column: number, width: number) {
  const center = column * PRESS_SEGMENT + width / 2
  let best: { id: string; dist: number } | null = null
  for (const [id, s] of sims) {
    const dist = Math.abs(s.x + SPRITE_W / 2 - center)
    if (dist <= SPRITE_W / 2 + width / 2 && (!best || dist < best.dist)) best = { id, dist }
  }
  markActive()
  if (best) sims.set(best.id, pat(sims.get(best.id)!))
}

/** A fresh start: `register` runs again on a hot reload (and once per test). */
function resetState() {
  timer?.cancel()
  timer = null
  sims.clear()
  current = null
  loading = null
  band = null
  isWorking = false
  idleTicks = 0
  denies = 0
  isTicking = false
  isCommandRegistered = false
}

export const register: Register = on => {
  resetState()

  on('session.start', async ($, e, next) => {
    await ensureCommand($)
    await load($)
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    isWorking = true
    markActive()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', ($, e, next) => {
    isWorking = false
    markActive()
    return next(e)
  })

  on('prompt.edit', ($, e, next) => {
    markActive()
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, revision)
    await ensureCommand($)
    const { roster, hidden } = await load($)

    if (e.props.hasSurvey || hidden || roster.length === 0 || e.surface !== 'terminal') {
      stopTimer()
      band = null
      return next(e)
    }

    const columns = Math.max(1, Math.min(512, Math.floor(e.props.bodyColumns)))
    isWorking = e.props.isWorking
    if (isWorking) markActive()
    band = { requestId: e.requestId, columns }
    syncSims(roster, columns)
    ensureTimer($)

    const { Box, Button, Raster } = $.ui.resolve(e)
    const segments = Math.ceil(columns / PRESS_SEGMENT)
    const rows = Array.from({ length: BAND_ROWS }, (_, r) => r)
    const cols = Array.from({ length: segments }, (_, c) => c)

    return (
      <Box width={columns} height={BAND_ROWS}>
        <Raster key={BAND_KEY} columns={columns} rows={BAND_ROWS} cells={compose() ?? ''} />
        {/* Invisible press grid over the Raster (it has no onPress): a press pats the pet under it. */}
        <Box position="absolute" top={0} left={0} width={columns} height={BAND_ROWS} flexDirection="column">
          {rows.map(r => (
            <Box key={`row-${r}`} flexDirection="row" width={columns}>
              {cols.map(c => {
                const w = Math.min(PRESS_SEGMENT, columns - c * PRESS_SEGMENT)
                return (
                  <Button key={`pat-${r}-${c}`} plain label={' '.repeat(w)} onPress={() => patNear(c, w)} />
                )
              })}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    markActive()
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    const sub = (words[0] ?? '').toLowerCase()
    const rest = words.slice(1)
    const state = await load($)
    const find = (name: string) => state.roster.find(p => p.name.toLowerCase() === name.toLowerCase())
    const names = () => state.roster.map(p => p.name).join(', ')

    switch (sub) {
      case 'add': {
        const species = (rest[0] ?? '').toLowerCase()
        if (!isSpecies(species)) {
          return { text: `Add a cat or a dog: /pet add <cat|dog> [color] [name]\nCat colors: ${COLORS.cat.join(', ')}\nDog colors: ${COLORS.dog.join(', ')}` }
        }
        if (state.roster.length >= MAX_PETS) {
          return { text: `You already have ${MAX_PETS} pets, which is the most that fit. Try /pet remove <name> first (${names()}).` }
        }
        let args = rest.slice(1)
        let color: string | undefined
        const first = (args[0] ?? '').toLowerCase()
        if (COLORS[species].includes(first)) {
          color = first
          args = args.slice(1)
        } else if (COLORS.cat.includes(first) || COLORS.dog.includes(first)) {
          return { text: `${capitalize(species)}s do not come in ${first}. ${capitalize(species)} colors: ${COLORS[species].join(', ')}` }
        }
        const name = args.join(' ').slice(0, 24).trim() || undefined
        if (name && find(name)) return { text: `You already have a pet named ${find(name)!.name}. Pick another name.` }
        const pet = randomPet(state.roster, species, color, name)
        await save($, { ...state, roster: [...state.roster, pet] })
        return {
          text: `Welcome, ${pet.name} the ${pet.color} ${pet.species}!` + (state.hidden ? ' (Pets are hidden: /pet show to see them.)' : ''),
        }
      }
      case 'remove': {
        if (rest.length === 0) return { text: `Remove which pet? /pet remove <name>${state.roster.length ? ` (${names()})` : ''}` }
        const pet = find(rest.join(' '))
        if (!pet) return { text: `No pet named "${rest.join(' ')}".${state.roster.length ? ` Your pets: ${names()}.` : ' You have no pets yet.'}` }
        await save($, { ...state, roster: state.roster.filter(p => p.id !== pet.id) })
        return { text: `Goodbye, ${pet.name}. They will be missed.` }
      }
      case 'clear': {
        if (state.roster.length === 0) return { text: 'You have no pets to clear.' }
        await save($, { ...state, roster: [] })
        return { text: `Cleared ${state.roster.length} pet${state.roster.length === 1 ? '' : 's'}. /pet add <cat|dog> to adopt again.` }
      }
      case 'list': {
        const lines = state.roster.map((p, i) => `${i + 1}. ${p.name} - ${p.color} ${p.species}`)
        const head = state.roster.length
          ? `Your pets (${state.roster.length}/${MAX_PETS}):`
          : 'You have no pets yet. /pet add <cat|dog> [color] [name]'
        return { text: [head, ...lines, ...(state.hidden ? ['(hidden: /pet show to bring them back)'] : [])].join('\n') }
      }
      case 'hide': {
        if (state.hidden) return { text: 'The pets are already hidden. /pet show brings them back.' }
        await save($, { ...state, hidden: true })
        return { text: 'Pets hidden. /pet show brings them back.' }
      }
      case 'show': {
        if (!state.hidden) return { text: 'The pets are already showing.' }
        await save($, { ...state, hidden: false })
        return {
          text: state.roster.length ? 'Pets are back!' : 'Pets are shown, but you have none yet. /pet add <cat|dog> [color] [name]',
        }
      }
      case 'pat': {
        if (state.roster.length === 0) return { text: 'You have no pets to pat. /pet add <cat|dog> [color] [name]' }
        if (state.hidden) return { text: 'The pets are hidden, so they cannot be patted. /pet show first.' }
        const pet = rest.length ? find(rest.join(' ')) : pick(state.roster, rng.next())
        if (!pet) return { text: `No pet named "${rest.join(' ')}". Your pets: ${names()}.` }
        const s = sims.get(pet.id)
        if (s) sims.set(pet.id, pat(s))
        return { text: pet.species === 'cat' ? `${pet.name} purrs. <3` : `${pet.name} wags happily. <3` }
      }
      default:
        return { text: sub ? `Unknown subcommand "${sub}".\n${USAGE}` : USAGE }
    }
  })
}

