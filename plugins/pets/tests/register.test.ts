import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PetsPet } from '../types'

const ROSTER: PetsPet[] = [{ id: 'a', species: 'cat', color: 'gray', name: 'Tom' }]

/** An in-memory `$.store` the test can read back (`mock.store` has no read-back). */
function memoryStore(on: On, entries: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_$, e) => ({ value: data.get(e.key) === undefined ? undefined : JSON.parse(JSON.stringify(data.get(e.key))) }))
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

/** What the engine itself would draw in the band (nothing beneath the plugin answers otherwise). */
const engineBand = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'engine band' }) as never
  })

let seq = 0
const band = (over: Record<string, unknown> = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
  ...over,
})

const mount = ($: any, props = band()) =>
  $.ui.mount({ plugin: 'pets', surface: 'terminal', component: 'AbovePrompt', props, requestId: `band-${++seq}` })

const pet = async ($: any, args = '') => (await $.command.run({ command: 'pet', args })).text as string

test('a new user gets one random cat, saved to the store', async ($, on) => {
  const store = memoryStore(on)
  mock.clock(on)
  const text = await pet($, 'list')
  expect(text).toMatch(/1\. \S+ - \w+ cat/)
  const roster = store.get('roster') as PetsPet[]
  expect(roster).toHaveLength(1)
  expect(roster[0]!.species).toBe('cat')
})

test('add, list, remove, clear persist in the store', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await pet($, 'add dog golden Rex')).toMatch(/Rex the golden dog/)
  expect(await pet($, 'add cat Pixel Dust')).toMatch(/Pixel Dust/)
  expect(await pet($, 'add dog')).toMatch(/Welcome/)
  expect((store.get('roster') as PetsPet[]).map(p => p.name).slice(0, 3)).toEqual(['Tom', 'Rex', 'Pixel Dust'])
  expect(await pet($, 'list')).toMatch(/Your pets \(4\/6\)/)
  expect(await pet($, 'remove rex')).toMatch(/Goodbye, Rex/)
  expect((store.get('roster') as PetsPet[]).some(p => p.name === 'Rex')).toBe(false)
  expect(await pet($, 'remove nobody')).toMatch(/No pet named "nobody"/)
  expect(await pet($, 'clear')).toMatch(/Cleared 3 pets/)
  expect(store.get('roster')).toEqual([])
  expect(await pet($, 'clear')).toMatch(/no pets/)
})

test('add validates species, color, names and the cap of 6', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await pet($, 'add')).toMatch(/cat or a dog/)
  expect(await pet($, 'add bird')).toMatch(/cat or a dog/)
  expect(await pet($, 'add cat golden')).toMatch(/do not come in golden/)
  expect(await pet($, 'add cat black tom')).toMatch(/already have a pet named Tom/)
  for (let i = 0; i < 5; i++) expect(await pet($, 'add dog')).toMatch(/Welcome/)
  expect(await pet($, 'add cat')).toMatch(/most that fit/)
  const roster = store.get('roster') as PetsPet[]
  expect(roster).toHaveLength(6)
  expect(new Set(roster.map(p => p.name)).size).toBe(6)
})

test('hide and show persist the hidden flag', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await pet($, 'hide')).toMatch(/hidden/)
  expect(store.get('hidden')).toBe(true)
  expect(await pet($, 'hide')).toMatch(/already hidden/)
  expect(await pet($, 'pat')).toMatch(/hidden/)
  expect(await pet($, 'show')).toMatch(/back/)
  expect(store.get('hidden')).toBe(false)
  expect(await pet($, 'show')).toMatch(/already showing/)
})

test('pat replies, by name or at random, and errors on an unknown name', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await pet($, 'pat tom')).toMatch(/Tom purrs/)
  expect(await pet($, 'pat')).toMatch(/Tom purrs/)
  expect(await pet($, 'pat Rex')).toMatch(/No pet named "Rex"/)
})

test('no or unknown subcommand answers with usage', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  expect(await pet($)).toMatch(/Usage: \/pet/)
  expect(await pet($, 'dance')).toMatch(/Unknown subcommand "dance"[\s\S]*Usage/)
})

test('the stored roster survives a fresh load', async ($, on) => {
  memoryStore(on, { roster: [...ROSTER, { id: 'b', species: 'dog', color: 'brown', name: 'Rex' }], hidden: true })
  mock.clock(on)
  expect(await pet($, 'list')).toMatch(/Tom[\s\S]*Rex[\s\S]*hidden/)
})

test('the band draws a keyed Raster, sized to bodyColumns x 4', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  mock.clock(on)
  const ui = await mount($)
  const raster = await ui.find({ type: 'Raster', key: 'band' })
  expect(raster?.props.columns).toBe(78) // 80 minus the 2-column pat button
  expect(raster?.props.rows).toBe(4)
  const narrow = await mount($, band({ bodyColumns: 30 }))
  expect((await narrow.find({ type: 'Raster' }))?.props.columns).toBe(28)
  const tiny = await mount($, band({ bodyColumns: 6 }))
  expect((await tiny.find({ type: 'Raster' }))?.props.columns).toBe(6) // too narrow for the button
  expect((await tiny.findAll({ type: 'Button' })).length).toBe(0)
  await tiny.unmount()
  await ui.unmount()
  await narrow.unmount()
})

test('hidden, empty or surveyed: the band draws nothing of ours', async ($, on) => {
  engineBand(on)
  const store = memoryStore(on, { roster: ROSTER, hidden: true })
  mock.clock(on)
  expect(await (await mount($)).find({ type: 'Raster' })).toBeUndefined()
  await pet($, 'show')
  expect(await (await mount($, band({ hasSurvey: true }))).find({ type: 'Raster' })).toBeUndefined()
  await pet($, 'clear')
  expect(await (await mount($)).find({ type: 'Raster' })).toBeUndefined()
})

test('the timer blits while visible and stops when hidden', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  const clock = mock.clock(on)
  const blits: any[] = []
  on('ui.blit', (_$: any, e: any) => {
    blits.push(e)
    return { value: {} }
  })
  const ui = await mount($)
  await clock.advance(125 * 8)
  expect(blits.length).toBe(8)
  expect(blits[0]).toMatchObject({ key: 'band', columns: 78, rows: 4 })
  const first = blits[0].cells
  await clock.advance(125 * 40)
  expect(blits.some(b => b.cells !== first)).toBe(true)
  await pet($, 'hide')
  const count = blits.length
  await clock.advance(125 * 8)
  expect(blits.length).toBe(count)
  await pet($, 'show')
  await clock.advance(125 * 4)
  expect(blits.length).toBeGreaterThan(count)
  await ui.unmount()
})

test('the pat button beside the band hearts a pet, and nothing overlays the raster', async ($, on) => {
  const store = memoryStore(on, { roster: ROSTER })
  const clock = mock.clock(on)
  const blits: any[] = []
  on('ui.blit', (_$: any, e: any) => {
    blits.push(e)
    return { value: {} }
  })
  const ui = await mount($, band({ bodyColumns: 20 }))
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.length).toBe(1)
  await clock.advance(125)
  expect(blits[blits.length - 1].columns).toBe(18) // 20 minus the button's 2
  const before = blits[blits.length - 1].cells
  await ui.press({ key: 'pat' })
  await clock.advance(125)
  expect(blits[blits.length - 1].cells).not.toBe(before)
  await ui.unmount()
})
