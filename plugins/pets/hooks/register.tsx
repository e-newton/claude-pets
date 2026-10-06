import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { PetsPet, PetsPosition, PetsSpecies, PetsStore } from '../types'
import type { Placed } from './render'
import { renderBand } from './render'
import type { Mode, PetRuntime } from './sim'
import { makeRng, maxX, pat, spawn, step, TICK_MS } from './sim'
import type { Pose } from './sprites'
import { BAND_ROWS, COLORS, getFrames } from './sprites'

type Engine = EngineInterface

const MAX_PETS = 6
const MAX_PET_NAME_LENGTH = 24
const MAX_BAND_COLUMNS = 512
/** With no prompt activity for this long, the pets fall asleep. */
const SLEEP_AFTER_TICKS = Math.round(120_000 / TICK_MS)
/** After this many refused or failed blits in a row the timer stops; the next render restarts it. */
const MAX_REFUSED_BLITS = 16
/** How often pet positions are saved to `$.state`, in ticks (about once a second). */
const SAVE_POSITIONS_EVERY_TICKS = 8
const BAND_KEY = 'band'
const POSES: readonly Pose[] = ['walk', 'run', 'sit', 'sleep']

// biome-ignore format: keep the name list compact
const PET_NAMES = [
  'Mochi', 'Biscuit', 'Pumpkin', 'Waffles', 'Pickles', 'Noodle', 'Peanut', 'Muffin', 'Bean', 'Cookie',
  'Sprout', 'Maple', 'Olive', 'Pixel', 'Clover', 'Nugget', 'Pretzel', 'Truffle', 'Ziggy', 'Daisy',
  'Toast', 'Marble', 'Button', 'Cinnamon', 'Poppy', 'Ginger', 'Fudge', 'Tofu', 'Pebble', 'Sesame',
]

const USAGE_TEXT = [
  'Usage: /pet <command>',
  '  add <cat|dog> [color] [name]   adopt a pet (max 6)',
  '  remove <name>                  say goodbye to a pet',
  '  rename <name> <new name>       give a pet a new name',
  '  clear                          remove every pet',
  '  list                           show your pets',
  '  hide | show                    hide or show the band',
  '  pat [name]                     give a pet some love',
].join('\n')

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** Bumped whenever the roster or hidden flag changes, so the band (which reads it) redraws. */
const revisionAtom = atom({ plugin: 'pets', key: 'revision' } as const, 0)
/**
 * Where each pet is, saved about once a second. A hot reload drops this module's state
 * (the simulation included) and a pet would teleport to a random spot; `$.state`
 * survives it, so a fresh load resumes the pets from here.
 */
const positionsAtom = atom({ plugin: 'pets', key: 'positions' } as const, {} as Record<string, PetsPosition>)

/** Where the pets are drawn, and the size of the band they live in. */
type Band = { requestId: string; columns: number }

/** Everything this module remembers between events. A hot reload drops it, timers and all. */
type Session = {
  /** Each pet's simulation state, by pet id. */
  runtimes: Map<string, PetRuntime>
  /** The roster and hidden flag as last read from or written to `$.store`; null before the first load. */
  store: PetsStore | null
  /** The store read in flight, so concurrent callers share one read. */
  pendingStoreLoad: Promise<PetsStore> | null
  /** The band currently on screen; null while hidden or not yet drawn. */
  band: Band | null
  tickTimer: { cancel: () => void } | null
  isClaudeWorking: boolean
  /** Ticks since the last prompt activity, counted only while idle. */
  idleTicks: number
  ticksSinceSavingPositions: number
  /** Blits refused or failed in a row. */
  refusedBlits: number
  /** Guards against a slow tick overlapping the next one. */
  isTicking: boolean
  isCommandRegistered: boolean
}

const newSession = (): Session => ({
  runtimes: new Map(),
  store: null,
  pendingStoreLoad: null,
  band: null,
  tickTimer: null,
  isClaudeWorking: false,
  idleTicks: 0,
  ticksSinceSavingPositions: 0,
  refusedBlits: 0,
  isTicking: false,
  isCommandRegistered: false,
})

