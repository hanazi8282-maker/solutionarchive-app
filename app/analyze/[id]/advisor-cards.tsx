'use client'

import { useState } from 'react'
import { sortMovesByTime } from '@/lib/cases/detail'
import { directionMark, displayGradeLabel, factCheckLabel, isProvisionalGrade } from '@/lib/cases/grade-display'
import { Badge } from '../../_ds/components/Badge'
import { GradeLegend } from '../../_ds/components/GradeLegend'
import { Button } from '../../_ds/components/Button'

// ── 크로스섹션 어드바이저 — 화면 한 벌 ─────────────────────────
// 선례(A)·실패사례(B)·원칙(C) 세 코퍼스에서 겹치는 근거를 보여준다. 전에는 앵글 화면
// (angles/page.tsx) 안에만 있어서 목록 → 앵글 → "유사 사례 보기" 두 단 아래 숨어 있었다.
// 검수 화면이 프로젝트 단위(`project_id=`)로 같은 API 를 부르게 되면서 렌더링을 여기로 뺐다.
// 카드 모양·3상태 문장·SP-024 표시는 그대로다 — 두 화면이 각자 그리면 곧 갈라진다.
//
// 자동으로 fetch 하지 않는다. 사용자가 눌렀을 때만 한 번 부른다(앵글마다 자동이면 화면 하나에
// 앵글 수만큼 요청이 나간다).

type AdvisorStatus = 'matched' | 'no_match' | 'not_run'
type AdvisorCorpus<Card> = { status: AdvisorStatus; reason: string; cards: Card[] }
/** 매칭 근거 — 왜 이 사례가 나왔는지. 세 코퍼스 카드가 전부 갖는다 (SP-024). */
type AdvisorMatchInfo = { matched_terms: string[]; score: number; low_confidence: boolean }
/** 같은 케이스에 기록된 무브 한 줄 — 카드 안 시간순 접힘에 쓴다(lib/cases/advisor.ts CaseMoveSibling). */
export type AdvisorMoveSibling = {
  id: string; lever: string; claim: string
  /** null = 관측 시점 미기재. 화면이 "시점 미확인"으로 말한다 — 모르는 것을 1단계로 배치하지 않는다. */
  observed_period_start: string | null
  created_at?: string
}
export type AdvisorCaseMoveCard = AdvisorMatchInfo & {
  case_move_id: string; case_study_id: string; slug: string; brand_name: string; lever: string
  claim: string; evidence_grade: string
  /** 사실확인 등급. null = 미기재(조회에 없었거나 안 적힘)이고 등급 D 와 다르다. */
  fact_check_grade: string | null
  /** PMF 등급축. null = 컬럼 미적용이거나 재채점 전 → 배지가 인사이트 등급으로 폴백한다. */
  pmf_grade?: string | null
  pmf_provisional?: boolean | null
  outcome_direction: string
  /**
   * 내일 할 행동 — `case_moves.transfer_note` **원문 그대로**. LLM 이 다시 쓰지 않는다(§10.1).
   * null = 미기재. 빈 줄로 두지 않고 배지로 그 사실을 말한다.
   */
  transfer_note?: string | null
  preconditions?: string | null
  observed_period_start?: string | null
  /** 같은 케이스의 승인 무브 전부(자기 포함). 2개 미만이면 접힘을 그리지 않는다. */
  siblings?: AdvisorMoveSibling[]
}
export type AdvisorFailedAngleCard = AdvisorMatchInfo & {
  case_key: string; product_category: string; claimed_angle: string
  outcome: string; source_tier: string; is_estimate: boolean
}
type AdvisorPrincipleCard = AdvisorMatchInfo & {
  sp_id: string; statement: string; evidence_grade: string
  evidence_grade_note: string | null; source_ref: string
}
export type AdvisorPayload = {
  status: AdvisorStatus
  reason: string
  corpus_a: AdvisorCorpus<AdvisorCaseMoveCard>
  corpus_b: AdvisorCorpus<AdvisorFailedAngleCard>
  corpus_c: AdvisorCorpus<AdvisorPrincipleCard>
}

