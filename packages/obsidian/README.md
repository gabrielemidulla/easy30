# Easy30 for Obsidian

Study by concept graph: map prerequisites between concept notes, skim what you
already know, and review the rest with spaced repetition (FSRS).

- **Concept graph** - one node per concept note, coloured by mastery (unknown, weak,
  shaky, solid). Dashed border = inferred from your skim, ring = ready to learn.
  Drag from a node's bottom handle to another node's top handle to add a
  prerequisite; select an edge and press Delete to remove it. Right-click a node
  for rename, importance and delete.
- **Skim** - a fast first pass. Rating a concept "Knew it" marks its unrated
  prerequisites as probably known; "Didn't know" marks its dependents as probably
  unknown, so you answer far fewer cards.
- **Review** - due concepts, with optional typed answers. Ratings are Again / Hard /
  Good / Easy (keys 1-4).
- **AI grading (optional)** - type an answer and click "Check with AI" to get a
  verdict and feedback from any OpenAI-compatible endpoint (OpenRouter, OpenAI,
  Ollama, ...). Nothing is sent unless you click that button.

Everything is plain Markdown plus an append-only log at `.easy30/log/<course>.jsonl`;
see the [vault format](../../docs/vault-format.md).

## Install

### With BRAT

Add this repository in the BRAT plugin and enable **Easy30**.

### Manually

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/easy30/`, then enable **Easy30** under
Settings -> Community plugins.

## Use

1. Run **Easy30: New course** (or use the ribbon icon to open the graph).
2. Add concepts with **Easy30: New concept**, or turn an existing note into one with
   **Easy30: Turn current note into a concept**. Link prerequisites in the graph or
   in the `requires` property.
3. **Start skim**, then **Start review** whenever the status bar shows due items.

Commands (no default hotkeys; assign your own in Settings -> Hotkeys): Open concept
graph, Start skim, Start review, New course, New concept, Turn current note into a
concept, Assign missing ids, Show issues.

Keys in a study session: `Space` show answer, `1`-`3` (skim) or `1`-`4` (review) rate,
`U` undo, `Ctrl/Cmd+Enter` show answer from the answer box.

To keep two devices from conflicting on the review log, add this to `.gitattributes`
(if you version your vault):

```
.easy30/log/*.jsonl merge=union
```

## Sync

Your progress lives in `.easy30/` (a dot-folder) at the vault root. Git and file-sync
tools (Syncthing, iCloud, Dropbox) sync it, but Obsidian Sync may not sync dot-folders:
check your sync settings. For multi-device progress, use git or another file sync.

## Settings

- Default folder for new courses (default `Easy30`).
- Include inferred concepts in the skim (off by default).
- AI grading: provider preset, base URL, API key, model, and a connection test. The
  key is stored unencrypted in the plugin's `data.json`; use a scoped key.

## Develop

```
pnpm --filter easy30-obsidian dev        # watch build
pnpm --filter easy30-obsidian build      # production build: main.js + styles.css
pnpm --filter easy30-obsidian typecheck
pnpm --filter easy30-obsidian test
```

`styles.css` is generated: React Flow's stylesheet followed by `src/styles.css`.

## Licenses

Bundles React and React Flow (MIT).
