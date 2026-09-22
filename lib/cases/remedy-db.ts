// 처방 카드의 DB 왕복 — 코퍼스 조회 · 판정 캐시 읽기 · 판정 돌려 캐시에 쓰기.
//
// 순수 계산은 remedy.ts(조립) · remedy-gate.ts(거르기) · remedy-judge.ts(프롬프트·파싱) 에 있고,
// supabase 를 만지는 것은 이 파일뿐이다. 라우트 2개(remedy·summary)와 판정 라우트·CLI 가 같은 한 벌을 쓴다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(scripts/remedy-judge.mjs). `@/` 별칭을 쓰지 않는다.
//
// ★ 조회 실패를 빈 배열로 접지 않는다 — null 로 넘겨야 remedy 가 "관련 사례 없음" 과 "확인 불가" 를 가른다(§7.1).

import type { SupabaseClient } from '@supabase/supabase-js'
import { productKindOf } from './advisor.ts'
import type { CaseMoveCard, FailedAngleCard, FailedAngleRow, PrincipleCard, PrincipleRow } from './advisor.ts'
import type { MoveRow, StudyRow } from './match.ts'
import { buildRemedies, type RemedyAspectRow, type RemedyProject, type RemedyResult } from './remedy.ts'
import { CARD_KINDS, cardFingerprint, cardIdOf, cardLine, type CardKind, type VerdictRow } from './remedy-gate.ts'
import { judgeAspect, type JudgeCard, buildJudgePrompt } from './remedy-judge.ts'

const STUDY_COLS =
  'id, slug, brand_name, bottleneck, business_model, buyer_type, price_band, outcome_status, review_status'
const MOVE_COLS =
  'id, case_study_id, lever, claim, evidence_grade, fact_check_grade, outcome_direction, review_status, metric_name, metric_before, metric_after, metric_unit'

export interface RemedyCorpora {
  principles: PrincipleRow[] | null
  studies: StudyRow[] | null
  moves: MoveRow[] | null
  failedAngles: FailedAngleRow[] | null
}

async function safeSelect<T>(supabase: SupabaseClient, label: string, table: string, cols: string): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select(cols)
  if (error) {
    console.error(`[${label}] ${table} select error:`, error.code ?? '', error.message)
    return null
  }
  return (data ?? []) as T[]
}

/** 처방 코퍼스 4종. 어느 하나라도 실패하면 그 자리는 null 이고, 그게 not_run 의 근거가 된다. */
export async function loadCorpora(supabase: SupabaseClient, label: string): Promise<RemedyCorpora> {
  return {
    principles: await safeSelect<PrincipleRow>(
      supabase, label, 'strategy_principles', 'sp_id, tags, statement, evidence_grade, evidence_grade_note, source_ref',
    ),
    studies: await safeSelect<StudyRow>(supabase, label, 'case_studies', STUDY_COLS),
    moves: await safeSelect<MoveRow>(supabase, label, 'case_moves', MOVE_COLS),
    failedAngles: await safeSelect<FailedAngleRow>(
      supabase, label, 'failed_angles', 'case_key, product_category, claimed_angle, outcome, evidence_source, source_tier, is_estimate',
    ),
  }
}

/** 이 속성들에 대한 판정 캐시. 조회 실패는 빈 배열이 아니라 null 이다(전부 "미검증" 으로 떨어진다). */
export async function loadVerdicts(
  supabase: SupabaseClient, label: string, aspectIds: string[],
): Promise<VerdictRow[] | null> {
  if (aspectIds.length === 0) return []
  const { data, error } = await supabase
    .from('remedy_verdicts')
    .select('aspect_id, card_kind, card_id, card_fingerprint, verdict, human_verdict')
    .in('aspect_id', aspectIds)
  if (error) {
    // 테이블이 아직 없어도(마이그레이션 미적용) 여기로 온다 — 그때 전부 "미검증" 이 되고 카드는 안 사라진다.
    console.error(`[${label}] remedy_verdicts select error:`, error.code ?? '', error.message)
    return null
  }
  return (data ?? []) as VerdictRow[]
}