// 모양은 app/_ds/v2/v2.css 의 .v2-* 클래스(M2). 이 카드를 쓰는 화면은 전부 .sa-v2 안이다
// — /analyze/[id]/angles·result·review, /cases/search, /cases/report.

function fmtScore(v: number | string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '—'
}

/**
 * 세 코퍼스 = 셀러가 묻는 세 가지 질문. 버튼 문구와 섹션 제목이 같은 질문을 가리킨다.
 * a = 남들은 어떻게 풀었나 / b = 이 소구점으로 망한 적 있나 / c = 원칙은 뭐라고 하나
 */
export const ADVISOR_FOCUS = ['a', 'b', 'c'] as const
export type AdvisorFocus = (typeof ADVISOR_FOCUS)[number]

const FOCUS_BUTTON: Record<AdvisorFocus, string> = {
  a: '남들은 어떻게 풀었나(선례)',
  b: '이 소구점으로 망한 적 있나(실패 사례)',
  c: '원칙은 뭐라고 하나(원칙)',
}

const FOCUS_TITLE: Record<AdvisorFocus, string> = {
  a: '선례 · 성공 사례',
  b: '실패 사례 · 이 소구점은 이미 실패한 적 있다',
  c: '원칙',
}

/**
 * 코퍼스 한 칸. 한 벌만 펼치고 나머지는 접되 **건수는 접힌 채로도 보인다** —
 * 접힌 0건과 "안 찾아봤다"가 같아 보이면 안 된다(§7.1). 펼침은 native <details> 가 한다.
 */
function Corpus({ k, status, reason, count, focus, children }: {
  k: AdvisorFocus
  status: AdvisorStatus
  reason: string
  count: number
  /** null = 전부 펼친다(기존 동작). */
  focus: AdvisorFocus | null
  children: React.ReactNode
}) {
  const tally = status === 'not_run' ? '판정 불가' : `${count}건`
  return (
    <details className="dgy-details" open={focus === null || focus === k}>
      <summary>{FOCUS_TITLE[k]} · {tally}</summary>
      <div className="v2-stack-sm v2-pt">
        {status === 'not_run'
          ? <p className="v2-text v2-text--muted">판정 불가 — {reason}</p>
          : count === 0
            ? <p className="v2-text v2-text--muted">관련 사례 없음 — 조회는 정상인데 겹치는 근거가 0건입니다. 억지로 끼워 맞추지 않습니다.</p>
            : children}
      </div>
    </details>
  )
}

/**
 * "왜 이 사례가 나왔나" — 겹친 낱말과 점수를 그대로 보여준다 (SP-024).
 * 낱말 하나로만 걸린 매칭은 점수로 걸러지지 않으므로 숨기지 않고 표시만 한다.
 */
function MatchWhy({ m }: { m: AdvisorMatchInfo }) {
  return (
    <p className="v2-note">
      매칭 근거 · {m.matched_terms.map(t => `“${t}”`).join(', ')} · 점수 {fmtScore(m.score)}
      {m.low_confidence && ' — 겹친 낱말이 하나뿐입니다. 이 낱말이 우연히 겹친 것은 아닌지 직접 확인하세요.'}
    </p>
  )
}

/**
 * 근거 등급 배지 — 색을 쓰지 않는다(neutral). 등급은 결과 방향이 아니라 분류라서
 * 초록·빨강은 물론 파랑(정보)도 붙이지 않는다 — M1(_pub)·/cases/grade 와 같은 규칙. 뜻은 글자가 말한다.
 */
function GradeBadge({ grade }: { grade: string }) {
  return <Badge tone="neutral" size="sm">근거 {grade}</Badge>
}

/**
 * 무브 등급 배지 — 축이 셋이라 **무슨 축인지 이름으로 밝힌다**(2026-09-16 분리, 2026-09-23 PMF 1순위).
 *
 * ★ 등급 문자열은 `displayGradeLabel(move)` 하나로만 만든다. 카드가 필드를 직접 읽지 않는다 —
 *   축이 또 바뀌면 그 한 함수만 바뀌고 전 화면이 같이 바뀐다. **값은 건드리지 않는다**
 *   (저장된 등급을 올리는 것은 사람이 CLI regrade 로 한다, §10.1).
 * ★ 폴백을 PMF 라고 부르지 않는다: `pmf_grade` 가 없으면 `displayGrade` 는 인사이트 등급을
 *   돌려주므로 배지 이름도 "인사이트" 가 된다(§7.1 — 폴백을 새 축으로 위장하지 않는다).
 * ★ 방향(↑/↓/↕)을 등급에 붙인다: PMF 축에서는 **실패 사례도 A** 다. 등급만 보면 성공으로 읽힌다.
 */
