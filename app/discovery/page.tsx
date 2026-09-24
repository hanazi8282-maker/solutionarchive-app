import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '../_ds/components/Card'
import { Badge, type Tone } from '../_ds/components/Badge'
import { EmptyState } from '../_ds/components/EmptyState'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../_ds/components/Shell'
import { FilterChip } from '../_ds/components/FilterChip'
import { MIN_VOC_HITS, MAX_VOC_HITS } from '@/lib/discovery/candidate'
import { ReviewForm } from './review-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: '발굴 후보 검증' }

// 이 파일은 읽기만 한다. 쓰기는 ./actions.ts(사람이 누르는 서버 액션) 하나다.
//
// 화면의 목적: 야간 발굴 루프(scripts/discovery-run.mjs)가 낸 후보를 사람이 사후 검증한다.
// 설계 정본은 docs/discovery-design.md — "LLM 은 후보 이름만 낸다. 채택은 실측 hits 가 정한다."
//
// ⛔ 기각·확인불가도 전부 보여준다. 채택된 것만 보여주면 "왜 이건 안 뽑혔나"에 아무도
//    답할 수 없고, 그게 이 테이블이 후보 전부를 남기는 이유다(설계 §1).

type CandidateRow = {
  id: string
  kind: string
  name: string
  category_hint: string | null
  homepage_url: string | null
  why: string
  probe_source_key: string | null
  probe_ref: string | null
  probe_hits: number | null
  probe_at: string | null
  probe_note: string | null
  verdict: string
  verdict_reason: string
  project_id: string | null
  run_id: string | null
  human_review: string
  created_at: string
}

const VERDICT: Record<string, { label: string; tone: Tone }> = {
  accepted: { label: '채택 — 실측 통과', tone: 'success' },
  rejected: { label: '기각 — 알아봤는데 기준 밖', tone: 'neutral' },
  unverified: { label: '확인 불가 — 못 알아봤다', tone: 'danger' },
}

const HUMAN: Record<string, { label: string; tone: Tone }> = {
  pending: { label: '검토 대기', tone: 'warning' },
  kept: { label: '사람이 유지', tone: 'success' },
  killed: { label: '사람이 무효화', tone: 'danger' },
}

const KIND: Record<string, string> = {
  physical: '실물 소비재',
  saas: '소프트웨어',
  service: '무형 서비스',
}

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const KST_DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/** 채택 창. 판정한 것은 프로브이고, 화면은 그 기준을 실측값 옆에 그대로 적기만 한다. */
const WINDOW_TEXT = `${MIN_VOC_HITS}~${MAX_VOC_HITS}`

/**
 * probe_hits 의 NULL 은 **0 이 아니라 "못 셌다"** 다(컬럼 COMMENT).
 * 0 으로 렌더하면 "세어 봤더니 없더라"로 읽혀서, 프로브가 깨진 날을 사람이 못 알아챈다.
 *
 * 실측값만 두면 30 이 많은지 적은지 사람이 알 수 없다 — **기준을 나란히** 적는다.
 * 실측값이 없으면 통과·미달을 말하지 않는다(확인 불가). 기준은 상수 하나를 읽는다 —
 * 화면에 숫자를 다시 적으면 env 로 창을 옮긴 날 화면만 옛 값을 말한다.
 */
function ProbeHits({ hits }: { hits: number | null }) {
  if (hits === null || hits === undefined) {
    return <Badge tone="danger" size="sm">VOC 확인 불가 (못 셈) · 기준 {WINDOW_TEXT}</Badge>
  }
  const inWindow = hits >= MIN_VOC_HITS && hits <= MAX_VOC_HITS
  return (
    <Badge tone={inWindow ? 'info' : 'neutral'} size="sm">
      실측 VOC {hits.toLocaleString()}건 / 기준 {WINDOW_TEXT}
    </Badge>
  )
}

