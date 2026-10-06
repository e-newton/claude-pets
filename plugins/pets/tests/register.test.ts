import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { renderBand } from '../hooks/render'
import { BAND_ROWS, getFrames } from '../hooks/sprites'
import type { PetsPet } from '../types'

const TICK_MS = 125
type Positions = Record<string, { x: number; dir: number }>
const ROSTER: PetsPet[] = [{ id: 'a', species: 'cat', color: 'gray', name: 'Tom' }]

/** An in-memory `$.store` the test can read back (`mock.store` has no read-back). */
function memoryStore(on: On, entries: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_$, e) => ({
    value: data.get(e.key) === undefined ? undefined : JSON.parse(JSON.stringify(data.get(e.key))),
  }))
  on('store.set', (_$, e) => {
    data.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    data.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...data.keys()] }))
  return { get: (key: string) => data.get(key) }
}

/**
 * An in-memory `$.state` for the `pets` plugin's values. `seed` is what the session holds
 * before the plugin loads, as after a hot reload; `values` reads what the plugin wrote.
 */
function memoryState(on: On, seed: Record<string, unknown> = {}) {
  const values = new Map<string, { value: unknown; version: number }>(
    Object.entries(seed).map(([key, value]) => [key, { value, version: 1 }]),
  )
  on(
    'state.get',
    (_$, e) => ({ value: { value: values.get(e.key)?.value, version: values.get(e.key)?.version ?? 0 } }) as never,
  )
  on('state.set', (_$, e) => {
    const version = (values.get(e.key)?.version ?? 0) + 1
    values.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } } as never
  })
  return { get: (key: string) => values.get(key)?.value }
}

/** What the engine itself would draw in the band (nothing beneath the plugin answers otherwise). */
const engineBand = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'engine band' }) as never
  })

let nextRequestId = 0
/** The props the engine hands the AbovePrompt component. */
const bandProps = (overrides: Record<string, unknown> = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
  ...overrides,
})

const mountBand = ($: any, props = bandProps()) =>
  $.ui.mount({
    plugin: 'pets',
    surface: 'terminal',
    component: 'AbovePrompt',
    props,
    requestId: `band-${++nextRequestId}`,
  })

/** Runs `/pet <args>` and returns the reply text. */
const petCommand = async ($: any, args = '') => (await $.command.run({ command: 'pet', args })).text as string

test('a new user gets one random cat, saved to the store', async ($, on) => {
  const store = memoryStore(on)
  mock.clock(on)
  const text = await petCommand($, 'list')
  expect(text).toMatch(/1\. \S+ - \w+ cat/)
  const roster = store.get('roster') as PetsPet[]
  expect(roster).toHaveLength(1)
  expect(roster[0]!.species).toBe('cat')
})

test('add, list, remove, clear persist in the store', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await petCommand($, 'add dog golden Rex')).toMatch(/Rex the golden dog/)
  expect(await petCommand($, 'add cat Pixel Dust')).toMatch(/Pixel Dust/)
  expect(await petCommand($, 'add dog')).toMatch(/Welcome/)
  expect((store.get('roster') as PetsPet[]).map(p => p.name).slice(0, 3)).toEqual(['Tom', 'Rex', 'Pixel Dust'])
  expect(await petCommand($, 'list')).toMatch(/Your pets \(4\/6\)/)
  expect(await petCommand($, 'remove rex')).toMatch(/Goodbye, Rex/)
  expect((store.get('roster') as PetsPet[]).some(p => p.name === 'Rex')).toBe(false)
  expect(await petCommand($, 'remove nobody')).toMatch(/No pet named "nobody"/)
  expect(await petCommand($, 'clear')).toMatch(/Cleared 3 pets/)
  expect(store.get('roster')).toEqual([])
  expect(await petCommand($, 'clear')).toMatch(/no pets/)
})

