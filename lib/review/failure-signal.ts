// HN "망한 아이디어" 실패신호 탐지 — 순수 함수만.
//
// 배경(claude/cto-progress-audit-2026-09-10.md §5 백로그): 이미 수집 중인 HN
// 댓글 중에 창업자가 "이거 접었다"고 직접 말하는 글이 섞여 있다. 그게 무료
// 실패 사례 후보다. 다만 자동으로 failed_angles 에 넣지는 않는다 — 사람이
// 읽고 큐레이션할 **대기열**만 만든다(reports/hn-failed-idea-candidates.md).
//
// 건드리지 않는 것:
//   · `search_by_date` 엔드포인트 — 러너의 증분 종료가 시간 역순을 전제한다.
//   · 페이지네이션 — 상한·커서 계산 그대로다.
//   · 코멘트당 Firebase 상세조회 — 일일 요청 예산이 마른다. Algolia 응답의
//     comment_text(1단계)만 쓴다.
//   · DB — 이 경로는 아무것도 쓰지 않는다. reports/ 파일만 쓴다(§10.1 허용 경로).
//
// ⚠️ **단일 단어 매칭 금지.** 어드바이저에서 "직접"·"안내" 같은 범용 단어
//    하나로 무관한 사례가 걸리는 오염 사고가 났다(2026-09-11). 같은 실패를 새
//    경로로 다시 들이지 않는다 — 여기 문구는 전부 다단어 구문이고, 그래서
//    "failed" 하나로는 절대 걸리지 않는다.

/**
 * 기능 켜기/끄기. review_sources.enabled 킬스위치와 성격이 다르다 — 그쪽은
 * 수집 자체를 멈추는 운영 스위치고, 이건 이미 받아 둔 본문을 훑을지 말지다.
 * 수집 경로를 건드리지 않으므로 코드 레벨 상수 하나로 시작한다.
 */
export const FAILURE_SIGNAL_ENABLED = true

/**
 * 실패 신호 구문. **전부 다단어**여야 한다 — 단일 단어는 범용어 오염의 입구다.
 *
 * 표기 흔들림은 normalize 가 흡수한다: 대소문자, 굽은 따옴표(’), 하이픈
 * ("product-market" → "product market"), 연속 공백.
 *
 * ★ 다단어라고 다 안전한 게 아니다. 2026-09-16 실측(최근 7일, 12구문 전수):
 *   후보 42건 중 "창업자가 자기 제품을 접었다"는 진술은 **0건**이었고, 그중
 *   39건이 아래 세 구문에서 나왔다.
 *     · "shut it down"   14건 — 닫는 주체·대상이 아무것이나 된다(발전소·광고·AI)
 *     · "gave up on"     19건 — "쓰던 제품을 그만 썼다"(사용자 이탈)이지 폐업이 아니다
 *     · "didn't work out" 6건 — 어떤 결과에나 쓰는 관용구
 *   셋을 빼면 주당 후보가 3건대로 떨어진다. 대기열은 사람이 읽어야 의미가
 *   있으므로, 재현율보다 읽히는 양을 택했다. 빼기 전 목록은 git 이력에 있다.
 *
 * ⚠️ 구문을 새로 넣기 전에 `--sweep --dry --since-days 7` 로 **몇 건이 걸리고
 *    그중 몇 건이 진짜인지** 먼저 세라. 넣고 나서 대기열이 불어난 뒤에 세면
 *    이미 아무도 그 파일을 안 읽는다.
 */
export const FAILURE_PHRASES = [
  'we shut down',
  'we failed',
  'pivoted away from',
  'never found product market fit',
  "couldn't find pmf",
  'no product-market fit',
  'discontinued the product',
  'sunset the product',
  'turned out to be a failure',
] as const

/**
 * 비교용 정규화. 알파벳·숫자·아포스트로피만 남기고 나머지는 공백 한 칸으로.
 * 하이픈이 공백이 되므로 "product-market fit" 과 "product market fit" 이 같아진다.
 */