function CandidateCard({ c }: { c: CandidateRow }) {
  const v = VERDICT[c.verdict]
  const h = HUMAN[c.human_review]
  // 사람이 무효화한 후보는 회색으로 내린다 — 목록에서 **빼지는 않는다.** 빼면 "왜 이건
  // 안 뽑혔나"에 아무도 답할 수 없고, 그게 이 테이블이 후보 전부를 남기는 이유다(설계 §1).
  const overridden = c.human_review === 'killed'
  return (
    <Card className={overridden ? 'v2-card--muted' : undefined}>
      <div className={overridden ? 'v2-stack v2-dim' : 'v2-stack'}>
        <div className="v2-chiprow">
          <Badge tone={v?.tone ?? 'neutral'} dot size="sm">{v?.label ?? c.verdict}</Badge>
          <Badge tone={h?.tone ?? 'neutral'} size="sm">{h?.label ?? c.human_review}</Badge>
          <Badge tone="neutral" size="sm">{KIND[c.kind] ?? c.kind}</Badge>
          <ProbeHits hits={c.probe_hits} />
          <span className="v2-note v2-push">
            {KST.format(new Date(c.created_at))} KST
          </span>
        </div>

        <h3 className="v2-h3">
          {c.homepage_url
            ? <a href={c.homepage_url} target="_blank" rel="noreferrer" className="v2-link-plain">{c.name} ↗</a>
            : c.name}
        </h3>
        {c.category_hint && <p className="v2-note">카테고리: {c.category_hint}</p>}

        {/* LLM 이 왜 뽑았는지. 판정 근거가 아니라 참고다 — 채택은 아래 실측이 정했다. */}
        <div className="v2-box">
          <p className="v2-note">왜 뽑았나 (LLM 주장 — 판정 근거 아님)</p>
          <p className="v2-body v2-pre">{c.why}</p>
        </div>

        {/* 판정 근거. 남헌이 뒤집을지 말지 보는 자리라 숫자를 그대로 노출한다. */}
        <div className="v2-stack-tight">
          <p className="v2-body">
            <b>판정 근거</b>: {c.verdict_reason}
          </p>
          <p className="v2-note">
            프로브: {c.probe_source_key ?? '실행 안 됨'}
            {c.probe_ref ? ` · 대상 ${c.probe_ref}` : ''}
            {c.probe_at ? ` · ${KST.format(new Date(c.probe_at))} KST` : ''}
          </p>
          {c.probe_note && <p className="v2-note">프로브 메모: {c.probe_note}</p>}
        </div>

        {c.project_id && (
          <p className="v2-body">
            {/* 상세 화면은 /review 다 — /analyze 목록의 "상세·검수" 버튼과 같은 곳(app/analyze/page.tsx).
                맨 `/analyze/<id>` 는 09-18 까지 라우트가 없어 404 였고(여기 링크 사고), 지금은
                app/analyze/[id]/page.tsx 가 /review 로 넘긴다. 링크는 그래도 최종 목적지를 직접 가리킨다. */}
            <Link href={`/analyze/${c.project_id}/review`}>이 후보가 만든 분석 프로젝트 상세·검수 →</Link>
          </p>
        )}

        <ReviewForm id={c.id} current={c.human_review} hasProject={Boolean(c.project_id)} />
      </div>
    </Card>
  )
}

