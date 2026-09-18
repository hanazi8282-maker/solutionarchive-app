// Threads 게시물 ↔ posts 초안 매칭의 순수 로직.
//
// 라우트에서 분리한 이유: 여기가 이 기능에서 틀리기 가장 쉬운 부분인데
// 네트워크·DB 없이 단독으로 검증할 수 있어야 한다.
// scripts/threads-match-selftest.mjs 가 이 파일만 import 해서 돌린다.
// 그래서 여기에는 '@/' 경로 별칭도, 외부 의존성도 두지 않는다.

// ── 정규화 ────────────────────────────────────────────────────
//
// 초안 본문과 실제 게시물 텍스트는 "사람이 복사해서 붙여넣는" 경로를 거친다.
// 그 과정에서 의미와 무관하게 달라지는 것들만 지운다:
//   - 줄바꿈·공백 (에디터·앱마다 래핑이 다르고, 붙여넣기에서 흔히 바뀐다)
//   - 이모지 (Threads 앱에서 즉석으로 붙이거나 빼는 일이 잦다)
//   - 전각/반각, 스마트 따옴표, 유니코드 대시·말줄임표
//
// 반대로 지우면 안 되는 것: 해시태그·문장부호·숫자. 그건 실제 내용 차이다.

const ZERO_WIDTH = /[​‌‍⁠﻿]/gu      // ZWSP/ZWNJ/ZWJ/WJ/BOM
const VARIATION_SELECTOR = /[︀-️]/gu               // 이모지 표현 셀렉터
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/gu                  // 피부톤 수정자
const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/gu         // 국기(문자 2개 조합)
const PICTOGRAPH = /\p{Extended_Pictographic}/gu             // 나머지 이모지 전반
const WHITESPACE = /[\s 　]/gu                      // 공백·줄바꿈·전각 공백

export function normalizeBody(input: string | null | undefined): string {
  if (!input) return ''

  return input
    // NFKC 를 먼저 돌린다. 전각 영숫자·호환 한글 자모를 표준형으로 모아야
    // 뒤따르는 치환이 한 벌만 있으면 된다.
    .normalize('NFKC')
    // 이모지 계열 제거. ZWJ 시퀀스(가족 이모지 등)는 구성 요소가 각각
    // Extended_Pictographic 이라 결합자만 지우면 조각이 남는다. 그래서
    // 결합자(ZERO_WIDTH)와 구성 요소(PICTOGRAPH)를 모두 지운다.
    .replace(VARIATION_SELECTOR, '')
    .replace(SKIN_TONE, '')
    .replace(REGIONAL_INDICATOR, '')
    .replace(PICTOGRAPH, '')
    .replace(ZERO_WIDTH, '')
    // 문장부호 이형태를 하나로. 모바일 자판이 자동으로 바꿔놓는 것들이다.
    .replace(/[‘’‛′]/gu, "'")
    .replace(/[“”‟″]/gu, '"')
    .replace(/[–—―−]/gu, '-')
    .replace(/…/gu, '...')
    // 공백은 전부 제거한다(하나로 합치지 않는다). 한국어는 띄어쓰기가
    // 흔들려도 의미가 같은 경우가 많고, 붙여넣기에서 줄바꿈이 통째로
    // 사라지거나 늘어나는 일이 잦다. "공백 차이 무시"를 가장 확실하게 만든다.
    .replace(WHITESPACE, '')
    .toLowerCase()
}

// ── 유사도: 문자 바이그램 Dice 계수 ───────────────────────────
//
// 왜 Dice(바이그램)인가:
//   - 한국어에 쓸 만한 단어 토크나이저가 없다. 문자 n-gram 이면 언어 무관하다.
//   - O(n+m). 레벤슈타인은 O(n*m) 이고, 500자 본문 × 초안 10개 × 게시물 25개면
//     서버리스 실행 시간에서 무시할 수 없어진다.
//   - 문장 순서를 바꾸거나 한 문단을 통째로 옮겨도 점수가 급락하지 않는다.
//     맞춤법 교정 한두 곳 때문에 매칭이 깨지는 걸 막아준다.
//
// 집합(Set)으로 계산하므로 같은 바이그램의 반복 횟수는 무시된다. 짧은 문장이
// 여러 번 반복되는 글에서 점수가 과대평가될 수 있지만, 우리 글은 300~500자라
// 실질적인 영향이 없다.

