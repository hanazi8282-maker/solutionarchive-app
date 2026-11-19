// [v71cu 4-1] 사례 기반 맞춤 적용 문장 — "비슷한 사례" 3건을 이 고객의 단계·자원·병목에 맞춰 풀어 주는 층.
// 두 경로(기존 retrieveSimilar · 새 selectStoryFlow) 어느 쪽 사례에도 같은 프롬프트로 붙는다(비교 공정성). 순수 함수 + LLM 주입(askJson).
// 아직 결론서(compose.ts)에 연결하지 않는다 — 평가(scripts/story-flow-eval-pack.mjs --synth)에서 효과가 확인된 뒤 결정.
// 사고 방지선: verifySynthesis — 출력의 숫자·고유명이 사례·진단 글에 없으면 그 합성은 버린다(근거 없는 주장 0건).
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'

/** 진단(고객이 아는 자기 사정). situation 은 표시용 한국어 키(단계·손님·팀 크기 …). */
export type SynthDiagnosis = { pitch?: string; bottleneck: string; situation?: Record<string, string>; adversity?: string; story?: string }
/** 사례 한 건. quote_allowed=false 면 번역 인용을 프롬프트에 싣지 않는다(인용 금지 소스). */
export type SynthPick = { action?: string | null; result?: string | null; condition?: string | null; adversity?: string | null; quote_ko?: string | null; failed?: boolean; quote_allowed?: boolean }
export type SynthStep = { step: string; from_case: number; why: string }
export type SynthAvoid = { avoid: string; from_case: number; why: string }
export type Synthesis = { summary_for_you: string; do_this_week: SynthStep[]; dont_do: SynthAvoid[]; caveat: string }
export type SynthResult =
  | { status: 'ok'; value: Synthesis }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'unsupported'; unsupported: string[]; value: Synthesis }
export type AskJson = (o: { system: string; user: string }) => Promise<unknown>

export const SYNTH_LIMITS = { steps: 3, avoids: 2, summary: 700, item: 200, caveat: 300 } as const

export const SYNTH_SYSTEM = `당신은 소규모 창업자에게 "비슷한 사례"를 바탕으로 지금 이 고객이 할 일을 풀어 주는 조언가입니다.
${UNTRUSTED_INPUT_NOTICE}
입력은 <diagnosis>(고객 진단: 사업 설명·막힌 곳·단계·자원·고객 이야기 요약)와 <cases>(사례 1~N: 행동·결과·통하는 조건·겪은 어려움·번역 인용, 잘 안 풀린 사례 표시)입니다.
규칙:
1. 지어내기 금지 — 사례와 진단에 없는 사실·수치·도구 이름·회사 이름·고객 정보를 쓰지 않습니다. 숫자는 사례·진단에 적힌 숫자만 그대로 씁니다("이번 주"처럼 숫자 없이 쓰고, 새 숫자·횟수·목표치를 만들지 않습니다). 영어 낱말(도구·서비스 이름)도 사례·진단에 나온 것만 씁니다.
2. 인용 번호 필수 — do_this_week·dont_do 의 모든 항목에 from_case(사례 번호 1~N)를 답니다. 항목은 그 사례에 나온 행동·숫자·도구에서만 파생합니다.
3. do_this_week 는 최대 ${SYNTH_LIMITS.steps}개 — 1주 안에 시작할 수 있고, 진단의 단계·자원(팀 크기·매출 단계)에 맞는 것만. 큰 예산·채용·긴 개발이 필요한 일은 넣지 않습니다.
4. dont_do 는 최대 ${SYNTH_LIMITS.avoids}개 — 잘 안 풀린 사례가 있으면 거기서 뽑습니다. 없으면 사례의 조건이 진단과 어긋나는 점에서 뽑거나 빈 배열로 둡니다.
5. 사례가 진단과 크게 안 맞으면(손님·단계·막힌 곳이 다름) summary_for_you 에 그 사실을 쓰고 do_this_week 를 0~1개로 줄입니다. 억지로 맞추지 않습니다.
6. 인용 금지 — "인용: 금지"로 표시된 사례의 문장은 따옴표로 옮기지 않습니다. 인용 허용 사례도 번역 문장을 길게 옮기지 말고 요지만 씁니다.
7. summary_for_you: 이 고객 상황에 맞춘 3~4문장 — 왜 이 사례들이 지금 이 막힌 곳에서 의미 있는지. caveat: 사례가 진단과 안 맞는 점을 솔직히 1문장. 모두 합니다체.
출력은 JSON 하나만: {"summary_for_you":"","do_this_week":[{"step":"","from_case":1,"why":""}],"dont_do":[{"avoid":"","from_case":1,"why":""}],"caveat":""}`