/** 프로젝트 하나의 처방을 처음부터 조립한다. 프로젝트가 없으면 null. */
export async function buildProjectRemedies(
  supabase: SupabaseClient, projectId: string, label = 'remedy-db',
): Promise<RemedyResult | null> {
  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, market, business_model')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) {
    console.error(`[${label}] project fetch error:`, projectError.message)
    return { status: 'not_run', reason: '프로젝트 조회에 실패했다 — 확인 불가다', cards: [] }
  }
  if (!project) return null

  const { data: aspects, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, notes, importance, satisfaction')
    .eq('project_id', projectId)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
  if (aspectsError) console.error(`[${label}] aspects fetch error:`, aspectsError.message)

  return buildRemedies({
    aspects: aspectsError ? null : ((aspects ?? []) as RemedyAspectRow[]),
    project: project as RemedyProject,
    corpora: await loadCorpora(supabase, label),
  })
}

// ── 판정 실행 ────────────────────────────────────────────────────

export interface JudgeAspectReport {
  aspect_id: string
  name: string
  /** 낱말 겹침으로 걸린 카드 수. */
  candidates: number
  /** 이미 판정이 있어 건너뛴 카드 수. */
  cached: number
  /** 이번에 0/1/2 를 받은 카드 수. */
  judged: number
  /** 그중 무관(0). */
  irrelevant: number
  /** 이번에도 판정을 못 받은 카드 수(미검증). */
  unverified: number
  model: string
  /** --dry 일 때만. 사람이 눈으로 보는 프롬프트. */
  prompt?: string
}

export interface JudgeRunResult {
  project_id: string
  status: 'ok' | 'skipped'
  reason?: string
  aspects: JudgeAspectReport[]
  upserted: number
}

type AnyCard = CaseMoveCard | FailedAngleCard | PrincipleCard

/** 속성당 카드 목록을 뽑는다. 화면에 나가는 문장 그대로를 판정에 넘긴다. */
function cardsOf(card: RemedyResult['cards'][number]): JudgeCard[] {
  const lists: Record<CardKind, AnyCard[]> = {
    case_move: card.fixes,
    failed_angle: card.failures,
    principle: card.principles,
  }
  return CARD_KINDS.flatMap((kind) =>
    lists[kind].map((c) => ({ kind, card_id: cardIdOf(kind, c), text: cardLine(kind, c) })),
  )
}

/** 동시 호출 상한. Gemini 무료 티어는 extract 와 RPM 을 공유한다(429 경험) — 크게 열지 않는다. */
const CONCURRENCY = 3

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

/**
 * 프로젝트 하나의 처방 카드를 전부 판정해 remedy_verdicts 에 적립한다.
 *
 * 이미 판정(0/1/2)이 있고 지문이 같은 카드는 건너뛴다 — 재실행이 공짜가 되게 하려는 것이다.
 * 지문이 다르거나 verdict 가 NULL(미검증)이면 다시 판정한다.
 */
