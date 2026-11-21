# Easy30

**Study by concept graph.** Easy30 turns each of your courses into a map of concepts and their
prerequisites inside your Obsidian vault. Every concept is coloured by how well you know it, and the
map tells you what to study next. Your own AI agent (Claude Code, Codex, Cursor…) builds the map
from your notes, writes practice exams in your professor's style, grades them, and runs mock orals.

> In Italian universities the top grade is **30 e lode**. Easy30 is how to get there with less guesswork.

```
 Vettore ──▶ Combinazione lineare ──▶ Span ──▶ Base ──▶ Dimensione
    🟢               🟢                🟠      🔴         ⚪
```

## How it works

1. **Map the course.** Ask your agent to *"build the concept graph for Geometria from my notes and the syllabus"*.
   It creates one note per concept, with a question, a reference answer and its prerequisites.
2. **Skim.** In Obsidian, go through every concept once: read the question, think, reveal the answer,
   and rate it *didn't know / kinda / knew it*. Ratings spread through the graph: knowing *Base* implies you probably
   know *Span*, so the first pass takes minutes.
3. **Review.** Spaced repetition (FSRS) schedules each concept. Answer openly and self-grade, or let an LLM check you.
4. **Practise.** *"Fammi una simulazione d'esame"*: your agent writes a written exam. You answer in the note,
   by photo or on an Excalidraw whiteboard. It grades the **answer and the reasoning separately**: a right result
   with a wrong procedure counts as wrong.
5. **Oral.** *"Interrogami sui concetti deboli"*: a strict but fair mock oral exam, focused on your red nodes.

Everything is plain Markdown plus an append-only log in `.easy30/`. It works with git and needs no account.
There is no server and no subscription; the AI work runs on the agent you already pay for.

## Packages

| Package | What it is |
|---|---|
| [`packages/obsidian`](packages/obsidian) | Obsidian plugin: graph view, skim, review, dashboard |
| [`packages/mcp`](packages/mcp) · `easy30-mcp` | MCP server that gives agents safe tools over your vault |
| [`packages/cli`](packages/cli) · `easy30` | `easy30 init`, `doctor`, `status`, `skills install` |
| [`packages/core`](packages/core) · `@easy30/core` | Vault format, prerequisite graph, FSRS replay, study planner |
| [`skills/`](skills) | Agent skills: build a graph, practice test, grading, mock oral |

## Quick start

```bash
cd path/to/your/vault          # or an empty folder
npx easy30 init                # plugin, MCP config, skills; non-destructive
```

Then open the folder as a vault in Obsidian, enable **Easy30** under *Community plugins*, and ask your
agent to build your first graph. See [docs/vault-format.md](docs/vault-format.md) for the file format.

## Development

```bash
pnpm install
pnpm check      # biome + typecheck + tests
pnpm build
```

Requires Node 22+ and pnpm. Contributions welcome. Please keep `pnpm check` green.

## License

[MIT](LICENSE)
