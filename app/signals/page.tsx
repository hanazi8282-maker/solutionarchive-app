import { createClient } from '@/lib/supabase/server'
import { COMMUNITY_SIGNALS, LABEL_LEVELS } from '@/lib/analysis/relevance-judge'
import {
  EXCERPT_MAX, LEVEL_LABEL, MAX_PAGE, PAGE_SIZE, SIGNAL_LABEL, feedHref, loadFeed, parseFeedQuery,
} from '@/lib/signals/feed'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubFacet, PubFacetBar, PubFacetSep } from '../_pub/components/PubFacetBar'
import { PubEmpty } from '../_pub/components/PubEmpty'
import { PubButtonLink } from '../_pub/components/Button'
import { PubSignalCard } from '../_pub/components/PubSignalCard'
import { IconArrowRight } from '../_pub/icons'

/**
 * 신호 라이브 피드 — 수집한 리뷰·댓글 중 **관련 판정**을 받은 것만, 판정 시각 최신순.
 * 남헌 2026-09-25 위임 B항(reports/2026-09-24/competitor-features-reestimate.md B1).
 *
 * **익명으로 열린다**(`lib/auth/policy.ts` PUBLIC_EXACT `/signals`). 읽기 전용이고 LLM 호출 0.
 * 원문은 발췌 EXCERPT_MAX 자만 싣는다 — 출처 링크는 카드 상세에 있다(lib/signals/feed.ts 머리말).
 *
 * 종류: 기본 SaaS만(/library 와 같은 축·같은 결정 — 소비재는 숨기되 지우지 않는다), `?kind=all` 이면 소비재 포함.
 * 필터는 전부 링크(JS 0). ★ 3상태: 조회 실패 = 경고 패널(카드 영역 없음) / 0건 = 빈 상태 / 있음.
 * 신호·영향 필터의 0건은 대개 "라벨이 아직 없다"이다 — 빈 상태 문구가 그 사실을 말한다.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: '신호 라이브 피드',
  description: '수집한 리뷰·댓글 중 관련 판정을 받은 것만 최신순으로. 짧은 발췌와 출처 링크.',
}

export default async function SignalsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { filters: f, errors } = parseFeedQuery(await searchParams)
  const sb = await createClient()
  const result = sb ? await loadFeed(sb, f) : null
  const labelFilter = Boolean(f.signal || f.impact)

  const facets = result?.status === 'ok' ? (
    <PubFacetBar label="신호 필터">
      <PubFacet href={feedHref(f, { source: null, signal: null, impact: null })} active={!f.source && !labelFilter}>전체</PubFacet>
      <PubFacetSep />
      {/* 종류 토글. 소비재는 지우지 않고 숨기기만 하므로 되돌리는 손잡이가 화면에 있어야 한다(/library 와 같다). */}
      <PubFacet href={feedHref(f, { kind: 'saas' })} active={f.kind === 'saas'}>SaaS만(기본)</PubFacet>
      <PubFacet href={feedHref(f, { kind: 'all' })} active={f.kind === 'all'}>소비재 포함</PubFacet>
      <PubFacetSep />
      {(result.sources ?? []).map((s) => (
        <PubFacet key={s.key} href={feedHref(f, { source: f.source === s.key ? null : s.key })} active={f.source === s.key}>
          {s.name}
        </PubFacet>
      ))}
      <PubFacetSep />
      {COMMUNITY_SIGNALS.map((s) => (
        <PubFacet key={s} href={feedHref(f, { signal: f.signal === s ? null : s })} active={f.signal === s}>
          {SIGNAL_LABEL[s]}
        </PubFacet>
      ))}
      <PubFacetSep />
      {LABEL_LEVELS.map((l) => (
        <PubFacet key={l} href={feedHref(f, { impact: f.impact === l ? null : l })} active={f.impact === l}>
          영향 {LEVEL_LABEL[l]}
        </PubFacet>
      ))}
    </PubFacetBar>
  ) : null

  const total = result?.status === 'ok' ? result.total : null
  const hidden = result?.status === 'ok' ? result.hiddenConsumer : null
  // 숨긴 소비재 문장 — 못 셌으면(null) 그렇다고 적는다. 0 이면 말하지 않는다.
  const hiddenNote = f.kind !== 'saas' ? null
    : hidden == null ? '숨긴 소비재 건수 집계 불가 — "소비재 포함"으로 볼 수 있다.'
    : hidden > 0 ? `숨긴 소비재 ${hidden}건은 "소비재 포함"으로 볼 수 있다.` : null
  const lastPage = total == null ? null : Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE)))

  return (
    <PubShell theme="light">
      <Hero
        eyebrow="SIGNAL FEED"
        title="신호 라이브 피드"
        lead="수집한 리뷰·댓글 중 관련 판정을 받은 것만, 판정 시각 최신순으로 싣는다. 판정은 야간 배치가 한다."
        note={`원문은 옮겨 싣지 않는다 — 카드에는 ${EXCERPT_MAX}자 발췌만, 출처 링크는 카드를 누르면 나온다.`}
        actions={<PubButtonLink href="/signals/community" variant="ghost" size="sm">겪는 문제 · 원하는 것 · 안 쓰는 이유 3열로 보기<IconArrowRight /></PubButtonLink>}
      />

      {errors.length > 0 && (
        <Panel tone="alert" title="질의를 그대로 쓰지 못했다">
          <p className="pub-text">{errors.join(' / ')} — 그 조건은 빼고 보여줬다.</p>
        </Panel>
      )}
      {!sb && (
        <Panel tone="alert" title="확인 불가 — Supabase 환경변수 미설정">
          <p className="pub-text">판정 행을 읽지 못했다. 신호가 없다는 뜻이 아니다.</p>
        </Panel>
      )}
      {result?.status === 'error' && (
        <Panel tone="alert" title="확인 불가 — 신호 조회 실패">
          <p className="pub-text">{result.reason} · 신호가 없다는 뜻이 아니다. 잠시 뒤 다시 열어 보라.</p>
        </Panel>
      )}

      {result?.status === 'ok' && (
        <div className="pub-liblayout">
          {facets}
          <div className="pub-libmain">
            <p className="pub-caption">
              {total == null ? '전체 건수 집계 불가' : `조건에 맞는 관련 판정 ${total}건`}
              {result.items.length > 0 ? ` · 이 페이지 ${(f.page - 1) * PAGE_SIZE + 1}–${(f.page - 1) * PAGE_SIZE + result.items.length}` : ''}
              {f.kind === 'saas' ? ' · SaaS만' : ' · 소비재 포함'}
              {hiddenNote && result.items.length > 0 ? ` · ${hiddenNote}` : ''}
            </p>
            {result.sources === null && <p className="pub-caption">소스 목록을 읽지 못해 소스 칩을 뺐다(소스가 없다는 뜻이 아니다).</p>}

            {result.items.length > 0 ? (
              <div className="pub-cardgrid">
                {result.items.map((it) => <PubSignalCard key={it.input_id} item={it} />)}
              </div>
            ) : (
              <PubEmpty
                title={labelFilter ? '라벨 수집 중 — 이 조건에 맞는 라벨이 아직 없다' : '조건에 맞는 관련 판정이 없다'}
                description={[labelFilter
                  ? '조회는 정상이다. 신호·영향 라벨은 야간 판정이 새 행부터 채운다 — 라벨 도입 전에 판정된 행에는 아직 라벨이 없다.'
                  : '조회는 정상이다. 지금 이 조건으로 관련 판정을 받은 리뷰가 없다는 뜻이고, 다른 것으로 채우지 않는다.',
                hiddenNote].filter(Boolean).join(' ')}
                action={f.kind === 'saas' && hidden !== 0
                  ? <PubButtonLink href={feedHref(f, { kind: 'all' })} variant="ghost" size="sm">소비재 포함해서 보기{hidden ? ` ${hidden}` : ''}<IconArrowRight /></PubButtonLink>
                  : <PubButtonLink href="/signals" variant="ghost" size="sm">필터 없이 보기<IconArrowRight /></PubButtonLink>}
              />
            )}

            {(f.page > 1 || (lastPage != null && f.page < lastPage)) && (
              <nav className="pub-chiprow" aria-label="페이지">
                {f.page > 1 && <PubButtonLink href={feedHref(f, { page: f.page - 1 })} variant="ghost" size="sm">이전 {PAGE_SIZE}건</PubButtonLink>}
                {lastPage != null && f.page < lastPage && <PubButtonLink href={feedHref(f, { page: f.page + 1 })} variant="ghost" size="sm">다음 {PAGE_SIZE}건<IconArrowRight /></PubButtonLink>}
              </nav>
            )}
          </div>
        </div>
      )}
    </PubShell>
  )
}
