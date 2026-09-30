// 인사이트 카드 한 장에 붙는 두 가지 — 근거 리뷰 인용 · 유사 해결사례(처방).
//
// ★ 연결 고리(지어내지 않는다): 카드 = analysis_angles 1행 → `aspect_id`(단일 uuid FK, 마이그 20260816000001)
//   → analysis_aspects 1행. 앵글은 속성을 **정확히 하나** 가리킨다(여러 속성 컬럼·조인 테이블 없음) —
//   그래서 "여러 속성 중 어느 것" 규칙은 필요 없고, 그 한 속성의 인용·처방만 붙인다. aspect_id 가 NULL 인
//   앵글은 게이트(feed.ts INSIGHT_GATE.aspectQuadrants)에서 이미 빠져 카드가 안 된다.
//
// ★ 처방은 **읽기 전용 재사용**이다. 이 화면은 LLM 을 부르지 않는다.
//   - 처방 카드 조립(buildRemedies)은 순수 함수다 — 낱말 겹침일 뿐 LLM 이 아니다. 결과 화면의
//     GET /api/analyze/remedy 가 매번 같은 식으로 다시 조립한다(저장본 없음). 여기서도 똑같이 한다.
//   - LLM 재검증(remedy judge) 결과는 remedy_verdicts 테이블(마이그 20260928000001)에 저장돼 있고,
//     쓰는 곳은 extract 8단계(lib/analysis/extract-run.ts)와 POST /api/analyze/remedy/judge 뿐이다.
//     여기는 loadVerdicts 로 **읽기만** 하고 applyGate 로 거른다 — /api/analyze/remedy 와 같은 한 벌.
//   - 판정 행이 없는 카드는 엔진 규약대로 "미검증" 으로 남는다(숨기지 않는다, remedy-gate.ts 헤더).
//
// ★ 4상태(§7.1). matched / no_match 는 엔진 그대로. 여기서 새로 생기는 것은 둘이다:
//   - not_run  = 처방 미실행. 이 속성의 판정(aspectVerdict)이 슈퍼 니즈·니즈 포인트가 아니라 엔진이 처방을
//                돌리지 않는 속성이다(remedy.ts REMEDY_VERDICTS). "사례 없음" 과 다르다.
//   - unknown  = 확인 불가. 이 화면의 조회가 실패했거나, 엔진이 not_run(코퍼스 조회 실패·질의어 없음)을 냈다.
//                엔진 not_run 의 결과 화면 라벨이 "확인 불가 — 이유" 라서 그 라벨을 그대로 쓴다(remedyStatusLine).
//
// ★ N+1 없음: 카드 수와 무관하게 조회 횟수가 고정이다 — 속성 1(+번역 칸 없을 때 1) · 프로젝트 1 ·
//   처방 코퍼스(loadCorpora, 고정 개수) · 판정 1. 속성·프로젝트·판정은 id 를 모아 `.in()` 한 번이다.
//   행 상한(1000): id 는 한 페이지 카드 수(PAGE_SIZE=50) 이하라 속성·프로젝트는 50행을 넘지 않고,
//   판정은 속성당 카드 ≤ MAX_FIXES+MAX_FAILURES+MAX_PRINCIPLES(7) 이라 350행을 넘지 않는다 — 잘릴 수 없다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { VERDICT_LABEL, aspectVerdict } from '../analysis/aspect-verdict.ts'
import { quoteLines, type QuoteLine, type QuoteRow } from '../analysis/quote-display.ts'
import { REMEDY_VERDICTS, buildRemedies, type RemedyProject } from '../cases/remedy.ts'
import { applyGate, type GatedRemedyCard, type VerdictRow } from '../cases/remedy-gate.ts'
import { loadCorpora, loadVerdicts, type RemedyCorpora } from '../cases/remedy-db.ts'

/** 인용을 펴 두는 수. 검수 화면(/analyze/[id]/review)과 같은 2 — 추출은 속성당 1~3건이라 나머지는 많아야 1건이다. */
export const QUOTES_OPEN = 2

const ASPECT_COLS = 'id, project_id, name, notes, importance, satisfaction, evidence_quotes'
const PROJECT_COLS = 'id, product_elevator_pitch, market, business_model'

export interface EvidenceAspectRow {
  id: string
  project_id: string | null
  name: string
  notes?: string | null
  importance: number | string | null
  satisfaction: number | string | null
  evidence_quotes?: QuoteRow[] | null
  /** 마이그 000047. undefined = 칸 없음(미적용) · null = 번역 전. */
  evidence_quotes_ko?: unknown
}
export interface EvidenceProjectRow extends RemedyProject { id: string }

export type InsightQuotes =
  | { state: 'ok'; lines: QuoteLine[] }
  /** evidence_quotes NULL — 추출이 인용을 남기기 전 행. 재분석하면 채워진다. */
  | { state: 'missing' }
  | { state: 'unknown'; reason: string }

export type InsightRemedy =
  | { state: 'matched' | 'no_match'; card: GatedRemedyCard; judgeLookupFailed: boolean }
  | { state: 'not_run'; reason: string; verdictLabel: string }
  | { state: 'unknown'; reason: string }

export interface InsightEvidence { aspect_name: string | null; quotes: InsightQuotes; remedy: InsightRemedy }

