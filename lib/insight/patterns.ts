// 승격/기각 판정과 가이드 파일 렌더링 — 전부 순수 함수다.
//
// 왜 순수하게 떼어놨는가: 이 파일의 판정이 사람 승인 없이 main 에 커밋된다.
// DB·네트워크가 얽혀 있으면 "표본 4개인데 승격됐다" 같은 사고를 재현할
// 방법이 없다. scripts/insight-patterns-selftest.mjs 가 여기를 전수 검증한다.
//
// 라우트는 이 파일의 결정을 실행만 한다. 판정 로직을 라우트에 넣지 마라.

/** 승격 최소 표본. guard_hypothesis_promotion() 트리거·threads-report.mjs 와 같은 값. */
export const MIN_SAMPLE = 5

/**
 * 효과 없음으로 접는 표본 수.
 *
 * 이게 없으면 개선도 악화도 아닌 패턴이 가이드에 영원히 남는다. 표본이
 * 쌓일수록 "아직 판단 못 함"이 사실상 "효과 없음"인데, hold 만 반복하면
 * 가이드가 검증되지 않은 문장으로 계속 불어난다.
 */
export const NO_EFFECT_SAMPLE = 12

/** 개선/악화로 인정하는 상대 변화량. ±10%. 경계값은 포함한다(>= / <=). */
export const EFFECT_THRESHOLD = 0.1

/**
 * 임계치 비교용 허용오차.
 *
 * 부동소수점 때문에 "정확히 -10%"가 -0.09999999999999999 로 계산된다
 * (0.02 * 0.9 = 0.018 → (0.018-0.02)/0.02). 그대로 두면 경계값이 문서와
 * 반대로 판정된다. 승격/기각이 부동소수점 잡음으로 갈리면 안 된다.
 */
const EPS = 1e-9

/** 가이드 강조 수준의 상한. insight_patterns.strength CHECK 와 같은 값. */
export const MAX_STRENGTH = 3

export type PatternStatus = 'candidate' | 'reflected' | 'confirmed' | 'rejected'

export interface PatternRow {
  pattern_key: string
  title: string
  description: string
  insight_type: string | null
  evidence_count: number
  status: PatternStatus
  strength: number
  hypothesis_code: string | null
}

/** 판정에 쓰는 지표. post_performance 집계 결과. */
export interface PerfSummary {
  /** views_24h 가 있는 글만 센다 — 아직 측정이 안 끝난 글은 표본이 아니다. */
  sampleSize: number
  avgReplyRate: number | null
  avgSpreadMultiple: number | null
}

export type Decision = 'promote' | 'reject' | 'hold'

export interface DecisionResult {
  decision: Decision
  reason: string
  /** 상대 개선율. 기준선이 없거나 0 이면 null. */
  improvement: number | null
  nextStrength: number
}

/**
 * 근거가 몇 건 모여야 가이드에 반영하는가.
 *
 * 1건은 우연과 구별되지 않는다. 2건부터 "반복 관찰"이다. 설계안 §4 의
 * "같은 패턴이 2건 이상 반복 관찰되면 우선순위를 올린다"와 같은 기준.
 */
export const MIN_EVIDENCE_TO_REFLECT = 2

/** 후보 패턴을 가이드에 반영할 때가 됐는지. */
export function shouldReflect(p: Pick<PatternRow, 'status' | 'evidence_count'>): boolean {
  return p.status === 'candidate' && p.evidence_count >= MIN_EVIDENCE_TO_REFLECT
}

/**
 * 발행자 수정 패턴(edit-)은 1건이면 가이드에 싣는다(남헌 결정 2026-09-13).
 *
 * 저장 글과 기준이 다른 이유: 저장 글은 남의 글이라 1건이 우연일 수 있지만,
 * 수정 쌍은 발행자가 직접 고친 최종본이 정답이다. 1건이라도 초안 문체에 들어가야
 * 다음 초안이 같은 수정을 또 받지 않는다. 등급은 '참고'(strength 0/1)에서 시작하고
 * 올리는 건 기존 decide() 경로뿐이다. 가설 발급 문턱(shouldReflect)은 그대로 2건이다.
 */
export const MIN_EDIT_EVIDENCE_TO_RENDER = 1

/** learned-patterns.md 에 실리는가. 렌더와 dry-run 집계가 같은 판정을 쓴다. */
export function isRendered(
  r: Pick<PatternRow, 'pattern_key' | 'status' | 'strength' | 'evidence_count'>,
): boolean {
  if ((r.status === 'reflected' || r.status === 'confirmed') && r.strength >= 1) return true
  return (
    r.status === 'candidate' &&
    r.pattern_key.startsWith('edit-') &&
    r.evidence_count >= MIN_EDIT_EVIDENCE_TO_RENDER
  )
}

