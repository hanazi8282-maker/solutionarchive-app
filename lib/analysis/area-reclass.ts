// HN 1차 relevant 글 단위 영역 재판정(남헌 v71aj §5-3, D-37/45). 순수 함수만 — 네트워크·DB·파일 없음.
// 설계: reports/2026-10-17/mention-loop-v71aj.md §6. 실행기: scripts/hn-area-reclass.mjs(파일 입출력). 마이그: 20261017000090_review_area_verdicts(미적용).
//
// 지금 영역은 프로젝트 단위다(v_input_area = analysis_projects.area_code). HN 글은 프로젝트가 'out-founder'·NULL 이라
// 글 내용이 ①~⑤ 에 맞아도 영역 밖으로 남는다. 여기서는 글 하나하나를 ①~⑤ 중 하나(또는 none)로 다시 본다.
// 기존 판정(review_relevance_verdicts·analysis_projects.area_code)은 덮지 않는다 — 결과는 새 표(insert-only)에만 간다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

/** 프롬프트를 바꾸면 버전을 올린다. 정밀도 게이트는 버전 단위로 잰다(다른 버전 표본으로 통과시키지 않는다). */
export const RECLASS_PROMPT_VERSION = 'arv-1'
export const RECLASS_AREAS = ['1', '2', '3', '4', '5'] as const
export type ReclassArea = (typeof RECLASS_AREAS)[number] | 'none'
/** 글 단위 영역을 쓰는 하한(뷰 v_input_area_effective 와 같은 값 — 셀프테스트가 마이그 파일과 대조). */
export const FIT_MIN = 0.7
/** 적용 중단 규칙: 표본 정밀도가 이 값 미만이면 SQL 을 만들지 않는다(지시 v71aj §5-3). */
export const PRECISION_MIN = 0.6
/** 정밀도를 잴 최소 표본(영역 예측 수). 이보다 적으면 확인 불가 = 통과 아님(§7.1). */
export const PRECISION_MIN_N = 30
export const BATCH = 20
export const TEXT_MAX = 600

export const RECLASS_INSTRUCTIONS = [
  '너는 B2B SaaS 리뷰 분류기다. 각 글이 아래 업무 영역 중 어디의 도구·업무 불만/요구를 다루는지 하나만 고른다.',
  '1 = 회의·통화 기록(회의록·녹취·요약·통화 기록)',
  '2 = 영업(CRM·리드·파이프라인·영업 메일·견적)',
  '3 = 마케팅(직접 쓰는 마케팅 도구: 이메일 마케팅·SNS 예약·광고 운영·SEO 도구)',
  '4 = 인사 운영(근태·급여·평가. 채용은 제외)',
  '5 = 리뷰 관리·글쓰기(리뷰 응대·작성 도구·글쓰기 보조)',
  "none = 위 어디에도 맞지 않음(창업 일반론·개발 도구·소비재·채용 등). 애매하면 none 이다 — 억지로 영역을 고르지 마라.",
  'fit 은 그 영역이 맞을 확신 0~1. 글에 업무 맥락이 직접 나오지 않으면 0.5 아래로.',
  'label 은 근거를 12단어 이내로(예: "회의록 자동 요약 부정확 불만"). 원문을 길게 베끼지 마라.',
  '출력은 JSON 객체 하나: {"prompt_version":"' + RECLASS_PROMPT_VERSION + '","rows":[{"input_id","area_code","fit","label"}]}',
].join('\n')

export type ReclassInput = { input_id: string; text: string; project_area?: string | null }
export type ReclassRow = { input_id: string; area_code: ReclassArea; fit: number; label: string | null }
export type VerdictRow = ReclassRow & { model: string; prompt_version: string; judged_at: string }

