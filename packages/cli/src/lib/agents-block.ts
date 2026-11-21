/** The section Easy30 manages inside AGENTS.md / CLAUDE.md (without the markers). */
export const AGENTS_BLOCK = `## Easy30 study vault

This folder is an Easy30 vault: an Obsidian vault where notes are recognised by their
frontmatter, not their location.

- \`easy30: course\` notes describe a course (\`id\`, \`title\`, optional \`exam\` date and \`sources\`).
- \`easy30: concept\` notes are the atomic ideas to learn: \`question\` in the frontmatter,
  the reference answer in the body (Markdown + LaTeX), \`requires\` as wikilinks to
  prerequisite concepts, \`importance\` 1-3. The prerequisite graph must stay acyclic.
- Progress lives in \`.easy30/log/<course-id>.jsonl\` (append-only). Never edit it by hand.
- Practice tests are \`easy30: test\` notes; their solutions stay hidden in \`.easy30/solutions/\`.

Prefer the **easy30 MCP tools** (server \`easy30\`, see \`.mcp.json\`) over editing these files
directly: they validate links, refuse cycles and log reviews correctly. Run \`npx easy30 doctor\`
to check the vault.

Agent skills for building concept graphs, reviewing, practice tests and mock orals are in
\`.claude/skills/\` and \`.agents/skills/\` (folders named \`easy30-*\`). Format reference: \`docs/vault-format.md\` in the Easy30 repository.`
