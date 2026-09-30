import type { ReactNode } from 'react'
import Link from 'next/link'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { DEFAULT_SEARCH_KIND, QUERY_MAX, parseSearchQuery, searchMoves } from '@/lib/cases/search'
import { toTerms } from '@/lib/cases/advisor'
import { pairMoves, pairsForMoves } from '@/lib/cases/compare'
import { cutReport } from '@/lib/cases/report-tier'
import { logReportView } from '@/lib/cases/idea-angles-log'
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
import { PubLockRow } from '../../_pub/components/PubLockRow'
import { IconChevronRight, IconSearch } from '../../_pub/icons'
import { ShareLinkButton } from '../../library/[slug]/share-button'
import { AnglePanel } from './angle-panel'

// 아이디어 PMF 판정(구 매칭 리포트, 2026-10-01 남헌 v9 개명 — 라우트 /cases/report 는 그대로).
// 아이디어 한 줄 → 리포트 한 장 (경쟁사 기능 11a, 남헌 2026-09-24 승인).
//
// 새 매칭기가 아니다. /cases/search 의 searchMoves(무브 + 실패 앵글)와 compare.pairMoves(갈린 짝)를
// 그대로 돌려 **섹션 4개 한 장**으로 묶는다. 새 LLM 호출·마이그 없음.
//
// ★ 비로그인 체험판(남헌 2026-09-25 결정 2, §10.2 예외 3 승인). lib/auth/policy.ts PUBLIC_EXACT **정확일치**로만
//   연다 — PUBLIC_PREFIXES 에 넣지 않는다(검수 /cases/* 가 같이 열린다). 익명이면 내부 화면 링크(검색·분석)를
//   숨기고 공개 화면(/library·/voc)으로 보낸다. 아이디어는 GET ?q= 로 남는다 — 공유 링크가 되는 대신
//   URL·접근 로그에 원문이 남고, 그것도 승인됐다(화면에 한 줄로 밝힌다).
// ★ §7.1: 섹션마다 0건이면 "해당 없음"을 그대로 그리고, 조회 실패(not_run)는 "확인 불가"로 따로 말한다.
//   /cases/search 와 달리 **조건 없는 둘러보기를 하지 않는다** — 아이디어와 무관한 상위 N건을
//   리포트에 실으면 "내 아이디어에 매칭됐다"로 읽힌다.
// ★ B7(2026-09-30, reports/2026-09-30/design-direction-cases-report-addendum.md R1): 운영 화면 껍데기(PageShell) →
//   `PubShell` 공개 화면. 헤더·푸터가 생겨 익명 막다른길이 풀리고, 무브는 색인 줄 · 갈린 짝은 2열 대조표다.
// ★ I4(2026-10-01): 로그인후에만 "앵글 검증" 섹션이 붙는다. **이 페이지 GET 은 여전히 LLM 0** — 클라이언트 섬
//   `angle-panel.tsx` 가 POST /api/cases/report/angles 로 비동기 잡을 걸고 폴링한다(claude-cli, 본체 lib/cases/idea-angles-run.ts).
// ★ 질의 기록(남헌 2026-10-01): 매칭을 실제로 돌린 요청마다 idea_query_log 1행(source='report_view', outcome='view').
//   익명은 requested_by NULL(원문·해시·kind·시각만). after() 로 응답 뒤에 쓰고, 실패해도 리포트는 그대로 뜬다
//   (본체 lib/cases/idea-angles-log.ts — 플러드 천장·콘솔 원문 0). 라우터 프리페치 요청은 세지 않는다.

export const dynamic = 'force-dynamic'
export const metadata = { title: '아이디어 PMF 판정' }

