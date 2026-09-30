import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { PubShell } from './_pub/components/PubShell'
import { Hero } from './_pub/components/Hero'
import { Section } from './_pub/components/Section'
import { Panel } from './_pub/components/Panel'
import { PubButtonLink } from './_pub/components/Button'
import { getAuthVerdict } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { PubIndexRow } from './_pub/components/PubIndexRow'
import { PubEmpty } from './_pub/components/PubEmpty'
import { PubBrandLogo } from './_pub/components/PubBrandLogo'
import { PubStamp } from './_pub/components/PubStamp'
import { PubIconTile } from './_pub/components/PubIconTile'
import { PubSteps, type PubStepItem } from './_pub/components/PubSteps'
import { PubValueGrid, type PubValueItem } from './_pub/components/PubValueGrid'
import { PubLogoStrip } from './_pub/components/PubLogoStrip'
import { Reveal } from './_pub/components/Reveal'
import { STEPS } from './_pub/steps'
import {
  IconAction, IconArrowRight, IconChevronDown, IconEvidence, IconGrade, IconProblem, IconSignal, IconSplit,
} from './_pub/icons'
import {
  DEFAULT_SORT, approvedThisWeek, loadLibrary, loadSourceTiles, pickTodayCase, summarizeSourceTiles,
  type LibraryCard, type LibraryResult,
} from '@/lib/cases/library'
import { clipTransferNote } from '@/lib/cases/detail'
import { READER_PROBLEMS } from '@/lib/cases/draft'
import { DEFAULT_SEARCH_KIND } from '@/lib/cases/search'

// 로그인 안 한 방문자가 보는 첫 화면.
//
// ⚠️ 이 라우트 하나만 공개다(정확일치). 판정은 lib/auth/policy.ts 의 PUBLIC_EXACT —
//    접두사 목록에 넣으면 앱 전체가 열린다. scripts/auth-selftest.mjs 가 양성·음성을 같이 본다.
//
// 모양은 DESIGN.md §4 + reports/2026-09-30/design-direction-decisions.md G2(B3-1·2·3 · B4 · B5 · B6):
// 2열 히어로(오늘의 케이스) → 로고 띠 → 작동원리 4단계 → 소스 요약 → 가치제안 6 → 최신 케이스 → 다크 배너.
// 눈썹 라벨 없음, 공개 카피에 em 대시 없음. 숫자는 라이브 집계만, 못 셌으면 "집계 불가"(§7.1).

// 정적 프리렌더 금지. 이 화면은 (1) 로그인 여부로 갈리고 (2) 축적량을 DB 에서 읽는다 —
// 빌드 시점에 굳으면 로그인한 사람이 랜딩에 머물고, 숫자는 배포 시각에 멈춘다.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'SaaS 1인 창업가를 위한 사례 아카이브',
  description:
    '내 문제와 비슷한 상황을 겪은 SaaS 사례가 그걸 어떻게 풀었는지, 근거 등급과 함께 본다.',
}

const UNKNOWN = '집계 불가'
const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 한 번의 조회에서 케이스·무브·근거를 같이 센다. null = 못 셌다(0 이 아니다). */
type Counts = { cases: number | null; moves: number | null; evidence: number | null }

/**
 * §7.1 — **못 읽은 것을 0 으로 접지 않는다.** 조회가 실패하면 셋 다 null,
 * 근거만 못 셌으면(`evidence_count === null`) 근거만 null.
 */
function countsOf(result: LibraryResult | null): Counts {
  if (!result || result.status === 'error') return { cases: null, moves: null, evidence: null }
  const missed = result.cards.some((c) => c.evidence_count === null)
  return {
    cases: result.cards.length,
    moves: result.cards.reduce((n, c) => n + c.move_count, 0),
    evidence: missed ? null : result.cards.reduce((n, c) => n + (c.evidence_count ?? 0), 0),
  }
}

/** B5 표기 규칙: 소수는 올림 정수 + "+"(4.4 → 5+), 정수는 그대로. */
function perCase(evidence: number | null, cases: number | null): { label: string; raw: string } | null {
  if (evidence === null || !cases) return null
  const avg = evidence / cases
  return { label: Number.isInteger(avg) ? String(avg) : `${Math.ceil(avg)}+`, raw: `${evidence} ÷ ${cases} = ${avg.toFixed(2)}` }
}

/** 랜딩 CTA 전용 알약 + 화살표 원(B6-2). 다른 공개 화면 버튼은 그대로(G3·G4 몫). */
function PillCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="pub-btn pub-btn--primary pub-btn--lg pub-btn--pill" href={href}>
      {children}
      <span className="pub-btn-circle" aria-hidden="true"><IconArrowRight /></span>
    </Link>
  )
}

