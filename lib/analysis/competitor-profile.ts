// 경쟁사 프로필 — 순수 모듈(DB·시계·네트워크 없음). 프롬프트 · 파서 · 근거 해석 · 3상태 검증.
// DB·LLM 왕복은 competitor-profile-db.ts, 셀프테스트는 scripts/competitor-profile-selftest.mjs, 저장은 마이그 20260930000037.
//
// 남헌 2026-09-29 결정(경쟁사 프로필링 원칙을 기존 VOC 데이터만으로 이식):
//   1. 모든 판단에 원문 링크 — 원문별 URL 이 없는 소스(다나와·앱스토어 등)는 "소스 · 원문 id" 로 대신한다.
//   2. 경쟁사마다 같은 템플릿(SECTIONS) — At-a-Glance / Positioning / Pricing / Strengths·Weaknesses / Implications.
//   3. 날짜 붙은 스냅샷으로 버전 관리(재합성 시각이 곧 행이다).
//   4. extract 가 끝난 직후 생성(competitor-profile-db.ts · extract-run.ts 9단계).
//
// ★ 근거는 모델이 아니라 코드가 단다. 모델은 원문 번호([#n])만 돌려주고, 번호→input_id→URL 해석은 여기서 한다.
//   모르는 번호는 버리고, 근거가 하나도 안 남은 주장은 **버리고 센다**(dropped_claims) — 근거 없는 문장이
//   화면의 가장 믿음직한 자리에 앉는 것을 막는다(evidence-quotes.ts 와 같은 원칙).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'
import { parseJsonObject } from './llm.ts'
import { sourceLinkOf } from '../signals/feed.ts'

/** 프롬프트·검증 규칙을 바꾸면 올린다. 백필은 이 값과 다른 스냅샷만 다시 만든다. */
export const PROFILE_PROMPT_VERSION = 'cp-v1-2026-09-29'
export const PROFILE_MIGRATION = '20260930000037_competitor_profile_snapshots.sql'
/** 프롬프트에 싣는 원문 총량. extract(12만 자)보다 작게 — 요약 한 장에 그만큼 필요 없고, 프로젝트당 추가 시간이 이 값에 비례한다. */
export const PROFILE_MAX_CHARS_TOTAL = 60_000
export const PROFILE_MAX_CHARS_PER_INPUT = 4_000
export const CLAIM_MAX_CHARS = 200

export const SECTIONS = ['at_a_glance', 'positioning', 'pricing', 'strengths', 'weaknesses', 'implications'] as const
export type Section = (typeof SECTIONS)[number]
/** 비어 있으면 unverified 로 떨어지는 섹션. pricing·positioning 은 원문에 없을 수 있다. */
export const REQUIRED_SECTIONS: readonly Section[] = ['at_a_glance', 'strengths', 'weaknesses', 'implications']

export const SECTION_LABEL: Record<Section, string> = {
  at_a_glance: '한눈에 (At-a-Glance)',
  positioning: '포지셔닝',
  pricing: '가격 언급',
  strengths: '강점',
  weaknesses: '약점',
  implications: '시사점 — 1인 SaaS 창업가·판매자에게',
}

export type ProfileStatus = 'ok' | 'unverified' | 'failed'

export interface ProfileInput {
  id: string
  source_key: string | null
  /** review_sources.display_name. 없으면 source_key, 그것도 없으면 "직접 입력". */
  source_name?: string | null
  raw_text: string | null
  /** review_fingerprints.product_ref — 다나와 pcode · YouTube `v:<id>`. 링크 재료. */
  product_ref?: string | null
  created_at?: string | null
  collected_at?: string | null
}

export interface EvidenceRef {
  input_id: string
  /** 화면 표시. "Hacker News · 3f2a1c9b" 꼴 — URL 이 없는 소스도 이걸로 원문을 찾는다. */
  label: string
  /** 원문을 볼 수 있는 URL. 만들 수 없으면 null(지어내지 않는다). */
  link: string | null
}

export interface Claim {
  claim: string
  evidence: EvidenceRef[]
}

export type ProfileSections = Record<Section, Claim[]>

// ── 근거 해석 ─────────────────────────────────────────────────────────────

const PH_HEAD = /^\[Product Hunt 댓글 · ([a-z0-9-]+)\]/

/** 원문 1건의 링크. signals/feed.ts sourceLinkOf(HN 스레드·YouTube 영상·다나와 상품) + Product Hunt 글. 그 밖은 null. */
export function evidenceLinkOf(input: Pick<ProfileInput, 'source_key' | 'raw_text' | 'product_ref'>): string | null {
  if (input.source_key === 'producthunt') {
    const m = PH_HEAD.exec(input.raw_text ?? '')
    return m ? `https://www.producthunt.com/posts/${m[1]}` : null
  }
  return sourceLinkOf(input.source_key, input.raw_text, input.product_ref ?? null)
}

