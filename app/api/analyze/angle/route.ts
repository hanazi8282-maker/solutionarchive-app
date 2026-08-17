import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  ANGLE_TYPES,
  SUBSTANTIATION_VERDICTS,
  type AngleType,
  type OutputType,
  type SubstantiationVerdict,
} from '@/lib/analysis/types'
import {
  callLlmJson,
  describeFailure,
  requiredKeyFor,
  resolveProvider,
  type LlmProvider,
} from '@/lib/analysis/llm'

// 앵글 1건당 LLM 호출이 붙으므로 여유를 크게 잡는다.
export const maxDuration = 300

// LLM 호출 동시 실행 상한.
// Gemini 무료 티어는 분당 요청 수 제한이 빡빡해서 동시에 던지면 바로 429 가 난다.
// 앵글은 보통 5~8건이라 순차 처리해도 총 시간이 크게 늘지 않는다(건당 3~6초).
const CONCURRENCY = 1

type AspectRow = {
  id: string
  name: string
  aspect_layer: string | null
  importance: number | string | null
  satisfaction: number | string | null
  opportunity_score: number | string | null
  quadrant: string | null
  attribution: string | null
  pain_timing: string | null
  persona_role: string | null
  is_segmentation_axis: boolean | null
  value_realization_frequency: string | null
  notes: string | null
}

type ProjectRow = {
  id: string
  competitor_url: string
  product_elevator_pitch: string
  purpose: string
  seller_own_guess: string | null
  status: string
  maturity_stage: number | null
  maturity_notes: string | null
}

/** 만들 앵글 1건의 설계도. LLM 호출 전에 코드가 먼저 확정한다. */
type AnglePlan = {
  aspectId: string | null
  aspectName: string // 프롬프트/로그용
  angleType: AngleType
  outputType: OutputType
  /** 이 배정이 어느 규칙에서 나왔는지 — 보고·디버깅용 */
  rule: string
  /** BASELINE_SPEC 처럼 여러 속성을 묶는 경우 */
  groupedAspects?: AspectRow[]
}

// ── 앵글 배정 규칙 (강제 우선순위는 코드로 고정) ─────────────────
/**
 * maturity_stage 별 기본 후보군. 최종 선택은 LLM 이 하되, 후보 밖으로는 못 나간다.
 *   1~2단계 → PAS / ASPIRATION
 *   3~4단계 → MECHANISM / COMPARISON
 *   5단계   → SOCIAL_PROOF / FEAR_FOMO
 */
function defaultCandidates(maturityStage: number | null): AngleType[] {
  if (maturityStage === null) return ['MECHANISM', 'COMPARISON']
  if (maturityStage <= 2) return ['PAS', 'ASPIRATION']
  if (maturityStage <= 4) return ['MECHANISM', 'COMPARISON']
  return ['SOCIAL_PROOF', 'FEAR_FOMO']
}

/**
 * DIFFERENTIATOR 속성 1건의 angle_type/output_type 을 정한다.
 * 우선순위는 위에서부터 먼저 걸리는 규칙이 이긴다.
 */
function planForDifferentiator(a: AspectRow, project: ProjectRow): AnglePlan | { skip: 'PRODUCT_SPEC' } {
  // output_type 선분기: 상세페이지 목적인데 구매 후에야 알게 되는 페인이면
  // 카피로 쓰면 역효과다(사기 전에 검증 불가 → 불신). 제품 개선 과제로 넘긴다.
  if (project.purpose === 'detail_page' && a.pain_timing === 'POST_PURCHASE') {
    return { skip: 'PRODUCT_SPEC' }
  }

  // 1순위: 사용자가 자기 탓으로 서술하는 페인 → 재귀인
  if (a.attribution === 'USER_FAULT') {
    return {
      aspectId: a.id, aspectName: a.name,
      angleType: 'REATTRIBUTION',
      outputType: a.aspect_layer === 'PROCESS' ? 'OFFER' : 'COPY',
      rule: '1순위 attribution=USER_FAULT',
    }
  }

  // 2순위: 구매·사용 프로세스의 페인 → 카피가 아니라 오퍼로 푼다
  if (a.aspect_layer === 'PROCESS') {
    return {
      aspectId: a.id, aspectName: a.name,
      angleType: 'COMPARISON',
      outputType: 'OFFER',
      rule: '2순위 aspect_layer=PROCESS → OFFER',
    }
  }

  // 3순위: 극찬과 혐오가 공존하는 축 → 자기선택 유도
  if (a.is_segmentation_axis === true) {
    return {
      aspectId: a.id, aspectName: a.name,
      angleType: 'SELF_SELECTION',
      outputType: 'COPY',
      rule: '3순위 is_segmentation_axis=true',
    }
  }

  // 4순위: 성숙도 기본값 (후보군 중 최종 선택은 LLM)
  return {
    aspectId: a.id, aspectName: a.name,
    angleType: defaultCandidates(project.maturity_stage)[0],
    outputType: 'COPY',
    rule: `4순위 maturity_stage=${project.maturity_stage ?? '미판정'}`,
  }
}

