import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Category, HistoryEntry, Lesson } from '../types'

const PLUGIN = 'learn-band'
const CATEGORIES: readonly Category[] = ['kód', 'projekt', 'keretrendszer', 'nyelv', 'rendszertervezés']
const HISTORY_LIMIT = 40

type Lang = 'hu' | 'en'

const UI = {
  hu: {
    card: 'tanulókártya',
    busy: 'készül…',
    status: '📚 tanulókártya készül…',
    next: 'Új',
    more: 'Bővebben',
    less: 'Kevesebb',
    hide: 'Elrejt',
    failed: (reason: string) => `📚 Tanulókártya nem készült: ${reason}`,
    error: (message: string) => `📚 Tanulókártya hiba: ${message}`,
    commandDescription: 'Új tanulókártya a prompt felett (kód | projekt | keretrendszer | nyelv | rendszertervezés | szabad téma)',
    commandHint: '[kategória vagy téma]',
    starting: (what: string) => `📚 Tanulókártya készül ${what}… a prompt feletti sávban jelenik meg.`,
    nextTopic: '(következő téma)',
    categories: {
      kód: 'kód',
      projekt: 'projekt',
      keretrendszer: 'keretrendszer',
      nyelv: 'nyelv',
      rendszertervezés: 'rendszertervezés',
      téma: 'téma',
    } satisfies Record<Category, string>,
  },
  en: {
    card: 'learning card',
    busy: 'writing…',
    status: '📚 learning card on its way…',
    next: 'New',
    more: 'More',
    less: 'Less',
    hide: 'Hide',
    failed: (reason: string) => `📚 No learning card: ${reason}`,
    error: (message: string) => `📚 Learning card error: ${message}`,
    commandDescription: 'A new learning card above the prompt (code | project | framework | language | system design | free topic)',
    commandHint: '[category or topic]',
    starting: (what: string) => `📚 Writing a learning card ${what}… it shows in the band above the prompt.`,
    nextTopic: '(next topic)',
    categories: {
      kód: 'code',
      projekt: 'project',
      keretrendszer: 'framework',
      nyelv: 'language',
      rendszertervezés: 'system design',
      téma: 'topic',
    } satisfies Record<Category, string>,
  },
} as const

function t(): (typeof UI)[Lang] {
  return ctx.language === 'en' ? UI.en : UI.hu
}

const CATEGORY_COLOR: Record<Category, string> = {
  kód: 'claude',
  projekt: 'success',
  keretrendszer: 'suggestion',
  nyelv: 'remember',
  rendszertervezés: 'permission',
  téma: 'warning',
}

const lesson = atom({ plugin: 'learn-band', key: 'lesson' } as const, null)
const isHidden = atom({ plugin: 'learn-band', key: 'isHidden' } as const, false)
const isBusy = atom({ plugin: 'learn-band', key: 'isBusy' } as const, false)
const isExpanded = atom({ plugin: 'learn-band', key: 'isExpanded' } as const, true)

type Touched = { path: string; snippet: string }

type GenerateRequest = {
  category?: Category
  topic?: string
  files: Touched[]
  prompt: string
  answer: string
}

const SYSTEM_HU = `Te egy tapasztalt szoftvermérnök-mentor vagy. A fejlesztő ma már nem gépeli a kódot, egy AI-ügynök írja helyette, de ő szeretne naprakész és mélyen hozzáértő maradni. Minden híváskor EGY rövid, konkrét tanulókártyát írsz.

Szabályok:
- Az első sor: "# <cím>" (legfeljebb 8 szó).
- Utána 80–140 szó markdown törzs: mi ez, miért így csináljuk, mi a tipikus csapda.
- Zárásként egy sor "**Próbáld ki:**" vagy "**Nézz utána:**" egy konkrét, elvégezhető lépéssel; legfeljebb egy link.
- Ne ismételd a "Korábbi címek" között felsorolt témákat; válassz újat.
- Kategóriánként:
  - kód: a most módosított fájlokból/diffből indulj: mi történt, miért így, mire figyelj.
  - projekt: a projekt saját szabályaiból, domainjéből, architektúrájából (a megadott projekt-kontextusból).
  - keretrendszer: a projekt stackjének (a projekt-kontextus függőségei szerinti keretrendszerek, könyvtárak) aktuális verziójában ma ajánlott minta vagy újdonság.
  - nyelv: TypeScript / JavaScript nyelvi eszköz, típusrendszer, futtatókörnyezet.
  - rendszertervezés: a projekt méretéhez illő system design elv (skálázás, konzisztencia, cache, sorok, megfigyelhetőség stb.).
- Szabad téma esetén a kártya általános, technológia- és projektfüggetlen: ne hivatkozz semmilyen konkrét projektre, kódra vagy stackre. Fogalmat magyarázz, különbséget tegyél, és mondd ki, mikor melyiket érdemes választani (döntési szempontok, tipikus tévhit). Összevetésnél („X vs Y") mindkét oldal erősségeit és gyenge pontjait add meg.
- Csak a kártyát írd, semmi bevezetőt vagy lezárást.`