export const toPromptRow = (r: ReclassInput) => ({ input_id: r.input_id, text: String(r.text ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) })
export const reclassUserPrompt = (rows: readonly ReclassInput[]) => `아래 글들을 분류하라.\n\n${JSON.stringify(rows.map(toPromptRow))}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 모델 응답 검증. 요청에 없던 id·어휘 밖·fit 범위 밖·중복은 거부 목록으로(조용히 버리지 않는다). 요청했는데 빠진 id 는 missing. */
export function validateReclass(raw: unknown, asked: readonly string[]): { ok: ReclassRow[]; rejected: string[]; missing: string[] } {
  const o = raw as { prompt_version?: unknown; rows?: unknown } | null
  const rows = Array.isArray(o?.rows) ? (o!.rows as unknown[]) : null
  if (!rows) return { ok: [], rejected: ['rows 배열 없음'], missing: [...asked] }
  if (o?.prompt_version !== RECLASS_PROMPT_VERSION) return { ok: [], rejected: [`prompt_version 불일치: ${String(o?.prompt_version)}`], missing: [...asked] }
  const want = new Set(asked)
  const ok: ReclassRow[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  for (const r of rows as Array<Record<string, unknown>>) {
    const id = typeof r?.input_id === 'string' ? r.input_id : ''
    if (!want.has(id)) { rejected.push(`요청 밖 id ${id}`); continue }
    if (seen.has(id)) { rejected.push(`중복 ${id}`); continue }
    const area = String(r.area_code ?? '')
    if (![...RECLASS_AREAS, 'none'].includes(area)) { rejected.push(`area_code 어휘 밖 ${id}: ${area}`); continue }
    const fit = typeof r.fit === 'number' ? r.fit : Number.NaN
    if (!(fit >= 0 && fit <= 1)) { rejected.push(`fit 범위 밖 ${id}: ${String(r.fit)}`); continue }
    seen.add(id)
    ok.push({ input_id: id, area_code: area as ReclassArea, fit: Math.round(fit * 1000) / 1000, label: typeof r.label === 'string' ? r.label.slice(0, 120) : null })
  }
  return { ok, rejected, missing: asked.filter((id) => !seen.has(id)) }
}

// ── 영역 병합(뷰 우선순위와 한 벌) ─────────────────────────────────────
/**
 * 글 하나의 실효 영역. v_input_area_effective(마이그 20261017000090)와 같은 순서:
 *   1) 프로젝트 영역이 ①~⑤·design 이면 그대로(사람·라벨 근거가 있는 정본 — 글 단위 판정이 덮지 않는다)
 *   2) 아니면(out-*·hold·NULL) 그 글의 최신 재판정이 ①~⑤ ∧ fit ≥ FIT_MIN 이면 그 영역
 *   3) 아니면 프로젝트 영역(NULL 포함) 그대로
 * hold 는 2) 로 올리지 않는다 — 보류(⑥⑦)는 남헌이 정한 '신규 금지' 영역이라 글 단위로도 끌어오지 않는다.
 */
export function effectiveArea(projectArea: string | null | undefined, v: Pick<VerdictRow, 'area_code' | 'fit'> | null | undefined): { area: string | null; via: 'project' | 'input' } {
  const p = projectArea ?? null
  if (p && ['1', '2', '3', '4', '5', 'design'].includes(p)) return { area: p, via: 'project' }
  if (p !== 'hold' && v && v.area_code !== 'none' && v.fit >= FIT_MIN) return { area: v.area_code, via: 'input' }
  return { area: p, via: 'project' }
}

/** 같은 글에 판정이 여럿이면 최신 judged_at(동률이면 뒤 행) 하나. 뷰의 DISTINCT ON (input_id) ORDER BY judged_at DESC 와 같다. */
export function latestByInput<T extends { input_id: string; judged_at: string }>(rows: readonly T[]): Map<string, T> {
  const m = new Map<string, T>()
  for (const r of rows) {
    const prev = m.get(r.input_id)
    if (!prev || r.judged_at >= prev.judged_at) m.set(r.input_id, r)
  }
  return m
}

// ── 정밀도(표본 사람 라벨) ─────────────────────────────────────────────
/** Wilson 95% 구간. n=0 이면 null. */
export function wilson(k: number, n: number, z = 1.96) {
  if (!n) return null
  const p = k / n
  const d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  const r = (x: number) => Math.round(x * 1000) / 1000
  return { lo: r(Math.max(0, c - h)), hi: r(Math.min(1, c + h)) }
}

/**
 * 정밀도 = (모델이 ①~⑤ ∧ fit≥FIT_MIN 으로 고른 글 중) 사람 라벨이 같은 영역인 비율. 사람 라벨 빈칸은 제외(미채점).
 * 판정: n < PRECISION_MIN_N → unverified(적용 안 함) · 정밀도 < PRECISION_MIN → stop · 그 밖 pass.
 */
export function precisionReport(verdicts: readonly VerdictRow[], labels: ReadonlyMap<string, string>) {
  const versions = [...new Set(verdicts.map((v) => v.prompt_version))]
  const predicted = verdicts.filter((v) => v.area_code !== 'none' && v.fit >= FIT_MIN && labels.has(v.input_id))
  const correct = predicted.filter((v) => labels.get(v.input_id) === v.area_code).length
  const n = predicted.length
  const precision = n ? Math.round((correct / n) * 1000) / 1000 : null
  // 재현율 참고치: 사람이 ①~⑤ 라 한 글 중 모델이 같은 영역으로 고른 비율
  const humanIn = verdicts.filter((v) => (RECLASS_AREAS as readonly string[]).includes(labels.get(v.input_id) ?? ''))
  const recall = humanIn.length ? Math.round((humanIn.filter((v) => v.area_code === labels.get(v.input_id) && v.fit >= FIT_MIN).length / humanIn.length) * 1000) / 1000 : null
  const decision = versions.length !== 1 ? 'unverified' : n < PRECISION_MIN_N ? 'unverified' : (precision as number) < PRECISION_MIN ? 'stop' : 'pass'
  const why =
    versions.length !== 1 ? `prompt_version 이 하나가 아니다(${versions.join(',') || '없음'})`
    : n < PRECISION_MIN_N ? `채점된 영역 예측 ${n}건 < ${PRECISION_MIN_N} — 확인 불가`
    : decision === 'stop' ? `정밀도 ${precision} < ${PRECISION_MIN} — 적용 중단`
    : `정밀도 ${precision} ≥ ${PRECISION_MIN}`
  return { prompt_version: versions[0] ?? null, labeled: verdicts.filter((v) => labels.has(v.input_id)).length, n, correct, precision, ci95: wilson(correct, n), recall, decision, why }
}

/** 사람 라벨 CSV(input_id,human_area[,메모]) → Map. 빈 칸은 미채점. 어휘 밖 값은 던진다(조용히 버리지 않는다). */
export function parseLabelCsv(csv: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const [i, line] of String(csv).split(/\r?\n/).entries()) {
    const [id, lab] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    if (!id || !UUID.test(id)) continue // 머리줄·빈 줄
    if (!lab) continue
    if (![...RECLASS_AREAS, 'none'].includes(lab)) throw new Error(`라벨 CSV ${i + 1}행: human_area 는 1~5·none — ${lab}`)
    m.set(id, lab)
  }
  return m
}

/** insert-only SQL. 정밀도 게이트를 통과한 보고서(같은 prompt_version)가 있어야만 만든다. ON CONFLICT DO NOTHING — 기존 행을 덮지 않는다. */
export function renderVerdictSql(rows: readonly VerdictRow[], gate: { decision: string; prompt_version: string | null; precision: number | null }) {
  if (gate.decision !== 'pass') throw new Error(`정밀도 게이트 ${gate.decision} — SQL 을 만들지 않는다(적용 중단 규칙)`)
  const bad = rows.find((r) => r.prompt_version !== gate.prompt_version)
  if (bad) throw new Error(`게이트 버전 ${gate.prompt_version} 과 다른 판정 행: ${bad.input_id} ${bad.prompt_version}`)
  const q = (s: unknown) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
  for (const r of rows) if (!UUID.test(r.input_id)) throw new Error(`bad input_id ${r.input_id}`)
  const values = rows.map((r) => `  (${q(r.input_id)}::uuid, ${q(r.area_code)}, ${r.fit}, ${q(r.model)}, ${q(r.prompt_version)}, ${q(r.judged_at)}::timestamptz, ${q(r.label)})`)
  return (
    `-- review_area_verdicts insert-only (${rows.length}행, ${gate.prompt_version}, 표본 정밀도 ${gate.precision}). 마이그 20261017000090 적용 뒤 실행.\n` +
    `-- 원문 없음(라벨은 12단어 근거). analysis_inputs 에 없는 id 는 FK 로 실패한다 — 그 배치만 고쳐 다시 돌린다.\n` +
    `INSERT INTO public.review_area_verdicts (input_id, area_code, fit, model, prompt_version, judged_at, label)\nVALUES\n${values.join(',\n')}\n` +
    `ON CONFLICT (input_id, prompt_version) DO NOTHING;\n`
  )
}