function MoveGradeBadges({ move }: { move: AdvisorCaseMoveCard }) {
  const isPmf = typeof move.pmf_grade === 'string' && move.pmf_grade.trim() !== ''
  const mark = directionMark(move)
  return (
    <>
      <Badge tone="neutral" size="sm"
        title={isPmf
          ? 'PMF 등급 — 그래서 얼마나 됐고(신호) 내가 내일 옮길 수 있나(이식성). 방향은 ↑성공 ↓실패 ↕혼재'
          : '인사이트 등급 — 내가 옮겨 쓸 게 있나(옮길 행동·전제가 적혀 있나). PMF 등급이 아직 없어 이 축으로 보여준다'}>
        {isPmf ? 'PMF' : '인사이트'} {displayGradeLabel(move)}{mark && ` ${mark}`}
      </Badge>
      {isProvisionalGrade(move) && (
        <Badge tone="warning" size="sm" title="신호 강도·이식성을 사람이 아직 확정하지 않았다. 등급이 낮다는 뜻이 아니다">잠정</Badge>
      )}
      <Badge tone="neutral" size="sm" title="사실확인 등급 — 그 수치를 믿을 수 있나(출처가 몇 겹인가). 미기재는 D 가 아니다">
        사실확인 {factCheckLabel(move)}
      </Badge>
    </>
  )
}

function LowConfidenceBadge({ m }: { m: AdvisorMatchInfo }) {
  if (!m.low_confidence) return null
  return <Badge tone="warning" size="sm">신뢰도 낮음</Badge>
}

/**
 * 내일 할 행동 — `transfer_note` 원문. 없으면 빈 줄로 두지 않고 배지로 말한다.
 * "옮길 행동이 이 무브에 안 적혀 있다"이지 "할 게 없다"가 아니다(§7.1).
 */
function TransferNote({ note }: { note?: string | null }) {
  const t = (note ?? '').trim()
  if (!t) return <Badge tone="warning" size="sm">행동 미기재</Badge>
  return (
    <p className="v2-lead">
      내일 할 행동 · {t}
    </p>
  )
}

/** 전제 — 접힘. 미기재를 "전제가 없다"로 읽히게 두지 않는다. */
function Preconditions({ text }: { text?: string | null }) {
  const t = (text ?? '').trim()
  return (
    <details className="dgy-details">
      <summary>전제</summary>
      <p className="v2-text v2-text--muted v2-pt">{t || '전제 미기재 — 전제가 없다는 뜻이 아니다.'}</p>
    </details>
  )
}

/**
 * 이 케이스에 기록된 무브(시간순). **무브가 1개면 그리지 않는다** — 한 줄짜리 "단계"는
 * 다단계가 아니라서 접힘만 늘린다.
 *
 * ★ 번호만 쓰고 화살표(→)를 쓰지 않는다(pmf-grade §6). 시간순이 곧 인과가 아니다 —
 *   화살표를 그리면 "이대로 하면 된다"로 읽힌다.
 * ★ 정렬은 `lib/cases/detail.ts sortMovesByTime` 한 함수로 한다(상세 화면과 같은 계약).
 *   `observed_period_start` 없는 항목은 `created_at` 으로 자리만 잡고 "시점 미확인"을 붙인다.
 */