const line = (k: string, v?: string | null) => (v && v.trim() ? [`- ${k}: ${v.replace(/\s+/g, ' ').trim()}`] : [])
/** 프롬프트 — system 은 고정(규칙 + 표준 경고), user 는 데이터 블록 두 개. 순수 함수. */
export function buildSynthesisPrompt(d: SynthDiagnosis, picks: SynthPick[]): { system: string; user: string } {
  const sit = Object.entries(d.situation ?? {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')
  const dx = ['<diagnosis>', ...line('사업 설명', d.pitch), ...line('막힌 곳', d.bottleneck), ...line('상황', sit), ...line('겪는 어려움', d.adversity), ...line('고객 이야기 요약', d.story), '</diagnosis>']
  const cs = picks.flatMap((p, i) => [`사례 ${i + 1}${p.failed ? ' (잘 안 풀린 경우)' : ''} [인용: ${p.quote_allowed ? '허용' : '금지'}]`,
    ...line('행동', p.action), ...line('결과', p.result), ...line('통하는 조건', p.condition), ...line('겪은 어려움', p.adversity),
    ...(p.quote_allowed ? line('번역 인용', p.quote_ko) : []), ''])
  return { system: SYNTH_SYSTEM, user: [...dx, '', '<cases>', ...cs, '</cases>'].join('\n') }
}

const str = (v: unknown, max: number): string | null => { const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return t && t.length <= max ? t : null }
/** 모델 출력 검사 — 빈 칸·길이 초과·개수 초과·from_case 범위 밖이면 실패(잘라서 살리지 않는다). n = 사례 수. */
export function parseSynthesis(raw: unknown, n: number): { ok: true; value: Synthesis } | { ok: false; error: string } {
  if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { return { ok: false, error: 'JSON 아님' } } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '객체 아님' }
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: '사례 없음' }
  const o = raw as Record<string, unknown>, L = SYNTH_LIMITS
  const summary = str(o.summary_for_you, L.summary), caveat = str(o.caveat, L.caveat)
  if (!summary) return { ok: false, error: 'summary_for_you 비었거나 너무 김' }
  if (!caveat) return { ok: false, error: 'caveat 비었거나 너무 김' }
  const list = <T>(key: string, textKey: string, max: number): T[] | string => {
    const xs = o[key]
    if (!Array.isArray(xs)) return `${key} 배열 아님`
    if (xs.length > max) return `${key} ${xs.length}개(최대 ${max})`
    const out: Record<string, unknown>[] = []
    for (const [i, x] of xs.entries()) {
      const r = (x ?? {}) as Record<string, unknown>, t = str(r[textKey], L.item), why = str(r.why, L.item), fc = Number(r.from_case)
      if (!t || !why) return `${key}[${i}] ${textKey}/why 비었거나 너무 김`
      if (!Number.isInteger(fc) || fc < 1 || fc > n) return `${key}[${i}] from_case ${String(r.from_case)} 범위 밖(1~${n})`
      out.push({ [textKey]: t, from_case: fc, why })
    }
    return out as T[]
  }
  const steps = list<SynthStep>('do_this_week', 'step', L.steps); if (typeof steps === 'string') return { ok: false, error: steps }
  const avoids = list<SynthAvoid>('dont_do', 'avoid', L.avoids); if (typeof avoids === 'string') return { ok: false, error: avoids }
  return { ok: true, value: { summary_for_you: summary, do_this_week: steps, dont_do: avoids, caveat } }
}

