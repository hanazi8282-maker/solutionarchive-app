import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PubShell } from './_pub/components/PubShell'
import { Hero } from './_pub/components/Hero'
import { Section } from './_pub/components/Section'
import { Panel } from './_pub/components/Panel'
import { PubButtonLink } from './_pub/components/Button'
import { Chip } from './_pub/components/Chip'
import { Stat, StatRow } from './_pub/components/Stat'
import { getAuthVerdict } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { PubCaseCard } from './_pub/components/PubCaseCard'
import {
  DEFAULT_SORT, approvedThisWeek, loadLibrary, loadSourceTiles, pickTodayCase, type LibraryResult,
} from '@/lib/cases/library'
import { DEFAULT_SEARCH_KIND } from '@/lib/cases/search'
import { clipTransferNote, detailTitle } from '@/lib/cases/detail'
import { displayGradeLabel, factCheckLabel } from '@/lib/cases/grade-display'
import { READER_PROBLEM_LABEL } from '@/lib/cases/draft'

// 로그인 안 한 방문자가 보는 첫 화면.
//
// ⚠️ 이 라우트 하나만 공개다(정확일치). 판정은 lib/auth/policy.ts 의 PUBLIC_EXACT —
//    접두사 목록에 넣으면 앱 전체가 열린다. scripts/auth-selftest.mjs 가 양성·음성을 같이 본다.
//
// 디자인은 `app/_pub`(2026-09-23 남헌 B안: 두더지웍스 흔적 없는 새 DS) 다크 테마다.
// `app/_ds` 를 import 하지 않는다 — `_ds/AppNav` 는 이 경로에서 스스로 숨는다.

// 정적 프리렌더 금지. 이 화면은 (1) 로그인 여부로 갈리고 (2) 축적량을 DB 에서 읽는다 —
// 빌드 시점에 굳으면 로그인한 사람이 랜딩에 머물고, 숫자는 배포 시각에 멈춘다.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'SaaS 1인 창업가를 위한 사례 아카이브',
  description:
    '내 문제와 비슷한 상황을 겪은 SaaS 사례가 그걸 어떻게 풀었는지, 근거 등급과 함께 본다.',
}

/** 히어로 아래 3숫자. 한 번의 조회에서 케이스·무브·근거를 같이 센다. */
type Counts = { cases: string; moves: string; evidence: string }
const UNKNOWN = '집계 불가'

/**
 * §7.1 — **못 읽은 것을 0 으로 접지 않는다.** 조회가 실패하면 세 칸 모두 "집계 불가"고,
 * 근거만 못 셌으면(`evidence_count === null`) 근거 칸만 "집계 불가"다.
 * 승인 케이스가 진짜 0건인 것과 조회 실패는 다른 문장으로 나간다.
 */
function countsOf(result: LibraryResult | null): Counts {
  if (!result || result.status === 'error') return { cases: UNKNOWN, moves: UNKNOWN, evidence: UNKNOWN }
  const moves = result.cards.reduce((n, c) => n + c.move_count, 0)
  const missed = result.cards.some((c) => c.evidence_count === null)
  const evidence = result.cards.reduce((n, c) => n + (c.evidence_count ?? 0), 0)
  return {
    cases: `${result.cards.length}건`,
    moves: `${moves}개`,
    evidence: missed ? UNKNOWN : `${evidence}건`,
  }
}

/** "어떻게 다른가" 3가지. 기능 자랑이 아니라 이 아카이브가 실제로 거는 제약이다. */
const DIFFERENCES = [
  {
    eyebrow: '근거 등급',
    title: 'A/B/C/D 를 숨기지 않는다',
    body: '사례마다 등급이 붙는다. 공시·감사받은 수치인지, 창업자가 자기 블로그에서 말한 숫자인지 카드에서 구분된다. 등급이 낮은 사례를 지우는 대신 낮다고 적는다.',
  },
  {
    eyebrow: '내일 할 행동',
    title: '읽고 덮는 글로 끝나지 않는다',
    body: '사례마다 전제 조건과 "내 상황으로 옮기면 무엇이 달라지나"가 한 줄 붙는다. 카드에 먼저 보이는 문장이 요약이 아니라 그 행동이다.',
  },
  {
    eyebrow: '실패 기록',
    title: '무너진 시도를 같이 낸다',
    body: '통한 것만 모으면 이미 깨진 길로 다시 간다. 같은 병목에서 실패한 시도를 따로 적어 두고, 짝이 없으면 없다고 말한다.',
  },
]