const SYSTEM_EN = `You are a senior software engineering mentor. The developer no longer types the code; an AI agent writes it. They want to stay sharp and up to date. On each call you write ONE short, concrete learning card.

Rules:
- First line: "# <title>" (at most 8 words).
- Then an 80–140 word markdown body: what it is, why we do it this way, the typical pitfall.
- Close with one line "**Try it:**" or "**Look up:**" with one concrete, doable step; at most one link.
- Do not repeat the topics listed under "Previous titles"; pick something new.
- Per category:
  - kód (code): start from the files/diff just changed: what happened, why this way, what to watch for.
  - projekt (project): the project's own rules, domain and architecture (from the given project context).
  - keretrendszer (framework): a pattern or novelty recommended today in the current versions of the project's stack (the frameworks and libraries among the project context's dependencies).
  - nyelv (language): a TypeScript / JavaScript language feature, type-system or runtime topic.
  - rendszertervezés (system design): a principle that fits the project's scale (scaling, consistency, caching, queues, observability...).
- For a free topic the card is general and independent of any technology stack or project: never refer to a specific project, code or stack. Explain the concept, draw the distinction, and say when to choose which (decision criteria, a typical misconception). For a comparison ("X vs Y") give both sides' strengths and weaknesses.
- Write only the card, no preamble or closing.`

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function parseCategory(args: string): { category?: Category; topic?: string } {
  const text = args.trim()
  if (text === '') return {}
  const lower = text.toLowerCase()
  const aliases: Record<string, Category> = {
    kod: 'kód',
    kód: 'kód',
    code: 'kód',
    projekt: 'projekt',
    project: 'projekt',
    keretrendszer: 'keretrendszer',
    framework: 'keretrendszer',
    nyelv: 'nyelv',
    language: 'nyelv',
    rendszertervezes: 'rendszertervezés',
    rendszertervezés: 'rendszertervezés',
    design: 'rendszertervezés',
    'system-design': 'rendszertervezés',
  }
  const found = aliases[lower]
  return found ? { category: found } : { topic: text }
}