function MoveTimeline({ siblings }: { siblings?: AdvisorMoveSibling[] }) {
  const list = siblings ?? []
  if (list.length < 2) return null
  return (
    <details className="dgy-details">
      <summary>이 케이스에 기록된 무브 {list.length}개(시간순)</summary>
      <ol className="v2-olist v2-mt-xs">
        {sortMovesByTime(list).map((m) => (
          <li key={m.id} className="v2-text">
            <span className="v2-muted">
              {m.observed_period_start ? m.observed_period_start : '시점 미확인'} · {m.lever}
            </span>{' '}— {m.claim}
          </li>
        ))}
      </ol>
      <p className="v2-note v2-pt">
        번호는 기록된 시점 순서다. 앞이 뒤의 원인이라는 뜻은 아니다.
      </p>
    </details>
  )
}

/**
 * 선례 카드 목록. 어드바이저 패널과 /cases/search 가 **같은 카드**를 쓴다 —
 * 두 화면이 각자 그리면 배지·매칭 근거 표시가 곧 갈라진다(그 자리를 이미 한 번 겪었다).
 *
 * 순서(위→아래): 브랜드·레버·등급 → claim → **내일 할 행동** → 전제 → 매칭 근거 → 무브 시간순.
 * "내일 할 행동"이 claim 바로 아래다 — 셀러가 카드에서 가져가는 건 주장이 아니라 행동이다.
 */
export function CaseMoveCards({ cards }: { cards: AdvisorCaseMoveCard[] }) {
  return (
    <>
      {cards.map((c) => (
        <div key={c.case_move_id} className="v2-stack-tight">
          <div className="v2-chiprow">
            {/* 공개 상세 라우트(/library/<slug>). 전에는 검수 목록 앵커(`/cases?status=approved#case-…`)로
                보냈는데, 그 화면은 로그인 벽 뒤 검수용이라 셀러가 눌러도 볼 게 없었다. */}
            <a href={`/library/${c.slug}`} className="v2-link-bare"
              title="이 케이스의 상세 보기">
              <Badge tone="neutral" size="sm">{c.brand_name} ↗</Badge>
            </a>
            <Badge tone="neutral" size="sm">{c.lever}</Badge>
            <MoveGradeBadges move={c} />
            <LowConfidenceBadge m={c} />
          </div>
          <p className="v2-text">{c.claim}</p>
          <TransferNote note={c.transfer_note} />
          <Preconditions text={c.preconditions} />
          <MatchWhy m={c} />
          <MoveTimeline siblings={c.siblings} />
        </div>
      ))}
    </>
  )
}

/** 실패 앵글 카드 목록. 내세웠던 소구점과 결과를 **같이** 보여줘야 회피 조언이 된다. */
export function FailedAngleCards({ cards }: { cards: AdvisorFailedAngleCard[] }) {
  return (
    <>
      {cards.map((c) => (
        <div key={c.case_key} className="v2-stack-tight">
          <div className="v2-chiprow">
            <Badge tone="neutral" size="sm">{c.product_category}</Badge>
            <Badge tone="neutral" size="sm">{c.source_tier}</Badge>
            {c.is_estimate && <Badge tone="warning" size="sm">추정</Badge>}
            <LowConfidenceBadge m={c} />
          </div>
          <p className="v2-text">내세웠던 소구점 · {c.claimed_angle}</p>
          <p className="v2-text"><span className="v2-danger-text">결과 · {c.outcome}</span></p>
          <MatchWhy m={c} />
        </div>
      ))}
    </>
  )
}