/** 히어로 오른쪽 — 오늘의 케이스 한 장을 크게(플레이트 56 + 스탬프 md). 실제 데이터라 가짜 스크린샷이 아니다. */
function TodayCard({ card }: { card: LibraryCard }) {
  const { study, move, move_count } = card
  const note = clipTransferNote(move?.transfer_note, 120)
  const summary = (study.summary ?? '').trim()
  return (
    <section className="pub-today" aria-labelledby="pub-today-h">
      <h2 className="pub-today-h" id="pub-today-h">오늘 하나만 읽는다면</h2>
      <Link className="pub-today-card" href={`/library/${study.slug}`}>
        <span className="pub-today-head">
          <PubBrandLogo study={study} size="md" />
          <span className="pub-index-t" translate={study.brand_name ? 'no' : undefined}>{study.brand_name ?? '브랜드명 미기재'}</span>
        </span>
        {summary ? <span className="pub-index-s">{summary}</span> : null}
        <span className="pub-index-act">
          {note ? <><b>내일 할 행동</b> {note}</> : '가져갈 행동이 아직 안 적혀 있다 (인사이트 등급 D)'}
        </span>
        <span className="pub-today-foot">
          <PubStamp move={move} />
          <span className="pub-caption">무브 {move_count}개</span>
        </span>
      </Link>
      <p className="pub-caption">승인 케이스 중 한 장을 한국 시간 날짜로 골라 하루 동안 고정한다.</p>
    </section>
  )
}

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
  const failed = !result || result.status === 'error'
  const counts = countsOf(result)
  const cards = result?.status === 'ok' ? result.cards : []
  const latest = cards.slice(0, 3)
  const hiddenConsumer = result?.hidden_consumer ?? 0
  const now = new Date()
  const thisWeek = approvedThisWeek(result, now)
  const today = result?.status === 'ok' ? pickTodayCase(result.cards, now) : null
  const sources = sb ? await loadSourceTiles(sb, 'landing') : { tiles: null, hidden_zero: 0 }
  const voc = sources.tiles ? summarizeSourceTiles(sources.tiles) : null
  const vocTotal = voc?.total == null ? null : `${fmt(voc.total)}건`
  const vocSources = sources.tiles ? `${sources.tiles.length}곳` : null

  const n = (v: number | null, unit: string) => (v === null ? UNKNOWN : `${fmt(v)}${unit}`)
  const avg = perCase(counts.evidence, counts.cases)
  const withAction = failed ? null : cards.filter((c) => clipTransferNote(c.move?.transfer_note)).length

  // B4 캡션 — 랜딩 상단과 같은 로더 결과(불일치 0). 못 세면 캡션만 "집계 불가", 4타일은 그대로 뜬다.
  const captions: Pick<PubStepItem, 'caption' | 'href'>[] = [
    { caption: `근거 ${n(counts.evidence, '건')} · ${vocTotal ? `리뷰 ${vocTotal}은` : `리뷰(${UNKNOWN})는`} 따로 VOC 피드로 간다` },
    { caption: '2축 × A~D', href: '/library/methodology' },
    { caption: `승인 케이스 ${n(counts.cases, '건')} · 무브 ${n(counts.moves, '개')} · ${thisWeek === null ? `이번 주 승인 ${UNKNOWN}` : `+${thisWeek} 이번 주`}` },
    { caption: `문제 유형 ${READER_PROBLEMS.length}가지`, href: '/onboarding/quiz' },
  ]
  const steps: PubStepItem[] = STEPS.map((s, i) => ({ ...s, ...captions[i] }))

  // B5 가치제안 6개 — 문구는 결정 문서 그대로. 라이브 숫자가 본문에 들어가는 두 장(2·6)은
  // 못 셌으면 숫자 구절만 빼고(지어내지 않는다) 캡션은 "집계 불가".
  const values: PubValueItem[] = [
    {
      icon: <IconProblem />, title: '내 문제 하나로 시작한다',
      body: `브랜드 이름이나 회사 규모 대신, 지금 막힌 문제 ${READER_PROBLEMS.length}가지 중 하나를 고르면 그 문제를 겪은 케이스만 남는다.`,
      stat: `문제 유형 ${READER_PROBLEMS.length}가지`,
      source: 'config/reader-problems.json (코드 상수 READER_PROBLEMS)',
    },
    {
      icon: <IconEvidence />, title: '근거가 링크로 붙어 있다',
      body: `케이스마다 공시, 창업자 인터뷰, 기사 같은 원문 링크가${avg ? ` 평균 ${avg.label}개` : ''} 붙는다. 인용 300자와 게시일까지 같이 적어서 직접 확인할 수 있다.`,
      stat: avg ? `케이스당 근거 ${avg.label}개` : `케이스당 근거 ${UNKNOWN}`,
      source: avg ? `원 수치 ${avg.raw} (근거 ÷ 승인 케이스, 라이브 집계 lib/cases/library.ts loadLibrary)` : '라이브 집계 실패 (lib/cases/library.ts loadLibrary)',
    },
    {
      icon: <IconGrade />, title: '등급을 두 축으로 적는다',
      body: '그 수치를 믿어도 되는지(사실확인)와 내가 가져갈 게 있는지(인사이트)를 따로 A부터 D까지 적는다. 등급이 낮은 케이스도 지우지 않고 낮다고 쓴다.',
      stat: '2축 × 4등급, 법정 공시 근거 65행',
      source: 'lib/cases/draft.ts gradeMove · docs/evidence-rules.md §3 · drafts/cases 281행 중 is_regulatory_filing 65(23%), 2026-09-30 기준',
    },
    {
      icon: <IconAction />, title: '읽고 나면 내일 할 일이 하나 생긴다',
      body: '승인된 케이스에는 내가 내일 할 수 있는 행동 한 줄과 그 전제가 붙는다. 직접 사례를 뒤져 정리하는 것보다 빠르다 (추정).',
      stat: withAction === null || counts.cases === null ? `내일 할 행동 ${UNKNOWN}`
        : withAction === counts.cases ? `공개 케이스 ${fmt(counts.cases)}건 전부` : `공개 케이스 ${fmt(counts.cases)}건 중 ${fmt(withAction)}건`,
      source: '라이브 집계: 승인 케이스 중 대표 무브에 “내일 할 행동”(transfer_note)이 있는 수 (2026-09-30 실측 15/15)',
    },
    {
      icon: <IconSplit />, title: '안 된 쪽도 같이 본다',
      body: '같은 병목에서 반대로 간 케이스를 짝으로 붙이고, 같은 소구점으로 망한 기록도 옆에 둔다. 짝이 없으면 없다고 적는다.',
      stat: '병목 7가지 전부에서 짝 비교 가능, 소비재 포함',
      source: 'reports/2026-09-28/performance.md coverage 7/7 (소비재 포함, 2026-09-28. SaaS 만으로는 미확인)',
    },
    {
      icon: <IconSignal />, title: '진짜 사용자 목소리에서 신호를 고른다',
      body: `${vocSources && vocTotal ? `${vocSources}에서 모은 리뷰와 댓글 ${vocTotal} 중` : '모은 리뷰와 댓글 중'} 관련 판정을 받은 것만 짧은 발췌로 보여준다. 판정은 두 모델이 따로 하고 사람이 검사한다. 내 시장의 불만을 먼저 보는 데 도움이 된다 (추정).`,
      stat: vocSources && vocTotal ? `소스 ${vocSources} · ${vocTotal}` : `소스 ${UNKNOWN}`,
      source: '라이브 집계: 소스별 누적 수집 합(lib/cases/library.ts loadSourceTiles) · 2모델 판정은 CLAUDE.md §10.1 rr-v2',
    },
  ]

  return (
    <PubShell theme="light">
      <Hero
        animateTitle
        title="같은 문제에 막혔던 사례가, 그걸 어떻게 풀었는지."
        lead="만들 줄은 아는데 돈으로 바꾸는 법을 모르는 1인 창업가를 위해 모은다. 사례마다 근거 등급과 내일 할 행동 한 줄이 붙는다."
        actions={
          <>
            <PillCta href="/library">케이스 둘러보기</PillCta>
            <PubButtonLink href="/onboarding/quiz" variant="outline" size="lg">내 문제로 시작</PubButtonLink>
          </>
        }
        note="읽는 데는 로그인이 필요 없다. 초대된 계정만 내부 작업 화면에 들어온다."
        aside={
          today ? <TodayCard card={today} /> : (
            // 케이스가 없으면 4단계 압축판(B3-1). 조회 실패와 0건은 다른 문장(§7.1).
            <section className="pub-today" aria-labelledby="pub-today-h">
              <h2 className="pub-today-h" id="pub-today-h">오늘 하나만 읽는다면</h2>
              <p className="pub-caption">
                {failed
                  ? '케이스 목록을 읽지 못해 오늘의 케이스를 고르지 못했다. 승인 케이스가 없다는 뜻이 아니다.'
                  : '아직 무브까지 승인된 케이스가 없어 오늘의 케이스를 고를 수 없다.'}
              </p>
              <PubSteps steps={STEPS} compact />
            </section>
          )
        }
      />

      {/* 로고 띠 — 5개 미만이면 PubLogoStrip 이 스스로 null(빈 Reveal 은 CSS 로 접힌다). "Trusted by" 류 문구 금지. */}
      <Reveal>
        <PubLogoStrip studies={cards.map((c) => ({ ...c.study, approved_at: c.study.reviewed_at ?? null }))} />
      </Reveal>

      <Section
        title="사람이 승인한 것만 센다"
        lead={
          failed
            ? '지금 집계를 못 읽었다. 0건이라는 뜻이 아니라 확인에 실패한 것이다.'
            : `숫자는 SaaS 기준이다.${hiddenConsumer > 0 ? ` 소비재 ${hiddenConsumer}건은 라이브러리 기본 화면과 같게 빼고 셌다.` : ''}`
        }
      >
        <Reveal className="pub-reveal--deep"><PubSteps steps={steps} /></Reveal>
      </Section>

      {/* 소스별 VOC — 큰 숫자 하나 + 상위 5곳 + 나머지 접힘(B3-2). 누적 수집(dedupe 제외). 못 셌으면 "집계 불가"(§7.1). */}
      <Section
        title="소스별로 모은 목소리"
        lead={
          sources.tiles === null
            ? '소스 목록을 읽지 못했다. 수집이 0건이라는 뜻이 아니라 확인에 실패한 것이다.'
            : `수집기가 가져온 글·댓글의 누적 수집(중복 정리분 제외)이다.${sources.hidden_zero > 0 ? ` 아직 0건인 소스 ${sources.hidden_zero}곳은 뺐다.` : ''}`
        }
      >
        {voc && voc.top.length > 0 ? (
          <div className="pub-voc">
            <p className="pub-voc-total"><strong>{vocTotal ?? UNKNOWN}</strong> <span>소스 {vocSources}</span></p>
            <ul className="pub-voc-top">
              {voc.top.map((t) => (
                <li key={t.key}>
                  <PubIconTile icon={<IconSignal />} size={32} />
                  <span className="pub-voc-name">{t.name}</span>
                  <span className="pub-voc-count">{t.count === null ? UNKNOWN : `${fmt(t.count)}건`}</span>
                </li>
              ))}
            </ul>
            {voc.rest.length > 0 ? (
              <details className="pub-details">
                <summary>소스 {voc.rest.length}곳 더 보기 <IconChevronDown /></summary>
                <ul className="pub-voc-rest">
                  {voc.rest.map((t) => (
                    <li key={t.key}><span>{t.name}</span><span className="pub-voc-count">{t.count === null ? UNKNOWN : `${fmt(t.count)}건`}</span></li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : sources.tiles ? (
          <p className="pub-text">등록된 소스는 있지만 아직 모은 글이 없다.</p>
        ) : null}
      </Section>

      <Section title="사례집이 아니라 판정문에 가깝다">
        <Reveal className="pub-reveal--deep"><PubValueGrid items={values} /></Reveal>
      </Section>

      <Section title="최신 케이스" lead="줄의 마지막 문장은 요약이 아니라 내일 할 행동이다.">
        {latest.length > 0 ? (
          <Reveal className="pub-reveal--deep">
            <ul className="pub-index">
              {latest.map(({ study, move, move_count }) => (
                <PubIndexRow key={study.id} study={study} move={move} moveCount={move_count} />
              ))}
            </ul>
          </Reveal>
        ) : failed ? (
          // 3상태를 가른다(§7.1): 조회 실패는 알림, "아직 0건"은 빈 상태 — 같은 문장으로 접지 않는다.
          <Panel tone="alert" title="확인 불가. 케이스 목록 조회 실패">
            <p className="pub-text">승인 케이스가 없다는 뜻이 아니다. 라이브러리에서 다시 시도해 볼 수 있다.</p>
          </Panel>
        ) : (
          <PubEmpty
            compact
            title="아직 승인된 케이스가 없다 (조회는 정상)"
            description="초안은 쌓이고 있고, 사람 검수를 통과한 것만 여기 올라온다."
          />
        )}
        <div className="pub-actions">
          <PubButtonLink href="/library" variant="outline" size="sm">전체 라이브러리 보기<IconArrowRight /></PubButtonLink>
        </div>
      </Section>

      {/* 이 화면의 유일한 다크 면. */}
      <Panel tone="dark">
        <div>
          <h2 className="pub-panel-title">내 문제부터 고르면 사례가 좁혀진다</h2>
          <p className="pub-text">7가지 문제 유형 중 하나를 고르는 것으로 시작한다. 브랜드 이름이나 규모보다 그 축이 먼저다.</p>
        </div>
        <div className="pub-actions">
          <PillCta href="/onboarding/quiz">내 문제로 시작</PillCta>
          <PubButtonLink href="/library" variant="ghost" size="lg">케이스 둘러보기</PubButtonLink>
        </div>
      </Panel>
    </PubShell>
  )
}