/** 리포트는 한 장이다. 무브는 상위 N 만 싣고 나머지는 브랜드 칩으로 접는다(건수는 밝힌다). */
const REPORT_MOVES = 5
/**
 * 처음에 펴 두는 건수(무브 줄·실패 앵글 둘 다). 나머지는 `<details>` 로 접는다 — DOM 에는 그대로 있다.
 * 그래서 접기는 **로그인후만** 쓴다. 로그인전은 `cutReport`(lib/cases/report-tier.ts)가 먼저 잘라 접을 것이 없다(I3-T).
 * 3 = 갈린 짝 대조표의 "한 열 3건 + N건 더"(B7-4)와 같은 문턱. 실데이터(2026-09-30, 닮은 무브 15·경고 5·짝 2)에서
 * 5건씩 펴면 1280 문서가 3,206px 로 기준(≤3,000)을 넘었다. 요약 띠가 전체 건수를 먼저 말하므로 상위 3건이면 방향은 보인다.
 */
const OPEN_ROWS = 3

const LEAD = '아이디어 한 줄을 넣으면 승인된 케이스와 실패 원장에서 닮은 것만 모아 한 장으로 보여준다. 로그인하면 앵글 검증과 사분면 판정(자가진단)까지 본다. 없는 것은 “해당 없음”으로 적는다.'
const EXAMPLE = '프리랜서용 인보이스 자동 발송 SaaS'

