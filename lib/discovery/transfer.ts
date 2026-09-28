// 이식성 판정 — VOC 창을 통과한 SaaS 후보가 **1인·소규모 SaaS 창업가에게 옮겨 쓸 교훈**을 주는가.
// 순수 함수만(프롬프트 조립·응답 파싱·판정 합성). 네트워크·DB 없음 — LLM 호출은 discovery-run.mjs 가 한다.
//
// 왜 있나: VOC 창 상한이 500 → 50,000 으로 넓어진 뒤(2026-09-28) Stripe·Figma·Datadog 급이 창을 통과해
// 자동 적재됐다. 사람이 사후에 죽인 5건(Metabase·Retool·Superhuman·Tailscale·Fly.io)도 같은 결이다.
// hits 는 "분석할 거리가 있나"만 답하고 "우리 독자에게 쓸모 있나"는 못 답한다. 그 질문을 이 판정이 맡는다.
//
// ⚠️ **세 상태다: pass / fail / unverified.** 호출 실패·파싱 실패·모르는 제품·빈 교훈·뻔한 교훈은
//    전부 unverified(확인 불가)다. 절대 pass 로 접지 않는다(CLAUDE.md §7.1) — 자동 채택 경로라
//    pass 로 접으면 이 게이트가 없던 때와 같아진다.
//
// ⚠️ 제안 LLM 의 `why` 는 판정자에게 **주지 않는다.** 그 문장이 Tailscale·Retool·Superhuman 을
//    "소규모 팀 / 인디 출신"이라 적었다(2026-09-29 실측). 판정자는 이름·카테고리·홈페이지만 본다.
// ⚠️ 사람이 죽인 이름도 판정자에게 **주지 않는다.** 그건 제안 프롬프트의 반례로만 쓴다 —
//    판정자에게 주면 교정(calibration)이 정답지를 보고 푼 시험이 된다.

export type TransferState = 'pass' | 'fail' | 'unverified'
export type FoundingScale = 'solo' | 'small_team' | 'venture_scale' | 'unknown'
export type GateMode = 'on' | 'shadow'

export interface TransferResult {
  state: TransferState
  foundingScale: FoundingScale
  /** pass 일 때만 의미 있다. 1인 SaaS 창업가가 가져갈 구체적 교훈 한 줄. */
  lesson: string | null
  /** 판정 이유(또는 확인 불가 사유). 항상 채운다. */
  reason: string
}

/**
 * 기본 모드. 교정 결과(scripts/discovery-transfer-calibrate.mjs)가 정한다.
 * 규칙: 라벨 9건 중 ≥7 정답 **그리고** 유지(kept) 4건 중 기각 ≤1 이면 'on', 아니면 'shadow'.
 */
export const DEFAULT_GATE_MODE: GateMode = 'shadow'

const SCALES: FoundingScale[] = ['solo', 'small_team', 'venture_scale', 'unknown']

/** 교훈 최소 길이. 이보다 짧으면 "구체적 교훈"이 아니다. */
export const MIN_LESSON_CHARS = 15

/** 어느 제품에나 붙는 교훈. 이걸 받으면 판정자가 제품을 몰랐다는 뜻이다 → 확인 불가. */
const GENERIC_LESSONS = [
  '고객의 목소리를 들어라',
  '고객 피드백을 반영하라',
  '좋은 제품을 만들어라',
  '사용자 경험이 중요하다',
  '마케팅이 중요하다',
  '문제를 해결하라',
  '고객에게 집중하라',
].map(norm)

