import { Command, InvalidArgumentError, Option } from "commander"
import { runDoctor } from "./commands/doctor.js"
import { runInit } from "./commands/init.js"
import { runMcp } from "./commands/mcp.js"
import { runSkillsInstall, SKILL_TARGETS, type SkillTarget } from "./commands/skills.js"
import { runStatus } from "./commands/status.js"
import type { AssetPaths } from "./lib/assets.js"
import { type Io, processIo } from "./lib/io.js"
import { CliError } from "./lib/workspace.js"

export interface CliContext {
  io: Io
  assets?: AssetPaths
  version: string
}

function parseTarget(value: string): SkillTarget {
  const target = SKILL_TARGETS.find((t) => t === value)
  if (!target) throw new InvalidArgumentError(`expected one of: ${SKILL_TARGETS.join(", ")}`)
  return target
}

/** Build the command tree. Each action resolves to the process exit code. */
export function buildProgram(ctx: CliContext, setExit: (code: number) => void): Command {
  const program = new Command()
    .name("easy30")
    .description("Easy30: a study tool that lives in your Obsidian vault.")
    .version(ctx.version)
    .showHelpAfterError()
    .configureOutput({ writeOut: ctx.io.out, writeErr: ctx.io.err })

  const withDir = (command: Command): Command => command.argument("[dir]", "vault folder", ".")

  withDir(program.command("init"))
    .description(
      "Set up an Easy30 vault in a folder (new, or an existing Obsidian vault). Safe to rerun: it never overwrites your files.",
    )
    .option("--example", "also create the example Linear Algebra course")
    .option("--no-agents", "skip AGENTS.md, .mcp.json and agent skills")
    .option("--force", "replace files that would otherwise be kept")
    .action(async (dir: string, o: { example?: boolean; agents: boolean; force?: boolean }) => {
      setExit(
        await runInit(
          {
            dir,
            example: o.example === true,
            agents: o.agents,
            force: o.force === true,
            ...(ctx.assets && { assets: ctx.assets }),
          },
          ctx.io,
        ),
      )
    })

  withDir(program.command("doctor"))
    .description(
      "Check the vault: frontmatter, links, cycles, missing questions or answers, log files. Exits 2 if problems remain.",
    )
    .option("--fix", "write missing concept ids")
    .action(async (dir: string, o: { fix?: boolean }) => {
      setExit(await runDoctor({ dir, fix: o.fix === true }, ctx.io))
    })

  withDir(program.command("status"))
    .description(
      "Show progress per course: mastery, reviews due, concepts ready to learn, days to the exam.",
    )
    .option("--json", "machine-readable output")
    .action(async (dir: string, o: { json?: boolean }) => {
      setExit(await runStatus({ dir, json: o.json === true }, ctx.io))
    })

  const skills = program.command("skills").description("Manage the Easy30 agent skills")
  withDir(skills.command("install"))
    .description(
      "Copy the Easy30 skills into the vault for Claude Code (.claude/skills) and other agents (.agents/skills).",
    )
    .addOption(
      new Option("-t, --target <target>", "which agents to install for")
        .choices([...SKILL_TARGETS])
        .default("all"),
    )
    .action(async (dir: string, o: { target: string }) => {
      setExit(
        await runSkillsInstall(
          { dir, target: parseTarget(o.target), ...(ctx.assets && { assets: ctx.assets }) },
          ctx.io,
        ),
      )
    })

  program
    .command("mcp")
    .description("Start the Easy30 MCP server on stdio (for agents that launch it themselves).")
    .option("--vault <dir>", "vault folder", ".")
    .action(async (o: { vault: string }) => {
      await runMcp({ vault: o.vault })
    })

  return program
}

/** Run the CLI with `argv` (without node and script). Returns the exit code. */
export async function main(
  argv: string[],
  ctx: Partial<CliContext> & { version: string },
): Promise<number> {
  const io = ctx.io ?? processIo()
  let code = 0
  const program = buildProgram({ ...ctx, io }, (c) => {
    code = c
  })
  program.exitOverride()
  try {
    await program.parseAsync(argv, { from: "user" })
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("commander.")
    ) {
      const exitCode =
        "exitCode" in error && typeof error.exitCode === "number" ? error.exitCode : 1
      return exitCode
    }
    if (error instanceof CliError) io.err(`easy30: ${error.message}\n`)
    else io.err(`easy30: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
  return code
}