export function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

/** 0(무관) ~ 1(동일). 정규화된 문자열을 받는다. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1
  if (!a.length || !b.length) return 0
  // 바이그램을 만들 수 없는 1글자 문자열은 동일 여부로만 판정한다(위에서 걸러짐).
  if (a.length < 2 || b.length < 2) return 0

  const A = bigrams(a)
  const B = bigrams(b)
  let overlap = 0
  for (const g of A) if (B.has(g)) overlap++
  return (2 * overlap) / (A.size + B.size)
}

// ── 임계값 ────────────────────────────────────────────────────
//
// AUTO_MATCH_MIN = 0.82
//   정상 경로에서는 사람이 drafts/YYYY-MM-DD.md 에서 본문을 그대로 복사해
//   붙여넣으므로 정규화 후 완전 일치(1.0)가 기본값이다. 임계값이 실제로
//   쓰이는 건 "붙여넣고 나서 앱에서 몇 글자 고친" 경우뿐이다.
//   300~500자 한국어 본문에서 0.82 는 문장 하나를 통째로 고쳐 쓰거나
//   해시태그·CTA 를 갈아끼운 정도까지 흡수하고, 같은 소재로 쓴 다른 글은
//   확실히 떨어뜨리는 지점이다.
//
// AMBIGUITY_MARGIN = 0.08
//   이 루프의 존재 이유가 A/B 변형 실험이라, 같은 content_code 로 훅만 바꾼
//   초안 두 편이 공존하는 게 정상이다. 그 둘은 본문 대부분이 겹쳐서
//   임계값만으로는 **둘 다 통과한다.** 그때 점수가 조금 높은 쪽으로 자동
//   연결해버리면 훅 A 의 성과가 훅 B 에 기록되고, 우리가 검증하려는 가설이
//   조용히 오염된다. 잘못 붙은 데이터는 미매칭보다 나쁘다 — 미매칭은
//   눈에 보이지만 오연결은 보이지 않는다.
//   그래서 1등과 2등의 격차가 이 값보다 작으면 자동 연결을 포기하고
//   사람에게 넘긴다(대시보드의 수동 연결 섹션).
//
//   단, 1등이 **완전 일치(1.0)** 면 이 판정을 적용하지 않는다. 정규화 후 문자열이
//   글자 하나까지 같다는 뜻이라 해석의 여지가 없다 — 2등이 0.95든 0.99든 그건
//   "다른 문자열"이다. 이 예외가 없으면 정상 경로가 통째로 막힌다: A/B 변형 두
//   편을 다 발행하면 각 초안의 1등은 1.0, 2등은 서로에 대한 유사도(0.9 언저리)라
//   격차가 마진보다 작아져 **둘 다 보류된다.** 실측 0.90~0.96 구간이라 마진을
//   0.1 로 키워도 해결되지 않고, 키울수록 "손댄 발행본"까지 같이 막힌다.
//   1등도 2등도 1.0 이면(같은 글을 두 번 올린 경우) 여전히 보류한다.
export const AUTO_MATCH_MIN = 0.82
export const AMBIGUITY_MARGIN = 0.08

// ── 입출력 타입 ───────────────────────────────────────────────

export interface DraftRow {
  id: string
  body: string | null
  created_at?: string | null
}

export interface ThreadsPost {
  id: string
  text?: string | null
  permalink?: string | null
  timestamp?: string | null
}

export interface MatchedPair {
  draftId: string
  threadsId: string
  score: number
  exact: boolean
  permalink: string | null
  timestamp: string | null
}

export type SkipReason =
  /** 어떤 게시물과도 충분히 닮지 않았다. 대개 아직 발행되지 않은 초안이다. */
  | 'below_threshold'
  /** 이 초안이 게시물 두 개와 비슷하다 — 어느 쪽인지 정할 수 없다. */
  | 'ambiguous'
  /** 이 게시물이 초안 두 개와 비슷하다 — 성과가 엉뚱한 초안에 붙을 수 있다. */
  | 'contested'
  /** 노리던 게시물을 더 높은 점수의 초안이 먼저 가져갔다. */
  | 'taken_by_better_match'