export function normalize(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

/**
 * 본문에서 걸린 실패 신호 구문들. 없으면 빈 배열.
 * 반환값은 원래 표기(FAILURE_PHRASES 그대로)라 보고에 그대로 쓸 수 있다.
 */
export function detectFailureSignals(text: string | null | undefined): string[] {
  if (!FAILURE_SIGNAL_ENABLED) return []
  const hay = normalize(text ?? '')
  if (!hay) return []
  return FAILURE_PHRASES.filter((p) => hay.includes(normalize(p)))
}

/** 한 구문당 받아 볼 댓글 수. hackernews.ts HITS_PER_PAGE 와 같은 값이다. */
export const SWEEP_HITS_PER_PAGE = 50

/**
 * 구문 하나를 찾는 Algolia 질의 URL (0페이지, 시간 역순).
 *
 * ⚠️ 이 질의는 **재현율용이지 판정용이 아니다.** Algolia 가 따옴표를 구문으로
 *    처리하든 낱말로 흩든, 걸러 내는 것은 detectFailureSignals 다. 질의가
 *    느슨하면 훑는 댓글이 늘 뿐 오탐이 새로 들어오지는 않는다. 반대 방향
 *    (질의를 판정으로 믿는 것)이 위험하다.
 *
 * ⚠️ `search` 가 아니라 `search_by_date` 다. 매일 도는 스윕이 원하는 것은
 *    관련도 상위가 아니라 **지난 실행 이후 새로 달린 댓글**이다.
 */
export function phraseSearchUrl(
  phrase: string,
  opts: { hitsPerPage?: number; sinceEpoch?: number } = {},
): string {
  const { hitsPerPage = SWEEP_HITS_PER_PAGE, sinceEpoch } = opts
  return (
    'https://hn.algolia.com/api/v1/search_by_date' +
    `?query=${encodeURIComponent(`"${phrase}"`)}` +
    '&tags=comment' +
    '&advancedSyntax=true' +
    `&hitsPerPage=${hitsPerPage}` +
    // 시간 하한이 없으면 "turned out to be a failure" 같은 희귀 구문이 2007년
    // 댓글까지 긁어 온다. 실측: 하한 없이 12구문을 훑으면 신규 후보가 420건이고,
    // 그건 사람이 읽는 대기열이 아니라 덤프다. 과거분이 필요하면 --since-days
    // 를 크게 줘서 사람이 한 번 백필한다.
    (sinceEpoch == null ? '' : `&numericFilters=${encodeURIComponent(`created_at_i>${sinceEpoch}`)}`)
  )
}

export interface HnCandidate {
  objectId: string
  phrases: string[]
  excerpt: string
  url: string
  /** 어떤 질의·타깃에서 나온 댓글인지. 나중에 사람이 맥락을 되짚는 유일한 단서다. */
  context: string
  storyTitle?: string | null
  author?: string | null
  createdAt?: string | null
}

/** 발췌 상한. 원문 전체를 옮기면 대기열 파일이 못 읽을 만큼 불어난다. */
export const EXCERPT_LIMIT = 500

export function excerpt(text: string, limit: number = EXCERPT_LIMIT): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim()
  return one.length <= limit ? one : one.slice(0, limit) + '…'
}

export function hnItemUrl(objectId: string): string {
  return `https://news.ycombinator.com/item?id=${objectId}`
}

/**
 * 이미 기록된 HN object_id 들. 대기열 파일 본문을 그대로 넣는다.
 * 블록 머리글(`## HN <id>`)에서 뽑는다 — 본문 발췌에 숫자가 섞여도 안 걸린다.
 */
export function existingObjectIds(md: string | null | undefined): Set<string> {
  const ids = new Set<string>()
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = /^##\s+HN\s+(\d+)\s*$/.exec(line.trim())
    if (m) ids.add(m[1])
  }
  return ids
}

/** 이미 파일에 있는 것과 이번 배치 안 중복을 둘 다 걸러 낸다. */
export function selectNewCandidates(existing: Set<string>, candidates: HnCandidate[]): HnCandidate[] {
  const seen = new Set(existing)
  const out: HnCandidate[] = []
  for (const c of candidates) {
    if (!c.objectId || seen.has(c.objectId)) continue
    seen.add(c.objectId)
    out.push(c)
  }
  return out
}

/** 후보 하나 → 대기열 파일에 붙일 마크다운 블록. */
export function formatCandidateBlock(c: HnCandidate): string {
  const lines = [
    `## HN ${c.objectId}`,
    '',
    // 사람이 결론을 적을 자리를 비워 둔다. 이 줄이 없으면 "아직 안 읽은 것"과
    // "읽고 기각한 것"이 파일에서 구분되지 않는다(§7.1 — 음성과 확인 불가).
    '- 판정: (미검토)',
    `- 매칭: ${c.phrases.map((p) => `\`${p}\``).join(', ')}`,
    `- 원본: ${c.url}`,
    `- 검색 맥락: ${c.context}`,
  ]
  if (c.storyTitle) lines.push(`- 스레드: ${c.storyTitle}`)
  if (c.author) lines.push(`- 작성자: ${c.author}`)
  if (c.createdAt) lines.push(`- 작성일: ${c.createdAt}`)
  lines.push('', `> ${excerpt(c.excerpt)}`, '')
  return lines.join('\n')
}

/** Algolia hit 하나 → 후보. 실패 신호가 없으면 null. */
export function candidateFromHit(
  hit: Record<string, unknown>,
  context: string,
  strip: (html: string) => string,
): HnCandidate | null {
  const objectId = typeof hit['objectID'] === 'string' ? hit['objectID'] : ''
  const raw = hit['comment_text']
  if (!objectId || typeof raw !== 'string' || raw.trim() === '') return null

  const body = strip(raw)
  const phrases = detectFailureSignals(body)
  if (phrases.length === 0) return null

  return {
    objectId,
    phrases,
    excerpt: body,
    url: hnItemUrl(objectId),
    context,
    storyTitle: typeof hit['story_title'] === 'string' ? hit['story_title'] : null,
    author: typeof hit['author'] === 'string' ? hit['author'] : null,
    createdAt: typeof hit['created_at'] === 'string' ? hit['created_at'].slice(0, 10) : null,
  }
}
