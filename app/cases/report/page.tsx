import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { DEFAULT_SEARCH_KIND, QUERY_MAX, parseSearchQuery, searchMoves } from '@/lib/cases/search'
import { toTerms } from '@/lib/cases/advisor'
import { pairMoves, pairsForMoves } from '@/lib/cases/compare'
import { PubShell } from '../../_pub/components/PubShell'
import { Hero } from '../../_pub/components/Hero'
import { Section } from '../../_pub/components/Section'
import { Panel } from '../../_pub/components/Panel'
import { Stat, StatRow } from '../../_pub/components/Stat'
import { Chip } from '../../_pub/components/Chip'
import { PubFacet } from '../../_pub/components/PubFacetBar'
import { PubEmpty } from '../../_pub/components/PubEmpty'
import { PubTOC } from '../../_pub/components/PubTOC'
import { PubButton, PubButtonLink } from '../../_pub/components/Button'
import { PubGradeLegend } from '../../_pub/components/PubGradeBadge'
import { PubMatchRow } from '../../_pub/components/PubMatchRow'
import { PubPairCompare } from '../../_pub/components/PubPairCompare'
import { IconChevronRight, IconSearch } from '../../_pub/icons'
import { ShareLinkButton } from '../../library/[slug]/share-button'

// 아이디어 한 줄 → 매칭 리포트 한 장 (경쟁사 기능 11a, 남헌 2026-09-24 승인).
//
// 새 매칭기가 아니다. /cases/search 의 searchMoves(무브 + 실패 앵글)와 compare.pairMoves(갈린 짝)를
// 그대로 돌려 **섹션 4개 한 장**으로 묶는다. 새 LLM 호출·마이그 없음.
//
// ★ 비로그인 체험판(남헌 2026-09-25 결정 2, §10.2 예외 3 승인). lib/auth/policy.ts PUBLIC_EXACT **정확일치**로만
//   연다 — PUBLIC_PREFIXES 에 넣지 않는다(검수 /cases/* 가 같이 열린다). 익명이면 내부 화면 링크(검색·분석)를
//   숨기고 공개 화면(/library·/signals)으로 보낸다. 아이디어는 GET ?q= 로 남는다 — 공유 링크가 되는 대신
//   URL·접근 로그에 원문이 남고, 그것도 승인됐다(화면에 한 줄로 밝힌다).
// ★ §7.1: 섹션마다 0건이면 "해당 없음"을 그대로 그리고, 조회 실패(not_run)는 "확인 불가"로 따로 말한다.
//   /cases/search 와 달리 **조건 없는 둘러보기를 하지 않는다** — 아이디어와 무관한 상위 N건을
//   리포트에 실으면 "내 아이디어에 매칭됐다"로 읽힌다.
// ★ B7(2026-09-30, reports/2026-09-30/design-direction-cases-report-addendum.md R1): 운영 화면 껍데기(PageShell) →
//   `PubShell` 공개 화면. 헤더·푸터가 생겨 익명 막다른길이 풀리고, 무브는 색인 줄 · 갈린 짝은 2열 대조표다.

export const dynamic = 'force-dynamic'
export const metadata = { title: '아이디어 매칭 리포트' }

/** 리포트는 한 장이다. 무브는 상위 N 만 싣고 나머지는 브랜드 칩으로 접는다(건수는 밝힌다). */
const REPORT_MOVES = 5

const LEAD = '아이디어 한 줄을 넣으면 승인된 케이스와 실패 원장에서 닮은 것만 모아 한 장으로 보여준다. 없는 것은 “해당 없음”으로 적는다.'
const EXAMPLE = '프리랜서용 인보이스 자동 발송 SaaS'

const TOC = [['moves', '닮은 성공 무브'], ['failed', '실패 경고 앵글'], ['pairs', '갈린 짝 비교'], ['next', '다음 행동']] as const

/** lib 의 사유 원문은 그대로 두고 화면에서만 푼다(DESIGN.md §5: em 대시·직선 따옴표 금지). */
const tidy = (s: string) => s.replace(/\s[—–]\s/g, '. ').replace(/"([^"]*)"/g, '“$1”')

