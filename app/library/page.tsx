import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_SORT, LIBRARY_SORTS, LIBRARY_SORT_LABEL, UNLABELED_KEY, groupByProblem, loadLibrary, parseLibraryQuery,
  teaserLibrary, type LibraryCard, type LibrarySort,
} from '@/lib/cases/library'
import { DEFAULT_SEARCH_KIND, type SearchKind } from '@/lib/cases/search'
import { READER_PROBLEM_LABEL, READER_PROBLEMS } from '@/lib/cases/draft'
import { getAuthVerdict } from '@/lib/auth/session'
import { PubShell } from '../_pub/components/PubShell'
import { Hero } from '../_pub/components/Hero'
import { Panel } from '../_pub/components/Panel'
import { PubIndexRow } from '../_pub/components/PubIndexRow'
import { PubBrandLogoNotice } from '../_pub/components/PubBrandLogo'
import { PubGradeLegend } from '../_pub/components/PubGradeBadge'
import { PubFacet, PubFacetBar, PubFacetSep } from '../_pub/components/PubFacetBar'
import { PubEmpty } from '../_pub/components/PubEmpty'
import { PubButtonLink } from '../_pub/components/Button'
import { PubIconTile } from '../_pub/components/PubIconTile'
import { PubLockRow } from '../_pub/components/PubLockRow'
import { Chip } from '../_pub/components/Chip'
import { IconArrowRight, IconChevronDown, IconProblem, IconSearch } from '../_pub/icons'

/**
 * 공개 케이스 라이브러리 — 색인 줄 목록(남헌 2026-09-29 결정 b: 카드 격자 대신 색인 줄, DESIGN.md §4).
 *
 * **익명으로 열린다**(`lib/auth/policy.ts` 의 `/library` 접두사, PR #227). 그래서 이 화면은
 * **읽기 전용**이고 `review_status='approved'` 인 케이스만 낸다 — 승인 상태를 여기서 바꾸지
 * 않는다(승인은 `/cases` 의 서버 액션뿐, `/columns/read` 와 같은 구조).
 *
 * JS 가 0이다: 필터는 링크, 정렬·검색은 GET `<form>`. 결과가 전부 URL 에 있어 그대로 공유된다.
 *
 * ★ 3상태를 다른 화면으로 가른다(§7.1): 조회 실패는 경고 패널(목록 영역을 아예 안 낸다),
 *   0건은 빈 상태. 둘을 같은 "케이스 없음"으로 접으면 DB 장애가 "아직 축적 중"으로 굳는다.
 */

export const dynamic = 'force-dynamic'
export const metadata = {
  title: '케이스 라이브러리',
  description: '승인된 케이스만 모아 둔 공개 라이브러리. 문제 유형별로 남들은 어떻게 풀었나를 본다.',
}