function norm(s: string): string {
  return s.replace(/[\s.,!?·'"“”‘’]/g, '').toLowerCase()
}

export function transferPrompt(c: { name: string; categoryHint?: string | null; homepageUrl?: string | null }): string {
  return [
    '너는 1인·소규모(3명 이하) SaaS 창업가를 위한 사례 아카이브의 편집자다.',
    '아래 제품을 고객 불만(VOC) 분석 대상으로 넣을지 판정한다.',
    '',
    `제품: ${c.name}`,
    c.categoryHint ? `카테고리: ${c.categoryHint}` : null,
    c.homepageUrl ? `홈페이지: ${c.homepageUrl}` : null,
    '',
    '판정 질문은 하나다: 이 제품의 사례(고객이 무엇에 만족·불만인지, 제품이 어떻게 이기거나 졌는지)에서',
    '1인 또는 3명 이하 팀의 SaaS 창업가가 **자기 제품에 다음 달 바로 옮겨 쓸 수 있는 구체적 교훈**이 나오는가.',
    '',
    '회사 규모는 판정 기준이 아니다. 큰 회사여도 교훈이 옮겨지면 pass, 작은 회사여도 안 옮겨지면 fail.',
    '',
    'fail — 사례의 핵심이 아래 중 하나에 달려 있으면:',
    '- 인프라·R&D·하드웨어·저수준 기술 자체가 경쟁력이다',
    '- 영업 조직·엔터프라이즈 계약·대형 파트너십·규제 라이선스·대규모 투자금이 있어야 재현된다',
    '- 거대한 기존 사용자 기반·네트워크 효과·생태계를 전제로 한다',
    '- 소규모 팀이 따라 하면 비용 구조가 성립하지 않는다',
    'pass — 좁은 문제 하나를 단순하게 푼 방식, 가격·과금 구조, 셀프서브 온보딩, 바이럴·콘텐츠·커뮤니티 유통,',
    '틈새 포지셔닝, 부트스트랩 운영처럼 1~3명이 실행할 수 있는 수로 교훈이 나오면.',
    '',
    '제품 홍보 문구를 믿지 마라. 네가 아는 이 제품의 실제 역사와 사용자 반응으로만 판단하라.',
    '이 이름의 제품을 확실히 모르면 추측하지 말고 verdict 를 "unknown" 으로 둬라.',
    '검색하지 마라. 도구를 쓰지 말고 바로 답하라.',
    '',
    '출력은 JSON 객체 하나만. 다른 말 붙이지 마라:',
    '{"verdict":"pass|fail|unknown","founding_scale":"solo|small_team|venture_scale|unknown",' +
      '"lesson":"1인 SaaS 창업가가 가져갈 구체적 교훈 한 줄(pass 일 때 필수)","reason":"판정 이유 한 줄"}',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

const unverified = (reason: string): TransferResult => ({ state: 'unverified', foundingScale: 'unknown', lesson: null, reason })

/**
 * 판정자 응답 → 세 상태. ```json 펜스나 앞뒤 설명이 붙어도 객체만 건진다.
 * 못 읽거나 모르면 unverified. pass 는 교훈이 구체적일 때만 pass 다.
 */
export function parseTransferVerdict(text: unknown): TransferResult {
  const s = String(text ?? '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return unverified('unparseable: JSON 객체 없음')
  let o: Record<string, unknown>
  try {
    const v = JSON.parse(s.slice(start, end + 1))
    if (!v || typeof v !== 'object' || Array.isArray(v)) return unverified('unparseable: 객체가 아니다')
    o = v as Record<string, unknown>
  } catch (e) {
    return unverified(`unparseable: ${(e as Error).message}`)
  }

  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')
  const verdict = str('verdict').toLowerCase()
  const scaleRaw = str('founding_scale') as FoundingScale
  const foundingScale: FoundingScale = SCALES.includes(scaleRaw) ? scaleRaw : 'unknown'
  const lesson = str('lesson')
  const reason = str('reason')

  if (verdict === 'fail') {
    return { state: 'fail', foundingScale, lesson: lesson || null, reason: reason || '(사유 미기재)' }
  }
  if (verdict === 'pass') {
    if (!lesson) return { ...unverified('empty_lesson: pass 인데 교훈이 없다'), foundingScale }
    const n = norm(lesson)
    if (lesson.length < MIN_LESSON_CHARS || GENERIC_LESSONS.includes(n)) {
      return { ...unverified(`generic_lesson: "${lesson}"`), foundingScale }
    }
    return { state: 'pass', foundingScale, lesson, reason: reason || '(사유 미기재)' }
  }
  if (verdict === 'unknown') return { ...unverified(`judge_unknown: ${reason || '판정자가 제품을 모른다'}`), foundingScale }
  return unverified(`bad_verdict: "${verdict}"`)
}

/**
 * `claude -p --output-format json` 실행 결과 → 판정. 호출 실패·타임아웃·is_error 는 전부 unverified.
 * 봉투가 아니면 원문을 그대로 파싱한다(parseTransferVerdict 가 앞뒤 설명을 견딘다).
 */
export function transferFromRun(r: { exitCode: number | null; timedOut?: boolean; stdout: string; stderr?: string }): TransferResult {
  if (r.exitCode !== 0) {
    return unverified(`judge_call_failed: exit ${r.exitCode}${r.timedOut ? ' (timeout)' : ''} ${(r.stderr ?? '').slice(0, 200)}`.trim())
  }
  let payload = r.stdout
  try {
    const env = JSON.parse(r.stdout)
    if (env && typeof env === 'object' && !Array.isArray(env)) {
      if (env.is_error === true) return unverified(`judge_call_failed: is_error ${String(env.result ?? '').slice(0, 200)}`)
      if (typeof env.result === 'string') payload = env.result
    }
  } catch {
    // 봉투가 아니었을 뿐이다.
  }
  return parseTransferVerdict(payload)
}

/** env 값 → 모드. 빈 문자열은 미지정(워크플로가 vars 없을 때 넘긴다). 모르는 값은 던진다 — 오타로 게이트가 조용히 바뀌면 안 된다. */
export function gateMode(raw: string | undefined | null): GateMode {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v) return DEFAULT_GATE_MODE
  if (v === 'on' || v === 'shadow') return v
  throw new Error(`DISCOVERY_TRANSFER_GATE 값이 이상하다: "${raw}" (on|shadow)`)
}

/**
 * VOC 판정 + 이식성 판정 → 최종 판정. VOC 가 accepted 가 아니면 손대지 않는다(판정자도 안 돈다).
 * - on:     fail → rejected/not_transferable, unverified → unverified/transfer_unverified, pass → accepted
 * - shadow: 판정만 기록하고 VOC 판정을 그대로 둔다(자동 적재는 오늘과 같다)
 */
export function applyTransfer(
  voc: { verdict: string; reason: string },
  t: TransferResult,
  mode: GateMode,
): { verdict: string; reason: string } {
  if (voc.verdict !== 'accepted' || mode === 'shadow') return voc
  if (t.state === 'fail') return { verdict: 'rejected', reason: `not_transferable: ${t.reason}` }
  if (t.state === 'unverified') return { verdict: 'unverified', reason: `transfer_unverified: ${t.reason}` }
  return voc
}
