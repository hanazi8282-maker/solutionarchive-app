import { createClient } from '@/lib/supabase/server'
import { COMMUNITY_SIGNALS, LABEL_LEVELS } from '@/lib/analysis/relevance-judge'
import {
  EXCERPT_MAX, LEVEL_LABEL, MAX_PAGE, PAGE_SIZE, SIGNAL_LABEL, feedHref, loadFeed, parseFeedQuery, sourceChips,
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
 * VOC 라이브 피드(2026-10-01 `/signals` 에서 개명) — 수집한 리뷰·댓글 중 **관련 판정**을 받은 것만, 판정 시각 최신순.
 * 남헌 2026-09-25 위임 B항(reports/2026-09-24/competitor-features-reestimate.md B1).
 *
 * **익명으로 열린다**(`lib/auth/policy.ts` PUBLIC_EXACT `/voc`). 읽기 전용이고 LLM 호출 0.
 * 원문은 발췌 EXCERPT_MAX 자만 싣는다 — 출처 링크는 카드 상세에 있다(lib/signals/feed.ts 머리말).
 *
 * 종류: SaaS만(2026-10-01 남헌 — "소비재 포함" 필터 제거. 옛 `?kind=all` 은 기본값으로 되돌리고 사유 패널을 띄운다).
 * 카드는 판정 사유(review_relevance_verdicts.reason)를 크게, 발췌는 그 아래 작게(PubSignalCard).
 * 필터는 전부 링크(JS 0). ★ 3상태: 조회 실패 = 경고 패널(카드 영역 없음) / 0건 = 빈 상태 / 있음.
 * 신호·영향 필터의 0건은 대개 "라벨이 아직 없다"이다 — 빈 상태 문구가 그 사실을 말한다.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'VOC 라이브 피드',
  description: '수집한 리뷰·댓글 중 관련 판정을 받은 것만 최신순으로. 판정 사유 한 줄과 짧은 발췌, 주소가 남은 소스는 출처 링크.',
}

export default async function SignalsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { filters: f, errors } = parseFeedQuery(await searchParams)
  const sb = await createClient()
  const result = sb ? await loadFeed(sb, f) : null
  const labelFilter = Boolean(f.signal || f.impact)

  const facets = result?.status === 'ok' ? (
    <PubFacetBar label="VOC 필터">
      <PubFacet href={feedHref(f, { source: null, signal: null, impact: null })} active={!f.source && !labelFilter}>전체</PubFacet>
      <PubFacetSep />
      {/* 관련 판정 1건 이상인 소스만 + 건수(현재 kind 기준). 못 셌으면 전부 내고 숫자 자리를 비운다. */}
      {sourceChips(result.sources ?? [], result.sourceCounts, f.source).map((s) => (
        <PubFacet key={s.key} href={feedHref(f, { source: f.source === s.key ? null : s.key })} active={f.source === s.key} count={s.count}>
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
  // 싣지 않는 소비재 문장 — 못 셌으면(null) 그렇다고 적는다. 0 이면 말하지 않는다. 되돌리는 손잡이는 없다(필터 제거).
  const hiddenNote = hidden == null ? '제외한 소비재 건수 집계 불가.'
    : hidden > 0 ? `소비재 ${hidden}건은 이 피드에 싣지 않는다.` : null
  const lastPage = total == null ? null : Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE)))

  return (
    <PubShell theme="light">
      <Hero
        eyebrow="VOC FEED"
        title="VOC 라이브 피드"
        lead="수집한 리뷰·댓글 중 관련 판정을 받은 것만, 판정 시각 최신순으로 싣는다. 판정은 야간 배치가 한다."
        note={`원문은 옮겨 싣지 않는다 — 카드에는 판정 사유 한 줄과 ${EXCERPT_MAX}자 발췌만. 카드를 누르면 판정 사유 전문이 나오고, 글 주소가 남은 소스는 “출처 보기” 링크가, 주소가 없는 소스는 출처 이름이 나온다. 여기는 남의 목소리이고, 그 목소리에서 우리가 만든 문구와 판정은 로그인 후 인사이트 화면에 있다.`}
        actions={<PubButtonLink href="/voc/community" variant="ghost" size="sm">겪는 문제 · 원하는 것 · 안 쓰는 이유 3열로 보기<IconArrowRight /></PubButtonLink>}
      />

      {errors.length > 0 && (
        <Panel tone="alert" title="질의를 그대로 쓰지 못했다">
          <p className="pub-text">{errors.join(' / ')} — 그 조건은 빼고 보여줬다.</p>
        </Panel>
      )}
      {!sb && (
        <Panel tone="alert" title="확인 불가 — Supabase 환경변수 미설정">
          <p className="pub-text">판정 행을 읽지 못했다. VOC 가 없다는 뜻이 아니다.</p>
        </Panel>
      )}
      {result?.status === 'error' && (
        <Panel tone="alert" title="확인 불가 — VOC 조회 실패">
          <p className="pub-text">{result.reason} · VOC 가 없다는 뜻이 아니다. 잠시 뒤 다시 열어 보라.</p>
        </Panel>
      )}

      {result?.status === 'ok' && (
        <div className="pub-liblayout">
          {facets}
          <div className="pub-libmain">
            <p className="pub-caption">
              {total == null ? '전체 건수 집계 불가' : `조건에 맞는 관련 판정 ${total}건`}
              {result.items.length > 0 ? ` · 이 페이지 ${(f.page - 1) * PAGE_SIZE + 1}–${(f.page - 1) * PAGE_SIZE + result.items.length}` : ''}
              {' · SaaS만'}
              {hiddenNote && result.items.length > 0 ? ` · ${hiddenNote}` : ''}
            </p>
            {result.sources === null && <p className="pub-caption">소스 목록을 읽지 못해 소스 칩을 뺐다(소스가 없다는 뜻이 아니다).</p>}
            {result.sources !== null && result.sourceCounts === null && <p className="pub-caption">소스별 건수 집계 불가 — 소스 칩을 건수 없이 전부 냈다(0건 소스가 섞여 있을 수 있다).</p>}

            {result.items.length > 0 ? (
              <div className="pub-cardgrid">
                {result.items.map((it) => <PubSignalCard key={it.input_id} item={it} />)}
              </div>
            ) : (
              <PubEmpty
                title={labelFilter ? '라벨 수집 중 — 이 조건에 맞는 라벨이 아직 없다' : '조건에 맞는 관련 판정이 없다'}
                description={[labelFilter
                  ? '조회는 정상이다. VOC 유형·영향 라벨은 야간 판정이 새 행부터 채운다 — 라벨 도입 전에 판정된 행에는 아직 라벨이 없다.'
                  : '조회는 정상이다. 지금 이 조건으로 관련 판정을 받은 리뷰가 없다는 뜻이고, 다른 것으로 채우지 않는다.',
                hiddenNote].filter(Boolean).join(' ')}
                action={<PubButtonLink href="/voc" variant="ghost" size="sm">필터 없이 보기<IconArrowRight /></PubButtonLink>}
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