/** 응답 본문만 그린다. 3상태를 문장으로 가른다 — 0건은 0건이라고 말한다(§13-7 AC-2). */
export function AdvisorResult({ data, focus = null }: { data: AdvisorPayload; focus?: AdvisorFocus | null }) {
  if (data.status === 'not_run') return <p className="v2-text v2-text--muted">판정 불가 — {data.reason}</p>
  if (data.status === 'no_match') {
    return <p className="v2-text v2-text--muted">관련 사례 없음 — 세 코퍼스 모두 조회는 정상인데 겹치는 근거가 0건입니다.</p>
  }
  return (
    <>
      <Corpus k="a" status={data.corpus_a.status} reason={data.corpus_a.reason} count={data.corpus_a.cards.length} focus={focus}>
        <CaseMoveCards cards={data.corpus_a.cards} />
      </Corpus>

      {/* 실패 사례는 "무엇을 내세웠고(claimed_angle) 왜 안 됐는지(outcome)"를 함께
          보여줘야 회피 조언이 된다. 둘 중 하나만 보이면 쓸모가 없다. */}
      <Corpus k="b" status={data.corpus_b.status} reason={data.corpus_b.reason} count={data.corpus_b.cards.length} focus={focus}>
        <FailedAngleCards cards={data.corpus_b.cards} />
      </Corpus>

      <GradeLegend />

      <Corpus k="c" status={data.corpus_c.status} reason={data.corpus_c.reason} count={data.corpus_c.cards.length} focus={focus}>
        {data.corpus_c.cards.map(c => (
            <div key={c.sp_id} className="v2-stack-tight">
              <div className="v2-chiprow">
                <Badge tone="neutral" size="sm">{c.sp_id}</Badge>
                <GradeBadge grade={c.evidence_grade} />
                <Badge tone="neutral" size="sm">{c.source_ref}</Badge>
                <LowConfidenceBadge m={c} />
              </div>
              <p className="v2-text">{c.statement}</p>
              {c.evidence_grade_note && (
                <p className="v2-note">{c.evidence_grade_note}</p>
              )}
              <MatchWhy m={c} />
            </div>
          ))}
      </Corpus>
    </>
  )
}

/**
 * 열림·닫힘 + 1회 fetch. `query` 는 `/api/analyze/advisor?` 뒤에 붙는 문자열
 * (`angle_id=…` 또는 `project_id=…`). 라우트가 둘 다 받는다(app/api/analyze/advisor/route.ts).
 *
 * 버튼이 세 개인 이유: "유사 사례 보기" 한 개는 셀러가 무엇을 얻는지 말해 주지 않았다.
 * 세 버튼이 곧 세 질문이고, 어느 걸 눌러도 **요청은 한 번**이다(세 코퍼스가 한 응답에 온다).
 * 누른 질문만 펼치고 나머지는 접히되 건수는 보인다.
 *
 * `focus` 를 주면 그 코퍼스 전용 버튼 하나만 그린다(결과 화면이 속성 카드마다 쓰는 형태).
 * `label` 을 주면 전처럼 버튼 하나로 전부 펼친다 — 기존 호출부가 그대로 돈다.
 */
export function AdvisorLoader({ query, label, variant = 'outline', focus }: {
  query: string
  label?: string
  variant?: 'outline' | 'primary'
  focus?: AdvisorFocus
}) {
  const [open, setOpen] = useState(false)
  // 펼칠 코퍼스. null = 전부 펼친다(label 로 부른 기존 동작).
  const [active, setActive] = useState<AdvisorFocus | null>(focus ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AdvisorPayload | null>(null)

  const load = async (k: AdvisorFocus | null) => {
    setOpen(true)
    setActive(k)
    if (data || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analyze/advisor?${query}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? '유사 사례를 불러오지 못했습니다.')
        return
      }
      setData(json.advisor as AdvisorPayload)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 트리거. focus → 그 질문 하나 / label → 옛 단일 버튼 / 그 밖 → 세 질문.
  const triggers: (AdvisorFocus | null)[] = focus ? [focus] : label ? [null] : [...ADVISOR_FOCUS]

  if (!open) {
    return (
      // ≤480px 에서는 세로로 쌓고 각 버튼이 풀폭이 된다(app/_ds/styles.css).
      <div className="dgy-btnrow v2-actions v2-mt">
        {triggers.map((k, i) => (
          <Button
            key={k ?? 'all'}
            variant={i === 0 ? variant : 'outline'}
            size="sm"
            onClick={() => load(k)}
            aria-expanded={false}
          >
            {k ? FOCUS_BUTTON[k] : (label ?? '유사 사례 보기')}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="v2-advisor">
      <div className="v2-between">
        <div className="dgy-caps">{active ? FOCUS_TITLE[active] : '유사 사례 · 선례 · 실패 · 원칙'}</div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-expanded>접기</Button>
      </div>
      {loading && <p role="status" className="v2-text v2-text--muted">찾는 중…</p>}
      {error && <p role="alert" className="v2-danger-text">{error}</p>}
      {!loading && !error && data && <AdvisorResult data={data} focus={active} />}
    </div>
  )
}
