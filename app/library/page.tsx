import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_SORT, LIBRARY_SORTS, LIBRARY_SORT_LABEL, loadLibrary, parseLibraryQuery,
  type LibrarySort,
} from '@/lib/cases/library'
import { DEFAULT_SEARCH_KIND, type SearchKind } from '@/lib/cases/search'
import { READER_PROBLEM_LABEL, READER_PROBLEMS } from '@/lib/cases/draft'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubCaseCard } from '../_pub/components/PubCaseCard'
import { PubBrandLogoNotice } from '../_pub/components/PubBrandLogo'
import { PubGradeLegend } from '../_pub/components/PubGradeBadge'
import { PubFacet, PubFacetBar, PubFacetSep } from '../_pub/components/PubFacetBar'
import { PubEmpty } from '../_pub/components/PubEmpty'
import { PubButtonLink } from '../_pub/components/Button'

/**
 * 공개 케이스 라이브러리 — 카드 그리드(reports/2026-09-23/ui-overhaul-reference-plan.md §4).
 *
 * **익명으로 열린다**(`lib/auth/policy.ts` 의 `/library` 접두사, PR #227). 그래서 이 화면은
 * **읽기 전용**이고 `review_status='approved'` 인 케이스만 낸다 — 승인 상태를 여기서 바꾸지
 * 않는다(승인은 `/cases` 의 서버 액션뿐, `/columns/read` 와 같은 구조).
 *
 * JS 가 0이다: 필터는 링크, 정렬·검색은 GET `<form>`. 결과가 전부 URL 에 있어 그대로 공유된다.
 *
 * ★ 3상태를 다른 화면으로 가른다(§7.1): 조회 실패는 경고 패널(카드 영역을 아예 안 낸다),
 *   0건은 빈 상태 카드. 둘을 같은 "케이스 없음"으로 접으면 DB 장애가 "아직 축적 중"으로 굳는다.
 *
 * 디자인은 `app/_pub` 라이트 테마다(A2, 남헌 2026-09-23 B안). `app/_ds` 를 import 하지 않고
 * 두더지웍스 DS 컴포넌트·그쪽 sa- 접두 클래스를 하나도 쓰지 않는다 — 그쪽 AppNav 는 이 경로에서 스스로 숨는다.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: '케이스 라이브러리',
  description: '승인된 케이스만 모아 둔 공개 라이브러리 — 문제 유형별로 "남들은 어떻게 풀었나"를 본다.',
}

export default async function LibraryPage({ searchParams }: {
  searchParams: Promise<{ problem?: string; kind?: string; sort?: string }>
}) {
  const sp = await searchParams
  const { query, errors } = parseLibraryQuery(sp)

  // 링크는 **다른 조건을 지우지 않는다.** 기본값(kind=saas · sort=recent)은 URL 에 안 적는다 —
  // 파라미터 없는 첫 진입과 같은 화면이 되고 링크가 짧아진다.
  const href = (patch: { problem?: string | null; kind?: SearchKind; sort?: LibrarySort }) => {
    const p = new URLSearchParams()
    const problem = patch.problem === undefined ? query.problem : patch.problem
    const kind = patch.kind ?? query.kind
    const sort = patch.sort ?? query.sort
    if (problem) p.set('problem', problem)
    if (kind !== DEFAULT_SEARCH_KIND) p.set('kind', kind)
    if (sort !== DEFAULT_SORT) p.set('sort', sort)
    const s = p.toString()
    return s ? `/library?${s}` : '/library'
  }

  const sb = await createClient()
  const result = sb
    ? await loadLibrary(sb, query, 'library')
    : null

  // 사이드바(≥1024px) / 상단 가로 스크롤 칩(<1024px) — 같은 목록 한 벌이다(pub.css `.pub-facets`).
  // 두 벌로 렌더하면 건수가 갈라진다. 건수는 **현재 종류 필터 기준**이다.
  const counts = result?.counts
  const facets = (
    <PubFacetBar label="문제 유형 필터">
      <PubFacet href={href({ problem: null })} active={!query.problem} count={counts?.total}>
        전체
      </PubFacet>
      {READER_PROBLEMS.map((code) => (
        <PubFacet key={code} href={href({ problem: code })} active={query.problem === code} count={counts?.by_problem[code]}>
          {READER_PROBLEM_LABEL[code] ?? code}
        </PubFacet>
      ))}
      <PubFacetSep />
      {/* 종류 토글. 소비재 케이스는 지우지 않고 숨기기만 하므로(CLAUDE.md §10.2 예외 1)
          되돌리는 손잡이가 화면에 있어야 한다. */}
      <PubFacet href={href({ kind: 'saas' })} active={query.kind === 'saas'}>SaaS만(기본)</PubFacet>
      <PubFacet href={href({ kind: 'all' })} active={query.kind === 'all'}>소비재 포함</PubFacet>
    </PubFacetBar>
  )

  const toolbar = (
    <div className="pub-toolbar">
      {/* 검색은 이 화면이 하지 않는다 — 자유 텍스트 매칭기는 /cases/search 한 벌이다(두 벌이면 갈라진다). */}
      <form className="pub-inline pub-inline--grow" method="get" action="/cases/search">
        {query.problem && <input type="hidden" name="problem" value={query.problem} />}
        {query.kind !== DEFAULT_SEARCH_KIND && <input type="hidden" name="kind" value={query.kind} />}
        <input
          className="pub-field pub-field--grow"
          name="q" maxLength={200} aria-label="내 말로 검색 (유사 케이스 검색으로 이동)"
          placeholder="내 말로 한 줄 (예: 무료로는 쓰는데 결제를 안 한다)"
        />
        <button className="pub-btn pub-btn--ghost pub-btn--sm" type="submit">검색</button>
      </form>

      {/* 정렬 — JS 없이 GET 폼. select 만 두면 키보드로 바꿔도 적용이 안 되므로 버튼을 같이 둔다. */}
      <form className="pub-inline" method="get">
        {query.problem && <input type="hidden" name="problem" value={query.problem} />}
        {query.kind !== DEFAULT_SEARCH_KIND && <input type="hidden" name="kind" value={query.kind} />}
        <select className="pub-field" name="sort" defaultValue={query.sort} aria-label="정렬">
          {LIBRARY_SORTS.map((s) => <option key={s} value={s}>{LIBRARY_SORT_LABEL[s]}</option>)}
        </select>
        <button className="pub-btn pub-btn--ghost pub-btn--sm" type="submit">적용</button>
      </form>
    </div>
  )

  return (
    <PubShell theme="light">
      <Hero
        eyebrow="CASE LIBRARY"
        title="케이스 라이브러리"
        lead="승인된 케이스만 나온다. 카드의 한 줄은 요약이 아니라 내일 할 행동(transfer_note)이다."
        note={result ? result.reason : undefined}
      />

      {errors.length > 0 && (
        <Panel tone="alert" title="질의를 그대로 쓰지 못했다">
          <p className="pub-text">{errors.join(' / ')} — 그 조건은 빼고 보여줬다.</p>
        </Panel>
      )}

      {!sb && (
        <Panel tone="alert" title="확인 불가 — Supabase 환경변수 미설정">
          <p className="pub-text">케이스를 읽지 못했다. 승인된 케이스가 없다는 뜻이 아니다.</p>
        </Panel>
      )}
      {result?.status === 'error' && (
        <Panel tone="alert" title="확인 불가 — 케이스 조회 실패">
          <p className="pub-text">{result.reason} · 잠시 뒤 다시 열어 보라.</p>
        </Panel>
      )}

      {result && result.status !== 'error' && (
        <div className="pub-liblayout">
          {facets}
          <div className="pub-libmain">
            {toolbar}

            {result.status === 'ok' ? (
              <>
                <div className="pub-cardgrid">
                  {result.cards.map((c) => (
                    <PubCaseCard
                      key={c.study.slug}
                      study={c.study}
                      move={c.move}
                      moveCount={c.move_count}
                      // 근거 수는 "믿을 만한가"의 첫 줄이다. 못 센 것을 0 으로 적지 않는다(§7.1).
                      reason={c.evidence_count === null ? '근거 수 확인 불가' : `근거 ${c.evidence_count}건`}
                    />
                  ))}
                </div>
                <PubGradeLegend />
              </>
            ) : (
              <PubEmpty
                title={result.empty_state}
                description={
                  result.hidden_consumer > 0
                    ? `조회는 정상이다. 지금 이 조건에 맞는 승인 SaaS 케이스가 없고, 없는 것을 소비재로 채우지 않는다. 숨긴 소비재 ${result.hidden_consumer}건은 "소비재 포함"으로 볼 수 있다.`
                    : '조회는 정상이다. 지금 이 조건에 맞는 승인 케이스가 없다는 뜻이고, 없는 것을 비슷한 사례로 채우지 않는다.'
                }
                action={result.hidden_consumer > 0
                  ? <PubButtonLink href={href({ kind: 'all' })} variant="ghost" size="sm">소비재 포함해서 보기 {result.hidden_consumer}</PubButtonLink>
                  : <PubButtonLink href={href({ problem: null })} variant="ghost" size="sm">문제 유형 전체 보기</PubButtonLink>}
              />
            )}

            <footer className="pub-deflist">
              <PubBrandLogoNotice />
              {counts && counts.unlabeled > 0 && (
                <p className="pub-caption">문제 유형이 아직 안 적힌 케이스 {counts.unlabeled}건 — 위 칩 건수 합과 전체가 다른 이유다.</p>
              )}
              {result.logo_columns === 'missing' && (
                <p className="pub-caption">로고 컬럼(마이그 20260930000001)이 아직 없다 — 로고 미기재가 아니라 컬럼 없음이다.</p>
              )}
            </footer>
          </div>
        </div>
      )}
    </PubShell>
  )
}