/**
 * 콘텐츠 판단 위계(정본: ops/roles/cmo.md "콘텐츠 판단 위계"). 번호가 작을수록 우선이다.
 *   1 반응률 검증 — decide() 가 승격한 패턴(confirmed). edit- 도 승격되면 여기로 온다.
 *   2 발행자 수정 — edit-. 반응률 근거가 없을 때 작가 기본값을 이긴다.
 *   3 참고       — 저장 글 패턴, 반응률 판정 대기.
 * 등급(strength)을 바꾸지 않는다. 이미 있는 status·key 로 읽기만 한다.
 */
export function verdictTier(r: Pick<PatternRow, 'pattern_key' | 'status'>): 1 | 2 | 3 {
  if (r.status === 'confirmed') return 1
  return r.pattern_key.startsWith('edit-') ? 2 : 3
}

const TIER_LABEL = { 1: '1 반응률 검증', 2: '2 발행자 수정 (반응률 판정 대기)', 3: '3 참고 (반응률 판정 대기)' }

// ── 반응률 → 패턴 연결 ───────────────────────────────────────
//
// posts.hypothesis_code 는 글당 1개라 "이 초안에 적용한 패턴 여러 개"를 못 담고,
// case-draft-stage.mjs 경로는 아예 비워 둔다. 그래서 가설 코드만으로는 edit- 패턴이
// 반응률 판정을 받을 길이 없다. 작가가 stage.json 에 남긴 applied_patterns 로
// content_code 를 찾아 post_performance 에 붙인다. 새 컬럼 없음.

export interface StageManifest {
  content_code?: unknown
  applied_patterns?: unknown
}

/** pattern_key → 그 패턴을 적용한 content_code 들. applied_patterns 가 없는 매니페스트는 unrecorded(확인 불가). */
export function appliedPatternIndex(manifests: StageManifest[]): {
  byKey: Map<string, Set<string>>
  unrecorded: string[]
} {
  const byKey = new Map<string, Set<string>>()
  const unrecorded: string[] = []
  for (const m of manifests) {
    const code = typeof m.content_code === 'string' ? m.content_code : null
    if (!code) continue
    // 필드가 없으면 "적용 안 함"이 아니라 "기록 없음"이다. 음성으로 접지 않는다(§7.1).
    if (!Array.isArray(m.applied_patterns)) { unrecorded.push(code); continue }
    for (const k of m.applied_patterns) {
      if (typeof k !== 'string' || !k.trim()) continue
      if (!byKey.has(k.trim())) byKey.set(k.trim(), new Set())
      byKey.get(k.trim())!.add(code)
    }
  }
  return { byKey, unrecorded }
}

export interface PerfRow {
  content_code: string | null
  hypothesis_code: string | null
  reply_rate: number | null
  spread_multiple: number | null
}

/** 한 패턴의 표본 = 연결된 가설의 글 ∪ 그 패턴을 적용했다고 기록된 글. 한 글은 한 번만 센다. */
export function perfRowsForPattern<T extends PerfRow>(
  rows: T[],
  hypothesisCode: string | null,
  appliedCodes: Set<string> | undefined,
): T[] {
  return rows.filter(
    (r) =>
      (hypothesisCode !== null && r.hypothesis_code === hypothesisCode) ||
      (r.content_code !== null && !!appliedCodes?.has(r.content_code)),
  )
}

/** post_performance 행(views_24h 있는 것만 넘긴다) → PerfSummary. */
export function summarizePerf(rows: PerfRow[]): PerfSummary {
  const avg = (vals: Array<number | null>): number | null => {
    const nums = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
  }
  return {
    sampleSize: rows.length,
    avgReplyRate: avg(rows.map((r) => r.reply_rate)),
    avgSpreadMultiple: avg(rows.map((r) => r.spread_multiple)),
  }
}

/**
 * 반영된 패턴의 성과를 보고 승격/기각/보류를 정한다.
 *
 * baseline 은 같은 채널의 전체 평균이다. 절대값으로 판정하면 계정이 성장하는
 * 동안 모든 패턴이 좋아 보이고, 정체기에는 전부 나빠 보인다 — 시기 효과와
 * 패턴 효과가 구별되지 않는다.
 */
