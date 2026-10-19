import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

/** The engine's own bottoms a session would answer beneath the plugin. */
function boot(on: On): void {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/learn-band-test' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('fs.read', (_, e) => {
    if (e.path === 'CLAUDE.md') return { value: '# Teszt projekt\n\nAngular + NestJS.' }
    return { deny: `no such file: ${e.path}` }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

const USAGE = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const CARD = '# Mongo összetett index\n\nAz első mondat. A második mondat.\n\n**Próbáld ki:** nézd meg az explain() kimenetét.'

test('/learn <kategória> kér egy kártyát és a sáv megmutatja', { options: { language: 'hu' } }, async ($, on) => {
  boot(on)
  mock.store(on)
  const clock = mock.clock(on)
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: CARD, usage: USAGE } }
  })

  await $.session.start({ cwd: '/tmp/learn-band-test', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ plugin: 'learn-band', surface, ...BAND })
    expect(await empty.find({ type: 'Button' })).toBeUndefined()
    await empty.unmount()
  }

  const ran = await $.command.run({ ...RUN, command: 'learn', args: 'rendszertervezés' })
  expect(ran.text).toContain('készül')
  await clock.settle()

  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('Kategória: rendszertervezés')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'learn-band', surface, ...BAND })
    expect(await ui.find({ text: /Mongo összetett index/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()

    await ui.press({ key: 'toggle' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    expect(await ui.find({ text: /Az első mondat\./ })).toBeDefined()

    await ui.press({ key: 'toggle' })
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'learn-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('szabad téma és a korábbi címek a promptban', { options: { language: 'hu' } }, async ($, on) => {
  boot(on)
  mock.store(on, { history: [{ title: 'Régi cím', category: 'nyelv', at: 1 }] })
  const clock = mock.clock(on)
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: CARD, usage: USAGE } }
  })
  await $.session.start({ cwd: '/tmp/learn-band-test', surface: 'terminal', isInteractive: true })

  await $.command.run({ ...RUN, command: 'learn', args: 'optimistic locking Mongoose-ban' })
  await clock.settle()

  expect(prompts[0]).toContain('Szabad téma: optimistic locking Mongoose-ban')
  expect(prompts[0]).toContain('[nyelv] Régi cím')
  expect(prompts[0]).not.toContain('Kategória:')
  expect(prompts[0]).not.toContain('Projekt-kontextus')
  expect(prompts[0]).not.toContain('Teszt projekt')
  expect(prompts[0]).not.toContain('A fejlesztő kérése')

  const ui = await $.ui.mount({ plugin: 'learn-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /téma · optimistic locking Mongoose-ban/ })).toBeDefined()
  await ui.unmount()

  // A free topic leaves the rotation alone: the next bare /learn starts at the first category.
  await $.command.run({ ...RUN, command: 'learn', args: '' })
  await clock.settle()
  expect(prompts[1]).toContain('Kategória: projekt')
})

test('csak kódmódosító kör után készül kártya magától', async ($, on) => {
  boot(on)
  mock.store(on)
  const clock = mock.clock(on)
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: CARD, usage: USAGE } }
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: '/p/a.ts' } as never, text: 'ok' }))
  await $.session.start({ cwd: '/tmp/learn-band-test', surface: 'terminal', isInteractive: true })

  await $.turn.start({ text: 'csak kérdezek', turnId: 't1' })
  await $.turn.complete({ reason: 'answer', answer: 'válasz', durationMs: 5, isAborted: false, turnId: 't1' })
  await clock.settle()
  expect(prompts).toHaveLength(0)

  await $.turn.start({ text: 'írd át a sémát', turnId: 't2' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'const b = 1' })
  await $.turn.complete({ reason: 'answer', answer: 'átírtam', durationMs: 5, isAborted: false, turnId: 't2' })
  await clock.settle()
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('/p/a.ts')
  expect(prompts[0]).toContain('const b = 1')
  expect(prompts[0]).toContain('írd át a sémát')
})

test('modellhiba esetén nem marad busy a sáv', async ($, on) => {
  boot(on)
  mock.store(on)
  const clock = mock.clock(on)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }))
  await $.session.start({ cwd: '/tmp/learn-band-test', surface: 'terminal', isInteractive: true })

  await $.command.run({ ...RUN, command: 'learn', args: '' })
  await clock.settle()

  const ui = await $.ui.mount({ plugin: 'learn-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('angol beállítással a sáv és a parancs is angol', { options: { language: 'en' } }, async ($, on) => {
  boot(on)
  mock.store(on)
  const clock = mock.clock(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: '# Compound index\n\nBody.', usage: USAGE } }))
  await $.session.start({ cwd: '/tmp/learn-band-test', surface: 'terminal', isInteractive: true })

  const ran = await $.command.run({ ...RUN, command: 'learn', args: 'mongo vs sql' })
  expect(ran.text).toContain('Writing a learning card')
  await clock.settle()

  const ui = await $.ui.mount({ plugin: 'learn-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ key: 'next' }))?.props.label).toBe('New')
  expect((await ui.find({ key: 'hide' }))?.props.label).toBe('Hide')
  expect(await ui.find({ text: /^topic$/ })).toBeDefined()
  await ui.unmount()
})