/** 섹션 공통 상태. matched 면 아무것도 안 낸다. not_run(확인 불가)과 no_match(해당 없음)를 같은 그릇에 담지 않는다. */
function SectionState({ status, reason, none, action }: { status: string; reason: string; none: string; action?: ReactNode }) {
  if (status === 'matched') return null
  if (status === 'not_run') {
    return (
      <Panel tone="alert" title="확인 불가">
        <p className="pub-text">{tidy(reason)}. “해당 없음”이 아니다.</p>
      </Panel>
    )
  }
  return <PubEmpty compact title={`해당 없음. ${tidy(none)}`} description={tidy(reason)} action={action} />
}

export default async function IdeaReportPage({ searchParams }: {
  searchParams: Promise<{ q?: string; kind?: string }>
}) {
  const sp = await searchParams
  // 로그인 여부는 **표시용**이다(app/library/[slug] 와 같은 방식). 허용 목록 밖 계정도 내부 화면에
  // 못 들어가므로 익명과 같이 체험판 화면을 본다.
  const signedIn = (await getAuthVerdict()).kind === 'allowed'
  const { query, errors } = parseSearchQuery({ q: sp.q, kind: sp.kind })
  const terms = toTerms(query.q)

  const withParams = (path: string, kind: string, q: string | null = query.q) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (kind !== DEFAULT_SEARCH_KIND) p.set('kind', kind)
    const s = p.toString()
    return s ? `${path}?${s}` : path
  }
  const href = (kind: string) => withParams('/cases/report', kind)

  const form = (
    <form method="get" className="pub-form pub-report-ask">
      {query.kind !== DEFAULT_SEARCH_KIND && <input type="hidden" name="kind" value={query.kind} />}
      <div className="pub-report-ask-row">
        <span className="pub-field-wrap">
          <IconSearch />
          <input name="q" defaultValue={query.q ?? ''} maxLength={QUERY_MAX} required autoComplete="off"
            placeholder={`내 아이디어 한 줄 (예: ${EXAMPLE})…`} aria-label="아이디어 한 줄"
            className="pub-field pub-field--grow" />
        </span>
        <PubButton variant="primary">리포트 만들기</PubButton>
      </div>
      <div className="pub-chiprow">
        <PubFacet href={href('saas')} active={query.kind === 'saas'}>SaaS만(기본)</PubFacet>
        <PubFacet href={href('all')} active={query.kind === 'all'}>소비재 포함</PubFacet>
      </div>
      <p className="pub-caption">입력한 아이디어 원문은 주소(URL)에 그대로 남는다. 이 주소를 보내면 같은 리포트가 열린다.</p>
    </form>
  )

  // 모든 반환(입력 전·낱말 0·환경변수 없음·정상)이 이 껍데기 하나를 지난다.
  const shell = (body: ReactNode) => (
    <PubShell theme="light">
      <Hero variant="index" title="아이디어 매칭 리포트" lead={LEAD} />
      <div className="pub-section">
        {form}
        {errors.length > 0 && (
          <Panel tone="alert" titleAs="h2" title="질의를 그대로 쓰지 못했다">
            <p className="pub-text">{errors.join(' / ')}. 그 조건은 빼고 만들었다.</p>
          </Panel>
        )}
        {body}
      </div>
    </PubShell>
  )

  const sb = await createClient()

  // 입력 전. 둘러보기로 채우지 않는다(위 머리말) — 대신 무엇이 나오는지 라이브 집계 3칸.
  if (!query.q) {
    let saasCases = '집계 불가', failedRows = '집계 불가', pairGroups = '집계 불가'
    if (sb) {
      const corpora = await loadCaseCorpus(sb, 'cases/report')
      const saas = searchMoves(query, corpora).saas_case_count
      if (saas !== null) saasCases = `${saas}건`
      if (corpora.failedAngles) failedRows = `${corpora.failedAngles.length}행`
      const all = pairMoves(corpora.studies, corpora.moves)
      if (all.status !== 'not_run') pairGroups = `${all.pairs.length}묶음`
    }
    return shell(<>
      {!sb && (
        <Panel tone="alert" titleAs="h2" title="확인 불가. Supabase 환경변수 미설정">
          <p className="pub-text">아래 집계를 세지 못했다. 케이스가 없다는 뜻이 아니다.</p>
        </Panel>
      )}
      <div className="pub-report-stats">
        <StatRow>
          <Stat label="닮은 성공 무브" value={saasCases} caption="승인된 SaaS 케이스 수. 여기서 닮은 무브를 찾는다" />
          <Stat label="실패 경고 앵글" value={failedRows} caption="실패 원장 행 수. 같은 소구점으로 망한 기록" />
          <Stat label="갈린 짝 비교" value={pairGroups} caption="같은 수로 한쪽은 되고 한쪽은 안 된 묶음" />
        </StatRow>
      </div>
      <p className="pub-caption">
        예시로 보기: <Link className="pub-link" href={withParams('/cases/report', query.kind, EXAMPLE)}>{EXAMPLE}</Link>
      </p>
    </>)
  }
  // 불용어·숫자만 들어와 낱말이 0개면 매칭을 돌릴 수 없다. 0건이 아니라 못 돌린 것이다.
  // (여기서 막지 않으면 searchMoves 가 조건 없는 둘러보기로 떨어져 무관한 상위 20건을 낸다.)
  if (terms.length === 0) {
    return shell(
      <Panel tone="alert" titleAs="h2" title="확인 불가. 매칭할 낱말을 뽑지 못했다">
        <p className="pub-text">입력에서 두 글자 이상의 의미 있는 낱말이 나오지 않았다. 제품·대상·문제를 명사로 한 줄 적어 달라.</p>
      </Panel>,
    )
  }
  if (!sb) {
    return shell(
      <Panel tone="alert" titleAs="h2" title="확인 불가. Supabase 환경변수 미설정">
        <p className="pub-text">리포트를 만들지 못했다. 선례가 없다는 뜻이 아니다.</p>
      </Panel>,
    )
  }

  const corpora = await loadCaseCorpus(sb, 'cases/report')
  const result = searchMoves(query, corpora)
  const moveCards = result.moves.cards
  const pairs = pairsForMoves(pairMoves(corpora.studies, corpora.moves), moveCards, corpora.studies,
    { saasOnly: query.kind === 'saas' })
  const studyById = new Map((corpora.studies ?? []).map((s) => [s.id, s]))

  const count = (s: string, n: number, unit: string) => (s === 'not_run' ? '확인 불가' : s === 'matched' ? `${n}${unit}` : '해당 없음')
  // 상위 N 밖 나머지는 케이스 단위로 중복을 빼 브랜드 칩으로 접는다(검색 화면은 익명에게 안 열려 문이 아니다).
  const shown = new Set(moveCards.slice(0, REPORT_MOVES).map((c) => c.case_study_id))
  const restCases = [...new Map(moveCards.slice(REPORT_MOVES)
    .filter((c) => !shown.has(c.case_study_id))
    .map((c) => [c.case_study_id, c] as const)).values()]
  const restCount = moveCards.length - REPORT_MOVES

  return shell(<>
    <div className="pub-section">
      <div className="pub-report-stats">
        <StatRow>
          <Stat label="닮은 무브" value={count(result.moves.status, moveCards.length, '건')} />
          <Stat label="실패 경고" value={count(result.failed_angles.status, result.failed_angles.cards.length, '건')} />
          <Stat label="갈린 짝" value={count(pairs.status, pairs.pairs.length, '묶음')} />
        </StatRow>
      </div>
      <div className="pub-chiprow">
        <span className="pub-caption">매칭 낱말</span>
        {terms.map((t) => <Chip key={t}>“{t}”</Chip>)}
        <ShareLinkButton />
      </div>
    </div>

    <div className="pub-detail pub-report-body">
      <PubTOC items={TOC} />
      <div className="pub-detail-body">
        <Section id="moves" title="닮은 성공 무브"
          lead={`승인된 케이스·무브만. 등급 D 제외. ${query.kind === 'saas' ? 'SaaS 케이스만(소비재는 숨김, 위 “소비재 포함”).' : '소비재 포함.'}`}>
          <SectionState status={result.moves.status} reason={result.moves.reason} none={result.empty_state}
            action={query.kind === 'saas'
              ? <PubButtonLink href={href('all')} variant="ghost" size="sm">소비재 포함해서 다시</PubButtonLink>
              : undefined} />
          {moveCards.length > 0 && <>
            <ul className="pub-index">
              {moveCards.slice(0, REPORT_MOVES).map((c) => (
                <PubMatchRow key={c.case_move_id} card={c}
                  study={studyById.get(c.case_study_id) ?? { brand_name: c.brand_name, slug: c.slug }}
                  moveCount={c.siblings.length} />
              ))}
            </ul>
            {restCount > 0 && restCases.length === 0 && !signedIn && (
              <p className="pub-caption">나머지 {restCount}건은 위 브랜드의 다른 무브다.</p>
            )}
            {restCount > 0 && (restCases.length > 0 || signedIn) && (
              <details className="pub-fold">
                <summary><IconChevronRight />나머지 {restCount}건{restCases.length > 0 ? ` (브랜드 ${restCases.length}곳)` : ''}</summary>
                <div className="pub-fold-body">
                  {restCases.length > 0 && (
                    <div className="pub-chiprow pub-report-rest">
                      {restCases.map((c) => (
                        <Link key={c.case_study_id} href={`/library/${c.slug}`} translate="no"><Chip>{c.brand_name}</Chip></Link>
                      ))}
                    </div>
                  )}
                  {signedIn && (
                    <p className="pub-caption"><Link className="pub-link" href={withParams('/cases/search', query.kind)}>검색 화면</Link>에서 전부 본다.</p>
                  )}
                </div>
              </details>
            )}
            <PubGradeLegend />
          </>}
        </Section>

        <Section id="failed" title="실패 경고 앵글" lead="아이디어 낱말과 겹치는 실패 원장 행. 같은 소구점으로 망한 적이 있나.">
          <SectionState status={result.failed_angles.status} reason={result.failed_angles.reason} none="겹치는 실패 사례 0건" />
          {result.failed_angles.cards.length > 0 && (
            <ul className="pub-angles">
              {result.failed_angles.cards.map((c) => (
                <li key={c.case_key}>
                  <b>{c.claimed_angle}</b>
                  <span className="pub-angle-out">{c.outcome}</span>
                  <span className="pub-caption">
                    {c.product_category} · {c.source_tier}{c.is_estimate ? ' · 추정' : ''} · 겹친 낱말 {c.matched_terms.map((t) => `“${t}”`).join(', ')}
                    {c.low_confidence ? ' · 신뢰도 낮음' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="pairs" title="갈린 짝 비교" lead="위 무브와 같은 병목·레버인데 한쪽은 됐고 한쪽은 안 된 승인 케이스 짝.">
          <SectionState status={pairs.status} reason={pairs.reason} none="내 매칭과 겹치는 갈린 짝 0묶음" />
          {pairs.pairs.map((p) => <PubPairCompare key={p.key} p={p} />)}
        </Section>

        {/* 아이디어 텍스트를 /analyze/new 쿼리스트링으로 넘기지 않는다(/cases/search 와 같은 이유 — 리퍼러·액세스 로그). */}
        <Section id="next" title="다음 행동" lead="남의 사례는 방향이다. 내 시장에서도 그 문제가 아픈지는 내 경쟁사 리뷰가 답한다.">
          <Panel tone="dark">
            {signedIn ? (
              <>
                <div className="pub-actions">
                  <PubButtonLink href="/analyze/new" variant="primary">경쟁사 분석 시작</PubButtonLink>
                  <PubButtonLink href="/analyze" variant="ghost">PMF 진단 (분석 프로젝트에서)</PubButtonLink>
                </div>
                <p className="pub-text">PMF 진단은 분석 프로젝트의 검토 화면에서 돈다. 프로젝트가 없으면 경쟁사 분석부터.</p>
              </>
            ) : (
              <>
                <div className="pub-actions">
                  <PubButtonLink href="/library" variant="primary">케이스 라이브러리 보기</PubButtonLink>
                  <PubButtonLink href="/signals" variant="ghost">신호 피드 보기</PubButtonLink>
                </div>
                <p className="pub-text">경쟁사 분석·PMF 진단은 가입 후 쓸 수 있다. 가입은 10/12 개방 예정이다.</p>
              </>
            )}
          </Panel>
        </Section>
      </div>
    </div>
  </>)
}
