import { Menu } from "obsidian"
import type { Easy30Host } from "../host"
import { confirm } from "../modals/confirm-modal"
import { promptText } from "../modals/prompt-modal"
import type { ConceptNodeData } from "./flow-model"

const IMPORTANCE: { level: 1 | 2 | 3; label: string }[] = [
  { level: 1, label: "Importance 1 (minor)" },
  { level: 2, label: "Importance 2" },
  { level: 3, label: "Importance 3 (core)" },
]

/** Right-click menu for a concept node. */
export function showNodeMenu(
  host: Easy30Host,
  event: MouseEvent,
  node: ConceptNodeData,
  fallbackCourseId: string,
): void {
  const courseId = node.courseId ?? fallbackCourseId
  const menu = new Menu()
  menu.addItem((item) =>
    item
      .setTitle("Open")
      .setIcon("file-text")
      .onClick(() => void host.openNote(node.path)),
  )
  menu.addItem((item) =>
    item
      .setTitle("Review now")
      .setIcon("play")
      .onClick(
        () => void host.startStudy({ mode: "review", courseId, conceptIds: [node.conceptId] }),
      ),
  )
  menu.addItem((item) =>
    item
      .setTitle("Rename")
      .setIcon("pencil")
      .onClick(async () => {
        const title = await promptText(host.app, {
          title: "Rename concept",
          label: "Title",
          value: node.title,
          cta: "Rename",
        })
        if (title && title !== node.title) {
          await host.mutate((ws) => ws.renameConcept(node.conceptId, title))
        }
      }),
  )
  menu.addSeparator()
  for (const { level, label } of IMPORTANCE) {
    menu.addItem((item) =>
      item
        .setTitle(label)
        .setChecked(node.importance === level)
        .onClick(
          () => void host.mutate((ws) => ws.updateConcept(node.conceptId, { importance: level })),
        ),
    )
  }
  menu.addSeparator()
  menu.addItem((item) =>
    item
      .setTitle("Delete")
      .setIcon("trash")
      .setWarning(true)
      .onClick(async () => {
        const ok = await confirm(host.app, {
          title: "Delete concept",
          message: `Move "${node.title}" to the trash and remove it from other concepts' prerequisites? Its review history stays in the log.`,
          cta: "Delete",
          destructive: true,
        })
        if (ok) await host.mutate((ws) => ws.deleteConcept(node.conceptId))
      }),
  )
  menu.showAtMouseEvent(event)
}
