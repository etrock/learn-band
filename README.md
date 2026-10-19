# learn-band

A learning card above the Claude Code prompt. We hardly write code by hand any more, but we still
want to learn and stay up to date. After every turn in which Claude edits or writes a file, this mod asks
a model for one short lesson drawn from the code just touched, from your project, from the framework,
from the language, or from system design, and draws it in the band above the prompt. `/learn` brings
a card any time, during planning too.

```
╭─ 📚 framework · Angular signals replace async pipe in templates ─────────────╮
│ With signals, a component reads `count()` in the template and the view updates │
│ … (expand with b)                                                               │
│ [n] New   [b] More   [x] Hide                                                   │
╰─────────────────────────────────────────────────────────────────────────────────╯
```

The border and category label change colour by category: code, project, framework, language,
system design, free topic. The buttons have hotkeys: `n` new card, `b` expand / collapse, `x` hide.

## Install

At the prompt of a terminal session:

```
/plugin install learn-band --marketplace etrock/learn-band
```

Answer `y` to add the marketplace, then pick a scope (user scope installs it for every session).

From a shell:

```
claude plugin install learn-band --marketplace etrock/learn-band
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `etrock/learn-band`, then **Add plugin**.

## Usage

- **Automatic card**: after a turn in which Claude used Edit, Write or NotebookEdit, a card is written from
  the touched files, the turn's request and answer, and the project context (CLAUDE.md, package.json).
  Categories rotate between project, framework, language and system design; "code" is picked when files
  were edited.
- `/learn` – a new card, next category in the rotation.
- `/learn <category>` – a card of that kind. Accepted names: `code` / `kód`, `project` / `projekt`,
  `framework` / `keretrendszer`, `language` / `nyelv`, `design` / `system-design` / `rendszertervezés`.
- `/learn <free topic>` – for example `/learn mongo vs sql` or `/learn conditional and mapped types`.
  A free topic gives a general, project-independent card: what the concept is, the differences, and when
  to pick which.

The card is a title, a body of 80–140 words and one "Try it" or "Read more" line, with at most one link.
Recent titles are remembered across sessions so cards do not repeat.

## Settings

Open `/config` and look for the plugin's section:

| Setting    | Values                     | Default  | Meaning                                                |
| ---------- | -------------------------- | -------- | ------------------------------------------------------ |
| `model`    | `haiku`, `sonnet`, `opus`  | `sonnet` | Which model writes the card.                           |
| `language` | `hu`, `en`                 | `hu`     | Language of the card, the band, the buttons and toasts. |

## What leaves your machine, and cost

The card is produced with the engine's own model call (`$.model.complete`), under your Claude account.
Each automatic or category card sends a compact context: the turn's request and answer, up to 3000
characters of snippets from the touched files, the first 3000 characters of CLAUDE.md and the project's
dependency names. A free-topic card sends only the topic and the recent titles, no project data. Each
card is one short model call with low effort, roughly 700–900 output tokens.

## Development

```
claude plugin validate .
claude plugin test .
npx tsc -p .
```

`.claude-plugin/types/` is written by the engine when the mod loads and is not committed. To run from
the folder while hacking on it: `claude --plugin-dir .`.

---

## Magyarul

Tanulókártya a Claude Code prompt felett. Minden olyan kör után, amelyben Claude fájlt módosít vagy
ír, egy rövid leckét kapsz az épp érintett kódból, a projektből, a keretrendszerből, a nyelvből vagy
rendszertervezésből. A `/learn` paranccsal bármikor kérhetsz kártyát, tervezés közben is.

**Telepítés** egy terminál-session promptjánál:

```
/plugin install learn-band --marketplace etrock/learn-band
```

`y` a marketplace hozzáadásához, utána válassz scope-ot (a user scope minden sessionben betölti).

**Használat**

- Automatikus kártya minden Edit/Write kör után.
- `/learn` – új kártya, a rotáció következő kategóriájából.
- `/learn kód | projekt | keretrendszer | nyelv | rendszertervezés` – adott fajta kártya.
- `/learn <szabad téma>` – pl. `/learn mongo vs sql`: általános, projektfüggetlen magyarázat, mi a
  különbség, mikor melyiket érdemes választani.

**Beállítások** a `/config`-ban: `model` (haiku / sonnet / opus) és `language` (hu / en). A nyelv a
sávot, a gombokat és az üzeneteket is átváltja.

**Adat és költség**: a kártya a saját Claude-fiókod modelljével készül. A kör kérése és válasza, a
módosított fájlok részletei (max. 3000 karakter), a CLAUDE.md eleje és a függőségek nevei mennek a
modellnek; szabad témánál semmilyen projektadat. Egy kártya egy rövid, alacsony effort-tal futó hívás.