// ── 프롬프트 ─────────────────────────────────────────────────────
const ANGLE_TYPE_GUIDE = `앵글 유형 정의:
- PAS: 문제(Problem)→동요(Agitate)→해결(Solution). 감정적 페인을 정면으로 건드린다.
- MECHANISM: 왜 되는지의 고유 작동원리를 설명해 믿게 만든다.
- COMPARISON: 대안/경쟁 방식과 대조해 우위를 드러낸다.
- SOCIAL_PROOF: 다른 사람들의 선택·후기를 근거로 안심시킨다.
- FEAR_FOMO: 놓쳤을 때의 손실·뒤처짐을 환기한다.
- ASPIRATION: 도달하고 싶은 상태·정체성을 그려준다.
- REATTRIBUTION: "당신 탓이 아니다". 자책 인정 → 원인은 당신이 아니라 구조/제품 → 구조적 해법 제시.
  반드시 이 3단 구조를 지켜라. 사용자를 탓하거나 훈계하지 마라.
- SELF_SELECTION: "이런 사람에게는 맞고, 이런 사람에게는 안 맞는다"로 스스로 걸러내게 한다.

산출물 유형(output_type)별 톤:
- COPY: 실제 노출되는 카피 문구 한 줄. 헤드라인으로 바로 쓸 수 있어야 한다.
- OFFER: 카피가 아니라 "오퍼(제안) 문구". 보장·교환·체험·구성 등 거래 조건으로 페인을 없앤다.
  예) 사이즈가 안 맞으면 무료 교환, 30일 안에 효과 없으면 전액 환불 같은 형태.
- PRODUCT_SPEC: 광고 문구가 아니라 "차기 제품 개선 과제" 메모. 무엇을 고쳐야 하는지 한 줄로.
- BASELINE_SPEC: 광고 문구가 아니라 "기본으로 반드시 충족해야 하는 사양" 목록 요약 한 줄.
  이건 차별화 소구점이 아니라, 빠지면 탈락하는 기본기다.`

const PURPOSE_TONE: Record<string, string> = {
  hook: '광고 후킹 — 스크롤을 멈추게 하는 말. 짧고 의외성 있게.',
  ad_conversion: '메타광고 전환 — 클릭해서 사게 하는 말. 편익과 행동을 분명히.',
  detail_page: '상세페이지 구매전환 — 이미 관심 있는 사람에게 확신을 주는 말. 과장보다 근거.',
  product_fit: '제품/오퍼 매력 — 애초에 팔릴 제품인지 판단하는 관점. 제품·오퍼 구조 중심.',
}

const SYSTEM_PROMPT = `너는 이커머스 소구점 발굴 파이프라인의 Stage4(앵글 생성)를 수행한다.
주어진 속성(aspect) 하나와 배정된 앵글 유형에 맞춰 한국어 산출물 1건을 만든다.

${ANGLE_TYPE_GUIDE}

실증 게이트(중요):
성능·효능·수치를 주장하는 문구를 쓸 때는 근거 수준을 스스로 판정해라.
- SUBSTANTIATED: 임상·인체적용시험·인증 등 제시된 근거로 뒷받침되는 주장
- EXPERIENTIAL: 사용감·경험 서술이라 검증 대상이 아닌 표현
- UNSUBSTANTIATED: 근거 없이 성능·효능을 단정하는 주장
성능 주장이 전혀 없으면 EXPERIENTIAL 로 판정해라.

반드시 JSON만 출력해라. 형식:
{ "angle_type": "배정된 유형 또는 허용 후보 중 하나",
  "headline_draft": "산출물 한 줄",
  "substantiation_verdict": "SUBSTANTIATED|EXPERIENTIAL|UNSUBSTANTIATED",
  "reason": "판정 근거 한 줄" }`