test('add validates species, color, names and the cap of 6', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await petCommand($, 'add')).toMatch(/cat or a dog/)
  expect(await petCommand($, 'add bird')).toMatch(/cat or a dog/)
  expect(await petCommand($, 'add cat golden')).toMatch(/do not come in golden/)
  expect(await petCommand($, 'add cat black tom')).toMatch(/already have a pet named Tom/)
  for (let i = 0; i < 5; i++) expect(await petCommand($, 'add dog')).toMatch(/Welcome/)
  expect(await petCommand($, 'add cat')).toMatch(/most that fit/)
  const roster = store.get('roster') as PetsPet[]
  expect(roster).toHaveLength(6)
  expect(new Set(roster.map(p => p.name)).size).toBe(6)
})

test('rename changes a pet name and persists it', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await petCommand($, 'rename tom Biscuit')).toBe('Tom is now called Biscuit.')
  expect(store.get('roster')).toEqual([{ id: 'a', species: 'cat', color: 'gray', name: 'Biscuit' }])
  expect(await petCommand($, 'list')).toMatch(/1\. Biscuit - gray cat/)
  expect(await petCommand($, 'rename Biscuit BISCUIT')).toMatch(/now called BISCUIT/)
})

test('rename handles multi-word old and new names', async ($, on) => {
  const store = memoryStore(on, { roster: [{ id: 'a', species: 'cat', color: 'gray', name: 'Pixel Dust' }] })
  mock.clock(on)
  expect(await petCommand($, 'rename pixel dust Sir Fluffington')).toBe('Pixel Dust is now called Sir Fluffington.')
  expect((store.get('roster') as PetsPet[]).map(p => p.name)).toEqual(['Sir Fluffington'])
})

test('rename explains unknown pets, missing new names and duplicate names', async ($, on) => {
  const store = memoryStore(on, {
    roster: [ROSTER[0]!, { id: 'b', species: 'dog', color: 'golden', name: 'Rex' }],
  })
  mock.clock(on)
  expect(await petCommand($, 'rename')).toMatch(/Rename which pet\?.*Tom, Rex/)
  expect(await petCommand($, 'rename nobody Fido')).toMatch(/No pet named "nobody Fido".*Tom, Rex/)
  expect(await petCommand($, 'rename Tom')).toMatch(/What should Tom be called/)
  expect(await petCommand($, 'rename Tom rex')).toMatch(/already have a pet named Rex/)
  expect((store.get('roster') as PetsPet[]).map(p => p.name)).toEqual(['Tom', 'Rex'])
})

test('hide and show persist the hidden flag', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await petCommand($, 'hide')).toMatch(/hidden/)
  expect(store.get('hidden')).toBe(true)
  expect(await petCommand($, 'hide')).toMatch(/already hidden/)
  expect(await petCommand($, 'pat')).toMatch(/hidden/)
  expect(await petCommand($, 'show')).toMatch(/back/)
  expect(store.get('hidden')).toBe(false)
  expect(await petCommand($, 'show')).toMatch(/already showing/)
})

test('pat replies, by name or at random, and errors on an unknown name', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await petCommand($, 'pat tom')).toMatch(/Tom purrs/)
  expect(await petCommand($, 'pat')).toMatch(/Tom purrs/)
  expect(await petCommand($, 'pat Rex')).toMatch(/No pet named "Rex"/)
})

test('no or unknown subcommand answers with usage', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await petCommand($)).toMatch(/Usage: \/pet/)
  expect(await petCommand($, 'dance')).toMatch(/Unknown subcommand "dance"[\s\S]*Usage/)
})

test('the stored roster survives a fresh load', async ($, on) => {
  memoryStore(on, { roster: [...ROSTER, { id: 'b', species: 'dog', color: 'brown', name: 'Rex' }], hidden: true })
  mock.clock(on)
  expect(await petCommand($, 'list')).toMatch(/Tom[\s\S]*Rex[\s\S]*hidden/)
})

