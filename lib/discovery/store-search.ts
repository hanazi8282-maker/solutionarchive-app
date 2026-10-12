// 자율 발굴 C-1(남헌 v56 §C-1 · v61) — 순수 함수만. 네트워크·DB 는 scripts/store-search-discovery.mjs.
//
//   ④ 영역별 키워드 확장 + 국가·정렬 조합 자동 생성(v53 §5 2-A 잔여): combos()
//   ② 검색 기반 신규 제품 발견: 스토어별 공식 검색·목록 경로를 조합마다 만들고, 수집해도 되는지 storeGate() 가 가른다.
//
// 게이트(3상태 §7.1 — 못 읽은 것은 허용이 아니다):
//   review_sources 행이 없거나 · enabled 아님 · 약관 금지(prohibited·forbids_automation) · 약관 확인 불가(null·unverified) ·
//   robots 가 그 검색 경로를 허용으로 판정하지 않음 → 'suggest'(사람이 여는 링크만 낸다, 요청 0).
//   ⚠️ 소유자 robots 예외(override owner_2026-10-0x)는 **리뷰 수집 경로에 준 것**이라 검색 경로로 넓히지 않는다.
//   2026-10-12 실측으로 네 스토어 모두 검색 경로가 robots 금지라 전부 'suggest' 다(config/discovery-c1.json robots_rule).

export type Lang = 'ko' | 'en'
export const LANGS: readonly Lang[] = ['ko', 'en']

export type StoreDef = {
  source_key: string
  langs: Lang[]
  countries: boolean
  sorts: string[]
  search_url: string
  robots_rule?: string
}
export type DiscoveryC1Config = {
  rule_ver: string
  areas: Record<string, Partial<Record<Lang, string[]>>>
  modifiers: Record<Lang, string[]>
  countries: Record<Lang, string[]>
  stores: Record<string, StoreDef>
}

export type Combo = {
  area: string
  store: string
  lang: Lang
  keyword: string
  country: string | null
  sort: string | null
  url: string
}

/** 씨앗 × 수식어 → 키워드(씨앗 순서 유지, 대소문자 무시 중복 제거). */
export function expandKeywords(seeds: string[], modifiers: string[]): string[] {
  const out = new Map<string, string>()
  for (const s of seeds) {
    for (const m of modifiers.length ? modifiers : ['']) {
      const k = `${s.trim()} ${m.trim()}`.trim().replace(/\s+/g, ' ')
      if (k && !out.has(k.toLowerCase())) out.set(k.toLowerCase(), k)
    }
  }
  return [...out.values()]
}

/** 자리표시 치환. {q} 는 인코딩한다. 남는 자리표시가 있으면 던진다(조용히 깨진 링크를 내지 않는다). */
export function searchUrl(tpl: string, v: { q: string; country: string | null; sort: string | null; lang: Lang }): string {
  const url = tpl
    .replaceAll('{q}', encodeURIComponent(v.q))
    .replaceAll('{country}', v.country ?? '')
    .replaceAll('{COUNTRY}', (v.country ?? '').toUpperCase())
    .replaceAll('{hl}', v.lang)
    .replaceAll('{sort}', v.sort ?? '')
  if (/\{[a-zA-Z]+\}/.test(url)) throw new Error(`치환 안 된 자리표시: ${url}`)
  return url
}

/** 영역 하나의 (스토어 × 언어 × 키워드 × 국가 × 정렬) 조합. 순서 = 스토어 키 → 언어 → 키워드 → 국가 → 정렬(결정적). */
export function combos(cfg: DiscoveryC1Config, area: string): Combo[] {
  const seeds = cfg.areas[area]
  if (!seeds) return []
  const out: Combo[] = []
  for (const store of Object.keys(cfg.stores).sort()) {
    const def = cfg.stores[store]
    for (const lang of LANGS) {
      if (!def.langs.includes(lang)) continue
      for (const keyword of expandKeywords(seeds[lang] ?? [], cfg.modifiers[lang] ?? [''])) {
        for (const country of def.countries ? (cfg.countries[lang] ?? []) : [null]) {
          for (const sort of def.sorts.length ? def.sorts : [null]) {
            out.push({ area, store, lang, keyword, country, sort, url: searchUrl(def.search_url, { q: keyword, country, sort, lang }) })
          }
        }
      }
    }
  }
  return out
}

