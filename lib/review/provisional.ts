// B레인 ① — 제품 후보 → "임시(provisional) 등록" 대상 선별. 순수 함수만. DB·파일을 건드리지 않는다.
//
// 남헌 v69(2026-10-13): 기존 "영역당 하루 3개·사람이 승인 시트에 Y" 규칙을 자동 임시 등록으로 대체한다. 이 파일은 그 첫 단계(후보 추출 → 선별)이고,
// **꺼진 상태로 출하된다** — scripts/provisional-register.mjs 가 리포 변수 PROVISIONAL_REGISTER_ENABLED=true 일 때만 파일을 쓴다. 등록(INSERT)·승격·폐기는 ② 단계다.
//
// 임시 표식(새 DDL 없음): analysis_projects.area_rule_ver = 'prov-v1'(승격하면 'prov-v1:promoted'), area_basis = 'source'(CHECK 어휘 label|slug|name|source|manual).
//
// ⚠️ 3상태(§7.1): 못 읽은 후보 필드(area·tier 없음)는 '채택'으로 접지 않고 건너뛰어 사유를 센다.

export const PROV_RULE_VER = 'prov-v1'
/** 하루 영역당 신규 임시 등록 상한(남헌 v69 B레인 — 초기 10). */
export const PROV_AREA_CAP = 10
/** 대표 영역 비율 문턱 — 근거 글의 이 비율 이상이 한 영역에 모일 때만(여러 영역에 흩어진 이름은 건너뛴다). */
export const PROV_MIN_AREA_SHARE = 0.6
/** 정규화 키가 이보다 짧으면 동음이의 위험(Loox·Judge.me 류)으로 건너뛴다. 정식 방어는 ② 단계의 관련성 비율이다. */
export const PROV_MIN_KEY_LEN = 4
/**
 * 플랫폼·이미 수집 중인 소스 이름 — 제품이 아니라 글이 올라오는 곳이다(실측 2026-10-14 드라이런: tistory·brunch 가 채택으로 올라옴).
 * 정규화 키 기준. 새 소스를 등록하면 여기에도 더한다(② 단계는 review_sources.key 에서 읽는다).
 */
export const PROV_PLATFORM_BLOCK: ReadonlySet<string> = new Set([
  'tistory', 'brunch', 'velog', 'naver', 'navercafe', 'naverblog', 'kakao', 'kakaotalk', 'medium', 'substack', 'wordpress', 'tumblr', 'blogger',
  'github', 'gitlab', 'youtube', 'reddit', 'twitter', 'facebook', 'instagram', 'linkedin', 'tiktok', 'discord', 'telegram', 'quora',
  'hackernews', 'producthunt', 'devto', 'indiehackers', 'disquiet', 'clien', 'okky', 'ppomppu', 'ruliweb', 'dcinside', 'fmkorea', 'theqoo',
  'danawa', 'appstore', 'googleplay', 'playstore', 'shopify', 'geeknews', 'yozm',
])

/** DB area_code CHECK 어휘 중 영역 ①~⑤ 만. design(임시)·notes·out-* 는 임시 등록 대상이 아니다. */
export const PROV_AREAS: ReadonlySet<string> = new Set(['1', '2', '3', '4', '5'])

export type CandidateRow = {
  key: string
  name: string
  /** product-name-candidates 상태: adopt | hold | rejected | benchmark */
  status: string
  area?: string | null
  areaShare?: number | null
  /** anchor | small | new */
  tier?: string | null
  posts?: number
  sources?: number
  score?: number
  refs?: unknown
}

export type SkipReason = 'platform' | 'lowercase_name' | 'not_adopt' | 'area_out' | 'area_share_low' | 'tier_anchor' | 'key_short' | 'blocked' | 'area_cap' | 'unreadable'

export type SelectOpts = {
  areaCap?: number
  /** 오늘 이미 임시 등록한 수(영역별). 상한에서 뺀다 — ② 단계가 DB 에서 읽어 넘긴다. */
  alreadyToday?: Record<string, number>
  /** 사람이 기각했거나 이미 등록된 키(정규화 키). */
  blocked?: ReadonlySet<string>
}

export type Selection = {
  picked: CandidateRow[]
  skipped: Record<SkipReason, number>
  byArea: Record<string, number>
}

/**
 * 입력 순서를 유지한 채 고른다(호출자가 점수순으로 정렬해 넘긴다 — product-name-candidates 가 이미 그렇게 준다).
 * 건너뛰는 순서 = not_adopt → unreadable(key·name·area·tier) → area_out → unreadable(areaShare) → tier_anchor → blocked → key_short → platform → lowercase_name → area_share_low → area_cap.
 * ponytail: 소문자로 시작하는 이름(npm·dbt·n8n)은 이 줄로는 못 들어온다 — 보수 쪽 거짓 음성. 필요해지면 허용 목록을 더한다.
 * 경쟁 기준점(tier anchor)은 임시 등록하지 않는다 — 기준점은 별도 소절·별도 한도다(pnc-v4).
 */
export function selectProvisional(rows: CandidateRow[], opts: SelectOpts = {}): Selection {
  const cap = opts.areaCap ?? PROV_AREA_CAP
  const skipped: Record<SkipReason, number> = { platform: 0, lowercase_name: 0, not_adopt: 0, area_out: 0, area_share_low: 0, tier_anchor: 0, key_short: 0, blocked: 0, area_cap: 0, unreadable: 0 }
  const byArea: Record<string, number> = {}
  const picked: CandidateRow[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.status !== 'adopt') { skipped.not_adopt++; continue }
    if (!r.key || !r.name || r.area == null || !r.tier) { skipped.unreadable++; continue }
    // 영역 판정을 비율 판독보다 먼저 — notes 영역 후보는 areaShare 가 의도적으로 null 이다(product-name-candidates). 영역 밖을 '못 읽음'으로 세지 않는다(§7.1).
    if (!PROV_AREAS.has(r.area)) { skipped.area_out++; continue }
    if (typeof r.areaShare !== 'number' || !Number.isFinite(r.areaShare)) { skipped.unreadable++; continue }
    if (r.tier === 'anchor') { skipped.tier_anchor++; continue }
    if (opts.blocked?.has(r.key) || seen.has(r.key)) { skipped.blocked++; continue }
    if (r.key.length < PROV_MIN_KEY_LEN) { skipped.key_short++; continue }
    if (PROV_PLATFORM_BLOCK.has(r.key)) { skipped.platform++; continue }
    // 라틴 문자로 시작하는 이름이 소문자로 시작하면 문장 속 일반 구("ask AI")·플랫폼 별칭일 가능성이 높다 — 제품명은 대개 대문자로 시작한다. 한글 등은 대상 아님.
    if (/^[a-z]/.test(r.name.trim())) { skipped.lowercase_name++; continue }
    if (r.areaShare < PROV_MIN_AREA_SHARE) { skipped.area_share_low++; continue }
    const used = (opts.alreadyToday?.[r.area] ?? 0) + (byArea[r.area] ?? 0)
    if (used >= cap) { skipped.area_cap++; continue }
    seen.add(r.key)
    byArea[r.area] = (byArea[r.area] ?? 0) + 1
    picked.push(r)
  }
  return { picked, skipped, byArea }
}
