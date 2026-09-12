// Stage 6 — 온보딩 "감 점수" 퀴즈의 순수 로직. 페어링 · 채점 · 퍼센타일 분기.
//
// 이 파일은 **순수 함수만** 둔다 — DB 조회는 app/api/onboarding/quiz 가 하고
// 여기엔 행 배열을 넘긴다. 그래야 셀프테스트가 네트워크 없이 돈다
// (lib/cases/advisor.ts 와 같은 규약).
//
// 코퍼스:
//   성공 쪽 = case_moves WHERE outcome_direction='positive'  (정답은 항상 이쪽)
//   실패 쪽 = failed_angles                                   (제품 트랙 실패 원장)
// case_moves 의 negative 는 방법론 트랙 소재라 쓰지 않는다(§13-2). 호출부가
// 이미 필터해서 넘기지만, 여기서도 한 번 더 걸러낸다 — 필터를 한쪽에만 두면
// 나중에 호출부가 늘었을 때 조용히 새어 들어온다.
//
// validated_angles_corpus 는 쓰지 않는다(0건, §13-4 별건).

/** 문항 수. 스펙 허용치 5~10 중 10 고정 — "X/10" 표기와 점수 분해능. */
export const QUESTION_COUNT = 10

/**
 * 퍼센타일을 표시해도 되는 최소 응답자 수.
 * 이 밑에서는 "상위 N%"를 절대 만들지 않고 원 수치만 보여준다(§7.1).
 * 표본이 작을 때의 퍼센타일은 통계적 근거 없는 확신을 준다 — 응답자 5명에서
 * "상위 20%"는 그냥 "5명 중 1등"이고, 전자는 후자보다 훨씬 센 주장으로 읽힌다.
 */
export const PERCENTILE_MIN_N = 30

export type Side = 'a' | 'b'
export type OptionSource = 'case_move' | 'failed_angle'

/** case_moves 한 행 (성공 쪽). */
export interface SuccessMoveRow {
  id: string
  claim: string
  outcome_direction: string
}

/** failed_angles 한 행 (실패 쪽). */
export interface FailedAngleRow {
  id: string
  claimed_angle: string
  product_category: string | null
}

export interface QuizOption {
  side: Side
  text: string
}

export interface QuizQuestion {
  index: number
  case_move_id: string
  failed_angle_id: string
  category: string | null
  /** 길이 2, side 'a' → 'b' 순. 어느 쪽이 성공 사례인지는 섞인다. */
  options: QuizOption[]
  /** 성공 사례(case_moves)가 놓인 쪽. 정답은 항상 이쪽이다. */
  correct_side: Side
}

/** 0 이상 1 미만을 돌려주는 난수원. 테스트에서 결정적 함수로 바꿔 끼운다. */
export type Rand = () => number

/** Fisher-Yates. 원본을 건드리지 않는다. */
function shuffled<T>(items: readonly T[], rand: Rand): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 성공 1건 + 실패 1건을 무작위 페어링해 문항을 만든다.
 *
 * 건수에 로직이 의존하지 않는다: failed_angles 가 6건이든 12건이든 돈다.
 * 성공 쪽은 문항마다 서로 다른 행을 쓰고(중복 claim 은 퀴즈를 지루하게 만든다),
 * 실패 쪽은 모자라면 순환해서 재사용한다. 그래서 만들 수 있는 문항 수는
 * min(count, 성공 건수) 이고, 어느 한쪽이라도 0건이면 0문항이다.
 * **0문항을 "정상적인 빈 퀴즈"로 내보내지 않는다** — 호출부가 확인 불가로 다룬다.
 */
export function buildQuiz(
  moves: readonly SuccessMoveRow[],
  failedAngles: readonly FailedAngleRow[],
  count: number = QUESTION_COUNT,
  rand: Rand = Math.random,
): QuizQuestion[] {
  const positives = moves.filter(
    (m) => m.outcome_direction === 'positive' && m.claim?.trim() && m.id,
  )
  const failed = failedAngles.filter((f) => f.claimed_angle?.trim() && f.id)
  if (positives.length === 0 || failed.length === 0) return []

  const pickedMoves = shuffled(positives, rand).slice(0, Math.max(0, count))
  const failedPool = shuffled(failed, rand)

  return pickedMoves.map((move, index) => {
    const angle = failedPool[index % failedPool.length]
    // 순서를 섞는다. 정답이 항상 왼쪽이면 퀴즈가 성립하지 않는다.
    const moveFirst = rand() < 0.5
    const correct_side: Side = moveFirst ? 'a' : 'b'
    const options: QuizOption[] = moveFirst
      ? [
          { side: 'a', text: move.claim },
          { side: 'b', text: angle.claimed_angle },
        ]
      : [
          { side: 'a', text: angle.claimed_angle },
          { side: 'b', text: move.claim },
        ]
    return {
      index,
      case_move_id: move.id,
      failed_angle_id: angle.id,
      category: angle.product_category ?? null,
      options,
      correct_side,
    }
  })
}

/** 한 문항 채점. 정답은 항상 case_moves 가 놓인 쪽(correct_side)이다. */
export function isCorrectPick(correctSide: Side, pickedSide: Side): boolean {
  return correctSide === pickedSide
}

export interface ScoreSummary {
  score: number
  question_count: number
  /** 완주(complete)한 응답자 수. 본인 포함. null = 집계를 못 읽었다(확인 불가). */
  respondents: number | null
  /** 상위 몇 %인가. respondents 가 null 이거나 PERCENTILE_MIN_N 미만이면 항상 null. */
  percentile: number | null
}

/**
 * 점수 요약 + 퍼센타일 분기.
 *
 * `completedScores` 는 complete 이벤트의 score 전체이고 **본인 점수를 포함**한다
 * (로그를 먼저 적고 나서 집계하므로 자연히 포함된다). 조회 자체를 못 했으면
 * `null` 을 넘긴다 — 빈 배열로 바꿔 넘기지 마라. "응답자 0명"과 "응답자 수를
 * 못 읽었다"는 다른 사건이다(§7.1).
 *
 * 퍼센타일은 "나보다 높은 점수의 비율"이다. 동점자는 같은 등수로 묶인다 —
 * 만점 동점 100명에게 서로 다른 등수를 붙일 근거가 없다. 1% 밑으로는 내리지
 * 않는다("상위 0%"는 없는 말이다).
 */
export function summarizeScore(
  score: number,
  questionCount: number,
  completedScores: readonly number[] | null,
): ScoreSummary {
  if (completedScores === null) {
    return { score, question_count: questionCount, respondents: null, percentile: null }
  }
  const respondents = completedScores.length
  if (respondents < PERCENTILE_MIN_N) {
    return { score, question_count: questionCount, respondents, percentile: null }
  }
  const higher = completedScores.filter((s) => s > score).length
  const percentile = Math.max(1, Math.ceil((higher / respondents) * 100))
  return { score, question_count: questionCount, respondents, percentile }
}

/**
 * 점수 한 줄 표기. 화면과 공유 이미지가 **같은 함수**를 쓴다 — 이미지에서만
 * 과장되면 AC-4 가 무의미해진다.
 */
export function scoreHeadline(s: ScoreSummary): string {
  const base = `정답 ${s.score}/${s.question_count}`
  if (s.percentile !== null) return `${base} · 상위 ${s.percentile}%`
  if (s.respondents !== null) return `${base} · 응답자 ${s.respondents}명 중 집계`
  return base // 집계 확인 불가 — 없는 수치를 지어내지 않는다
}
