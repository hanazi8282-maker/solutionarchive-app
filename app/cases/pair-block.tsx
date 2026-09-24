import type { MovePair } from '@/lib/cases/compare'
import { Badge } from '../_ds/components/Badge'

/**
 * 갈린 짝 한 묶음 — 같은 병목·레버인데 한쪽은 됐고 한쪽은 안 됐다.
 * 성공만 보여주면 "이 수를 쓰면 된다"로 읽힌다. 실패를 같은 칸에 붙여야 대조가 된다.
 * /cases/search 와 /cases/report 가 같이 쓴다.
 */
export function PairBlock({ p }: { p: MovePair }) {
  return (
    <div className="v2-inset v2-stack-tight">
      <div className="v2-chiprow">
        <Badge tone="neutral" size="sm">{p.bottleneck}</Badge>
        <Badge tone="neutral" size="sm">{p.lever}</Badge>
        {p.saas && <Badge tone="info" size="sm">SaaS 끼리</Badge>}
      </div>
      {p.positive.map((s) => (
        <p key={s.move.id} className="v2-text">
          <b>됐다 · {s.study.brand_name}</b> — {s.move.claim}
        </p>
      ))}
      {/* 안 된 쪽은 코랄 글자 대신 코랄 왼쪽 선(대비) — 뜻은 "안 됐다" 글자가 말한다. */}
      {p.negative.map((s) => (
        <p key={s.move.id} className="v2-text v2-neg-line">
          <b>안 됐다 · {s.study.brand_name}</b> — {s.move.claim}
        </p>
      ))}
    </div>
  )
}