const REWRITE_SYSTEM_PROMPT = `너는 이커머스 카피의 실증 게이트를 통과시키는 편집자다.
입력으로 받은 문구는 근거 없이 성능·효능을 주장(UNSUBSTANTIATED)한다고 판정됐다.

성능·효능 주장을 완전히 제거하고, 대신 "불안 해소 장치"로 다시 써라.
불안 해소 장치란 구매자가 스스로 확인·통제할 수 있게 해주는 것이다:
사용 가이드, 확인 방법, 사용 조건 안내, 체험·교환·환불 같은 안전장치, 자가 점검 기준 등.
효과를 약속하지 말고, 확인하는 방법을 주어라.

반드시 JSON만 출력해라. 형식:
{ "headline_draft": "다시 쓴 문구 한 줄", "reason": "무엇을 어떻게 바꿨는지 한 줄" }`

function aspectBlock(a: AspectRow): string {
  return [
    `- 속성명: ${a.name}`,
    `- 레이어: ${a.aspect_layer ?? '-'} / 사분면: ${a.quadrant ?? '-'}`,
    `- 중요도: ${a.importance ?? '-'} / 만족도: ${a.satisfaction ?? '-'} / 기회점수: ${a.opportunity_score ?? '-'}`,
    `- 귀인: ${a.attribution ?? '(없음 — 불만이 아닌 속성)'} / 인지시점: ${a.pain_timing ?? '-'}`,
    `- 페르소나: ${a.persona_role ?? '-'} / 세그먼트축: ${a.is_segmentation_axis ? '예' : '아니오'}`,
    `- 가치실현빈도: ${a.value_realization_frequency ?? '-'}`,
    `- 판단근거: ${a.notes ?? '-'}`,
  ].join('\n')
}

function buildUserPrompt(plan: AnglePlan, project: ProjectRow, candidates: AngleType[]): string {
  const head = [
    '## 분석 대상',
    `- 경쟁사 상품 URL: ${project.competitor_url}`,
    `- 내 상품 한 줄 소개: ${project.product_elevator_pitch}`,
    `- 분석 목적: ${project.purpose} — ${PURPOSE_TONE[project.purpose] ?? ''}`,
    `- 시장 성숙도: ${project.maturity_stage ?? '미판정'}단계 (${project.maturity_notes ?? '-'})`,
    '',
    '## 배정',
    `- 배정된 앵글 유형: ${plan.angleType}`,
    `- 선택 가능한 유형: ${candidates.join(', ')} (이 밖으로 나가지 마라)`,
    `- 산출물 유형(output_type): ${plan.outputType}`,
    `- 배정 근거: ${plan.rule}`,
    '',
  ]

  if (plan.groupedAspects?.length) {
    head.push('## 대상 속성들 (기본기 묶음)')
    for (const a of plan.groupedAspects) head.push(aspectBlock(a), '')
    head.push('위 속성들은 "있어도 차별화되지 않지만 없으면 탈락하는 기본기"다.')
    head.push('개별 소구 카피가 아니라, 반드시 충족해야 할 기본 사양을 한 줄로 요약해라.')
  } else {
    head.push('## 대상 속성')
    head.push(aspectBlock(plan.groupedAspects?.[0] ?? ({} as AspectRow)))
  }
  return head.join('\n')
}

