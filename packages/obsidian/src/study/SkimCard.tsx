import type { Concept, Rating } from "@easy30/core"
import { useRef, useState } from "react"
import { CardFace } from "./CardFace"
import { useStudyKeys } from "./keys"
import { RatingButtons, SKIM_OPTIONS } from "./RatingButtons"
import type { RateExtras } from "./use-session"

interface Props {
  concept: Concept
  busy: boolean
  onRate: (rating: Rating, extras: RateExtras) => void
}

export function SkimCard({ concept, busy, onRate }: Props) {
  const [revealed, setRevealed] = useState(false)
  const shownAt = useRef(Date.now())

  const rate = (rating: Rating) => onRate(rating, { ms: Date.now() - shownAt.current })

  useStudyKeys((key) => {
    if (busy) return false
    if (!revealed) {
      if (key === "space" || key === "enter") setRevealed(true)
      else return false
      return true
    }
    if (key === "1" || key === "2" || key === "3") {
      rate(Number(key) as Rating)
      return true
    }
    return false
  })

  return (
    <>
      <CardFace concept={concept} revealed={revealed} />
      {revealed ? (
        <RatingButtons options={SKIM_OPTIONS} disabled={busy} onRate={rate} />
      ) : (
        <button type="button" className="mod-cta easy30-reveal" onClick={() => setRevealed(true)}>
          Show answer <kbd>Space</kbd>
        </button>
      )}
    </>
  )
}