export function decide(
  pattern: Pick<PatternRow, 'status' | 'strength'>,
  perf: PerfSummary,
  baseline: PerfSummary,
): DecisionResult {
  const hold = (reason: string, improvement: number | null = null): DecisionResult => ({
    decision: 'hold',
    reason,
    improvement,
    nextStrength: pattern.strength,
  })

  if (pattern.status === 'rejected') {
    return hold('이미 기각된 패턴이다')
  }
  if (perf.sampleSize < MIN_SAMPLE) {
    return hold(`표본 ${perf.sampleSize}개 — ${MIN_SAMPLE}개 필요`)
  }

  // 답글률이 1차 지표다. seo-guide 가 "좋아요가 아니라 답글을 노린다"를
  // 명시하고, H1·H5 등 기존 가설도 답글률로 판정한다. 지표를 바꾸면
  // 자동 가설과 사람 가설이 서로 다른 잣대로 평가된다.
  const mine = perf.avgReplyRate
  const base = baseline.avgReplyRate

  if (mine === null || base === null || base === 0) {
    // 기준선이 없으면 비교가 불가능하다. 표본이 아무리 많아도 판정하지 않는다 —
    // 여기서 임의로 승격시키면 근거 없는 문장이 가이드에 박힌다.
    if (perf.sampleSize >= NO_EFFECT_SAMPLE) {
      return hold(`표본 ${perf.sampleSize}개지만 비교 기준선이 없어 판정 불가`)
    }
    return hold('비교 기준선(전체 평균 답글률)이 없다')
  }

  const improvement = (mine - base) / base

  if (improvement >= EFFECT_THRESHOLD - EPS) {
    return {
      decision: 'promote',
      reason: `답글률 ${(improvement * 100).toFixed(1)}% 개선 (표본 ${perf.sampleSize})`,
      improvement,
      nextStrength: Math.min(pattern.strength + 1, MAX_STRENGTH),
    }
  }

  if (improvement <= -EFFECT_THRESHOLD + EPS) {
    return {
      decision: 'reject',
      reason: `답글률 ${(improvement * 100).toFixed(1)}% 악화 (표본 ${perf.sampleSize})`,
      improvement,
      nextStrength: 0,
    }
  }

  if (perf.sampleSize >= NO_EFFECT_SAMPLE) {
    return {
      decision: 'reject',
      reason: `표본 ${perf.sampleSize}개에도 유의한 차이 없음 (${(improvement * 100).toFixed(1)}%)`,
      improvement,
      nextStrength: 0,
    }
  }

  return hold(
    `변화 ${(improvement * 100).toFixed(1)}% — 임계치 미만, 표본 더 필요`,
    improvement,
  )
}

// ── 가이드 렌더링 ─────────────────────────────────────────────
//
// ⚠️ 출력은 반드시 결정적이어야 한다. 같은 입력에 같은 바이트가 나오지 않으면
//    아무것도 안 바뀐 밤에도 커밋이 생기고, git 히스토리가 매일 노이즈로
//    덮여 "언제 뭐가 진짜 바뀌었는지"를 못 찾게 된다. 그래서 정렬 기준을
//    고정하고 타임스탬프를 본문에 넣지 않는다.

const STRENGTH_LABEL: Record<number, string> = {
  1: '참고',
  2: '권장',
  3: '기본값',
}

export const LEARNED_PATTERNS_PATH = 'content/guides/learned-patterns.md'
export const REJECTED_PATTERNS_PATH = 'content/corpus/rejected-patterns.md'

function sortForRender(rows: PatternRow[]): PatternRow[] {
  // 위계 오름차순 → strength 내림차순 → evidence 내림차순 → key 사전순.
  // 위계가 먼저인 이유: 근거 많은 edit- 가 반응률 검증 패턴 위로 올라가면 작가가 순서를 우선순위로 읽는다.
  // 마지막 key 정렬이 동점일 때의 순서를 고정한다.
  return [...rows].sort(
    (a, b) =>
      verdictTier(a) - verdictTier(b) ||
      b.strength - a.strength ||
      b.evidence_count - a.evidence_count ||
      a.pattern_key.localeCompare(b.pattern_key),
  )
}

