import type { ReactNode } from 'react'
import Link from 'next/link'
import type { QuoteLine } from '@/lib/analysis/quote-display'
import { failureLine, fixLine, gateCaption, principleLine, remedyStatusLine } from '@/lib/cases/remedy'
import { QUOTES_OPEN, type InsightEvidence, type InsightQuotes, type InsightRemedy } from '@/lib/insights/evidence'
import { IconChevronRight } from '../icons'
import { Chip } from './Chip'

/**
 * 인사이트 카드 아래 두 칸 — "이런 리뷰들이 근거였다"(인용) · "유사 해결사례"(처방). `/insights` 전용.
 * 데이터는 lib/insights/evidence.ts 가 만든다(읽기 전용, LLM 0). 여기는 그리기만 한다.
 *
 * 처방은 결과 화면 `app/analyze/[id]/result/remedy-section.tsx` 의 `_pub` 이식이다 — 문장(fixLine·failureLine·
 * principleLine·remedyStatusLine·gateCaption)은 lib/cases/remedy.ts 한 곳에서 오고 여기서 다시 조립하지 않는다.
 * 3그룹 이름·"매칭 근거" 접힘·신뢰도 낮음/추정/미검증 표시도 그대로다. 달라진 것은 마크업(_pub 토큰)과
 * 보완 사례 줄이 `/library/[slug]` 로 이어지는 것뿐이다.
 *
 * 인용은 검수 화면과 같은 규칙(lib/analysis/quote-display.ts): 한국어 번역이 기본, 원문은 네이티브 `<details>`.
 */
export function PubInsightEvidence({ evidence }: { evidence: InsightEvidence | undefined }) {
  if (!evidence) return null
  return (
    <>
      <Quotes quotes={evidence.quotes} aspect={evidence.aspect_name} />
      <Remedy remedy={evidence.remedy} />
    </>
  )
}

function QuoteItem({ q }: { q: QuoteLine }) {
  const source = q.source_type ? <span className="pub-caption"> · {q.source_type}</span> : null
  if (q.ko) {
    return (
      <div className="pub-insight-qitem">
        <blockquote className="pub-insight-quote pub-insight-quote--review">“{q.ko}”{source}</blockquote>
        <details className="pub-fold pub-fold--inline">
          <summary><IconChevronRight />원문 보기</summary>
          <blockquote className="pub-insight-quote pub-insight-quote--review" lang="und">“{q.text}”</blockquote>
        </details>
      </div>
    )
  }
  return (
    <blockquote className="pub-insight-quote pub-insight-quote--review">
      “{q.text}”{source}
      {q.untranslated ? <span className="pub-caption"> · 번역 전</span> : null}
    </blockquote>
  )
}

function Quotes({ quotes, aspect }: { quotes: InsightQuotes; aspect: string | null }) {
  const body: ReactNode = quotes.state === 'unknown'
    ? <p className="pub-text">확인 불가 — {quotes.reason}. 인용이 없다는 뜻이 아니다.</p>
    : quotes.state === 'missing'
      ? <p className="pub-caption">인용을 아직 받지 못한 속성이다 — 재분석하면 채워진다.</p>
      : quotes.lines.length === 0
        ? <p className="pub-caption">추출이 인용을 남기지 않았다.</p>
        : (
          <>
            {quotes.lines.slice(0, QUOTES_OPEN).map((q, i) => <QuoteItem key={i} q={q} />)}
            {quotes.lines.length > QUOTES_OPEN && (
              <details className="pub-fold pub-fold--inline">
                <summary><IconChevronRight />인용 {quotes.lines.length - QUOTES_OPEN}건 더</summary>
                <div className="pub-fold-body">
                  {quotes.lines.slice(QUOTES_OPEN).map((q, i) => <QuoteItem key={i} q={q} />)}
                </div>
              </details>
            )}
            <p className="pub-caption">속성 ‘{aspect}’ 의 리뷰 원문 인용 {quotes.lines.length}건 (analysis_aspects.evidence_quotes)</p>
          </>
        )
  return (
    <section className="pub-insight-sub" aria-label="근거 리뷰">
      <p className="pub-insight-sub-t">이런 리뷰들이 근거였다</p>
      {body}
    </section>
  )
}

// 클래스 이름을 문자열로 조립하지 않는다 — pub.css 에 있는지 셀 수 있게 전체 이름으로 둔다.
const GROUP_CLASS = {
  fix: 'pub-insight-group pub-insight-group--fix',
  fail: 'pub-insight-group pub-insight-group--fail',
  principle: 'pub-insight-group pub-insight-group--principle',
} as const

