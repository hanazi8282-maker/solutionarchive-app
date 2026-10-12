// 소비재 자료 태그(남헌 v61) — "소비재 관련 판정은 관련 없음으로 취급하고 소비재 자료로 태그한다".
//
// 태그 = consumer_material_tags 표의 행(마이그 20261015000010, insert-only). 기존 판정(review_relevance_verdicts)은 건드리지 않는다.
//   · 판정 대기열(relevance-pending)은 태그된 입력을 미판정에서 뺀다 — 이미 있는 판정 행은 그대로.
//   · 하위 사용처(extract·경쟁사 프로필)는 relevance-judge.ts dropIrrelevant 한 곳에서 태그를 '관련 없음'으로 읽는다
//     (우선순위: 사람 채점 > 태그 > LLM 판정).
//   · 재개 스위치: env RELEVANCE_SKIP_CONSUMER=off → 태그를 아예 읽지 않는다(코드 동작이 이 PR 이전과 같다). 태그 행은 남는다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/consumer-material-selftest.mjs.

import { fetchAllPages } from './relevance-judge-all.ts'

/** 태그 대상 영역(analysis_projects.area_code) · 소스(유튜브 — 영상 19개 전부 소비재, 남헌 v61). */
export const CONSUMER_AREA = 'out-consumer'
export const CONSUMER_SOURCES: readonly string[] = ['youtube']
/** 태그 규칙 버전 — 규칙을 바꾸면 올린다(행마다 남는다). */
export const CONSUMER_RULE_VER = 'cm-v1'
/** 판정 1건 출력 비용 추정(달러) — 절감액 = 미판정 태그 수 × 이 값. */
export const JUDGE_COST_PER_INPUT_USD = 0.0028

/** 재개 스위치. 기본 on, 'off' 일 때만 끈다(대소문자·공백 무시). 오타는 on 으로 남는다 — 끄는 쪽은 명시적이어야 한다. */
export const consumerSkipEnabled = (raw: string | undefined = process.env.RELEVANCE_SKIP_CONSUMER): boolean =>
  (raw ?? '').trim().toLowerCase() !== 'off'

/** 태그 사유(정의 한 벌). 영역 우선, 그다음 소스. 해당 없으면 null. */
export function consumerReasonOf(projectArea: string | null | undefined, sourceKey: string | null | undefined): string | null {
  if (projectArea === CONSUMER_AREA) return `area:${CONSUMER_AREA}`
  if (sourceKey && CONSUMER_SOURCES.includes(sourceKey)) return `source:${sourceKey}`
  return null
}

/** 표가 아직 없다(마이그 미적용) — 42P01(Postgres) · PGRST205(PostgREST 스키마 캐시). */
export const isMissingTable = (e: { code?: string } | null | undefined): boolean => e?.code === '42P01' || e?.code === 'PGRST205'

/**
 * 한 프로젝트의 태그된 input_id.
 *   · 스위치 off → 빈 Set(조회 안 함 — 원래 동작)
 *   · 표 없음(마이그 미적용) → 빈 Set + 경고(원래 동작)
 *   · 그 밖 조회 실패·상한 초과 → null(확인 불가 — 호출부가 정한다, §7.1)
 */
export async function loadConsumerTagged(
  supabase: any,
  projectId: string,
  o: { enabled?: boolean; warn?: (m: string) => void } = {},
): Promise<Set<string> | null> {
  if (!(o.enabled ?? consumerSkipEnabled())) return new Set()
  let got
  try {
    got = await fetchAllPages<{ input_id: string }>(() =>
      supabase.from('consumer_material_tags').select('input_id').eq('project_id', projectId).order('input_id', { ascending: true }))
  } catch (e) {
    // 던지는 클라이언트(목·네트워크 예외)도 오류와 같이 '확인 불가'(null). 대기열은 null 이면 그 프로젝트를 건너뛴다(fail-closed 유지),
    // extract·프로필은 태그 없이 원래대로 간다.
    o.warn?.(`소비재 태그 조회 예외 project=${projectId}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
  if (isMissingTable(got.error)) {
    o.warn?.('consumer_material_tags 표가 없다(마이그 20261015000010 미적용) — 소비재 태그 없이 원래대로 간다')
    return new Set()
  }
  if (got.error || got.truncated) return null
  return new Set((got.data ?? []).map((r) => r.input_id))
}

// ── 경계 사례 정의(읽기 전용 목록 — scripts/consumer-material-tag.mjs --boundary) ──
// A: out-consumer 프로젝트 안의 SaaS 글 — 출처가 창업가 소스(config/areas.json founder_sources)거나 본문에 SaaS 신호.
// B: SaaS 프로젝트(business_model='SAAS') 안의 소비재 글 — 출처가 CONSUMER_SOURCES 거나 본문에 소비재 신호.
// ponytail: 낱말 휴리스틱이라 정밀도가 낮다(사람이 훑는 후보 목록 용도). 정밀도가 필요해지면 LLM 분류로.
const SAAS_SIGNAL = /\b(saas|api|subscription|pricing|dashboard|integration|workspace|crm|plugin|onboarding)\b|구독|요금제|대시보드|연동|플러그인|무료\s?체험|팀\s?플랜|워크스페이스/i
const CONSUMER_SIGNAL = /배송|포장|택배|반품|사이즈|착용|피부|발림|흡수|향이|맛이|용량|세탁|샴푸|유산균|이어폰|충전기/

export function boundaryKindOf(
  project: { area_code?: string | null; business_model?: string | null },
  input: { source_key?: string | null; raw_text?: string | null },
  founderSources: readonly string[],
): 'A' | 'B' | null {
  const text = input.raw_text ?? ''
  const src = input.source_key ?? ''
  if (project.area_code === CONSUMER_AREA) return founderSources.includes(src) || SAAS_SIGNAL.test(text) ? 'A' : null
  if (project.business_model === 'SAAS') return CONSUMER_SOURCES.includes(src) || CONSUMER_SIGNAL.test(text) ? 'B' : null
  return null
}
