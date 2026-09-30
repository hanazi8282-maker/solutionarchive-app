// `/cases/report` 앵글 검증 수치화(옵션 B, I4) — 순수 부품. DB·LLM 호출 없음(그건 ./idea-angles-run.ts).
// 정본: reports/2026-09-30/design-direction-ia-insights-report.md I4 + 남헌 2026-10-01 확정 4가지.
//
// ★ 판정 코퍼스 = 매칭된 승인 케이스의 근거 문장(I4-1 "코퍼스 바꿔 끼우기"). 그래서 judge 의 "근거 있음" 은
//   "내 리뷰 원문에 근거가 있다"(원 파이프라인)가 아니라 **"이 앵글 문장이 승인된 선례 근거로 뒷받침된다"** 다.
//   화면은 SUBSTANTIATION_VERDICT_LABELS 를 덮지 않고 이 파일의 IDEA_VERDICT_LABELS 를 쓰고, 캡션을 항상 붙인다.
// ★ writer 는 선례 무브 문구·근거 문장을 **앵커로 강하게** 받는다(남헌 확정 1 — "강한 참고 + 부분 재구성").
//   이미 맞는 부분은 그대로 쓰고, 아이디어에 맞게 달라져야 할 부분만 새로 쓴다. 앵글 3개를 writer **1회**로 받는다.
// ★ 이 파일은 클라이언트 패널(app/cases/report/angle-panel.tsx)도 불러온다 — node:* 를 import 하지 않는다
//   (해시는 Web Crypto).
import { ANGLE_TYPE_GUIDE } from '../analysis/angle-adaptation.ts'
import { normalizeWhitespace, type EvidenceInputRow } from '../analysis/judge-prompt.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import type { CaseMoveCard, FailedAngleCard } from './advisor.ts'

/** 앵글 상한(I4-2: 300초 안에 들어오게 고정). */
export const IDEA_ANGLE_MAX = 3
/** writer 에 앵커로 싣는 선례 무브 수 = 리포트 상위 무브 수(REPORT_MOVES). */
export const IDEA_ANCHOR_MOVES = 5
/** 근거 문장 한 개 상한(I4-1). */
export const IDEA_SNIPPET_MAX = 300

/**
 * 상한(남헌 2026-10-01 확정 3: 사용자당 하루 10건은 **잠정치** — 재검토 트리거는 docs/llm-provider-policy.md "재검토 항목").
 * 전부 idea_angle_runs 행 count 로 센다(새 인프라 0).
 */
export const IDEA_LIMITS = { perUserDaily: 10, perUserConcurrent: 1, globalConcurrent: 2 } as const
/** 같은 질의·kind 의 done 행을 재사용하는 기간. */
export const IDEA_CACHE_DAYS = 7
/** queued·running 이 이보다 오래되면 시간 초과로 본다(after() 는 300초에 잘린다 — 여유 60초). */
export const IDEA_STALE_MS = 6 * 60_000
/** 실행 안에서 다음 호출을 시작하지 않는 시점. 한 호출이 길어도 300초 전에 부분 결과를 저장하고 끝낸다. */
export const IDEA_RUN_DEADLINE_MS = 240_000

export const IDEA_ACTIVE = ['queued', 'running'] as const
/** 하루 상한에 세는 상태. limited 는 LLM 을 안 불렀으니 안 센다. 캐시 히트는 행을 만들지 않는다. */
export const IDEA_COUNTED = ['queued', 'running', 'done', 'failed'] as const

export type IdeaVerdict = 'SUBSTANTIATED' | 'EXPERIENTIAL' | 'UNSUBSTANTIATED'

/** 이 화면 전용 판정 라벨(I4-1). 원 파이프라인 라벨(SUBSTANTIATION_VERDICT_LABELS)과 뜻이 다르다. */
export const IDEA_VERDICT_LABELS: Record<IdeaVerdict, string> = {
  SUBSTANTIATED: '선례 근거 있음',
  EXPERIENTIAL: '체험 기반',
  UNSUBSTANTIATED: '선례 근거 없음 · 순화됨',
}
/** 패널에 **항상** 붙는 캡션(I4-8 3번 — 두 화면의 같은 색 칩을 같은 뜻으로 읽지 않게). */
export const IDEA_VERDICT_CAPTION =
  '판정 기준: 매칭된 승인 케이스의 근거 문장. 내 리뷰 원문으로 판정하는 경쟁사 분석의 “근거 있음”과 뜻이 다르다.'

export type IdeaRef = { slug: string; case_move_id: string | null }

/** idea_angle_runs.angles 한 칸. */
export type IdeaAngle = {
  angle_type: string | null
  headline: string
  /** 재작성 전 문구(재작성했을 때만). */
  headline_before: string | null
  verdict: IdeaVerdict
  reason: string
  /** SUBSTANTIATED 일 때만, 코드 검증을 통과한 인용. */
  evidence_quote: string | null
  /** 인용이 나온 선례. 실패 원장에서 나왔거나 못 찾으면 null. */
  evidence_ref: IdeaRef | null
  /** writer 가 앵커로 삼은 선례 무브. */
  anchor: IdeaRef | null
  rewritten: boolean
  models: string[]
}