const TOC = [['moves', '닮은 성공 무브'], ['failed', '실패 경고 앵글'], ['pairs', '갈린 짝 비교'], ['next', '다음 행동']] as const
/** 로그인후 목차 — 앵글 검증(I4)을 갈린 짝과 다음 행동 사이에. */
const TOC_MEMBER = [...TOC.slice(0, 3), ['angles', '앵글 검증'], TOC[3]] as const

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
  const verdict = await getAuthVerdict()
  const signedIn = verdict.kind === 'allowed'
  const { query, errors } = parseSearchQuery({ q: sp.q, kind: sp.kind })
  // 로그인전(I3-2): 필터는 SaaS만(기본) 하나. URL 로 kind=all 을 넣어도 서버가 되돌리고 그 사실을 말한다.
  if (!signedIn && query.kind !== DEFAULT_SEARCH_KIND) {
    query.kind = DEFAULT_SEARCH_KIND
    errors.push('소비재 포함은 로그인 후')
  }
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
        {signedIn
          ? <PubFacet href={href('all')} active={query.kind === 'all'}>소비재 포함</PubFacet>
          : <Chip title="로그인 후">소비재 포함 · 로그인 후</Chip>}
      </div>
      <p className="pub-caption">입력한 아이디어 원문은 주소(URL)에 그대로 남는다. 이 주소를 보내면 같은 리포트가 열린다.</p>
    </form>
  )

  // 모든 반환(입력 전·낱말 0·환경변수 없음·정상)이 이 껍데기 하나를 지난다.
  const shell = (body: ReactNode) => (
    <PubShell theme="light">
      <Hero variant="index" title="아이디어 PMF 판정" lead={LEAD} />
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
  // 매칭을 실제로 돌린 요청만 기록. 허용목록 밖 로그인 계정은 화면과 같이 익명 취급(이메일 안 남김).
  // 프리페치(next-router-prefetch · Sec-Purpose)는 사람이 연 게 아니라 건너뛴다. 헤더는 판정에만 쓰고 저장하지 않는다.
  const h = await headers()
  if (!h.get('next-router-prefetch') && !/prefetch/i.test(h.get('sec-purpose') ?? h.get('purpose') ?? '')) {
    const logged = { q: query.q, kind: query.kind, email: verdict.kind === 'allowed' ? verdict.email : null }
    after(() => logReportView(sb, logged))
  }
  // 짝은 매칭 무브 전체로 찾는다 — 요약 띠 건수는 로그인전·후 같다(I3-2, 자른 사실을 숨기지 않는다).
  const pairs = pairsForMoves(pairMoves(corpora.studies, corpora.moves), result.moves.cards, corpora.studies,
    { saasOnly: query.kind === 'saas' })
  // ★ 로그인전은 여기서 **배열을 자른 뒤** 렌더한다(I3-T). 잘린 무브·경고·짝은 HTML·RSC 페이로드에 없고 건수만 잠금 줄로 남는다.
  const tier = cutReport(signedIn, { moves: result.moves.cards, failed: result.failed_angles.cards, pairs: pairs.pairs })
  const moveCards = tier.moves
  const here = withParams('/cases/report', query.kind)
  const studyById = new Map((corpora.studies ?? []).map((s) => [s.id, s]))

  const count = (s: string, n: number, unit: string) => (s === 'not_run' ? '확인 불가' : s === 'matched' ? `${n}${unit}` : '해당 없음')
  const opened = (s: string, n: number, unit: string) => (!signedIn && s === 'matched' ? `${n}${unit} 공개` : undefined)
  // 상위 N 밖 나머지는 케이스 단위로 중복을 빼 브랜드 칩으로 접는다(로그인후만 — 브랜드명은 데이터다, I3-2).
  const shown = new Set(moveCards.slice(0, REPORT_MOVES).map((c) => c.case_study_id))
  const restCases = !signedIn ? [] : [...new Map(moveCards.slice(REPORT_MOVES)
    .filter((c) => !shown.has(c.case_study_id))
    .map((c) => [c.case_study_id, c] as const)).values()]
  const restCount = moveCards.length - REPORT_MOVES
  const row = (c: (typeof moveCards)[number]) => (
    <PubMatchRow key={c.case_move_id} card={c}
      study={studyById.get(c.case_study_id) ?? { brand_name: c.brand_name, slug: c.slug }}
      moveCount={c.siblings.length} />
  )
  const angle = (c: (typeof result.failed_angles.cards)[number]) => (
    <li key={c.case_key}>
      <b>{c.claimed_angle}</b>
      <span className="pub-angle-out">{c.outcome}</span>
      <span className="pub-caption">
        {c.product_category} · {c.source_tier}{c.is_estimate ? ' · 추정' : ''} · 겹친 낱말 {c.matched_terms.map((t) => `“${t}”`).join(', ')}
        {c.low_confidence ? ' · 신뢰도 낮음' : ''}
      </span>
    </li>
  )
  const foldedRows = moveCards.slice(OPEN_ROWS, REPORT_MOVES)
  const foldedAngles = tier.failed.slice(OPEN_ROWS)
  // 잠금 줄은 `.pub-index` 안의 `<li>` 다(PubLockRow). 실패 경고·짝 섹션은 목록 모양이 달라 한 줄짜리 목록으로 감싼다.
  const lock = (n: number, unit: string, what: string) =>
    n > 0 ? <PubLockRow count={n} unit={unit} what={what} next={here} /> : null

  return shell(<>
    <div className="pub-section">
      <div className="pub-report-stats">
        <StatRow>
          <Stat label="닮은 무브" value={count(result.moves.status, result.moves.cards.length, '건')}
            caption={opened(result.moves.status, tier.moves.length, '건')} />
          <Stat label="실패 경고" value={count(result.failed_angles.status, result.failed_angles.cards.length, '건')}
            caption={opened(result.failed_angles.status, tier.failed.length, '건')} />
          <Stat label="갈린 짝" value={count(pairs.status, pairs.pairs.length, '묶음')}
            caption={opened(pairs.status, tier.pairs.length, '묶음')} />
        </StatRow>
      </div>
      <div className="pub-chiprow">
        <span className="pub-caption">매칭 낱말</span>
        {terms.map((t) => <Chip key={t}>“{t}”</Chip>)}
        <ShareLinkButton />
      </div>
    </div>

    <div className="pub-detail pub-report-body">
      <PubTOC items={signedIn ? TOC_MEMBER : TOC} />
      <div className="pub-detail-body">
        <Section id="moves" title="닮은 성공 무브"
          lead={`승인된 케이스·무브만. 등급 D 제외. ${query.kind !== 'saas' ? '소비재 포함.'
            : signedIn ? 'SaaS 케이스만(소비재는 숨김, 위 “소비재 포함”).' : 'SaaS 케이스만(소비재 포함은 로그인 후).'}`}>
          <SectionState status={result.moves.status} reason={result.moves.reason} none={result.empty_state}
            action={signedIn && query.kind === 'saas'
              ? <PubButtonLink href={href('all')} variant="ghost" size="sm">소비재 포함해서 다시</PubButtonLink>
              : undefined} />
          {moveCards.length > 0 && <>
            <ul className="pub-index">
              {moveCards.slice(0, OPEN_ROWS).map(row)}
              {lock(tier.locked.moves, '건', '닮은 무브 나머지')}
            </ul>
            {signedIn && moveCards.length > OPEN_ROWS && (
              <details className="pub-fold">
                <summary><IconChevronRight />나머지 {moveCards.length - OPEN_ROWS}건{restCases.length > 0 ? ` (브랜드 ${restCases.length}곳 더)` : ''}</summary>
                <div className="pub-fold-body">
                  {foldedRows.length > 0 && <ul className="pub-index">{foldedRows.map(row)}</ul>}
                  {restCases.length > 0 && (
                    <div className="pub-chiprow pub-report-rest">
                      {restCases.map((c) => (
                        <Link key={c.case_study_id} href={`/library/${c.slug}`} translate="no"><Chip>{c.brand_name}</Chip></Link>
                      ))}
                    </div>
                  )}
                  {restCount > 0 && (
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
          {tier.failed.length > 0 && (
            <ul className="pub-angles">{tier.failed.slice(0, OPEN_ROWS).map(angle)}</ul>
          )}
          {foldedAngles.length > 0 && (
            <details className="pub-fold">
              <summary><IconChevronRight />나머지 {foldedAngles.length}건</summary>
              <ul className="pub-angles">{foldedAngles.map(angle)}</ul>
            </details>
          )}
          {tier.locked.failed > 0 && <ul className="pub-index">{lock(tier.locked.failed, '건', '실패 경고 나머지')}</ul>}
        </Section>

        <Section id="pairs" title="갈린 짝 비교" lead="위 무브와 같은 병목·레버인데 한쪽은 됐고 한쪽은 안 된 승인 케이스 짝.">
          <SectionState status={pairs.status} reason={pairs.reason} none="내 매칭과 겹치는 갈린 짝 0묶음" />
          {tier.pairs.map((p) => <PubPairCompare key={p.key} p={p} lockRest={!signedIn} />)}
          {tier.locked.pairs > 0 && <ul className="pub-index">{lock(tier.locked.pairs, '묶음', '갈린 짝 나머지')}</ul>}
        </Section>

        {/* 앵글 검증(I4) — 로그인후만. 페이지는 LLM 0 으로 먼저 뜨고 패널(클라이언트 섬)이 비동기로 찬다.
            선례 무브가 0건이면 판정 코퍼스가 없어 돌리지 않는다(돌리면 늘 "근거 없음"만 나온다). */}
        {signedIn && (
          <Section id="angles" title="앵글 검증" lead="아이디어로 소구 앵글 3개를 쓰고, 위 선례의 근거 문장으로 뒷받침되는지 판정한다.">
            {result.moves.status === 'matched' && result.moves.cards.length > 0 && query.q
              ? <AnglePanel q={query.q} kind={query.kind} />
              : <PubEmpty compact title="해당 없음. 매칭된 선례 무브가 없다" description="판정 근거로 쓸 선례 문장이 없어 앵글 검증을 돌리지 않았다." />}
          </Section>
        )}

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
                  <PubButtonLink href="/voc" variant="ghost">VOC 피드 보기</PubButtonLink>
                </div>
                <p className="pub-text">경쟁사 분석·PMF 진단은 가입 후 쓸 수 있다. 가입은 10/12 개방 예정이다.</p>
                <p className="pub-text">로그인하면 나머지 무브·실패 경고·짝 전부와 내 아이디어의 앵글 검증 수치, 사분면 판정(자가진단)을 본다.</p>
              </>
            )}
          </Panel>
        </Section>
      </div>
    </div>
  </>)
}