let session = newSession()

const rng = makeRng(Math.floor(Math.random() * 2 ** 32))
/** Not part of `session`: it must keep counting across a reset so ids stay unique. */
let petIdCounter = 0

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const pick = <T,>(items: readonly T[], unitRandom: number): T =>
  items[Math.floor(unitRandom * items.length) % items.length]!
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const isSpecies = (text: string): text is PetsSpecies => text === 'cat' || text === 'dog'

function isPet(value: unknown): value is PetsPet {
  const pet = value as PetsPet | null
  return (
    typeof pet === 'object' &&
    pet !== null &&
    typeof pet.id === 'string' &&
    isSpecies(pet.species) &&
    typeof pet.color === 'string' &&
    typeof pet.name === 'string'
  )
}

const newPetId = () =>
  `p${Date.now().toString(36)}${(petIdCounter++).toString(36)}${Math.floor(rng.next() * 1296).toString(36)}`

/** A new pet; whatever the caller leaves out is picked at random (names avoiding ones in use). */
function createPet(existing: readonly PetsPet[], species?: PetsSpecies, color?: string, name?: string): PetsPet {
  const chosenSpecies = species ?? (rng.next() < 0.5 ? 'cat' : 'dog')
  const namesInUse = new Set(existing.map(pet => pet.name.toLowerCase()))
  const freeNames = PET_NAMES.filter(candidate => !namesInUse.has(candidate.toLowerCase()))
  return {
    id: newPetId(),
    species: chosenSpecies,
    color: color ?? pick(COLORS[chosenSpecies], rng.next()),
    name: name ?? pick(freeNames.length > 0 ? freeNames : PET_NAMES, rng.next()),
  }
}

// ---------------------------------------------------------------------------
// Store: the roster and hidden flag, kept across sessions
// ---------------------------------------------------------------------------

/** Reads the roster from `$.store`; a new user gets one random cat, saved at once. */
function loadStore($: Engine): Promise<PetsStore> {
  session.pendingStoreLoad ??= (async () => {
    const storedRoster = await $.store.get('roster')
    let roster: PetsPet[]
    if (Array.isArray(storedRoster)) {
      roster = storedRoster.filter(isPet)
    } else {
      roster = [createPet([], 'cat')]
      await $.store.set('roster', roster)
    }
    const hidden = (await $.store.get('hidden')) === true
    session.store = { roster, hidden }
    return session.store
  })().finally(() => {
    session.pendingStoreLoad = null
  })
  return session.pendingStoreLoad
}

async function saveStore($: Engine, next: PetsStore) {
  await $.store.set('roster', next.roster)
  await $.store.set('hidden', next.hidden)
  session.store = next
  await update($, revisionAtom, revision => (revision ?? 0) + 1)
}

// ---------------------------------------------------------------------------
// Simulation: one PetRuntime per roster pet
// ---------------------------------------------------------------------------

/** What the pets are doing, from the user's activity. */
function currentMode(): Mode {
  if (session.isClaudeWorking) return 'working'
  return session.idleTicks >= SLEEP_AFTER_TICKS ? 'sleeping' : 'idle'
}

function markUserActive() {
  session.idleTicks = 0
}

function countFramesByPose(pet: PetsPet): Record<Pose, number> {
  const counts = {} as Record<Pose, number>
  for (const pose of POSES) counts[pose] = getFrames(pet.species, pet.color, pose).length
  return counts
}

/**
 * Keeps one runtime state per roster pet. A pet with a saved position (from before a
 * hot reload) resumes there; a new pet appears at a random x.
 */
function syncRuntimes(roster: readonly PetsPet[], columns: number, savedPositions: Record<string, PetsPosition> = {}) {
  const rosterIds = new Set(roster.map(pet => pet.id))
  for (const id of [...session.runtimes.keys()]) if (!rosterIds.has(id)) session.runtimes.delete(id)
  for (const pet of roster) {
    if (session.runtimes.has(pet.id)) continue
    const fresh = spawn(rng, columns, currentMode())
    const saved = savedPositions[pet.id]
    session.runtimes.set(pet.id, saved ? { ...fresh, x: Math.min(saved.x, maxX(columns)), dir: saved.dir } : fresh)
  }
}