export function evidenceRefOf(input: ProfileInput): EvidenceRef {
  const source = (input.source_name ?? input.source_key ?? '').trim() || '직접 입력'
  return { input_id: input.id, label: `${source} · ${input.id.slice(0, 8)}`, link: evidenceLinkOf(input) }
}

// ── 프롬프트 ──────────────────────────────────────────────────────────────

export const PROFILE_SYSTEM_PROMPT = [
  '너는 경쟁사 프로필 작성자다. 입력은 한 제품(경쟁사·비교 대상)에 대한 리뷰·VOC 원문 여러 건이고, 각 원문 앞에 [#번호] 가 붙어 있다.',
  UNTRUSTED_INPUT_NOTICE,
  '',
  '아래 여섯 섹션을 채워라. 각 섹션은 주장(claim) 목록이고, **모든 주장은 근거가 된 원문 번호(refs)를 1개 이상** 단다.',
  '원문에 근거가 없는 주장은 쓰지 마라 — 근거 번호가 없거나 틀린 주장은 코드가 버린다.',
  '- at_a_glance: 이 제품이 무엇이고 누가 어떤 상황에서 쓰는가. 2~4개.',
  '- positioning: 리뷰어들이 이 제품을 무엇과 비교하고 어떤 자리로 보는가(대체재·전환 전후·"~보다 낫다"). 0~4개.',
  '- pricing: 가격·요금제·무료 티어·비용 대비 가치 언급. 원문에 없으면 빈 배열 [].',
  '- strengths: 반복해서 칭찬받는 점. 2~5개.',
  '- weaknesses: 반복해서 불만·이탈 사유로 나오는 점. 2~5개.',
  '- implications: 1인 SaaS 창업가·판매자가 이 경쟁사 옆에서 취할 수 있는 시사점 — 어떤 빈틈을 공략할지, 무엇은 따라가야 하는지. 2~4개. 시사점도 근거 원문 번호를 단다.',
  '',
  '규칙:',
  '- 원문에 없는 사실을 지어내지 않는다. 한 건에서만 나온 것은 "한 리뷰에서" 처럼 정도를 적는다.',
  '- 한국어로 쓴다. 제품명·서비스명·고유명사는 원문 표기 그대로.',
  `- 각 주장은 한 문장, ${CLAIM_MAX_CHARS}자 이내. 마크다운 없이.`,
  '',
  '반드시 JSON 하나만 출력한다. 형식:',
  '{"sections":{"at_a_glance":[{"claim":"...","refs":[1,4]}],"positioning":[],"pricing":[],"strengths":[],"weaknesses":[],"implications":[]}}',
].join('\n')

export interface ProfileProject {
  product_elevator_pitch: string | null
  competitor_url?: string | null
  purpose?: string | null
  business_model?: string | null
}

export interface PromptBuild {
  system: string
  user: string
  /** [#n] → 원문. 파서가 refs 를 이걸로 해석한다. */
  refIndex: Map<number, ProfileInput>
}

/** 원문마다 [#n] 번호를 붙여 사용자 프롬프트를 만든다. texts 는 selectInputs 가 자른 본문(input 과 같은 순서). */
export function buildProfilePrompt(
  project: ProfileProject,
  selected: readonly { input: ProfileInput; text: string }[],
  totals: { collected: number; irrelevant: number },
): PromptBuild {
  const refIndex = new Map<number, ProfileInput>()
  const parts = selected.map((s, i) => {
    refIndex.set(i + 1, s.input)
    return `### [#${i + 1}] (${s.input.source_name ?? s.input.source_key ?? '직접 입력'})\n${s.text}`
  })
  const user = [
    '## 분석 대상(경쟁사·비교 대상)',
    `- 제품 한 줄 소개: ${project.product_elevator_pitch ?? '(없음)'}`,
    `- URL: ${project.competitor_url ?? '(없음)'}`,
    `- 사업 모델: ${project.business_model ?? '(미기재)'}`,
    project.purpose ? `- 분석 목적: ${project.purpose}` : null,
    '',
    `## 원문 ${parts.length}건 (수집 ${totals.collected}건 중 관련도 상위 · 목적 무관 판정 ${totals.irrelevant}건 제외)`,
    ...parts,
    '',
    '위 원문만 근거로 여섯 섹션을 채우고, 지정된 JSON 하나만 출력해라.',
  ].filter((l): l is string => l !== null).join('\n')
  return { system: PROFILE_SYSTEM_PROMPT, user, refIndex }
}

// ── 파서 · 해석 ──────────────────────────────────────────────────────────────