/** 순수: 조회 결과 → aspect_id 별 인용·처방. null 인 입력 = 그 조회 실패(0행과 다르다). */
export function buildInsightEvidence(
  aspectIds: readonly string[],
  c: { aspects: EvidenceAspectRow[] | null; projects: EvidenceProjectRow[] | null; corpora: RemedyCorpora; verdicts: VerdictRow[] | null },
): Map<string, InsightEvidence> {
  const out = new Map<string, InsightEvidence>()
  const aspectById = new Map((c.aspects ?? []).map((a) => [a.id, a]))
  const projectById = new Map((c.projects ?? []).map((p) => [p.id, p]))
  for (const id of new Set(aspectIds)) {
    const a = aspectById.get(id)
    if (!a) {
      const reason = c.aspects === null ? '속성 조회 실패' : '속성 행을 찾지 못했다'
      out.set(id, { aspect_name: null, quotes: { state: 'unknown', reason }, remedy: { state: 'unknown', reason } })
      continue
    }
    const quotes: InsightQuotes = Array.isArray(a.evidence_quotes)
      ? { state: 'ok', lines: quoteLines(a.evidence_quotes, a.evidence_quotes_ko) }
      : { state: 'missing' }
    out.set(id, { aspect_name: a.name, quotes, remedy: remedyOf(a, c) })
  }
  return out
}

function remedyOf(
  a: EvidenceAspectRow,
  c: { projects: EvidenceProjectRow[] | null; corpora: RemedyCorpora; verdicts: VerdictRow[] | null },
): InsightRemedy {
  const v = aspectVerdict(a.importance, a.satisfaction)
  if (!(REMEDY_VERDICTS as readonly string[]).includes(v.code)) {
    return {
      state: 'not_run',
      verdictLabel: v.label,
      reason: `이 속성의 판정은 “${v.label}”이라 처방을 돌리지 않는다. 처방은 “${VERDICT_LABEL.PUSH}”·“${VERDICT_LABEL.WATCH}” 속성에만 붙는다`,
    }
  }
  // 프로젝트의 시장·설명·사업모델이 질의어·카테고리 필터에 들어간다. 못 읽은 채 조립하면 결과 화면과 다른
  // 카드가 나온다 — 그래서 조립하지 않고 확인 불가로 둔다.
  if (c.projects === null) return { state: 'unknown', reason: '프로젝트 조회 실패' }
  const project = c.projects.find((p) => p.id === a.project_id)
  if (!project) return { state: 'unknown', reason: '프로젝트 행을 찾지 못했다' }
  // 속성 한 장의 카드는 같은 프로젝트의 다른 속성과 무관하다(buildRemedies 가 속성마다 advise 를 따로 부른다).
  // 그래서 이 속성 하나만 넘겨도 결과 화면(/analyze/[id]/result)의 그 속성 카드와 같다.
  const card = applyGate(
    buildRemedies({ aspects: [{ id: a.id, name: a.name, notes: a.notes, importance: a.importance, satisfaction: a.satisfaction }], project, corpora: c.corpora }),
    c.verdicts ?? [], // 판정 조회 실패 = 전부 미검증(카드는 안 사라진다) — GET /api/analyze/remedy 와 같다.
  ).cards[0]
  if (!card) return { state: 'unknown', reason: '처방 카드를 조립하지 못했다' }
  if (card.status === 'not_run') return { state: 'unknown', reason: card.reason }
  return { state: card.status, card, judgeLookupFailed: c.verdicts === null }
}

// ── 조회 ────────────────────────────────────────────────────────

type Res<T> = { data: T[] | null; error: { code?: string; message: string } | null }

/** 번역 칸(000047)이 없으면(42703) 그 칸 없이 한 번 더 — /api/analyze/review 와 같은 폴백. */
async function loadAspects(sb: SupabaseClient, ids: string[], where: string): Promise<EvidenceAspectRow[] | null> {
  let r = (await sb.from('analysis_aspects').select(`${ASPECT_COLS}, evidence_quotes_ko`).in('id', ids)) as unknown as Res<EvidenceAspectRow>
  if (r.error?.code === '42703') {
    console.warn(`[${where}] evidence_quotes_ko column missing (migration 000047 not applied) — reading without it`)
    r = (await sb.from('analysis_aspects').select(ASPECT_COLS).in('id', ids)) as unknown as Res<EvidenceAspectRow>
  }
  if (r.error) {
    console.error(`[${where}] analysis_aspects select error:`, r.error.code ?? '', r.error.message)
    return null
  }
  return r.data ?? []
}

async function loadProjects(sb: SupabaseClient, ids: string[], where: string): Promise<EvidenceProjectRow[] | null> {
  const r = (await sb.from('analysis_projects').select(PROJECT_COLS).in('id', ids)) as unknown as Res<EvidenceProjectRow>
  if (r.error) {
    console.error(`[${where}] analysis_projects select error:`, r.error.code ?? '', r.error.message)
    return null
  }
  return r.data ?? []
}

/** 한 페이지 카드들의 인용·처방. 조회 횟수는 카드 수와 무관하다(헤더). */
export async function loadInsightEvidence(
  sb: SupabaseClient,
  items: readonly { aspect_id: string; project_id: string }[],
): Promise<Map<string, InsightEvidence>> {
  const where = 'insights/evidence'
  const aspectIds = [...new Set(items.map((i) => i.aspect_id))]
  if (aspectIds.length === 0) return new Map()
  const projectIds = [...new Set(items.map((i) => i.project_id))]
  const [aspects, projects, corpora, verdicts] = await Promise.all([
    loadAspects(sb, aspectIds, where),
    loadProjects(sb, projectIds, where),
    loadCorpora(sb, where),
    loadVerdicts(sb, where, aspectIds),
  ])
  return buildInsightEvidence(aspectIds, { aspects, projects, corpora, verdicts })
}