export type IdeaRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'limited'

/** 캐시 키 정규화: 소문자 · 공백 축약. */
export const normalizeIdeaQuery = (q: string) => q.toLowerCase().replace(/\s+/g, ' ').trim()

/** sha256(normalize(q) + '|' + kind) 16진. Web Crypto 라 서버·브라우저·node 셀프테스트 어디서나 같다. */
export async function queryHash(q: string, kind: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${normalizeIdeaQuery(q)}|${kind}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 상한 판정. null = 통과. 문장은 화면에 그대로 나간다. */
export function limitReason(n: { userToday: number; userActive: number; globalActive: number }): string | null {
  if (n.userToday >= IDEA_LIMITS.perUserDaily) return `오늘 한도 ${IDEA_LIMITS.perUserDaily}건을 다 썼다. 내일 다시 시도해 달라`
  if (n.userActive >= IDEA_LIMITS.perUserConcurrent) return '내 다른 리포트의 앵글 검증이 도는 중이다. 끝난 뒤 다시 시도해 달라'
  if (n.globalActive >= IDEA_LIMITS.globalConcurrent) return '다른 리포트가 도는 중이다. 1~2분 뒤 다시 시도해 달라'
  return null
}

/** 게으른 청소 대상인가 — queued·running 인데 시작(없으면 생성) 뒤 IDEA_STALE_MS 가 지났다. */
export function staleRunning(row: { status: string; started_at: string | null; created_at: string }, now: number): boolean {
  if (!(IDEA_ACTIVE as readonly string[]).includes(row.status)) return false
  const t = Date.parse(row.started_at ?? row.created_at)
  return Number.isFinite(t) && now - t > IDEA_STALE_MS
}

export function summarizeVerdicts(angles: Pick<IdeaAngle, 'verdict'>[]) {
  const n = { SUBSTANTIATED: 0, EXPERIENTIAL: 0, UNSUBSTANTIATED: 0, total: angles.length }
  for (const a of angles) n[a.verdict]++
  return n
}

export type IdeaEvidenceRow = { case_study_id: string; case_move_id: string | null; snippet: string | null; supports_claim: boolean | null }
/** judge 코퍼스 한 줄 + 그 줄이 어느 선례에서 왔나(인용 → 출처 링크). */
export type IdeaCorpusRow = EvidenceInputRow & { ref: IdeaRef | null }

/**
 * 판정 코퍼스(I4-1). source_type 으로 buildEvidenceCorpus 우선순위를 재사용한다:
 * 근거 문장 `detail_page`(1순위, supports_claim 먼저) · 무브 claim+transfer_note `ad` · 겹친 실패 outcome `review`.
 */
export function buildIdeaCorpus(cards: CaseMoveCard[], evidence: IdeaEvidenceRow[], failed: FailedAngleCard[]): IdeaCorpusRow[] {
  const slugOf = new Map(cards.map((c) => [c.case_study_id, c.slug]))
  const ev = evidence
    .filter((e) => slugOf.has(e.case_study_id) && e.snippet?.trim())
    .sort((a, b) => Number(Boolean(b.supports_claim)) - Number(Boolean(a.supports_claim)))
    .map((e): IdeaCorpusRow => ({
      source_type: 'detail_page',
      raw_text: e.snippet!.trim().slice(0, IDEA_SNIPPET_MAX),
      ref: { slug: slugOf.get(e.case_study_id)!, case_move_id: e.case_move_id },
    }))
  const mv = cards.map((c): IdeaCorpusRow => ({
    source_type: 'ad',
    raw_text: [`[${c.brand_name}] ${c.claim}`, c.transfer_note ? `다음 행동: ${c.transfer_note}` : ''].filter(Boolean).join('\n'),
    ref: { slug: c.slug, case_move_id: c.case_move_id },
  }))
  const fl = failed.map((f): IdeaCorpusRow => ({ source_type: 'review', raw_text: `[실패] ${f.claimed_angle}: ${f.outcome}`, ref: null }))
  return [...ev, ...mv, ...fl]
}

/** 검증된 인용이 코퍼스의 어느 줄에서 왔나. 못 찾으면 null(화면은 링크 없이 인용만). */
export function refForQuote(rows: IdeaCorpusRow[], quote: string | null): IdeaRef | null {
  const needle = normalizeWhitespace(quote ?? '')
  if (!needle) return null
  return rows.find((r) => normalizeWhitespace(String(r.raw_text ?? '')).includes(needle))?.ref ?? null
}

export const IDEA_WRITER_SYSTEM = `너는 SaaS·소비재 창업자의 아이디어 한 줄을 받아 소구 앵글 ${IDEA_ANGLE_MAX}개를 쓰는 카피라이터다.

${UNTRUSTED_INPUT_NOTICE}

${ANGLE_TYPE_GUIDE}

작업 방식(중요 — 새로 지어내기보다 선례를 고쳐 쓴다):
- '선례 무브' 절은 이미 승인된 실제 사례의 주장(claim)·다음 행동·근거 문장이다. 이것을 **앵커**로 삼아라.
- 앵글마다 선례 하나를 골라 anchor_move_id 에 적어라. 그 선례의 문구·근거 문장 중 **이 아이디어에도 그대로 맞는 부분은 그대로 써라.**
- 사용자 아이디어에 맞게 **달라져야 하는 부분만** 새로 쓰거나 보강해라(대상 고객·제품 이름·쓰는 상황 등).
- 선례 근거 문장에 없는 숫자·기간·보장·효과를 새로 만들지 마라. 확인되지 않은 성과 주장은 쓰지 마라.
- 앵글 ${IDEA_ANGLE_MAX}개는 서로 다른 angle_type 이어야 한다. 모두 소비자에게 노출되는 카피(COPY) 한 줄이다.

반드시 JSON만 출력해라. 형식:
{ "angles": [ { "angle_type": "위 유형 중 하나", "headline_draft": "카피 한 줄", "anchor_move_id": "선례 무브 id 또는 null", "reason": "선례에서 그대로 쓴 것과 바꾼 것 한 줄" } ] }`

/** writer 사용자 프롬프트. 선례(앵커)가 먼저, 아이디어가 끝에 온다. */
export function buildIdeaWriterPrompt(q: string, cards: CaseMoveCard[], evidence: IdeaEvidenceRow[]): string {
  const lines = ['## 선례 무브 (승인된 사례 — 앵커)']
  for (const c of cards.slice(0, IDEA_ANCHOR_MOVES)) {
    lines.push(`- id: ${c.case_move_id}`, `  브랜드: ${c.brand_name} / 레버: ${c.lever}`, `  주장: ${c.claim}`,
      `  다음 행동: ${c.transfer_note ?? '(미기재)'}`)
    const ev = evidence.filter((e) => e.case_study_id === c.case_study_id && e.snippet?.trim())
      .sort((a, b) => Number(Boolean(b.supports_claim)) - Number(Boolean(a.supports_claim))).slice(0, 2)
    for (const e of ev) lines.push(`  근거 문장: ${e.snippet!.trim().slice(0, IDEA_SNIPPET_MAX)}`)
  }
  lines.push('', '## 사용자 아이디어 (데이터)', q)
  return lines.join('\n')
}

export type WriterAngle = { angle_type: string | null; headline: string; anchor_move_id: string | null; reason: string }

/** writer JSON → 앵글 최대 3개. 문구가 빈 칸은 버린다. angle_type 어휘 검사는 호출부(pickEnum). */
export function parseWriterAngles(data: Record<string, unknown>): WriterAngle[] {
  const raw = Array.isArray(data.angles) ? data.angles : []
  return raw.flatMap((a): WriterAngle[] => {
    if (!a || typeof a !== 'object') return []
    const o = a as Record<string, unknown>
    const headline = typeof o.headline_draft === 'string' ? o.headline_draft.trim() : ''
    if (!headline) return []
    return [{
      angle_type: typeof o.angle_type === 'string' ? o.angle_type : null,
      headline,
      anchor_move_id: typeof o.anchor_move_id === 'string' && o.anchor_move_id ? o.anchor_move_id : null,
      reason: typeof o.reason === 'string' ? o.reason.trim() : '',
    }]
  }).slice(0, IDEA_ANGLE_MAX)
}

export const IDEA_REWRITE_SYSTEM = `너는 카피의 실증 게이트를 통과시키는 편집자다.
입력 문구는 선례 근거 없이 성과·효과를 주장(UNSUBSTANTIATED)한다고 판정됐다.

${UNTRUSTED_INPUT_NOTICE}

성과·효과 주장을 걷어내고 다시 써라. '선례 근거 문장' 절에 실제로 있는 사실만 쓸 수 있다.
그 절에 없는 숫자·기간·보장·정책을 지어내지 마라. 근거로 쓸 사실이 없으면 아무것도 보장하지 않는
확인·행동 유도 문장으로만 써라.

반드시 JSON만 출력해라. 형식:
{ "headline_draft": "다시 쓴 문구 한 줄", "reason": "무엇을 어떻게 바꿨는지 한 줄" }`

export function buildIdeaRewritePrompt(headline: string, judgeReason: string, corpusText: string, q: string): string {
  return ['## 선례 근거 문장 (여기 있는 사실만 쓸 수 있다)', corpusText, '', '## 원래 문구 (UNSUBSTANTIATED 판정)', headline,
    '', '## 판정 사유', judgeReason || '(없음)', '', '## 사용자 아이디어 (데이터)', q].join('\n')
}