export interface ResolvedProfile {
  sections: ProfileSections
  /** 근거가 하나도 안 남아 버린 주장 수(0 과 "안 세었다"를 가른다). */
  droppedClaims: number
  /** 표에 없는 번호를 단 횟수. */
  unknownRefs: number
  /** 원문 안에서 주장에 쓰인 원문 수. */
  citedInputs: number
}

const emptySections = (): ProfileSections =>
  Object.fromEntries(SECTIONS.map((s) => [s, [] as Claim[]])) as unknown as ProfileSections

/**
 * 모델 출력(JSON 문자열) → 섹션별 주장 + 코드가 단 근거.
 * 던지지 않는다 — JSON 이 아니면 주장 0개로 돌아오고 validateProfile 이 failed 로 판정한다.
 */
export function resolveProfile(raw: string, refIndex: ReadonlyMap<number, ProfileInput>): ResolvedProfile {
  const sections = emptySections()
  let droppedClaims = 0
  let unknownRefs = 0
  const cited = new Set<string>()

  let parsed: Record<string, unknown>
  try {
    parsed = parseJsonObject(raw)
  } catch {
    return { sections, droppedClaims, unknownRefs, citedInputs: 0 }
  }
  const src = (parsed.sections && typeof parsed.sections === 'object' ? parsed.sections : parsed) as Record<string, unknown>

  for (const section of SECTIONS) {
    const list = Array.isArray(src[section]) ? (src[section] as unknown[]) : []
    const seen = new Set<string>()
    for (const item of list) {
      const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const claim = typeof o.claim === 'string' ? o.claim.replace(/\s+/g, ' ').trim().slice(0, CLAIM_MAX_CHARS) : ''
      if (!claim || seen.has(claim)) continue
      const refs = Array.isArray(o.refs) ? o.refs : []
      const evidence: EvidenceRef[] = []
      const dedupe = new Set<string>()
      for (const r of refs) {
        const n = typeof r === 'number' ? r : Number(String(r).replace(/^#/, ''))
        const input = Number.isInteger(n) ? refIndex.get(n) : undefined
        if (!input) { unknownRefs += 1; continue }
        if (dedupe.has(input.id)) continue
        dedupe.add(input.id)
        evidence.push(evidenceRefOf(input))
      }
      if (evidence.length === 0) { droppedClaims += 1; continue }
      seen.add(claim)
      for (const e of evidence) cited.add(e.input_id)
      sections[section].push({ claim, evidence })
    }
  }
  return { sections, droppedClaims, unknownRefs, citedInputs: cited.size }
}

// ── 3상태 검증 ────────────────────────────────────────────────────────────────
// ok         — 필수 섹션이 전부 차 있고 버린 주장이 없다
// unverified — 내용은 있지만 필수 섹션이 비었거나 근거 없는 주장을 버렸다(저장·표시하되 표식을 단다)
// failed     — 쓸 만한 주장이 하나도 없다(호출 실패·JSON 아님 포함). 본문 없이 사유만 남는다.

export interface Verdict { status: ProfileStatus; reason: string | null }

export function validateProfile(r: ResolvedProfile): Verdict {
  const total = SECTIONS.reduce((n, s) => n + r.sections[s].length, 0)
  if (total === 0) return { status: 'failed', reason: r.droppedClaims > 0 ? `주장 ${r.droppedClaims}개 전부 근거 번호가 없어 버렸다` : '해석 가능한 주장이 0개' }
  const missing = REQUIRED_SECTIONS.filter((s) => r.sections[s].length === 0)
  const reasons: string[] = []
  if (missing.length > 0) reasons.push(`빈 필수 섹션: ${missing.join(', ')}`)
  if (r.droppedClaims > 0) reasons.push(`근거 없는 주장 ${r.droppedClaims}개 버림`)
  if (r.unknownRefs > 0) reasons.push(`모르는 원문 번호 ${r.unknownRefs}회`)
  return reasons.length > 0 ? { status: 'unverified', reason: reasons.join(' · ') } : { status: 'ok', reason: null }
}

/** 화면·백필이 같은 판단을 쓴다 — 이 버전의 스냅샷이 없으면 만든다. failed 도 "있는 것"으로 본다(재시도는 --force). */
export function needsProfile(latest: { prompt_version: string } | null | undefined, version = PROFILE_PROMPT_VERSION): boolean {
  return !latest || latest.prompt_version !== version
}

/** 사용한 원문의 시간 창(created_at 기준 min/max). 없으면 null. */
export function inputWindow(inputs: readonly Pick<ProfileInput, 'created_at' | 'collected_at'>[]): { from: string | null; to: string | null } {
  const ts = inputs.map((i) => Date.parse(i.created_at ?? i.collected_at ?? '')).filter((n) => Number.isFinite(n))
  if (ts.length === 0) return { from: null, to: null }
  return { from: new Date(Math.min(...ts)).toISOString(), to: new Date(Math.max(...ts)).toISOString() }
}