function Group({ label, kind, children }: { label: string; kind: keyof typeof GROUP_CLASS; children: ReactNode }) {
  return (
    <div className={GROUP_CLASS[kind]}>
      <p className="pub-insight-group-t">{label}</p>
      <ul className="pub-insight-list">{children}</ul>
    </div>
  )
}

function Flags({ low, estimate, unverified }: { low: boolean; estimate?: boolean; unverified?: boolean }) {
  return (
    <>
      {estimate ? <> <Chip>추정</Chip></> : null}
      {low ? <> <Chip>신뢰도 낮음</Chip></> : null}
      {unverified ? <> <Chip>미검증</Chip></> : null}
    </>
  )
}

function Remedy({ remedy: r }: { remedy: InsightRemedy }) {
  let body: ReactNode
  if (r.state === 'unknown') {
    body = <p className="pub-text">{remedyStatusLine({ status: 'not_run', reason: r.reason })}</p>
  } else if (r.state === 'not_run') {
    body = <p className="pub-text"><Chip>처방 미실행</Chip> {r.reason}.</p>
  } else {
    const c = r.card
    const caption = gateCaption(c.gate_summary)
    const judgeNote = r.judgeLookupFailed ? <p className="pub-caption">재검사 기록을 읽지 못해 전부 미검증으로 둔다 — 무관하다는 뜻이 아니다.</p> : null
    if (r.state === 'no_match') {
      body = (
        <>
          <p className="pub-text"><Chip>유사 해결사례 없음</Chip> {remedyStatusLine(c)}</p>
          {caption ? <p className="pub-caption">{caption}</p> : null}
          {judgeNote}
        </>
      )
    } else {
      const lowCount = [...c.fixes, ...c.failures, ...c.principles].filter((x) => x.low_confidence).length
      const estimateCount = c.failures.filter((f) => f.is_estimate).length
      const unverified = c.gate_summary.unverified
      body = (
        <>
          <p className="pub-text"><Chip>{c.verdict.label}</Chip> {c.headline}</p>
          {caption ? <p className="pub-caption">{caption}</p> : null}
          {judgeNote}
          {c.fixes.length > 0 && (
            <Group label="이렇게 보완한 사례" kind="fix">
              {c.fixes.map((f) => (
                <li key={f.case_move_id}>
                  <Link href={`/library/${f.slug}`}>{fixLine(f)}</Link>
                  <Flags low={f.low_confidence} unverified={f.gate === 'unverified'} />
                </li>
              ))}
            </Group>
          )}
          {c.failures.length > 0 && (
            <Group label="이렇게 갔다가 막힌 사례" kind="fail">
              {c.failures.map((f) => (
                <li key={f.case_key}>{failureLine(f)}<Flags low={f.low_confidence} estimate={f.is_estimate} unverified={f.gate === 'unverified'} /></li>
              ))}
            </Group>
          )}
          {c.principles.length > 0 && (
            <Group label="원칙" kind="principle">
              {c.principles.map((p) => (
                <li key={p.sp_id}>{principleLine(p)}<Flags low={p.low_confidence} unverified={p.gate === 'unverified'} /></li>
              ))}
            </Group>
          )}
          <details className="pub-fold pub-fold--inline">
            <summary><IconChevronRight />매칭 근거</summary>
            <div className="pub-fold-body">
              <p className="pub-caption">겹친 낱말 · {c.terms.slice(0, 6).map((t) => `“${t}”`).join(', ')}</p>
              {lowCount > 0 && <p className="pub-caption">“신뢰도 낮음” {lowCount}건 — 겹친 낱말이 하나뿐입니다. 이 낱말이 우연히 겹친 것은 아닌지 직접 확인하세요.</p>}
              {unverified > 0 && <p className="pub-caption">“미검증” {unverified}건 — 관련성 재검사를 받지 못한 카드입니다. 무관하다는 뜻이 아니라 아직 판정이 없다는 뜻입니다.</p>}
              {estimateCount > 0 && <p className="pub-caption">“추정” {estimateCount}건 — 재서술에 인과 해석·추정이 섞인 행입니다. 원 기록이 그렇게 말한 것은 아닙니다.</p>}
            </div>
          </details>
        </>
      )
    }
  }
  return (
    <section className="pub-insight-sub" aria-label="유사 해결사례">
      <p className="pub-insight-sub-t">유사 해결사례</p>
      {body}
    </section>
  )
}