test('the band draws a keyed Raster, sized to bodyColumns x BAND_ROWS', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  const ui = await mountBand($)
  const raster = await ui.find({ type: 'Raster', key: 'band' })
  expect(raster?.props.columns).toBe(80)
  expect(raster?.props.rows).toBe(BAND_ROWS)
  const narrow = await mountBand($, bandProps({ bodyColumns: 30 }))
  expect((await narrow.find({ type: 'Raster' }))?.props.columns).toBe(30)
  const tiny = await mountBand($, bandProps({ bodyColumns: 6 }))
  expect((await tiny.find({ type: 'Raster' }))?.props.columns).toBe(6)
  await tiny.unmount()
  await ui.unmount()
  await narrow.unmount()
})

test('hidden, empty or surveyed: the band draws nothing of ours', async ($, on) => {
  engineBand(on)
  memoryStore(on, { roster: ROSTER, hidden: true })
  mock.clock(on)
  expect(await (await mountBand($)).find({ type: 'Raster' })).toBeUndefined()
  await petCommand($, 'show')
  expect(await (await mountBand($, bandProps({ hasSurvey: true }))).find({ type: 'Raster' })).toBeUndefined()
  await petCommand($, 'clear')
  expect(await (await mountBand($)).find({ type: 'Raster' })).toBeUndefined()
})

test('the timer blits while visible and stops when hidden', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  const clock = mock.clock(on)
  const blits: any[] = []
  on('ui.blit', (_$: any, e: any) => {
    blits.push(e)
    return { value: {} }
  })
  const ui = await mountBand($)
  await clock.advance(TICK_MS * 8)
  expect(blits.length).toBe(8)
  expect(blits[0]).toMatchObject({ key: 'band', columns: 80, rows: BAND_ROWS })
  const first = blits[0].cells
  await clock.advance(TICK_MS * 40)
  expect(blits.some(b => b.cells !== first)).toBe(true)
  await petCommand($, 'hide')
  const count = blits.length
  await clock.advance(TICK_MS * 8)
  expect(blits.length).toBe(count)
  await petCommand($, 'show')
  await clock.advance(TICK_MS * 4)
  expect(blits.length).toBeGreaterThan(count)
  await ui.unmount()
})

test('pet positions are saved to $.state about every 8 ticks', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  const state = memoryState(on)
  const clock = mock.clock(on)
  const ui = await mountBand($)
  await clock.advance(TICK_MS * 7)
  expect(state.get('positions')).toBeUndefined()
  await clock.advance(TICK_MS)
  const saved = state.get('positions') as Positions
  expect(Object.keys(saved)).toEqual(['a'])
  expect(saved.a!.x).toBeGreaterThanOrEqual(0)
  expect(saved.a!.x).toBeLessThanOrEqual(60)
  expect([1, -1]).toContain(saved.a!.dir)
  await ui.unmount()
})

test('a fresh load resumes pets at their saved positions (hot reload)', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  memoryState(on, { positions: { a: { x: 40, dir: -1 } } })
  mock.clock(on)
  const ui = await mountBand($)
  const cells = (await ui.find({ type: 'Raster' }))?.props.cells
  const catWalkingLeftAt40 = { frame: getFrames('cat', 'gray', 'walk')[0]!, x: 40, facingLeft: true, overlay: null }
  expect(cells).toBe(renderBand(80, [catWalkingLeftAt40]))
  await ui.unmount()
})

test('a saved position beyond the band is pulled back inside it', async ($, on) => {
  memoryStore(on, { roster: ROSTER })
  memoryState(on, { positions: { a: { x: 500, dir: 1 } } })
  mock.clock(on)
  const ui = await mountBand($, bandProps({ bodyColumns: 50 }))
  const cells = (await ui.find({ type: 'Raster' }))?.props.cells
  const catAtRightEdge = { frame: getFrames('cat', 'gray', 'walk')[0]!, x: 30, facingLeft: false, overlay: null }
  expect(cells).toBe(renderBand(50, [catAtRightEdge]))
  await ui.unmount()
})