/**
 * 오늘 몫 = 조합 목록을 날짜로 돌려 cap 개(겹침 없이). 날마다 시작점이 cap 만큼 밀려 모든 조합이 차례로 나온다.
 * ponytail: 조합 수가 바뀌면 순환 위치가 흔들린다(빠지는 날·두 번 나오는 날이 생길 수 있다). 본 조합 대장이 필요해지면 그때.
 */
export function dailyPick<T>(list: T[], date: string, cap: number): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date 형식 YYYY-MM-DD: ${date}`)
  if (list.length === 0 || cap <= 0) return []
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
  const n = Math.min(cap, list.length)
  const start = (day * n) % list.length
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length])
}

export type SourcePolicy = { key: string; enabled?: boolean | null; tos_status?: string | null; robots_status?: string | null }
export type RobotsState = 'allowed' | 'disallowed' | 'unverified'
export type Gate = { mode: 'collect' | 'suggest'; reasons: string[] }

export const TOS_BLOCKING: ReadonlySet<string> = new Set(['prohibited', 'forbids_automation'])

/** 이 스토어 검색 경로를 기계가 요청해도 되나. 하나라도 못 지키면 suggest — 사유를 전부 남긴다. */
export function storeGate(src: SourcePolicy | undefined, robots: RobotsState | null): Gate {
  const reasons: string[] = []
  if (!src) reasons.push('review_sources 행 없음 — 약관 기록 확인 불가')
  else {
    if (src.enabled !== true) reasons.push('enabled 아님')
    const tos = src.tos_status ?? null
    if (tos !== null && TOS_BLOCKING.has(tos)) reasons.push(`약관 금지(tos_status=${tos})`)
    else if (tos === null || tos === 'unverified') reasons.push(`약관 확인 불가(tos_status=${tos ?? 'null'})`)
  }
  if (robots !== 'allowed') reasons.push(`검색 경로 robots ${robots ?? '미확인'}`)
  return { mode: reasons.length ? 'suggest' : 'collect', reasons }
}

export type StoreSearchResult = {
  date: string
  picks: Record<string, Combo[]>
  gates: Record<string, Gate>
  totalCombos: number
}

/** 보고 블록 한 줄. */
export function storeSearchLine(r: StoreSearchResult): string {
  const stores = Object.keys(r.gates).sort()
  const collect = stores.filter((s) => r.gates[s].mode === 'collect')
  const picked = Object.values(r.picks).reduce((n, l) => n + l.length, 0)
  const why = stores.filter((s) => r.gates[s].mode === 'suggest').map((s) => `${s}(${r.gates[s].reasons.join('·')})`).join(' / ')
  return `검색 발굴: 조합 ${r.totalCombos} · 오늘 제안 ${picked} · 수집 가능 스토어 ${collect.length}/${stores.length}${why ? ` · 제안만: ${why}` : ''}`
}

/** 사람용 제안 표(markdown). 영역별 오늘 몫, 링크는 사람이 연다. */
export function proposalMarkdown(r: StoreSearchResult, areaNames: Record<string, string>, ruleVer: string): string {
  const lines = [
    `# 검색 기반 신규 제품 발견 — 제안 ${r.date}`,
    '',
    `규칙 ${ruleVer} · scripts/store-search-discovery.mjs. 기계는 아래 링크를 열지 않았다(게이트 'suggest'). 새 제품을 보면 후보 대장 경로(product-name-candidates 승인 시트, 영역별 하루 3개)로 올린다.`,
    '',
    `- ${storeSearchLine(r)}`,
    '',
  ]
  for (const [area, list] of Object.entries(r.picks)) {
    lines.push(`## ${areaNames[area] ?? area}`, '')
    if (!list.length) lines.push('- (조합 없음)')
    for (const c of list) lines.push(`- [${c.store}] ${c.keyword} · ${c.lang}${c.country ? ` · ${c.country}` : ''}${c.sort ? ` · ${c.sort}` : ''} — ${r.gates[c.store]?.mode ?? '?'} — ${c.url}`)
    lines.push('')
  }
  return lines.join('\n')
}
