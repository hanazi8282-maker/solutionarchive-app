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
