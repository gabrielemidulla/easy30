import type { CourseSummary } from "./flow-model"

const ITEMS = [
  { key: "unknown", label: "Unknown" },
  { key: "red", label: "Weak" },
  { key: "orange", label: "Shaky" },
  { key: "green", label: "Solid" },
] as const

export function Legend({ summary }: { summary: CourseSummary }) {
  return (
    <ul className="easy30-legend">
      {ITEMS.map(({ key, label }) => (
        <li key={key} className="easy30-legend-item">
          <span className={`easy30-swatch is-${key}`} />
          {label}
          <span className="easy30-legend-count">{summary[key]}</span>
        </li>
      ))}
      <li className="easy30-legend-item">
        <span className="easy30-swatch is-unknown is-dashed" />
        Inferred
      </li>
      <li className="easy30-legend-item">
        <span className="easy30-swatch is-unknown is-ring" />
        Ready to learn
        <span className="easy30-legend-count">{summary.ready}</span>
      </li>
    </ul>
  )
}