export default async function Home() {
  // 로그인한 사람에게 랜딩은 볼 이유가 없는 화면이다 — 종전대로 작업 화면으로 보낸다.
  const verdict = await getAuthVerdict()
  if (verdict.kind === 'allowed') redirect('/dashboard')

  // 라이브러리 로더 한 벌을 그대로 쓴다(화면마다 다른 숫자가 나오지 않게).
  // 기본 종류 필터(kind=saas)도 `/library` 첫 화면과 같다 — 여기 숫자와 그 목록이 어긋나면
  // 방문자가 세어 보고 틀렸다고 판단한다.
  const sb = await createClient()
  const result = sb
    ? await loadLibrary(sb, { problem: null, kind: DEFAULT_SEARCH_KIND, sort: DEFAULT_SORT }, 'landing')
    : null
  if (!result) console.error('[landing] supabase client unavailable — 숫자·최신 케이스를 비운다')
  const counts = countsOf(result)
  const latest = result?.status === 'ok' ? result.cards.slice(0, 3) : []
  const hiddenConsumer = result?.hidden_consumer ?? 0
  const now = new Date()
  const thisWeek = approvedThisWeek(result, now)
  const today = result?.status === 'ok' ? pickTodayCase(result.cards, now) : null
  const sources = sb ? await loadSourceTiles(sb, 'landing') : { tiles: null, hidden_zero: 0 }

  return (
    <PubShell theme="dark">
      <Hero
        eyebrow="CASE ARCHIVE FOR SOLO SAAS FOUNDERS"
        title="같은 문제에 막혔던 사례가, 그걸 어떻게 풀었는지."
        lead="만들 줄은 아는데 그걸 돈으로 바꾸는 법을 모르는 1인 창업가를 위해 모은다. 사례마다 근거 등급과 내일 할 행동 한 줄이 붙는다."
        actions={
          <>
            <PubButtonLink href="/library" variant="primary" size="lg">케이스 둘러보기</PubButtonLink>
            <PubButtonLink href="/onboarding/quiz" variant="ghost" size="lg">내 문제로 시작</PubButtonLink>
          </>
        }
        note="읽는 데는 로그인이 필요 없다. 초대된 계정만 내부 작업 화면에 들어온다."
      />

      {/* 실제 숫자. 지어내지 않는다 — 못 셌으면 "집계 불가"다(§7.1). */}
      <Section
        eyebrow="지금까지"
        title="사람이 승인한 것만 센다"
        lead={
          result?.status === 'error'
            ? '지금 집계를 못 읽었다. 0건이라는 뜻이 아니라 확인에 실패한 것이다.'
            : '자동 수집분은 초안으로만 쌓인다. 아래 숫자는 사람이 사실확인·이식성까지 보고 승인한 것이다.'
        }
      >
        <div className="pub-inline">
          <Chip tone="solid" title="KST 월요일 00:00 이후 승인(reviewed_at) 기준">
            {thisWeek === null ? '이번 주 승인 집계 불가' : `+${thisWeek} 이번 주`}
          </Chip>
        </div>
        <StatRow>
          <Stat
            label="승인 케이스"
            value={counts.cases}
            caption={hiddenConsumer > 0 ? `소비재 ${hiddenConsumer}건은 라이브러리 기본 화면과 같게 빼고 셌다` : 'SaaS 기준'}
          />
          <Stat label="무브" value={counts.moves} caption="한 케이스가 실제로 한 조치 단위" />
          <Stat label="근거" value={counts.evidence} caption="출처 링크·인용이 붙은 행" />
        </StatRow>
      </Section>

      {/* 소스별 VOC — 누적 수집 행을 센다(purge_reason IS DISTINCT FROM 'dedupe'). 못 셌으면 "집계 불가"(§7.1). */}
      <Section
        eyebrow="어디서 듣나"
        title="소스별로 모은 목소리"
        lead={
          sources.tiles === null
            ? '소스 목록을 읽지 못했다. 수집이 0건이라는 뜻이 아니라 확인에 실패한 것이다.'
            : `수집기가 가져온 글·댓글의 누적 수집(중복 정리분 제외)이다.${sources.hidden_zero > 0 ? ` 아직 0건인 소스 ${sources.hidden_zero}곳은 뺐다.` : ''}`
        }
      >
        {sources.tiles && sources.tiles.length > 0 ? (
          <div className="pub-statrow">
            {sources.tiles.map((t) => (
              <div key={t.key} className="pub-tile">
                <span className="pub-caption">{t.name}</span>
                <span className="pub-tile-value">{t.count === null ? UNKNOWN : `${t.count.toLocaleString('ko-KR')}건`}</span>
              </div>
            ))}
          </div>
        ) : sources.tiles ? (
          <p className="pub-text">등록된 소스는 있지만 아직 모은 글이 없다.</p>
        ) : null}
      </Section>

      <Section eyebrow="어떻게 다른가" title="사례집이 아니라 판정문에 가깝다">
        <div className="pub-grid">
          {DIFFERENCES.map((d) => (
            <Panel key={d.title} eyebrow={d.eyebrow} title={d.title}>
              <p className="pub-text">{d.body}</p>
            </Panel>
          ))}
        </div>
      </Section>

      {/* 오늘의 케이스 — KST 날짜로 하루 1장 고정(lib/cases/library.ts pickTodayCase). 표시만, 구독·발송 없음. */}
      <Section eyebrow="오늘의 케이스" title="오늘 하나만 읽는다면">
        {today ? (
          // 카드 1장만 두면 그리드 한 칸이 전폭으로 늘어난다 — 옆 칸에 고르는 규칙을 적어 폭을 나눈다.
          <div className="pub-cardgrid">
            <PubCaseCard study={today.study} move={today.move} moveCount={today.move_count} />
            <Panel eyebrow="고르는 법" title="날짜마다 한 장">
              <p className="pub-text">
                승인 케이스 중 한 장을 한국 시간 날짜로 골라 하루 동안 고정한다. 새로고침해도 오늘은 같은 카드고, 자정이 지나면 바뀐다.
              </p>
              <PubButtonLink href="/library" variant="ghost">다른 케이스 둘러보기</PubButtonLink>
            </Panel>
          </div>
        ) : (
          <p className="pub-text">
            {result?.status === 'error' || !result
              ? '케이스 목록을 읽지 못해 오늘의 케이스를 고르지 못했다. 승인 케이스가 없다는 뜻이 아니다.'
              : '아직 무브까지 승인된 케이스가 없어 오늘의 케이스를 고를 수 없다.'}
          </p>
        )}
      </Section>

      <Section
        eyebrow="최근 승인"
        title="최신 케이스"
        lead="카드의 한 줄은 요약이 아니라 내일 할 행동이다."
      >
        <Panel>
          {latest.length > 0 ? (
            <div className="pub-caselist">
              {latest.map(({ study, move, move_count }) => (
                <Link key={study.id} className="pub-case" href={`/library/${study.slug}`}>
                  <div className="pub-case-meta">
                    {study.reader_problem
                      ? <Chip>{READER_PROBLEM_LABEL[study.reader_problem] ?? study.reader_problem}</Chip>
                      : null}
                    {study.bottleneck ? <Chip>병목 {study.bottleneck}</Chip> : null}
                  </div>
                  <span className="pub-case-title">{detailTitle(study)}</span>
                  <span className="pub-text">
                    {clipTransferNote(move?.transfer_note)
                      ? `내일 할 행동 · ${clipTransferNote(move?.transfer_note)}`
                      : '가져갈 행동이 아직 안 적혀 있다 (인사이트 등급 D)'}
                  </span>
                  <div className="pub-case-meta">
                    <Chip title="인사이트 등급 — 내가 옮겨 쓸 게 있나">인사이트 {displayGradeLabel(move)}</Chip>
                    <Chip title="사실확인 등급 — 그 수치를 믿을 수 있나. 미기재는 D 가 아니다">사실확인 {factCheckLabel(move)}</Chip>
                    <span className="pub-caption">무브 {move_count}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            // 3상태를 가른다(§7.1): 조회 실패와 "아직 0건"을 같은 문장으로 접지 않는다.
            <p className="pub-text">
              {result?.status === 'error' || !result
                ? '케이스 목록을 읽지 못했다. 승인 케이스가 없다는 뜻이 아니다 — 라이브러리에서 다시 시도해 볼 수 있다.'
                : '아직 승인된 케이스가 없다. 초안은 쌓이고 있고, 사람 검수를 통과한 것만 여기 올라온다.'}
            </p>
          )}
          <PubButtonLink href="/library" variant="ghost">전체 라이브러리 보기</PubButtonLink>
        </Panel>
      </Section>

      <Panel tone="banner" eyebrow="어디서 막혀 있나" title="내 문제부터 고르면 사례가 좁혀진다">
        <p className="pub-text">
          7가지 문제 유형 중 하나를 고르는 것으로 시작한다. 브랜드 이름이나 규모보다 그 축이 먼저다.
        </p>
        <div className="pub-actions">
          <PubButtonLink href="/onboarding/quiz" variant="primary" size="lg">내 문제로 시작</PubButtonLink>
          <PubButtonLink href="/library" variant="ghost" size="lg">케이스 둘러보기</PubButtonLink>
        </div>
      </Panel>
    </PubShell>
  )
}