/** M2 v2 스코프 — 조기 반환 4곳이 같은 껍데기를 쓴다. */
function Shell({ children }: { children: ReactNode }) {
  return <div className="sa-v2"><PageShell maxWidth={960}>{children}</PageShell></div>
}

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ verdict?: string; review?: string; kind?: string }>
}) {
  const sp = await searchParams
  const fVerdict = sp.verdict ?? 'all'
  const fReview = sp.review ?? 'all'
  const fKind = sp.kind ?? 'all'

  const sb = await createClient()
  const header = (
    <PageHeader
      title="발굴 후보 검증"
      subtitle="야간 발굴 루프가 스스로 고른 후보를 사람이 사후 검증한다. 채택은 LLM 주장이 아니라 실측 VOC 건수가 정했고, 여기서는 그 판정을 받아들일지만 정한다."
    />
  )

  if (!sb) {
    return (
      <Shell>
        {header}
        <Notice tone="danger" title="확인 불가 — Supabase 환경변수 미설정">
          후보를 조회하지 못했다. 검증할 후보가 없다는 뜻이 아니다.
        </Notice>
      </Shell>
    )
  }

  const res = await sb.from('discovery_candidates').select('*').order('created_at', { ascending: false })

  // 테이블 자체가 없으면(마이그 미적용) 42P01/PGRST205 — 존재 확인은 GET 결과로 한다.
  // head:true 는 없는 테이블에도 204 를 주는 함정이 있다(§7.1).
  if (res.error && (res.error.code === '42P01' || res.error.code === 'PGRST205')) {
    return (
      <Shell>
        {header}
        <Notice tone="warning" title="마이그레이션 미적용 — discovery_candidates 테이블 없음">
          <code>supabase/migrations/20260921000001_discovery_candidates.sql</code> 을 적용해야 이 화면이 데이터를 보여준다.
        </Notice>
      </Shell>
    )
  }
  if (res.error || !res.data) {
    return (
      <Shell>
        {header}
        <Notice tone="danger" title="확인 불가 — 조회 실패">
          {res.error?.message ?? '응답에 행이 없다'} · 검증할 후보가 없다는 뜻이 아니다.
        </Notice>
      </Shell>
    )
  }

  const all = res.data as CandidateRow[]

  const accepted = all.filter((c) => c.verdict === 'accepted').length
  const rejected = all.filter((c) => c.verdict === 'rejected').length
  const unverified = all.filter((c) => c.verdict === 'unverified')
  const pendingN = all.filter((c) => c.human_review === 'pending').length

  // 마지막 실행일의 확인 불가 건수 — 프로브가 깨진 날은 이 숫자가 갑자기 튄다.
  // 누적으로만 보여주면 "어제부터 다나와 마크업이 바뀌었다"를 못 알아챈다(§7.1).
  const latestDay = all.length > 0 ? KST_DAY.format(new Date(all[0].created_at)) : null
  const latest = latestDay ? all.filter((c) => KST_DAY.format(new Date(c.created_at)) === latestDay) : []
  const latestUnverified = latest.filter((c) => c.verdict === 'unverified').length

  const rows = all.filter((c) =>
    (fVerdict === 'all' || c.verdict === fVerdict) &&
    (fReview === 'all' || c.human_review === fReview) &&
    (fKind === 'all' || c.kind === fKind))

  // 검토 대기를 위로. 같은 그룹 안에서는 최신순(쿼리 정렬 유지).
  const sorted = [...rows].sort((a, b) =>
    Number(b.human_review === 'pending') - Number(a.human_review === 'pending'))

  const qs = (patch: Partial<{ verdict: string; review: string; kind: string }>) => {
    const next = { verdict: fVerdict, review: fReview, kind: fKind, ...patch }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v !== 'all') p.set(k, v)
    const s = p.toString()
    return s ? `/discovery?${s}` : '/discovery'
  }

  return (
    <Shell>
      {header}

      {all.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="아직 발굴 결과가 없다 (조회는 정상)"
            description="야간 발굴 루프는 매일 KST 02:13 에 돈다. 첫 실행 뒤 후보가 여기 올라온다. 채택된 후보는 분석 프로젝트와 수집 대상까지 자동으로 만들고, 같은 밤 24분 뒤 리뷰 수집이 그 대상을 주워 간다."
          />
        </Card>
      ) : (
        <>
          <StatGrid>
            <StatTile label="검토 대기" value={pendingN} caption="사람이 아직 안 본 후보" tone={pendingN > 0 ? 'warning' : undefined} />
            <StatTile label="채택" value={accepted} caption={`실측 VOC 가 기준 ${WINDOW_TEXT}건 안`} />
            <StatTile label="기각" value={rejected} caption="알아봤는데 기준 밖" />
            <StatTile
              label="확인 불가"
              value={unverified.length}
              caption="못 알아봤다 — 재시도 대상"
              tone={unverified.length > 0 ? 'danger' : undefined}
            />
          </StatGrid>

          {/*
            확인 불가는 기각과 같은 자리에 두지 않는다. 전자는 "프로브가 깨져서 못 알아봤다"이고
            후자는 "알아봤는데 기준 밖"이다. 섞으면 다나와가 마크업을 바꾼 날 후보 전부가
            "정상 기각"으로 보이고 발굴이 영영 0건이 된다(설계 §2-2, CLAUDE.md §7.1).
          */}
          {latestUnverified > 0 && (
            <Notice
              tone="danger"
              title={`확인 불가 ${latestUnverified}건 — 마지막 실행(${latestDay})에서 프로브가 답을 못 냈다`}
            >
              이건 “후보가 별로였다”가 아니라 <b>“알아보지 못했다”</b>다. 한 날에 몰려 있으면 소스 쪽 마크업이
              바뀌었거나 차단됐을 수 있다 — 기각으로 읽고 넘기면 발굴이 조용히 0건이 된다.
              그날 후보는 재시도 대상이다.
            </Notice>
          )}

          <nav aria-label="후보 필터" className="v2-chiprow">
            <FilterChip href={qs({ verdict: 'all', review: 'all', kind: 'all' })} active={fVerdict === 'all' && fReview === 'all' && fKind === 'all'} count={all.length}>
              전체
            </FilterChip>
            <FilterChip href={qs({ review: 'pending' })} active={fReview === 'pending'} count={pendingN}>검토 대기</FilterChip>
            <FilterChip href={qs({ verdict: 'accepted' })} active={fVerdict === 'accepted'} count={accepted}>채택</FilterChip>
            <FilterChip href={qs({ verdict: 'rejected' })} active={fVerdict === 'rejected'} count={rejected}>기각</FilterChip>
            <FilterChip href={qs({ verdict: 'unverified' })} active={fVerdict === 'unverified'} count={unverified.length}>확인 불가</FilterChip>
            {['physical', 'saas', 'service'].map((k) => {
              const n = all.filter((c) => c.kind === k).length
              return n === 0 ? null : (
                <FilterChip key={k} href={qs({ kind: k })} active={fKind === k} count={n}>{KIND[k]}</FilterChip>
              )
            })}
          </nav>

          <p className="v2-note">
            판정은 <b>실측 결과를 뒤집는 게 아니라</b> 그 결과를 받아들일지 정하는 것이다. 무효화해도 이미 수집된
            리뷰는 남는다 — 앞으로의 수집만 멈춘다.
          </p>

          {sorted.length === 0 ? (
            <Card padded={false}>
              <EmptyState compact title="이 조건의 후보 0건 (조회는 정상)" description={`전체 ${all.length}건 중 걸러진 결과가 없다.`} />
            </Card>
          ) : (
            <div className="v2-stack">
              {sorted.map((c) => <CandidateCard key={c.id} c={c} />)}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
