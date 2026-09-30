import Link from 'next/link'
import type { MovePair, PairSide } from '@/lib/cases/compare'
import { IconChevronRight } from '../icons'
import { Chip } from './Chip'

/**
 * 갈린 짝 한 묶음 = 면 위 2열 대조표(B7-4). 같은 병목·레버인데 한쪽은 됐고 한쪽은 안 됐다.
 * 한 열은 `max`건까지 펴고 나머지는 "N건 더" 로 접는다(원문 claim 전문이 섹션을 벽으로 만들던 자리).
 *
 * 판정색은 열 머리 밑 선에만 쓴다(`.pub-pair-h`) — 글자는 잉크다(DESIGN.md §1). "됐다 / 안 됐다" 는 글자가 말한다.
 * 열 안 순서는 SaaS 케이스 먼저, 그다음 원래 순서.
 */
const saasFirst = (sides: PairSide[]) =>
  [...sides].sort((a, b) => Number(b.study.business_model === 'SAAS') - Number(a.study.business_model === 'SAAS'))

function Item({ s }: { s: PairSide }) {
  return (
    <li className="pub-pair-item">
      {/* 항목 전체가 링크다 — 브랜드명 한 줄(18px)만 링크면 375 터치타깃 44 에 못 미친다. */}
      <Link className="pub-pair-link" href={`/library/${s.study.slug}`}>
        <span className="pub-pair-who" translate="no">{s.study.brand_name}</span>
        <span className="pub-index-s">{s.move.claim}</span>
      </Link>
    </li>
  )
}

function Col({ title, sides, max, neg = false, lockRest = false }: { title: string; sides: PairSide[]; max: number; neg?: boolean; lockRest?: boolean }) {
  const sorted = saasFirst(sides)
  const rest = sorted.slice(max)
  return (
    <div className="pub-pair-col">
      <h3 className={neg ? 'pub-pair-h pub-pair-h--neg' : 'pub-pair-h'}>{title} ({sides.length})</h3>
      <ul className="pub-pair-list">
        {sorted.slice(0, max).map((s) => <Item key={s.move.id} s={s} />)}
      </ul>
      {rest.length > 0 && lockRest ? (
        <p className="pub-caption">{rest.length}건 더는 로그인 후 볼 수 있다</p>
      ) : rest.length > 0 ? (
        <details className="pub-fold pub-fold--inline">
          <summary><IconChevronRight />{rest.length}건 더</summary>
          <ul className="pub-pair-list">
            {rest.map((s) => <Item key={s.move.id} s={s} />)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** `lockRest`(로그인전, I3-T): 열마다 `max` 밖은 접지 않고 **렌더하지 않는다**. 접힌 내용도 DOM 에 실리므로 건수만 적는다. */
export function PubPairCompare({ p, max = 3, lockRest = false }: { p: MovePair; max?: number; lockRest?: boolean }) {
  return (
    <div className="pub-pair">
      <div className="pub-chiprow">
        <Chip title="병목">{p.bottleneck}</Chip>
        <Chip title="레버">{p.lever}</Chip>
        {p.saas ? <Chip>SaaS 끼리</Chip> : null}
      </div>
      <div className="pub-pair-cols">
        <Col title="됐다" sides={p.positive} max={max} lockRest={lockRest} />
        <Col title="안 됐다" sides={p.negative} max={max} neg lockRest={lockRest} />
      </div>
    </div>
  )
}
