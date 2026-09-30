import type { ReactNode } from 'react'
import { SUBSTANTIATION_VERDICTS, SUBSTANTIATION_VERDICT_LABELS } from '@/lib/analysis/types'
import { PMF_QUADRANT_ADVICE, PMF_QUADRANT_LABELS } from '@/lib/cases/match'
import {
  PAGE_SIZE, PROJECT_CHIPS, QUADRANT_ORDER, insightHref,
  type InsightFeed, type InsightQuery, type Loaded, type QuadrantKey,
} from '@/lib/insights/feed'
import type { InsightEvidence } from '@/lib/insights/evidence'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubFacet, PubFacetBar, PubFacetSep } from '../_pub/components/PubFacetBar'
import { PubEmpty } from '../_pub/components/PubEmpty'
import { PubButtonLink } from '../_pub/components/Button'
import { PubIconTile } from '../_pub/components/PubIconTile'
import { PubInsightCard } from '../_pub/components/PubInsightCard'
import { IconApprove, IconArrowRight, IconChevronRight, IconJudge, IconProblem, IconSignal, IconSplit } from '../_pub/icons'

/** 그룹 헤딩 라벨·아이콘(B2 10종 안). 'none' = 진단 행이 없거나 quadrant NULL. */
const QUADRANT_LABEL = (q: QuadrantKey) => (q === 'none' ? '미진단' : PMF_QUADRANT_LABELS[q])
const QUADRANT_ICON: Record<QuadrantKey, ReactNode> = {
  PROVEN_DEMAND: <IconApprove />, UNCHARTED_DEMAND: <IconSignal />, CROWDED_NO_DEMAND: <IconSplit />, PARK: <IconJudge />, none: <IconProblem />,
}

/** `/voc` 와의 경계. 두 화면 Hero 에 같은 뜻으로 적는다(I1-2). */
export const BOUNDARY =
  'VOC 피드는 남의 목소리(리뷰·댓글 발췌)이고, 여기는 그 목소리에서 우리가 만든 문구와 judge 판정이다. 카드마다 그 판단의 근거가 된 리뷰 인용과 유사 해결사례를 붙인다.'

/**
 * `/insights` 본문. 조회는 page.tsx 가 하고 여기는 결과만 그린다 — 오프라인 렌더 셀프테스트가
 * 가짜 로더 결과(있음·0건·조회 실패)를 넣어 HTML 을 검사한다(scripts/insights-render-selftest.mjs).
 * ★ 3상태: 조회 실패 = 경고 패널(목록 없음) / 0건 = 빈 상태 / 있음 = PMF 사분면별 카드.
 */