/** 가이드 본문 생성. isRendered() 가 참인 행만 들어간다. */
export function renderLearnedPatterns(rows: PatternRow[]): string {
  const active = sortForRender(rows.filter(isRendered))

  const head = [
    '# 검증된 패턴 (자동 생성)',
    '',
    '> ⛔ 이 파일은 나이틀리 인사이트 루프가 통째로 덮어쓴다.',
    '>    사람이 직접 고치면 다음 실행에서 사라진다.',
    '>    사람이 쓰는 가이드는 voice-guide / seo-guide / viral-patterns 쪽이다.',
    '>',
    `>    출처 1: 사용자가 저장한 Threads 글에서 추출된 패턴 중 근거 ${MIN_EVIDENCE_TO_REFLECT}건 이상인 것.`,
    `>    출처 2: 발행자가 AI 초안을 직접 고쳐 발행한 쌍에서 뽑은 수정 패턴(키 edit-). ${MIN_EDIT_EVIDENCE_TO_RENDER}건부터 싣는다.`,
    '>    생성 로직: lib/insight/patterns.ts, 실행: .github/workflows/nightly-insight-loop.yml',
    '',
    '강조 수준은 실측 성과로 정해진다:',
    '',
    '- **기본값** — 답글률 개선이 반복 확인됨. 특별한 이유가 없으면 이대로 쓴다.',
    '- **권장** — 개선이 확인됨. 소재에 맞으면 우선 고려한다.',
    '- **참고** — 성과 검증 대기 중. 참고만 한다.',
    '',
    '패턴끼리 부딪히면 **위계** 번호가 작은 쪽을 따른다 (정본: ops/roles/cmo.md "콘텐츠 판단 위계"). 위에서부터 이 순서로 실린다.',
    '',
    '- **1 반응률 검증** — 발행 성과로 승격된 패턴. 발행자 수정보다 앞선다.',
    '- **2 발행자 수정** — 키 edit-. 반응률 근거가 없을 때 작가 기본값보다 앞선다. 이것도 반응률로 기각된다.',
    '- **3 참고** — 저장 글 패턴, 반응률 판정 대기.',
    '',
    '초안에 적용한 패턴 키는 stage.json 의 applied_patterns 에 남긴다. 반응률 판정이 그 목록으로 발행글을 찾는다.',
    '',
  ]

  if (active.length === 0) {
    return [
      ...head,
      '---',
      '',
      '아직 반영된 패턴이 없다.',
      '',
      `저장 글 근거 ${MIN_EVIDENCE_TO_REFLECT}건 이상 모인 패턴이나 발행자 수정 패턴이 생기면 여기에 나타난다.`,
      '그때까지는 기존 가이드 3종만 보고 쓰면 된다.',
      '',
    ].join('\n')
  }

  const body = active.map((r) => {
    const label = STRENGTH_LABEL[r.strength] ?? '참고'
    return [
      `## ${r.title}`,
      '',
      `- **강조 수준**: ${label}`,
      `- **위계**: ${TIER_LABEL[verdictTier(r)]}`,
      // edit- 는 발행자가 초안을 고친 쌍에서 나온 규칙이다(lib/insight/edit-pairs.ts).
      // 작가가 "남의 글 구조"와 "초안을 발행본으로 고치는 규칙"을 구분해 읽게 한다.
      r.pattern_key.startsWith('edit-')
        ? `- **근거 수**: 발행자 수정 ${r.evidence_count}건 (초안 → 발행본, 발행본이 정답)`
        : `- **근거 수**: 저장 글 ${r.evidence_count}건`,
      r.insight_type ? `- **인사이트 유형**: ${r.insight_type}` : null,
      r.hypothesis_code ? `- **연결된 가설**: ${r.hypothesis_code}` : null,
      `- **패턴 키**: \`${r.pattern_key}\``,
      '',
      r.description,
      '',
    ]
      .filter((l) => l !== null)
      .join('\n')
  })

  return [...head, '---', '', ...body].join('\n')
}

/** 기각 로그. 같은 패턴을 다시 실험하지 않게 하는 것이 목적이다. */
export function renderRejectedPatterns(
  rows: Array<PatternRow & { rollback_reason?: string | null }>,
): string {
  const rejected = [...rows.filter((r) => r.status === 'rejected')].sort((a, b) =>
    a.pattern_key.localeCompare(b.pattern_key),
  )

  const head = [
    '# 기각된 패턴 (자동 생성)',
    '',
    '> ⛔ 이 파일은 나이틀리 인사이트 루프가 통째로 덮어쓴다.',
    '>',
    '>    목적은 기록이 아니라 **재실험 방지**다. 여기 있는 패턴은 실제 발행',
    '>    성과에서 개선이 확인되지 않았다. 다시 제안하지 마라.',
    '',
  ]

  if (rejected.length === 0) {
    return [...head, '---', '', '아직 기각된 패턴이 없다.', ''].join('\n')
  }

  const body = rejected.map((r) =>
    [
      `## ${r.title}`,
      '',
      `- **패턴 키**: \`${r.pattern_key}\``,
      r.hypothesis_code ? `- **연결된 가설**: ${r.hypothesis_code}` : null,
      `- **기각 사유**: ${r.rollback_reason ?? '사유 미기록'}`,
      '',
      r.description,
      '',
    ]
      .filter((l) => l !== null)
      .join('\n'),
  )

  return [...head, '---', '', ...body].join('\n')
}
