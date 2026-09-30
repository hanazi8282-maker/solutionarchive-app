import { createClient } from '@/lib/supabase/server'
import { SIGNAL_LABEL, loadColumns, parseFeedQuery } from '@/lib/signals/feed'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubEmpty } from '../../_pub/components/PubEmpty'
import { PubButtonLink } from '../../_pub/components/Button'
import { PubSignalCard } from '../../_pub/components/PubSignalCard'
import { IconArrowRight } from '../../_pub/icons'

/**
 * 커뮤니티 3열 — 관련 판정 리뷰를 T2 라벨 `community_signal` 로 가른다:
 * 겪는 문제(pain) · 원하는 것(demand) · 안 쓰는 이유(objection). 칼럼마다 건수를 센다.
 * 남헌 2026-09-25 위임 B항(reports/2026-09-24/competitor-features-reestimate.md B2 · §F 8).
 *
 * 익명 공개(PUBLIC_EXACT `/voc/community`), 읽기 전용, LLM 0.
 * 종류: SaaS만(2026-10-01 남헌 — "소비재 포함" 필터 제거, /voc 와 같다. 옛 `?kind=all` 은 사유 패널 + 기본값).
 * ★ 3상태: 조회 실패 = 경고 패널 / 세 칼럼 모두 0건 = "라벨 수집 중" 한 장 / 있음 = 3열.
 *   라벨이 없는 행을 어느 칼럼에 짐작으로 넣지 않는다 — 라벨 NULL 은 "모름"이다.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: '커뮤니티 3열 — 겪는 문제 · 원하는 것 · 안 쓰는 이유',
  description: '관련 판정을 받은 리뷰·댓글을 겪는 문제 · 원하는 것 · 안 쓰는 이유 세 칼럼으로 나눠 본다.',
}

export default async function SignalColumnsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // 종류만 읽는다(다른 필터는 이 화면에 없다). 파서는 피드와 한 벌.
  const { filters: { kind }, errors } = parseFeedQuery({ kind: (await searchParams).kind })
  const sb = await createClient()
  const result = sb ? await loadColumns(sb, kind) : null
  const labeled = result?.status === 'ok' ? result.columns.reduce((n, c) => n + c.count, 0) : null
  const hidden = result?.status === 'ok' ? result.hiddenConsumer : null
  const hiddenNote = hidden == null ? '제외한 소비재 건수 집계 불가.'
    : hidden > 0 ? `라벨이 붙은 소비재 ${hidden}건은 이 화면에 싣지 않는다.` : null
  const colHref = (signal: string) => `/voc?signal=${signal}`

  return (
    <PubShell theme="light">
      <Hero
        eyebrow="COMMUNITY VOC"
        title="겪는 문제 · 원하는 것 · 안 쓰는 이유"
        lead="관련 판정을 받은 리뷰·댓글을 판정 모델이 붙인 VOC 유형 라벨로 세 칼럼에 나눈다. 칼럼마다 최신 판정 순이다."
        note="라벨이 없는 리뷰는 어느 칼럼에도 넣지 않는다 — 짐작으로 분류하지 않는다."
        actions={<PubButtonLink href="/voc" variant="ghost" size="sm">전체 VOC 피드<IconArrowRight /></PubButtonLink>}
      />

      {errors.length > 0 && (
        <Panel tone="alert" title="질의를 그대로 쓰지 못했다">
          <p className="pub-text">{errors.join(' / ')} — 기본값(SaaS만)으로 보여줬다.</p>
        </Panel>
      )}
      {!sb && (
        <Panel tone="alert" title="확인 불가 — Supabase 환경변수 미설정">
          <p className="pub-text">판정 행을 읽지 못했다. VOC 가 없다는 뜻이 아니다.</p>
        </Panel>
      )}
      {result?.status === 'error' && (
        <Panel tone="alert" title="확인 불가 — VOC 조회 실패">
          <p className="pub-text">{result.reason} · 칼럼이 비었다는 뜻이 아니다. 잠시 뒤 다시 열어 보라.</p>
        </Panel>
      )}

      {result?.status === 'ok' && (
        <>
          <p className="pub-caption">
            {result.relevantTotal == null
              ? `VOC 유형 라벨이 붙은 관련 판정 ${labeled}건 (관련 판정 전체 수는 집계 불가)`
              : `관련 판정 ${result.relevantTotal}건 중 VOC 유형 라벨이 붙은 행 ${labeled}건`}
            {' · SaaS만'}
            {hiddenNote ? ` · ${hiddenNote}` : ''}
          </p>
          {labeled === 0 ? (
            <PubEmpty
              title="라벨 수집 중 — 야간 판정이 새 행부터 채운다"
              description={['조회는 정상이다. VOC 유형 라벨은 라벨 도입 뒤 판정된 행부터 붙는다. 그 전에 판정된 행은 라벨이 비어 있고, 짐작으로 칼럼에 넣지 않는다.', hiddenNote].filter(Boolean).join(' ')}
              action={<PubButtonLink href="/voc" variant="ghost" size="sm">라벨 없이 전체 VOC 보기<IconArrowRight /></PubButtonLink>}
            />
          ) : (
            <div className="pub-signalcols">
              {result.columns.map((c) => (
                <section key={c.signal} className="pub-signalcol" aria-labelledby={`col-${c.signal}`}>
                  <h2 className="pub-section-title" id={`col-${c.signal}`}>{SIGNAL_LABEL[c.signal]} {c.count}건</h2>
                  {c.items.length > 0
                    ? c.items.map((it) => <PubSignalCard key={it.input_id} item={it} showSignal={false} />)
                    : <PubEmpty compact title="이 칼럼은 아직 0건이다" description="조회는 정상이다. 이 유형으로 라벨된 관련 판정이 아직 없다." />}
                  {c.count > c.items.length && (
                    <PubButtonLink href={colHref(c.signal)} variant="ghost" size="sm">{SIGNAL_LABEL[c.signal]} 전체 {c.count}건<IconArrowRight /></PubButtonLink>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </PubShell>
  )
}