async function savePositions($: Engine) {
  const positions: Record<string, PetsPosition> = {}
  for (const [id, runtime] of session.runtimes) positions[id] = { x: runtime.x, dir: runtime.dir }
  await update($, positionsAtom, () => positions)
}

/** The band as Raster cells, or null when there is nothing to draw it for. */
function composeBandCells(): string | null {
  const { band, store } = session
  if (!band || !store) return null
  const mode = currentMode()
  const placed: Placed[] = []
  for (const pet of store.roster) {
    const runtime = session.runtimes.get(pet.id)
    if (!runtime) continue
    const frames = getFrames(pet.species, pet.color, runtime.pose)
    const frame = frames[runtime.frameIndex % frames.length]
    if (!frame) continue
    placed.push({
      frame,
      x: Math.round(runtime.x),
      facingLeft: runtime.dir < 0,
      overlay: runtime.heartTicks > 0 ? 'heart' : mode === 'sleeping' ? 'zzz' : null,
    })
  }
  return renderBand(band.columns, placed)
}

// ---------------------------------------------------------------------------
// The band and its timer
// ---------------------------------------------------------------------------

function startTimer($: Engine) {
  session.tickTimer ??= $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

function stopTimer() {
  session.tickTimer?.cancel()
  session.tickTimer = null
  session.refusedBlits = 0
}

function hideBand() {
  stopTimer()
  session.band = null
}

/** Stops the timer after too many blits in a row went wrong; a later render restarts it. */
function noteBlitRefused() {
  session.refusedBlits += 1
  if (session.refusedBlits >= MAX_REFUSED_BLITS) stopTimer()
}

/** One timer tick: advance every pet, save positions now and then, and repaint the band. */
async function tick($: Engine) {
  const { band, store } = session
  if (session.isTicking || !band || !store) return
  session.isTicking = true
  try {
    const mode = currentMode()
    if (mode === 'idle') session.idleTicks += 1
    for (const pet of store.roster) {
      const runtime = session.runtimes.get(pet.id) ?? spawn(rng, band.columns, mode)
      session.runtimes.set(
        pet.id,
        step(runtime, { width: band.columns, mode, frameCounts: countFramesByPose(pet) }, rng),
      )
    }
    session.ticksSinceSavingPositions += 1
    if (session.ticksSinceSavingPositions >= SAVE_POSITIONS_EVERY_TICKS) {
      session.ticksSinceSavingPositions = 0
      await savePositions($)
    }
    // Re-read the band: a render during the awaits above may have resized it.
    const cells = composeBandCells()
    const currentBand = session.band
    if (cells === null || !currentBand) return
    const result = await $.ui.blit({
      requestId: currentBand.requestId,
      key: BAND_KEY,
      cells,
      columns: currentBand.columns,
      rows: BAND_ROWS,
    })
    if (result?.deny) noteBlitRefused()
    else session.refusedBlits = 0
  } catch {
    noteBlitRefused()
  } finally {
    session.isTicking = false
  }
}

// ---------------------------------------------------------------------------
// The /pet command
// ---------------------------------------------------------------------------

async function ensureCommandRegistered($: Engine) {
  if (session.isCommandRegistered) return
  session.isCommandRegistered = true
  try {
    await $.command.register({
      name: 'pet',
      description: 'Cats and dogs that wander above your prompt',
      argumentHint: 'add|remove|rename|clear|list|hide|show|pat',
    })
  } catch {
    session.isCommandRegistered = false
  }
}

/**
 * Splits `rename` arguments into the pet being renamed and the new name's words. Pet names can contain
 * spaces, so this takes the longest leading run of words that names an existing pet.
 */
function splitRenameArgs<Pet>(args: string[], findPet: (name: string) => Pet | undefined) {
  for (let currentNameWordCount = args.length; currentNameWordCount >= 1; currentNameWordCount--) {
    const pet = findPet(args.slice(0, currentNameWordCount).join(' '))
    if (pet) return { pet, newNameWords: args.slice(currentNameWordCount) }
  }
  return { pet: undefined, newNameWords: args }
}

/** Runs `/pet <argsText>` and returns the text to show. */
async function runPetCommand($: Engine, argsText: string): Promise<{ text: string }> {
  const words = argsText.trim().split(/\s+/).filter(Boolean)
  const subcommand = (words[0] ?? '').toLowerCase()
  const args = words.slice(1)
  const store = await loadStore($)
  const findPet = (name: string) => store.roster.find(pet => pet.name.toLowerCase() === name.toLowerCase())
  const rosterNames = () => store.roster.map(pet => pet.name).join(', ')

  switch (subcommand) {
    case 'add': {
      const species = (args[0] ?? '').toLowerCase()
      if (!isSpecies(species)) {
        return {
          text: `Add a cat or a dog: /pet add <cat|dog> [color] [name]\nCat colors: ${COLORS.cat.join(', ')}\nDog colors: ${COLORS.dog.join(', ')}`,
        }
      }
      if (store.roster.length >= MAX_PETS) {
        return {
          text: `You already have ${MAX_PETS} pets, which is the most that fit. Try /pet remove <name> first (${rosterNames()}).`,
        }
      }
      let nameWords = args.slice(1)
      let color: string | undefined
      const firstWord = (nameWords[0] ?? '').toLowerCase()
      if (COLORS[species].includes(firstWord)) {
        color = firstWord
        nameWords = nameWords.slice(1)
      } else if (COLORS.cat.includes(firstWord) || COLORS.dog.includes(firstWord)) {
        return {
          text: `${capitalize(species)}s do not come in ${firstWord}. ${capitalize(species)} colors: ${COLORS[species].join(', ')}`,
        }
      }
      const name = nameWords.join(' ').slice(0, MAX_PET_NAME_LENGTH).trim() || undefined
      const sameName = name ? findPet(name) : undefined
      if (sameName) return { text: `You already have a pet named ${sameName.name}. Pick another name.` }
      const pet = createPet(store.roster, species, color, name)
      await saveStore($, { ...store, roster: [...store.roster, pet] })
      return {
        text:
          `Welcome, ${pet.name} the ${pet.color} ${pet.species}!` +
          (store.hidden ? ' (Pets are hidden: /pet show to see them.)' : ''),
      }
    }
    case 'remove': {
      if (args.length === 0)
        return { text: `Remove which pet? /pet remove <name>${store.roster.length ? ` (${rosterNames()})` : ''}` }
      const pet = findPet(args.join(' '))
      if (!pet)
        return {
          text: `No pet named "${args.join(' ')}".${store.roster.length ? ` Your pets: ${rosterNames()}.` : ' You have no pets yet.'}`,
        }
      await saveStore($, { ...store, roster: store.roster.filter(other => other.id !== pet.id) })
      return { text: `Goodbye, ${pet.name}. They will be missed.` }
    }
    case 'rename': {
      if (args.length === 0 || store.roster.length === 0)
        return {
          text: `Rename which pet? /pet rename <name> <new name>${store.roster.length ? ` (${rosterNames()})` : ''}`,
        }
      const { pet, newNameWords } = splitRenameArgs(args, findPet)
      if (!pet) return { text: `No pet named "${args.join(' ')}". Your pets: ${rosterNames()}.` }
      const newName = newNameWords.join(' ').slice(0, MAX_PET_NAME_LENGTH).trim()
      if (!newName) return { text: `What should ${pet.name} be called? /pet rename ${pet.name} <new name>` }
      const sameName = findPet(newName)
      if (sameName && sameName.id !== pet.id)
        return { text: `You already have a pet named ${sameName.name}. Pick another name.` }
      await saveStore($, {
        ...store,
        roster: store.roster.map(other => (other.id === pet.id ? { ...other, name: newName } : other)),
      })
      return { text: `${pet.name} is now called ${newName}.` }
    }
    case 'clear': {
      if (store.roster.length === 0) return { text: 'You have no pets to clear.' }
      await saveStore($, { ...store, roster: [] })
      return {
        text: `Cleared ${store.roster.length} pet${store.roster.length === 1 ? '' : 's'}. /pet add <cat|dog> to adopt again.`,
      }
    }
    case 'list': {
      const lines = store.roster.map((pet, i) => `${i + 1}. ${pet.name} - ${pet.color} ${pet.species}`)
      const heading = store.roster.length
        ? `Your pets (${store.roster.length}/${MAX_PETS}):`
        : 'You have no pets yet. /pet add <cat|dog> [color] [name]'
      return {
        text: [heading, ...lines, ...(store.hidden ? ['(hidden: /pet show to bring them back)'] : [])].join('\n'),
      }
    }
    case 'hide': {
      if (store.hidden) return { text: 'The pets are already hidden. /pet show brings them back.' }
      await saveStore($, { ...store, hidden: true })
      return { text: 'Pets hidden. /pet show brings them back.' }
    }
    case 'show': {
      if (!store.hidden) return { text: 'The pets are already showing.' }
      await saveStore($, { ...store, hidden: false })
      return {
        text: store.roster.length
          ? 'Pets are back!'
          : 'Pets are shown, but you have none yet. /pet add <cat|dog> [color] [name]',
      }
    }
    case 'pat': {
      if (store.roster.length === 0) return { text: 'You have no pets to pat. /pet add <cat|dog> [color] [name]' }
      if (store.hidden) return { text: 'The pets are hidden, so they cannot be patted. /pet show first.' }
      const pet = args.length ? findPet(args.join(' ')) : pick(store.roster, rng.next())
      if (!pet) return { text: `No pet named "${args.join(' ')}". Your pets: ${rosterNames()}.` }
      const runtime = session.runtimes.get(pet.id)
      if (runtime) session.runtimes.set(pet.id, pat(runtime))
      return { text: pet.species === 'cat' ? `${pet.name} purrs. <3` : `${pet.name} wags happily. <3` }
    }
    default:
      return { text: subcommand ? `Unknown subcommand "${subcommand}".\n${USAGE_TEXT}` : USAGE_TEXT }
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const register: Register = on => {
  // `register` runs again on a hot reload (and once per test): start from a clean session.
  session.tickTimer?.cancel()
  session = newSession()

  on('session.start', async ($, e, next) => {
    await ensureCommandRegistered($)
    await loadStore($)
    return next(e)
  })

  on('prompt.submit', (_$, e, next) => {
    session.isClaudeWorking = true
    markUserActive()
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('turn.complete', (_$, e, next) => {
    session.isClaudeWorking = false
    markUserActive()
    return next(e)
  })

  on('prompt.edit', (_$, e, next) => {
    markUserActive()
    return next(e)
  })

  // No click handling: presses on the band carry no coordinates, so a click cannot say
  // which pet was hit. `/pet pat` stands in for it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, revisionAtom)
    await ensureCommandRegistered($)
    const { roster, hidden } = await loadStore($)

    if (e.props.hasSurvey || hidden || roster.length === 0 || e.surface !== 'terminal') {
      hideBand()
      return next(e)
    }

    const columns = Math.max(1, Math.min(MAX_BAND_COLUMNS, Math.floor(e.props.bodyColumns)))
    session.isClaudeWorking = e.props.isWorking
    if (session.isClaudeWorking) markUserActive()
    session.band = { requestId: e.requestId, columns }
    // Only a fresh load (no pets placed yet) needs the saved positions.
    const savedPositions = session.runtimes.size === 0 ? await read($, positionsAtom) : {}
    syncRuntimes(roster, columns, savedPositions)
    startTimer($)

    const { Box, Raster } = $.ui.resolve(e)

    return (
      <Box width={columns} height={BAND_ROWS}>
        <Raster
          key={BAND_KEY}
          columns={columns}
          rows={BAND_ROWS}
          cells={composeBandCells() ?? renderBand(columns, [])}
        />
      </Box>
    )
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    markUserActive()
    return runPetCommand($, e.args)
  })
}