export interface SkippedDraft {
  draftId: string
  reason: SkipReason
  bestScore: number
  runnerUpScore: number | null
  bestThreadsId: string | null
}

export interface MatchOutcome {
  matched: MatchedPair[]
  skipped: SkippedDraft[]
  /** 어떤 초안과도 연결되지 않은 Threads 게시물. 대개 매처 도입 이전 글이다. */
  unmatchedThreads: string[]
}

// ── 매칭 ──────────────────────────────────────────────────────
//
// 1:1 배정이다. 초안 하나가 게시물 두 개에, 게시물 하나가 초안 두 개에
// 붙는 일이 없어야 한다(posts.external_id 가 UNIQUE 라 후자는 DB 에서도 터진다.
// 여기서 걸러 500 대신 "미매칭"으로 넘긴다).
//
// 절차:
//   1. 초안 × 게시물 점수 행렬을 만든다(둘 다 수십 건 규모라 전부 계산해도 싸다).
//   2. 초안마다 1등이 임계값 미만이면 below_threshold.
//   3. 초안 쪽 모호성: 그 초안의 1등·2등 게시물 격차가 마진 미만이면 ambiguous.
//   4. 게시물 쪽 모호성: 1등 게시물을 놓고 이 초안과 다른 초안이 마진 안에서
//      다투면 contested. 3) 만으로는 이쪽이 안 걸린다 — 게시물이 하나뿐이면
//      초안 입장에서는 2등이 없어 항상 "명확"해 보이기 때문이다. 정작 위험한
//      오연결(훅 A 의 성과가 훅 B 에 기록되는 일)은 여기서 난다.
//   5. 남은 후보를 점수 내림차순으로 훑으며 양쪽이 모두 비어 있을 때만 확정.
//      이미 배정된 게시물을 노리던 초안은 taken_by_better_match 로 남는다.
export function matchDrafts(drafts: DraftRow[], threads: ThreadsPost[]): MatchOutcome {
  const normDrafts = drafts.map(d => ({ row: d, norm: normalizeBody(d.body) }))
  const normThreads = threads.map(t => ({ row: t, norm: normalizeBody(t.text) }))

  interface Candidate {
    draftId: string
    threadsId: string
    score: number
    runnerUp: number | null
    permalink: string | null
    timestamp: string | null
  }

  const candidates: Candidate[] = []
  const skipped: SkippedDraft[] = []

  // 점수 행렬. 본문이 비어 있는 쪽은 계산하지 않고 -1 로 둔다 —
  // 빈 문자열끼리 1.0 이 나와 아무 게시물에나 붙는 사고를 막는다.
  const scores: number[][] = normDrafts.map(d =>
    normThreads.map(t =>
      d.norm && t.norm ? diceSimilarity(d.norm, t.norm) : -1,
    ),
  )

  /** 한 게시물(열)을 놓고 다투는 초안들의 1등·2등 점수. */
  function columnTop2(ti: number): { best: number; runnerUp: number } {
    let best = -1
    let runnerUp = -1
    for (let di = 0; di < scores.length; di++) {
      const s = scores[di][ti]
      if (s > best) { runnerUp = best; best = s }
      else if (s > runnerUp) { runnerUp = s }
    }
    return { best, runnerUp }
  }

  for (let di = 0; di < normDrafts.length; di++) {
    const d = normDrafts[di]

    const scored = normThreads
      .map((t, ti) => ({ t, ti, score: scores[di][ti] }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    const runnerUp = scored[1] ?? null

    if (!best || best.score < AUTO_MATCH_MIN) {
      skipped.push({
        draftId: d.row.id, reason: 'below_threshold',
        bestScore: best?.score ?? 0,
        runnerUpScore: runnerUp?.score ?? null,
        bestThreadsId: best?.t.row.id ?? null,
      })
      continue
    }

    // 완전 일치는 격차와 무관하게 확정한다(위 AMBIGUITY_MARGIN 주석 참조).
    // 2등도 완전 일치라면 진짜로 구분할 수 없으므로 보류로 넘어간다.
    const decidedByExactness = best.score === 1 && (!runnerUp || runnerUp.score < 1)

    if (!decidedByExactness && runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
      skipped.push({
        draftId: d.row.id, reason: 'ambiguous',
        bestScore: best.score, runnerUpScore: runnerUp.score,
        bestThreadsId: best.t.row.id,
      })
      continue
    }

    // 게시물 쪽에서 본 경쟁. 같은 content_code 의 A/B 변형처럼 본문 대부분이
    // 겹치는 초안 두 편이 한 게시물을 놓고 다투면, 근소한 점수 차로 자동
    // 연결해서는 안 된다. 여기서도 완전 일치는 예외다.
    if (!decidedByExactness) {
      const col = columnTop2(best.ti)
      if (col.runnerUp >= 0 && col.best - col.runnerUp < AMBIGUITY_MARGIN) {
        skipped.push({
          draftId: d.row.id, reason: 'contested',
          bestScore: best.score, runnerUpScore: col.runnerUp,
          bestThreadsId: best.t.row.id,
        })
        continue
      }
    }

    candidates.push({
      draftId: d.row.id,
      threadsId: best.t.row.id,
      score: best.score,
      runnerUp: runnerUp?.score ?? null,
      permalink: best.t.row.permalink ?? null,
      timestamp: best.t.row.timestamp ?? null,
    })
  }

  candidates.sort((a, b) => b.score - a.score)

  const usedDrafts = new Set<string>()
  const usedThreads = new Set<string>()
  const matched: MatchedPair[] = []

  for (const c of candidates) {
    if (usedDrafts.has(c.draftId) || usedThreads.has(c.threadsId)) {
      skipped.push({
        draftId: c.draftId, reason: 'taken_by_better_match',
        bestScore: c.score, runnerUpScore: c.runnerUp, bestThreadsId: c.threadsId,
      })
      continue
    }
    usedDrafts.add(c.draftId)
    usedThreads.add(c.threadsId)
    matched.push({
      draftId: c.draftId,
      threadsId: c.threadsId,
      score: c.score,
      exact: c.score === 1,
      permalink: c.permalink,
      timestamp: c.timestamp,
    })
  }

  return {
    matched,
    skipped,
    unmatchedThreads: normThreads
      .filter(t => !usedThreads.has(t.row.id))
      .map(t => t.row.id),
  }
}

// ── 게시물 기준 후보 순위 (수동 연결용) ────────────────────────
//
// 매처가 어떤 초안에도 붙이지 않은 게시물을 사람이 대시보드에서 연결할 때 보여줄
// 후보 목록이다. 임계값·모호성 판정을 하지 않고 점수순으로 늘어놓기만 한다 —
// 고르는 건 사람이다. **자동 연결에 쓰지 마라.** 발행 전에 통째로 다시 쓴 글은
// 0.2~0.3 대가 나오는데(실사례 CS-20260910-01: 0.267), 그 구간에서는 같은 소재의
// 다른 초안과 점수가 쉽게 뒤집힌다.
export function rankDraftsFor(thread: ThreadsPost, drafts: DraftRow[]): { draftId: string; score: number }[] {
  const t = normalizeBody(thread.text)
  return drafts
    .map(d => ({ draftId: d.id, score: diceSimilarity(normalizeBody(d.body), t) }))
    .sort((a, b) => b.score - a.score)
}

// ── 수동 연결 화면의 후보 좁히기 ──────────────────────────────
//
// rankDraftsFor 는 초안을 전부 점수순으로 돌려준다. 화면(app/dashboard/draft-link-form.tsx)이
// 그걸 그대로 드롭다운에 펼치고 있었다. 케이스·초안이 늘면 선택 자체가 불가능해진다.
// 그래서 화면은 둘로 나눈다: (1) 임계값을 넘은 상위 몇 건을 근거와 함께 먼저 펼치고,
// (2) 나머지 전체에는 검색으로 닿는다. 순위가 틀렸을 때 사람이 우회할 길을 남기는 게 (2) 다.
//
// MANUAL_SUGGEST_MIN = 0.15
//   "추천으로 내밀 가치가 있는 최저선"이다. AUTO_MATCH_MIN(0.82)과 같은 값일 수 없다 —
//   이 화면에 오는 글은 애초에 그 선을 못 넘어서 온 것들이다. 실사례 CS-20260910-01 은
//   발행 전에 본문을 통째로 다시 써서 0.267 이었고 그게 **맞는** 연결이었다. 그래서 바닥은
//   그보다 확실히 낮아야 한다. 0.15 아래는 같은 소재인지조차 구분되지 않는 잡음 구간이라
//   추천하지 않고 검색으로만 닿게 한다. 추천이 0건이면 화면은 빈 목록을 두지 않고
//   "자동으로 후보를 찾지 못했습니다"라고 문장으로 말한다.
export const MANUAL_SUGGEST_MIN = 0.15

/** 화면에 먼저 펼쳐 놓을 추천 후보 수. 그 아래는 검색으로 닿는다. */
export const MANUAL_SUGGEST_LIMIT = 5

/**
 * 추천으로 내밀 후보만 남긴다. **점수 내림차순 목록**(rankDraftsFor 출력)을 받는다 —
 * 정렬을 다시 하지 않으므로 정렬되지 않은 배열을 넘기면 "상위"가 상위가 아니다.
 *
 * 0건은 오류가 아니라 정상 결과다. 호출부는 그걸 빈 목록이 아니라 문장으로 표시한다.
 */
export function suggestedCandidates<T extends { score: number }>(
  ranked: readonly T[],
  limit: number = MANUAL_SUGGEST_LIMIT,
  min: number = MANUAL_SUGGEST_MIN,
): T[] {
  return ranked.filter(c => c.score >= min).slice(0, limit)
}

/**
 * 검색 필터 한 건 판정. 후보를 알아볼 문자열(소재 코드·생성일·본문 앞부분)과
 * 사람이 친 질의를 받아 포함 여부만 본다.
 *
 * 양쪽에 normalizeBody 를 쓴다 — 공백·이모지·전각을 지우고 소문자로 맞추므로
 * "재고 300" 으로도 "재고300만원" 이 잡힌다. 한국어는 띄어쓰기가 흔들리는데
 * 검색이 그것 때문에 실패하면 사람이 우회할 길이 막힌다.
 *
 * 질의가 비었으면(또는 공백·이모지뿐이면) true — 필터를 걸지 않은 상태다.
 */
export function candidateMatchesQuery(haystack: string, query: string): boolean {
  const q = normalizeBody(query)
  if (!q) return true
  return normalizeBody(haystack).includes(q)
}

// ── 미연결 게시물의 분류 ───────────────────────────────────────
//
// matchDrafts 의 unmatchedThreads 에는 성질이 다른 것들이 섞여 있다. 한 숫자로
// 뭉쳐 놓으면 매시 같은 ⚠️ 가 떠서, 다음에 진짜 미연결이 생겨도 아무도 안 본다
// (2026-09-16 이후 실제로 그 상태였다).
//
//   manual_link    — posts 초안이 후보로 잡힌다. 대시보드에서 바로 연결할 수 있다.
//   column_episode — posts 에는 후보가 없고 **칼럼 연재 편**(content_columns.threads[])이
//                    후보다. 그 편은 아직 posts 행이 없어서 연결할 자리부터 만들어야 한다
//                    (scripts/column-threads-stage.mjs). 이것도 조치 대상이다 — ⚠️ 에 남는다.
//   off_pipeline   — 넓힌 후보 집합(초안 + 칼럼 편) 어디와도 **현저히** 안 닮았다.
//                    초안 없이 사람이 직접 쓴 글로 본다.
//   undecidable    — 비교 자체를 못 했다(게시물 본문 없음 / 비교 가능한 후보 0건).
//                    off_pipeline 로 접지 않는다(§7.1) — "닮은 게 없다"와
//                    "닮았는지 볼 수 없다"는 다른 사건이다.
//
// ⚠️ 후보 집합을 먼저 넓히고, 분류는 그 다음이다. 순서를 뒤집으면 안 된다.
//    2026-09-18 에 실제로 뒤집어 봤고 결론이 반대로 나왔다: 게시물
//    18165008242467071(남헌이 직접 쓴 글로 보였던 것)은 posts 27행만 놓고 재면
//    최고 0.103 이라 "파이프라인 외"였는데, 실은 칼럼 `beauty-of-joseon` 연재
//    1편의 발행본이었다. 후보를 덜 본 상태의 점수로 임계값을 정하면 칼럼 연재의
//    발행본이 전부 오분류된다.
//
// OFF_PIPELINE_MAX = 0.08 — 일부러 낮게 잡았다. 실측을 늘어놓으면 이유가 보인다.
//
//   같은 글의 사람 재작성(= 놓치면 안 되는 쪽)
//     0.267  CS-20260910-01. 발행 직전에 구어체로 다시 쓴 글.
//     ~0.20  칼럼 1편(419자) vs 그 발행본(498자). **추정값이다** — 발행본 전문이
//            content_columns.review_note(DB)에만 있어 이 세션은 읽지 못했다.
//            요지로 만든 근사본으로 0.223 이 나왔고, 그 근사본은 같은 대조에서
//            0.128(실측 0.103)을 내 실물보다 0.025 높게 나오는 경향이 있었다.
//            실측은 다음 매처 실행이 남긴다(detail.candidates 에 점수가 기록된다).
//
//   닮지 않은 쪽(= 파이프라인 외로 봐도 되는 쪽)
//     0.051~0.071  소재가 완전히 다른 글 쌍.
//     0.109~0.130  같은 브랜드·다른 무브(칼럼 1편 vs 초안 CS-20260910-02 = 0.130).
//     0.114~0.175  같은 칼럼의 형제 편끼리(1편 vs 2편 = 0.175).
//     0.155        같은 화자·같은 문체·다른 소재.
//
//   두 띠가 **겹친다.** 사람이 다시 쓴 글에는 사실·수치만 남아 유사도가 0.2 언저리로
//   떨어지는데, 같은 브랜드의 형제 편끼리도 0.17 이 나온다. 게다가 후보가 수십 개면
//   최고값은 띠의 위쪽으로 밀린다(후보 27개 대비 최고 0.103 이 그 예다).
//   그래서 **이 지표로는 "파이프라인 외"를 자신 있게 가릴 수 없다.**
//
//   결론: 0.08 은 "여기보다 낮으면 어떤 재작성도 아니다"라고 말할 수 있는 선까지만
//   내려온 값이다. 이 아래는 소재가 다른 글 쌍(0.051~0.071)뿐이다. 실측 0.103 —
//   칼럼 연재의 발행본으로 판명된 그 글 — 은 이 선 위에 남아야 하고, 남는다.
//   off_pipeline 은 자주 뜨지 않는다. 그게 맞다: ⚠️ 소음의 진짜 원인은 분류가 없어서가
//   아니라 **연결할 자리(posts 행)가 없어서**였고, 그건 스테이징 경로로 푼다.
//
//   임계값을 올리고 싶으면 실측을 먼저 늘려라. 올리는 쪽의 대가는
//   "칼럼 연재 발행본이 경고에서 조용히 사라지는 것"이다.
//
//   ⚠️ 분류는 판단을 대신 내리지 않는다. off_pipeline 로 분류된 게시물도 대시보드에
//      그대로 남고 수동 연결 폼이 붙는다(app/dashboard/actions.ts linkDraft).
//      다이제스트의 ⚠️ 에서만 빠지고 별도 줄로 건수가 남는다. 오분류의 대가는
//      "주목도"이지 "경로 차단"이 아니다. 이 성질을 없애지 마라.
//
//   경계값은 조치 대상 쪽이다(`< OFF_PIPELINE_MAX` 만 off_pipeline).
export const OFF_PIPELINE_MAX = 0.08

export type UnmatchedKind = 'manual_link' | 'column_episode' | 'off_pipeline' | 'undecidable'

export interface UnmatchedInfo {
  threadsId: string
  kind: UnmatchedKind
  /** 두 후보 풀 전체에서의 최고 유사도. undecidable 이면 null — 0 으로 적지 않는다. */
  bestScore: number | null
  /** 1등 후보의 식별자. 초안이면 posts.id, 칼럼 편이면 `COL-<slug>-<편>` 코드. */
  bestId: string | null
  bestFrom: 'draft' | 'episode' | null
  /**
   * undecidable 인 이유. 그 밖에는 null.
   * `candidates_unavailable` 은 이 함수가 만들지 않는다 — 후보 조회 자체가 실패했을 때
   * 호출자(라우트·대시보드)가 붙인다. 후보를 못 읽은 것을 "안 닮았다"로 읽으면
   * 칼럼 연재의 발행본이 파이프라인 외로 오분류된다.
   */
  undecidable: 'no_text' | 'no_comparable_candidates' | 'candidates_unavailable' | null
}

/**
 * 미연결 게시물 1건을 분류한다. 매처 크론과 대시보드가 **같은 이 함수**를 쓴다.
 *
 * `episodes` 는 승인된 칼럼 연재 편이다(lib/threads/column-episodes.ts 가 만든다).
 * 자동 연결 후보가 아니라 **분류·보고용**이다 — 그 편에는 아직 posts 행이 없어서
 * 매처가 갱신할 대상이 없다. 매처는 새 행을 만들지 않는다(route.ts 규약).
 */
export function classifyUnmatched(
  thread: ThreadsPost,
  drafts: DraftRow[],
  episodes: DraftRow[] = [],
): UnmatchedInfo {
  const unjudgeable = (why: UnmatchedInfo['undecidable']): UnmatchedInfo => ({
    threadsId: thread.id, kind: 'undecidable', bestScore: null, bestId: null, bestFrom: null, undecidable: why,
  })

  if (!normalizeBody(thread.text)) return unjudgeable('no_text')

  // 본문이 빈 후보는 비교 대상이 아니다. 양쪽 풀이 다 비었으면 "닮은 게 없다"가
  // 아니라 "비교 불가"다 — diceSimilarity 가 주는 0 을 근거로 쓰면 안 된다.
  const top = (pool: DraftRow[]) => {
    const comparable = pool.filter(d => normalizeBody(d.body))
    return comparable.length ? rankDraftsFor(thread, comparable)[0] : null
  }
  const draft = top(drafts)
  const episode = top(episodes)
  if (!draft && !episode) return unjudgeable('no_comparable_candidates')

  // 동점이면 초안 쪽을 고른다 — 그쪽은 대시보드에서 바로 연결되고, 칼럼 편은
  // posts 행부터 만들어야 한다. 사람이 할 일이 적은 쪽으로 보낸다.
  const useEpisode = !draft || (!!episode && episode.score > draft.score)
  const best = useEpisode ? episode! : draft!

  return {
    threadsId: thread.id,
    kind: best.score < OFF_PIPELINE_MAX ? 'off_pipeline' : useEpisode ? 'column_episode' : 'manual_link',
    bestScore: best.score,
    bestId: best.draftId,
    bestFrom: useEpisode ? 'episode' : 'draft',
    undecidable: null,
  }
}