export default async function LibraryPage({ searchParams }: {
  searchParams: Promise<{ problem?: string; kind?: string; sort?: string }>
}) {
  const sp = await searchParams
  // 로그인전/후(I2). 판별은 PubShell 과 같은 getAuthVerdict 한 벌(요청 단위 캐시). forbidden(허용목록 밖)은 익명과 같다.
  const signedIn = (await getAuthVerdict()).kind === 'allowed'
  const { query, errors } = parseLibraryQuery(sp, signedIn)

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
      {signedIn
        ? <PubFacet href={href({ kind: 'all' })} active={query.kind === 'all'}>소비재 포함</PubFacet>
        : <Chip title="로그인 후">소비재 포함 · 로그인 후</Chip>}
    </PubFacetBar>
  )

  const toolbar = (
    <div className="pub-toolbar">
      {/* 검색은 이 화면이 하지 않는다 — 자유 텍스트 매칭기는 searchMoves 한 벌이고 /cases/report 가 그 비로그인
          입구다(로그인 벽 /cases/search 는 검수용으로 남긴다, MVP 9/30 §7.1). q 파라미터 이름은 그대로 통한다. */}
      <form className="pub-inline pub-inline--grow" method="get" action="/cases/report">
        {query.kind !== DEFAULT_SEARCH_KIND && <input type="hidden" name="kind" value={query.kind} />}
        <span className="pub-field-wrap">
          <IconSearch />
          <input
            className="pub-field pub-field--grow"
            name="q" maxLength={200} aria-label="내 말로 검색 (아이디어 PMF 판정으로 이동)"
            placeholder="내 말로 한 줄 (예: 무료로는 쓰는데 결제를 안 한다)…"
          />
        </span>
        <button className="pub-btn pub-btn--sm" type="submit">검색</button>
      </form>

      {/* 정렬 — JS 없이 GET 폼. select 만 두면 키보드로 바꿔도 적용이 안 되므로 버튼을 같이 둔다.
          로그인전에는 select 자체를 렌더하지 않는다(I2-2). */}
      {!signedIn ? <p className="pub-caption">{LIBRARY_SORT_LABEL[DEFAULT_SORT]} · 정렬은 로그인 후</p> : <form className="pub-inline" method="get">
        {query.problem && <input type="hidden" name="problem" value={query.problem} />}
        {query.kind !== DEFAULT_SEARCH_KIND && <input type="hidden" name="kind" value={query.kind} />}
        <select className="pub-field" name="sort" defaultValue={query.sort} aria-label="정렬">
          {LIBRARY_SORTS.map((s) => <option key={s} value={s}>{LIBRARY_SORT_LABEL[s]}</option>)}
        </select>
        <button className="pub-btn pub-btn--sm" type="submit">적용<IconChevronDown /></button>
      </form>}
    </div>
  )

  // ★ 로그인전은 여기서 **배열을 자른 뒤** 렌더한다 — 잘린 카드는 HTML·RSC 페이로드에 실리지 않는다(I2-1).
  const teaser = result && !signedIn ? teaserLibrary(result) : null
  const shown = teaser ? teaser.cards : (result?.cards ?? [])
  const lockFor = (key: string) => teaser?.locked[key] ?? 0

  const rows = (cards: LibraryCard[], lockKey?: string) => (
    <ul className="pub-index">
      {cards.map((c) => (
        <PubIndexRow
          key={c.study.slug}
          study={c.study}
          move={c.move}
          moveCount={c.move_count}
          // 근거 수는 "믿을 만한가"의 첫 줄이다. 못 센 것을 0 으로 적지 않는다(§7.1).
          reason={c.evidence_count === null ? '근거 수 확인 불가' : `근거 ${c.evidence_count}건`}
        />
      ))}
      {lockKey && lockFor(lockKey) > 0 && (
        <PubLockRow
          count={lockFor(lockKey)}
          unit="건"
          what={cards.length > 0 ? '이 유형의 나머지 케이스' : '이 유형의 케이스'}
          next={lockKey === UNLABELED_KEY ? '/library' : `/library?problem=${lockKey}`}
        />
      )}
    </ul>
  )

  // 로그인전 Hero note — 자른 사실을 문장으로 밝힌다(§7.1: 잘라 놓고 "15건" 이라 말하지 않는다).
  const teaserNote = teaser && result?.status === 'ok'
    ? `승인 케이스 ${result.cards.length}건 중 ${teaser.cards.length}건 공개 · ${LIBRARY_SORT_LABEL[DEFAULT_SORT]}`
      + (result.hidden_consumer > 0 ? ` (소비재 ${result.hidden_consumer}건 숨김)` : '')
    // 로그인전 빈 결과: "kind=all 로 보기" 는 로그인 후 손잡이라 뺀다.
    : teaser ? result?.reason.replace('(kind=all 로 보기)', '') : null

  return (
    <PubShell theme="light">
      <Hero
        variant="index"
        title="케이스 라이브러리"
        // 리드 문장은 뺐다(G3 B3-4: 첫 뷰포트에 색인 줄 6개). "승인 케이스 N건" 은 아래 note(조회 사유)가 말하고, 2축 등급 설명은 목록 아래 범례가 한다.
        note={teaserNote ?? (result ? result.reason : undefined)}
      />

      {!signedIn && result && result.status !== 'error' && (
        <Panel tone="card" title="로그인하면 다 본다">
          <p className="pub-text">
            승인 케이스 {result.counts.total}건 전부와 케이스마다 붙은 내일 할 행동 한 줄, 등급순·무브순 정렬, 소비재 포함 필터를 쓸 수 있다.
          </p>
          <div className="pub-actions">
            <PubButtonLink href="/login?next=%2Flibrary" variant="primary" size="sm">로그인</PubButtonLink>
          </div>
        </Panel>
      )}

      {errors.length > 0 && (
        <Panel tone="alert" title="질의를 그대로 쓰지 못했다">
          <p className="pub-text">{errors.join(' / ')}. 그 조건은 빼고 보여줬다.</p>
        </Panel>
      )}

      {!sb && (
        <Panel tone="alert" title="확인 불가. Supabase 환경변수 미설정">
          <p className="pub-text">케이스를 읽지 못했다. 승인된 케이스가 없다는 뜻이 아니다.</p>
        </Panel>
      )}
      {result?.status === 'error' && (
        <Panel tone="alert" title="확인 불가. 케이스 조회 실패">
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
                {/* "전체" 일 때만 문제 유형 그룹 헤딩(B3-4b). 건수는 칩과 같은 counts.by_problem 그대로,
                    0건 유형은 헤딩을 만들지 않는다. 한 유형만 고른 화면은 헤딩 없이 줄만 낸다. */}
                {query.problem ? rows(shown, query.problem) : groupByProblem(shown, result.counts).map((g) => {
                  const id = `g-${g.code ?? 'unlabeled'}`
                  return (
                    <section key={id} className="pub-libgroup" aria-labelledby={id}>
                      <h2 className="pub-libgroup-h" id={id}>
                        <PubIconTile icon={<IconProblem />} size={32} />
                        <span className="pub-libgroup-t">{g.code ? (READER_PROBLEM_LABEL[g.code] ?? g.code) : '문제 유형 미지정'}</span>
                        <span className="pub-libgroup-n">{g.count}건</span>
                      </h2>
                      {rows(g.cards, g.code ?? UNLABELED_KEY)}
                    </section>
                  )
                })}
                <PubGradeLegend />
              </>
            ) : (
              <PubEmpty
                title={result.empty_state}
                description={
                  result.hidden_consumer > 0
                    ? `조회는 정상이다. 지금 이 조건에 맞는 승인 SaaS 케이스가 없고, 없는 것을 소비재로 채우지 않는다. 숨긴 소비재 ${result.hidden_consumer}건은 ${signedIn ? '' : '로그인 후 '}“소비재 포함”으로 볼 수 있다.`
                    : '조회는 정상이다. 지금 이 조건에 맞는 승인 케이스가 없다는 뜻이고, 없는 것을 비슷한 사례로 채우지 않는다.'
                }
                action={signedIn && result.hidden_consumer > 0
                  ? <PubButtonLink href={href({ kind: 'all' })} variant="ghost" size="sm">소비재 포함해서 보기 {result.hidden_consumer}<IconArrowRight /></PubButtonLink>
                  : <PubButtonLink href={href({ problem: null })} variant="ghost" size="sm">문제 유형 전체 보기<IconArrowRight /></PubButtonLink>}
              />
            )}

            <footer className="pub-deflist">
              <PubBrandLogoNotice />
              {!signedIn && result.hidden_consumer > 0 && (
                <p className="pub-caption">숨긴 소비재 케이스 {result.hidden_consumer}건은 로그인 후 소비재 포함 필터로 볼 수 있다.</p>
              )}
              {counts && counts.unlabeled > 0 && (
                <p className="pub-caption">문제 유형이 아직 안 적힌 케이스 {counts.unlabeled}건. 위 칩 건수 합과 전체가 다른 이유다.</p>
              )}
              {result.logo_columns === 'missing' && (
                <p className="pub-caption">로고 컬럼(마이그 20260930000001)이 아직 없다. 로고 미기재가 아니라 컬럼 없음이다.</p>
              )}
            </footer>
          </div>
        </div>
      )}
    </PubShell>
  )
}