export async function judgeProjectRemedies(
  supabase: SupabaseClient, projectId: string, opts: { dry?: boolean } = {},
): Promise<JudgeRunResult> {
  const label = 'remedy-judge'
  const remedies = await buildProjectRemedies(supabase, projectId, label)
  if (!remedies) return { project_id: projectId, status: 'skipped', reason: '프로젝트를 찾을 수 없다', aspects: [], upserted: 0 }
  if (remedies.status === 'not_run') {
    // 코퍼스를 못 읽은 상태에서 판정하면 "카드가 없다" 를 "무관" 으로 굳히게 된다. 아예 돌리지 않는다.
    return { project_id: projectId, status: 'skipped', reason: `확인 불가 — ${remedies.reason}`, aspects: [], upserted: 0 }
  }

  const aspectIds = remedies.cards.map((c) => c.aspect_id)
  if (aspectIds.length === 0) {
    return { project_id: projectId, status: 'ok', reason: remedies.reason, aspects: [], upserted: 0 }
  }

  // 속성 메모는 처방 카드에 실려 오지 않는다(RemedyCard 는 이름만 갖는다). 판정 품질에 직접 닿는 재료라
  // 여기서 한 번 더 읽는다. 못 읽으면 메모 없이 판정한다 — 판정을 건너뛰지는 않는다.
  const { data: aspectNotes, error: notesError } = await supabase
    .from('analysis_aspects').select('id, notes').in('id', aspectIds)
  if (notesError) console.error(`[${label}] aspect notes fetch error:`, notesError.message)
  const notesById = new Map((aspectNotes ?? []).map((a) => [a.id as string, (a.notes ?? null) as string | null]))

  // 제품 종류(physical/software) — 판정 지시문의 첫 줄이 여기서 갈린다(remedy-judge.judgeSystem).
  // 못 읽으면 productKindOf(undefined) = physical 로 간다. 판정을 건너뛰지는 않는다(기존 동작).
  const { data: proj, error: projError } = await supabase
    .from('analysis_projects').select('business_model').eq('id', projectId).maybeSingle()
  if (projError) console.error(`[${label}] business_model fetch error:`, projError.message)
  const kind = productKindOf(proj?.business_model as string | null | undefined)

  const cached = await loadVerdicts(supabase, label, aspectIds)
  const done = new Set(
    (cached ?? [])
      .filter((v) => v.verdict !== null && v.verdict !== undefined)
      .map((v) => `${v.aspect_id}|${v.card_kind}|${v.card_id}|${v.card_fingerprint}`),
  )

  const targets = remedies.cards.map((c) => {
    const all = cardsOf(c)
    const todo = all.filter((k) => !done.has(`${c.aspect_id}|${k.kind}|${k.card_id}|${cardFingerprint(k.kind, k.text)}`))
    return { card: c, all, todo }
  })

  const rows: Record<string, unknown>[] = []
  const reports = await mapLimit(targets, CONCURRENCY, async ({ card, all, todo }): Promise<JudgeAspectReport> => {
    const base = {
      aspect_id: card.aspect_id,
      name: card.aspect_name,
      candidates: all.length,
      cached: all.length - todo.length,
    }
    if (todo.length === 0) {
      return { ...base, judged: 0, irrelevant: 0, unverified: 0, model: '(판정 불필요)' }
    }
    const aspect = { name: card.aspect_name, notes: notesById.get(card.aspect_id) ?? null, kind }
    if (opts.dry) {
      return {
        ...base, judged: 0, irrelevant: 0, unverified: 0, model: '(dry)',
        prompt: buildJudgePrompt(aspect, todo).user,
      }
    }

    const { model, verdicts } = await judgeAspect(aspect, todo)
    const byId = new Map(todo.map((k) => [`${k.kind}|${k.card_id}`, k]))
    const judgedAt = new Date().toISOString()
    let judged = 0, irrelevant = 0, unverified = 0
    for (const v of verdicts) {
      const k = byId.get(`${v.card_kind}|${v.card_id}`)
      if (!k) continue
      if (v.verdict === null) unverified++
      else { judged++; if (v.verdict === 0) irrelevant++ }
      rows.push({
        aspect_id: card.aspect_id,
        card_kind: v.card_kind,
        card_id: v.card_id,
        card_fingerprint: cardFingerprint(k.kind, k.text),
        verdict: v.verdict,
        judge_model: model,
        judged_at: judgedAt,
      })
    }
    return { ...base, judged, irrelevant, unverified, model }
  })

  let upserted = 0
  if (!opts.dry && rows.length > 0) {
    // human_verdict·human_graded_at 은 payload 에 없다 — 재판정이 사람 채점을 덮어쓰지 않는다.
    const { error } = await supabase.from('remedy_verdicts').upsert(rows, { onConflict: 'aspect_id,card_kind,card_id' })
    if (error) {
      console.error(`[${label}] remedy_verdicts upsert error:`, error.code ?? '', error.message)
      return { project_id: projectId, status: 'skipped', reason: `판정은 했으나 저장 실패: ${error.message}`, aspects: reports, upserted: 0 }
    }
    upserted = rows.length
  }

  return { project_id: projectId, status: 'ok', aspects: reports, upserted }
}
