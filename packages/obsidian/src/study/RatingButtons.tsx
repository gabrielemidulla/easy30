import type { Rating } from "@easy30/core"

export interface RatingOption {
  rating: Rating
  label: string
  tone: "red" | "orange" | "green" | "blue"
}

export const SKIM_OPTIONS: RatingOption[] = [
  { rating: 1, label: "Didn't know", tone: "red" },
  { rating: 2, label: "Kinda", tone: "orange" },
  { rating: 3, label: "Knew it", tone: "green" },
]

export const REVIEW_OPTIONS: RatingOption[] = [
  { rating: 1, label: "Again", tone: "red" },
  { rating: 2, label: "Hard", tone: "orange" },
  { rating: 3, label: "Good", tone: "green" },
  { rating: 4, label: "Easy", tone: "blue" },
]

interface Props {
  options: RatingOption[]
  suggested?: Rating | null
  disabled: boolean
  onRate: (rating: Rating) => void
}

export function RatingButtons({ options, suggested = null, disabled, onRate }: Props) {
  return (
    <div className="easy30-ratings">
      {options.map((o) => (
        <button
          key={o.rating}
          type="button"
          className={`easy30-rating is-${o.tone}${suggested === o.rating ? " is-suggested" : ""}`}
          disabled={disabled}
          onClick={() => onRate(o.rating)}
        >
          <span className="easy30-rating-label">{o.label}</span>
          <kbd>{o.rating}</kbd>
        </button>
      ))}
    </div>
  )
}