function parseLesson(text: string): { title: string; body: string } {
  const lines = text.trim().split('\n')
  const headingAt = lines.findIndex(line => /^#+\s+/.test(line))
  if (headingAt === -1) {
    const first = lines[0] ?? ''
    return { title: cut(first.replace(/^[*_\s]+|[*_\s]+$/g, ''), 80), body: lines.slice(1).join('\n').trim() }
  }
  const title = (lines[headingAt] ?? '').replace(/^#+\s+/, '').trim()
  const body = [...lines.slice(0, headingAt), ...lines.slice(headingAt + 1)].join('\n').trim()
  return { title, body }
}

function firstSentence(body: string): string {
  const plain = body.replace(/\s+/g, ' ').trim()
  const match = /^(.+?[.!?])(\s|$)/.exec(plain)
  return cut(match ? match[1] ?? plain : plain, 160)
}

type Context = {
  model: string
  language: string
  projectContext: string
  touched: Touched[]
  touchedChars: number
  lastPrompt: string
  inFlight: AbortController | null
}

const ctx: Context = {
  model: 'sonnet',
  language: 'hu',
  projectContext: '',
  touched: [],
  touchedChars: 0,
  lastPrompt: '',
  inFlight: null,
}

async function loadProjectContext($: EngineInterface): Promise<void> {
  const parts: string[] = []
  try {
    parts.push(`Munkakönyvtár: ${await $.session.cwd()}`)
  } catch {
    /* no cwd: fine */
  }
  try {
    const claudeMd = await $.fs.read('CLAUDE.md')
    parts.push('CLAUDE.md (részlet):\n' + cut(claudeMd, 3000))
  } catch {
    /* no CLAUDE.md: fine */
  }
  try {
    const pkg = JSON.parse(await $.fs.read('package.json')) as {
      name?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = Object.entries({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })
      .map(([name, version]) => `${name}@${version}`)
      .slice(0, 80)
    parts.push(`package.json: ${pkg.name ?? ''}\nfüggőségek: ${deps.join(', ')}`)
  } catch {
    /* no package.json: fine */
  }
  ctx.projectContext = parts.join('\n\n')
}

async function nextCategory($: EngineInterface, hasFiles: boolean): Promise<Category> {
  const counter = Number((await $.store.get('rotation')) ?? 0)
  for (let step = 0; step < CATEGORIES.length; step += 1) {
    const candidate = CATEGORIES[(counter + step) % CATEGORIES.length] ?? 'projekt'
    if (candidate === 'kód' && !hasFiles) continue
    return candidate
  }
  return 'projekt'
}

async function generate($: EngineInterface, request: GenerateRequest): Promise<void> {
  ctx.inFlight?.abort()
  const controller = new AbortController()
  ctx.inFlight = controller

  await update($, isBusy, () => true)
  $.ui.status(t().status)

  try {
    const isFreeTopic = request.topic !== undefined
    const category: Category = isFreeTopic
      ? 'téma'
      : (request.category ?? (await nextCategory($, request.files.length > 0)))
    const history = ((await $.store.get('history')) ?? []) as HistoryEntry[]
    const languageLine = `Nyelv: ${ctx.language === 'en' ? 'English' : 'magyar'}`
    const historyLine =
      history.length > 0
        ? 'Korábbi címek (ne ismételd):\n' + history.map(h => `- [${h.category}] ${h.title}`).join('\n')
        : null

    const sections: string[] = []
    if (isFreeTopic) {
      // A free topic is answered on its own: no project, no diff, no turn.
      sections.push(`Szabad téma: ${request.topic}`, languageLine)
    } else {
      sections.push(`Kategória: ${category}`, languageLine)
      if (ctx.projectContext) sections.push(`Projekt-kontextus:\n${ctx.projectContext}`)
      if (request.files.length > 0) {
        sections.push(
          'Ebben a körben módosított fájlok:\n' +
            request.files.map(f => `--- ${f.path}\n${f.snippet}`).join('\n'),
        )
      }
      if (request.prompt) sections.push(`A fejlesztő kérése ebben a körben:\n${cut(request.prompt, 800)}`)
      if (request.answer) sections.push(`Az ügynök válasza:\n${cut(request.answer, 1500)}`)
    }
    if (historyLine) sections.push(historyLine)

    const result = await $.model.complete(
      {
        model: ctx.model,
        system: [{ text: ctx.language === 'en' ? SYSTEM_EN : SYSTEM_HU, cache: true }],
        prompt: sections.join('\n\n'),
        maxTokens: isFreeTopic ? 900 : 700,
        effort: 'low',
        timeoutMs: 45000,
      },
      { signal: controller.signal },
    )

    if (controller.signal.aborted) return

    if (!result.isAnswered) {
      $.ui.toast(t().failed(result.reason))
      return
    }

    const { title, body } = parseLesson(result.text)
    const at = await $.clock.now()
    const fresh: Lesson = {
      title,
      body,
      category,
      topic: request.topic,
      at,
      files: isFreeTopic ? [] : request.files.map(f => f.path),
    }

    await update($, lesson, () => fresh)
    await update($, isHidden, () => false)
    await $.store.set('lastLesson', fresh)
    await $.store.set('history', [...history, { title, category, at }].slice(-HISTORY_LIMIT))
    if (!request.category && !isFreeTopic) {
      await $.store.set('rotation', Number((await $.store.get('rotation')) ?? 0) + 1)
    }
    $.ui.toast(`📚 ${title}`)
  } finally {
    if (ctx.inFlight === controller) {
      ctx.inFlight = null
      await update($, isBusy, () => false)
      $.ui.status(undefined)
    }
  }
}

function startGenerate($: EngineInterface, request: GenerateRequest): void {
  $.clock.after(0, () => {
    void generate($, request).catch(error => {
      $.ui.toast(t().error(error instanceof Error ? error.message : String(error)))
    })
  })
}

export const register: Register = (on, options) => {
  ctx.model = String(options.model ?? 'sonnet')
  ctx.language = String(options.language ?? 'hu')
  ctx.touched = []
  ctx.touchedChars = 0
  ctx.lastPrompt = ''
  ctx.inFlight = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'learn',
      description: t().commandDescription,
      argumentHint: t().commandHint,
    })

    await loadProjectContext($)

    const saved = (await $.store.get('lastLesson')) as Lesson | null | undefined
    if (saved && typeof saved.title === 'string') {
      await update($, lesson, current => current ?? saved)
    }

    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      ctx.touched = []
      ctx.touchedChars = 0
      ctx.lastPrompt = e.text
    }
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    let entry: Touched | null = null
    if (e.tool === 'Edit') {
      entry = { path: e.file_path, snippet: cut(e.new_string, 600) }
    } else if (e.tool === 'Write') {
      entry = { path: e.file_path, snippet: cut(e.content, 600) }
    } else if (e.tool === 'NotebookEdit') {
      entry = { path: e.notebook_path, snippet: cut(e.new_source, 600) }
    }
    if (entry && ctx.touchedChars < 3000) {
      ctx.touched.push(entry)
      ctx.touchedChars += entry.snippet.length
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer' && !e.isAborted && ctx.touched.length > 0) {
      startGenerate($, { files: [...ctx.touched], prompt: ctx.lastPrompt, answer: e.answer })
    }
    return next(e)
  })

  on('command.run', { command: 'learn' }, async ($, e) => {
    const { category, topic } = parseCategory(e.args)
    startGenerate($, { category, topic, files: [...ctx.touched], prompt: ctx.lastPrompt, answer: '' })
    const what = topic ? `„${topic}”` : category ? `(${t().categories[category]})` : t().nextTopic
    return { text: t().starting(what) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, lesson)
    const busy = await read($, isBusy)
    const hidden = await read($, isHidden)

    if (e.props.hasSurvey || hidden || (current === null && !busy)) {
      return next(e)
    }

    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const expanded = await read($, isExpanded)

    const onNext = () => {
      void update($, isHidden, () => false)
      startGenerate($, { files: [...ctx.touched], prompt: ctx.lastPrompt, answer: '' })
    }
    const onToggle = () => update($, isExpanded, value => !value)
    const onHide = () => update($, isHidden, () => true)

    const labels = t()
    const categoryLabel = current ? labels.categories[current.category] : null
    const categoryColor = current ? CATEGORY_COLOR[current.category] : 'claude'

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={categoryColor} borderDimColor paddingX={1}>
        <Box>
          <Text color="claude">📚 </Text>
          {current && categoryLabel && (
            <Text color={categoryColor} bold>
              {categoryLabel}
            </Text>
          )}
          {current?.topic && <Text dimColor> · {current.topic}</Text>}
          {current && <Text dimColor> · </Text>}
          {current ? <Text bold>{current.title}</Text> : <Text dimColor>{labels.card}</Text>}
          {busy && (
            <Text color="warning" italic>
              {' '}
              · {labels.busy}
            </Text>
          )}
        </Box>
        {current && expanded && <Markdown text={current.body} />}
        {current && !expanded && <Text dimColor>{firstSentence(current.body)}</Text>}
        <Box>
          <Button key="next" hotkey="n" label={labels.next} variant="primary" onPress={onNext} />
          <Text> </Text>
          <Button key="toggle" hotkey="b" label={expanded ? labels.less : labels.more} onPress={onToggle} />
          <Text> </Text>
          <Button key="hide" hotkey="x" label={labels.hide} dimColor onPress={onHide} />
        </Box>
      </Box>
    )
  })
}
