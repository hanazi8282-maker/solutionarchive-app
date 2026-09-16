// 앵글 생성 POST 의 낙관적 락 판정 (진단 1-1).
//
// 왜 필요한가. 앵글 생성은 LLM 호출이 10~32회 붙는 수 분짜리 배치인데,
// 시작 전에 status 를 읽기만 하고 끝나서야 바꿨다. 그 사이 들어온 두 번째 요청
// (더블클릭·탭 두 개·새로고침)도 같은 검사를 통과해 배치가 통째로 두 벌 나간다.
// 무료 티어 일일 한도(모델당 20건/일)에서는 중복 1회가 그날 하루를 날린다.
// 바로 옆 extract/route.ts 는 조건부 UPDATE 로 이미 락을 걸어 뒀다.
//
// 락 획득 방법: `.eq('status','reviewed')` 를 건 UPDATE 로 status 를 CLAIMED_STATUS 로
// 바꾸고, 0행이 돌아오면 그 사이 다른 요청이 가져간 것으로 본다.
//
// 왜 'angling' 같은 새 상태를 안 만드나 — analysis_projects_status_check 를 넓히는
// 마이그레이션이 필요하고, 적용은 사람이 한다(CLAUDE.md §10.1). 적용 전에 코드가 먼저
// 나가면 CHECK 위반으로 앵글 생성이 통째로 죽는다. 그래서 **이미 허용된 값**으로만 잠근다.
//
// 'angled' 로 잠그는 것의 의미: 중간에 함수가 죽으면 프로젝트는 '앵글 생성이 끝난'
// 상태로 남는다. 기존 앵글은 DELETE 를 성공 직전에만 하므로 그대로 살아 있고,
// 'angled' 는 검수 화면에서 다시 열 수 있는 상태다(review/route.ts REVIEWABLE).
// 즉 최악의 경우가 "직전 결과가 그대로 남고 사람이 다시 누른다"이지, 막힌 상태가 아니다.

/** 락을 잡을 때 쓰는 상태값. analysis_projects_status_check 에 이미 있는 값이어야 한다. */
export const CLAIMED_STATUS = 'angled'

/** 락을 풀 때 되돌릴 상태값(생성 실패 시). */
export const RELEASE_STATUS = 'reviewed'

export type LockVerdict =
  | { ok: true }
  | { ok: false; status: 409 | 500; error: string }

/**
 * 조건부 UPDATE 의 결과 → 락 획득 여부.
 * 0행은 "실패"가 아니라 "다른 요청이 먼저 가져감"이다. 409 로 끊어야
 * 클라이언트가 폴링으로 붙는다(analyze/new/page.tsx 가 extract 에서 쓰는 방식).
 */
export function lockVerdict(
  rows: unknown[] | null,
  error: { message: string } | null,
): LockVerdict {
  if (error) return { ok: false, status: 500, error: `앵글 생성 시작에 실패했습니다: ${error.message}` }
  if (!rows || rows.length === 0) {
    return { ok: false, status: 409, error: '이미 앵글을 생성하고 있습니다. 잠시 후 결과 화면에서 확인해주세요.' }
  }
  return { ok: true }
}