// ── 앵글 1건 생성 (LLM 2회까지: 생성 → 필요 시 재작성) ───────────
type GeneratedAngle = {
  plan: AnglePlan
  angleType: AngleType
  headline: string
  verdict: SubstantiationVerdict
  reason: string
  rewritten: boolean
  rewriteReason?: string
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

async function generateAngle(
  provider: LlmProvider,
  plan: AnglePlan,
  project: ProjectRow,
  aspectsById: Map<string, AspectRow>,
): Promise<GeneratedAngle> {
  // 규칙으로 확정된 유형은 후보를 1개로 고정하고, 4순위(기본값)일 때만 성숙도 후보군을 준다.
  const candidates = plan.rule.startsWith('4순위')
    ? defaultCandidates(project.maturity_stage)
    : [plan.angleType]

  const target = plan.groupedAspects ?? (plan.aspectId ? [aspectsById.get(plan.aspectId)!] : [])
  const userPrompt = buildUserPrompt({ ...plan, groupedAspects: target }, project, candidates)

  const parsed = await callLlmJson(provider, SYSTEM_PROMPT, userPrompt, 'angle:generate')

  const angleType = pickEnum<AngleType>(parsed.angle_type, ANGLE_TYPES) ?? plan.angleType
  let headline = typeof parsed.headline_draft === 'string' ? parsed.headline_draft.trim() : ''
  const verdict =
    pickEnum<SubstantiationVerdict>(parsed.substantiation_verdict, SUBSTANTIATION_VERDICTS) ??
    'EXPERIENTIAL'
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''

  // 실증 게이트: 근거 없는 성능 주장이면 성능 주장을 빼고 불안 해소 장치로 다시 쓴다.
  let rewritten = false
  let rewriteReason: string | undefined
  if (verdict === 'UNSUBSTANTIATED') {
    const rw = await callLlmJson(
      provider,
      REWRITE_SYSTEM_PROMPT,
      [
        `## 원래 문구 (UNSUBSTANTIATED 판정)`,
        headline,
        '',
        `## 판정 사유`,
        reason || '(없음)',
        '',
        `## 맥락`,
        userPrompt,
      ].join('\n'),
      'angle:rewrite',
    )
    const newHeadline = typeof rw.headline_draft === 'string' ? rw.headline_draft.trim() : ''
    if (newHeadline) {
      headline = newHeadline
      rewritten = true
      rewriteReason = typeof rw.reason === 'string' ? rw.reason.trim() : ''
    }
  }

  return { plan, angleType, headline, verdict, reason, rewritten, rewriteReason }
}

/** 동시 실행 상한을 두고 순서를 보존하며 처리한다. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ── POST: 앵글 생성 ──────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const provider = resolveProvider()
  const requiredKey = requiredKeyFor(provider)
  if (!process.env[requiredKey]) {
    console.error(`[analyze/angle] ${requiredKey} is not set (provider=${provider})`)
    return NextResponse.json({ error: '분석 엔진이 설정되지 않았습니다.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, maturity_stage, maturity_notes')
    .eq('id', projectId)
    .single<ProjectRow>()

  if (projectError || !project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (project.status !== 'reviewed') {
    return NextResponse.json(
      { error: '검수 완료 후에만 앵글을 생성할 수 있습니다.', status: project.status },
      { status: 400 },
    )
  }

  const { data: aspects, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, aspect_layer, importance, satisfaction, opportunity_score, quadrant, attribution, pain_timing, persona_role, is_segmentation_axis, value_realization_frequency, notes')
    .eq('project_id', projectId)
    .eq('human_confirmed', true)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .returns<AspectRow[]>()

  if (aspectsError) {
    return NextResponse.json({ error: '속성 조회 실패' }, { status: 500 })
  }
  const list = aspects ?? []
  if (list.length === 0) {
    return NextResponse.json({ error: '검수 완료된 속성이 없습니다.' }, { status: 400 })
  }

  const aspectsById = new Map(list.map(a => [a.id, a]))

  // 1. 설계도 확정 (LLM 호출 전에 코드가 규칙으로 결정)
  const plans: AnglePlan[] = []
  const skipped: { aspect: AspectRow; reason: string }[] = []

  for (const a of list.filter(x => x.quadrant === 'DIFFERENTIATOR')) {
    const p = planForDifferentiator(a, project)
    if ('skip' in p) {
      // 카피에서 빼고 차기 제품 개선 과제로 1건 남긴다.
      skipped.push({ aspect: a, reason: 'detail_page + POST_PURCHASE' })
      plans.push({
        aspectId: a.id, aspectName: a.name,
        angleType: 'PAS', // PRODUCT_SPEC 은 광고 앵글이 아니라 메모라 유형은 형식상 값
        outputType: 'PRODUCT_SPEC',
        rule: 'detail_page + POST_PURCHASE → 카피 제외, 제품 개선 과제',
        groupedAspects: [a],
      })
      continue
    }
    plans.push({ ...p, groupedAspects: [a] })
  }

  // 2. TABLE_STAKES 는 프로젝트당 1건으로 묶는다 (BASELINE_SPEC)
  const tableStakes = list.filter(a => a.quadrant === 'TABLE_STAKES')
  if (tableStakes.length > 0) {
    plans.push({
      // analysis_angles.aspect_id 는 nullable 이고 여러 속성을 묶으므로 null 로 둔다.
      aspectId: null,
      aspectName: `기본기 ${tableStakes.length}건 묶음`,
      angleType: 'COMPARISON',
      outputType: 'BASELINE_SPEC',
      rule: 'TABLE_STAKES 묶음',
      groupedAspects: tableStakes,
    })
  }

  if (plans.length === 0) {
    return NextResponse.json(
      { error: '앵글을 만들 속성이 없습니다. (DIFFERENTIATOR/TABLE_STAKES 없음)' },
      { status: 400 },
    )
  }

  // 3. LLM 호출
  const startedAt = Date.now()
  let generated: GeneratedAngle[]
  try {
    generated = await mapWithLimit(plans, CONCURRENCY, p =>
      generateAngle(provider, p, project, aspectsById),
    )
  } catch (e) {
    const detail = describeFailure(e)
    console.error(`[analyze/angle] project=${projectId} generation failed: ${detail}`)
    return NextResponse.json({ error: `앵글 생성에 실패했습니다: ${detail}` }, { status: 502 })
  }
  console.log(
    `[analyze/angle] project=${projectId} provider=${provider} ${plans.length}건 ${Date.now() - startedAt}ms`,
  )

  // 4. 기존 앵글 교체 후 저장 (재실행 시 중복 누적 방지)
  const { error: deleteError } = await supabase
    .from('analysis_angles')
    .delete()
    .eq('project_id', projectId)
  if (deleteError) {
    return NextResponse.json({ error: `기존 앵글 삭제 실패: ${deleteError.message}` }, { status: 500 })
  }

  const rows = generated.map(g => ({
    project_id: projectId,
    aspect_id: g.plan.aspectId,
    angle_type: g.angleType,
    output_type: g.plan.outputType,
    headline_draft: g.headline || null,
    substantiation_verdict: g.verdict,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('analysis_angles')
    .insert(rows)
    .select('id')

  if (insertError) {
    return NextResponse.json({ error: `앵글 저장 실패: ${insertError.message}` }, { status: 500 })
  }

  const { error: statusError } = await supabase
    .from('analysis_projects')
    .update({ status: 'angled' })
    .eq('id', projectId)

  if (statusError) {
    return NextResponse.json({ error: `상태 변경 실패: ${statusError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    status: 'angled',
    provider,
    angles_created: inserted?.length ?? 0,
    elapsed_ms: Date.now() - startedAt,
    gate_rewritten: generated.filter(g => g.rewritten).length,
    skipped_for_product_spec: skipped.map(s => s.aspect.name),
    angles: generated.map(g => ({
      aspect_id: g.plan.aspectId,
      aspect_name: g.plan.aspectName,
      angle_type: g.angleType,
      output_type: g.plan.outputType,
      rule: g.plan.rule,
      headline_draft: g.headline,
      substantiation_verdict: g.verdict,
      reason: g.reason,
      rewritten: g.rewritten,
      ...(g.rewriteReason ? { rewrite_reason: g.rewriteReason } : {}),
    })),
  })
}

// ── GET: 생성된 앵글 목록 ────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, status, purpose, maturity_stage')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: angles, error } = await supabase
    .from('analysis_angles')
    .select('id, aspect_id, angle_type, output_type, headline_draft, substantiation_verdict, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: '앵글 조회 실패' }, { status: 500 })
  }

  // 앵글에 붙은 속성 이름을 같이 돌려준다 (화면에서 바로 쓰기 위함)
  const { data: aspects } = await supabase
    .from('analysis_aspects')
    .select('id, name, quadrant')
    .eq('project_id', projectId)
  const nameById = new Map((aspects ?? []).map(a => [a.id, a.name]))

  return NextResponse.json({
    project,
    angles: (angles ?? []).map(a => ({
      ...a,
      aspect_name: a.aspect_id ? (nameById.get(a.aspect_id) ?? null) : null,
    })),
    count: angles?.length ?? 0,
  })
}