const NUM = /\d+(?:[.,]\d+)*/g
const LATIN = /[A-Za-z][A-Za-z0-9+#&.'-]*[A-Za-z0-9+#]/g   // 두 글자 이상(A/B 같은 낱글자는 이름으로 보지 않는다)
// ponytail: 한국어 고유명은 흔한 플랫폼 이름 목록으로만 잡는다(형태소 분석 없음). 새 이름이 새면 목록에 더한다.
export const KO_NAMES = ['네이버', '카카오', '쿠팡', '인스타그램', '유튜브', '틱톡', '당근', '토스', '배민', '배달의민족', '스마트스토어', '구글', '페이스북', '스레드', '노션', '슬랙', '링크드인', '레딧']
const normNum = (s: string) => s.replace(/,/g, '')
/** 출력 글의 숫자·고유명(영어 낱말·플랫폼 이름)이 사례(+진단) 글에 있는지. 없으면 그 목록 — 하나라도 있으면 실패. "사례 N" 참조 번호는 숫자로 세지 않는다. */
export function verifySynthesis(out: Synthesis, picks: SynthPick[], d?: SynthDiagnosis): { ok: boolean; unsupported: string[] } {
  const src = [...picks.flatMap((p) => [p.action, p.result, p.condition, p.adversity, p.quote_allowed ? p.quote_ko : null]),
    ...(d ? [d.pitch, d.bottleneck, d.adversity, d.story, ...Object.entries(d.situation ?? {}).flat()] : [])].filter(Boolean).join('\n')
  const text = [out.summary_for_you, out.caveat, ...out.do_this_week.flatMap((s) => [s.step, s.why]), ...out.dont_do.flatMap((s) => [s.avoid, s.why])].join('\n').replace(/사례\s*\d+/g, '')
  const nums = new Set((src.match(NUM) ?? []).map(normNum)), low = src.toLowerCase(), bad = new Set<string>()
  for (const m of text.match(NUM) ?? []) if (!nums.has(normNum(m))) bad.add(`숫자 "${m}"`)
  for (const w of text.match(LATIN) ?? []) if (!new RegExp(`(^|[^a-z0-9])${w.toLowerCase().replace(/[.+#&'-]/g, '\\$&')}($|[^a-z0-9])`).test(low)) bad.add(`이름 "${w}"`)
  for (const k of KO_NAMES) if (text.includes(k) && !src.includes(k)) bad.add(`이름 "${k}"`)
  return { ok: bad.size === 0, unsupported: [...bad] }
}

/** 한 칸 합성 — 사례가 없으면 건너뜀, 호출·형식 실패 = failed, 근거 없는 숫자·이름 = unsupported(그 합성은 쓰지 않는다). 한도 오류(StopRun)는 다시 던진다. */
export async function synthesize(d: SynthDiagnosis, picks: SynthPick[], askJson: AskJson): Promise<SynthResult> {
  if (!picks.length) return { status: 'skipped', reason: '제시된 사례 없음' }
  const { system, user } = buildSynthesisPrompt(d, picks)
  let raw: unknown
  try { raw = await askJson({ system, user }) } catch (e) {
    if ((e as Error)?.constructor?.name === 'StopRun') throw e
    return { status: 'failed', reason: `호출 실패: ${String((e as Error)?.message ?? e).slice(0, 160)}` }
  }
  const p = parseSynthesis(raw, picks.length)
  if (!p.ok) return { status: 'failed', reason: p.error }
  const v = verifySynthesis(p.value, picks, d)
  return v.ok ? { status: 'ok', value: p.value } : { status: 'unsupported', unsupported: v.unsupported, value: p.value }
}