export function InsightsView({ query: q, errors, result, evidence }: {
  query: InsightQuery
  errors: string[]
  result: Loaded<InsightFeed>
  /** aspect_id → 인용·처방(lib/insights/evidence.ts). 없으면 카드에 붙이지 않는다. */
  evidence?: Map<string, InsightEvidence>
}) {
  const ok = result.status === 'ok' ? result : null
  const filtered = Boolean(q.quadrant || q.project || q.gate !== 'pass')
  const note = ok
    ? `게이트 통과 ${ok.gated}건 · ${q.sort === 'verdict' ? '판정순' : '최신순'} (${[
      q.gate === 'pass' ? `근거 없음 ${ok.hiddenUnsubstantiated}건 숨김` : '근거 없음 포함',
      `미진단 ${ok.undiagnosed}건`,
    ].join(' · ')})`
    : undefined
  const lastPage = ok ? Math.max(1, Math.ceil(ok.total / PAGE_SIZE)) : 1
  const shownProjects = ok ? ok.projects.slice(0, PROJECT_CHIPS) : []
  const moreProjects = ok ? ok.projects.slice(PROJECT_CHIPS) : []
  const projectFacet = (p: { id: string; label: string; count: number }) => (
    <PubFacet key={p.id} href={insightHref(q, { project: q.project === p.id ? null : p.id })} active={q.project === p.id} count={p.count}>
      {p.label}
    </PubFacet>
  )

  return (
    <PubShell theme="light">
      <Hero variant="index" title="인사이트" lead={BOUNDARY} note={note} />

      {errors.length > 0 && (
        <Panel tone="alert" titleAs="h2" title="질의를 그대로 쓰지 못했다">
          <p className="pub-text">{errors.join(' / ')}. 그 조건은 빼고 보여줬다.</p>
        </Panel>
      )}
      {result.status === 'error' && (
        <Panel tone="alert" titleAs="h2" title="확인 불가. 앵글 조회 실패">
          <p className="pub-text">{result.reason}. 앵글이 없다는 뜻이 아니다. 잠시 뒤 다시 열어 보라.</p>
        </Panel>
      )}

      {ok && (
        <div className="pub-liblayout">
          <PubFacetBar label="인사이트 필터">
            <PubFacet href={insightHref(q, { quadrant: null })} active={!q.quadrant}>전체</PubFacet>
            {QUADRANT_ORDER.map((k) => (
              <PubFacet key={k} href={insightHref(q, { quadrant: q.quadrant === k ? null : k })} active={q.quadrant === k} count={ok.quadrantCounts[k]}>
                {QUADRANT_LABEL(k)}
              </PubFacet>
            ))}
            <PubFacetSep />
            <PubFacet href={insightHref(q, { gate: 'pass' })} active={q.gate === 'pass'}>게이트 통과만(기본)</PubFacet>
            <PubFacet href={insightHref(q, { gate: 'all' })} active={q.gate === 'all'}>근거 없음 포함</PubFacet>
            <PubFacetSep />
            <PubFacet href={insightHref(q, { sort: 'recent' })} active={q.sort === 'recent'}>최신순</PubFacet>
            <PubFacet href={insightHref(q, { sort: 'verdict' })} active={q.sort === 'verdict'}>판정순</PubFacet>
            {shownProjects.length > 0 && <PubFacetSep />}
            {shownProjects.map(projectFacet)}
            {moreProjects.length > 0 && (
              <details className="pub-fold pub-fold--inline">
                <summary><IconChevronRight />프로젝트 {moreProjects.length}개 더</summary>
                <div className="pub-fold-body">{moreProjects.map(projectFacet)}</div>
              </details>
            )}
          </PubFacetBar>

          <div className="pub-libmain">
            <p className="pub-caption">
              {`조건에 맞는 앵글 ${ok.total}건`}
              {ok.total > 0 ? ` · 이 페이지 ${(q.page - 1) * PAGE_SIZE + 1}–${Math.min(q.page * PAGE_SIZE, ok.total)}` : ''}
              {ok.validatedKnown ? '' : ' · 실전 채택 칩 확인 불가'}
            </p>

            {ok.groups.length > 0 ? ok.groups.map((g) => {
              const id = `insight-group-${g.quadrant}`
              return (
                <section key={g.quadrant} className="pub-libgroup" aria-labelledby={id}>
                  <h2 className="pub-libgroup-h" id={id}>
                    <PubIconTile icon={QUADRANT_ICON[g.quadrant]} size={32} />
                    <span className="pub-libgroup-t">{QUADRANT_LABEL(g.quadrant)}</span>
                    <span className="pub-libgroup-n">{g.count}건</span>
                  </h2>
                  <p className="pub-caption">
                    {g.quadrant === 'none'
                      ? `PMF 진단을 아직 돌리지 않았거나 두 축 중 하나가 비어 사분면이 없다.${ok.notRunProjects > 0 ? ` 선례 확인 불가 프로젝트 ${ok.notRunProjects}곳 포함.` : ''}`
                      : PMF_QUADRANT_ADVICE[g.quadrant]}
                  </p>
                  <div className="pub-cardgrid">
                    {g.items.map((it) => <PubInsightCard key={it.id} item={it} evidence={evidence?.get(it.aspect_id)} />)}
                  </div>
                </section>
              )
            }) : filtered ? (
              <PubEmpty
                title="이 조건에 맞는 앵글이 없다"
                description="조회는 정상이다. 지금 고른 사분면·프로젝트·판정 조건에 맞는 앵글이 없다는 뜻이고, 다른 것으로 채우지 않는다."
                action={<PubButtonLink href="/insights" variant="ghost" size="sm">필터 없이 보기<IconArrowRight /></PubButtonLink>}
              />
            ) : (
              <PubEmpty
                title="게이트를 통과한 앵글이 아직 없다"
                description={`조회는 정상이다. 앵글은 검수 완료 프로젝트에서 ‘앵글 생성’ 을 눌러야 생기고, 여기엔 judge 가 근거 있음·체험 기반으로 판정한 것만 온다. 숨긴 근거 없음 ${ok.hiddenUnsubstantiated}건은 ‘전부 보기’ 로 볼 수 있다.`}
                action={<PubButtonLink href={insightHref(q, { gate: 'all' })} variant="ghost" size="sm">전부 보기<IconArrowRight /></PubButtonLink>}
              />
            )}

            {(q.page > 1 || q.page < lastPage) && (
              <nav className="pub-chiprow" aria-label="페이지">
                {q.page > 1 && <PubButtonLink href={insightHref(q, { page: q.page - 1 })} variant="ghost" size="sm">이전 {PAGE_SIZE}건</PubButtonLink>}
                {q.page < lastPage && <PubButtonLink href={insightHref(q, { page: q.page + 1 })} variant="ghost" size="sm">다음 {PAGE_SIZE}건<IconArrowRight /></PubButtonLink>}
              </nav>
            )}

            <details className="pub-fold">
              <summary><IconChevronRight />판정이 무슨 뜻인가</summary>
              <div className="pub-fold-body">
                {SUBSTANTIATION_VERDICTS.map((v) => <p key={v} className="pub-text">{SUBSTANTIATION_VERDICT_LABELS[v]}: {VERDICT_NOTE[v]}</p>)}
                <p className="pub-text">순화됨: 실증 게이트가 성능 주장을 걷어내고 다시 쓴 문구. 재작성 전 문구는 카드의 접힘에 있다.</p>
              </div>
            </details>
          </div>
        </div>
      )}
    </PubShell>
  )
}

/** 판정 범례 한 줄씩. judge 판정 분류(lib/analysis/judge-prompt.ts)를 옮긴 것이고 새 기준이 아니다. */
const VERDICT_NOTE: Record<(typeof SUBSTANTIATION_VERDICTS)[number], string> = {
  SUBSTANTIATED: '원문에 제시된 근거(시험·인증 등)로 뒷받침되는 주장. 카드의 인용 줄이 judge 가 뽑은 그 문장이다.',
  EXPERIENTIAL: '결과·효능을 암시하지 않는 사용감·경험 서술이라 검증 대상이 아닌 문구.',
  UNSUBSTANTIATED: '근거 없이 성능·효능·결과를 단정하는 주장. 기본 화면에서는 숨긴다.',
}
