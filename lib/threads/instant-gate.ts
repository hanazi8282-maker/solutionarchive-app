// Threads "즉시발행" 게이트 — 남헌이 수정 없이 승인만 눌러 발행할 수 있는 초안인지 가른다.
//
// 두 게이트를 **둘 다** 통과해야 버튼이 뜬다(남헌 2026-09-25 확정, 상호보완):
//   1) BP-1~3 — `claude/07-build-in-public-logic.md` §2 (남헌 2026-09-25 전달 원문, 리포에는 그 파일이 없다)
//        BP-1 독점 숫자: 남헌의 실제 작업에서만 나오는 실측치인가. 검색하면 나오는 통계·업계 평균은 실격.
//                       수치가 아예 없는 글도 실격.
//        BP-2 전이 가능: 그 숫자가 독자 자신의 작업에 대입되는 교훈으로 이어지는가. "나 이거 했다"로 끝나면 실격.
//        BP-3 맥락 0:   솔루션아카이브를 한 번도 들어본 적 없는 사람이 읽어도 완결되는가. 내부 용어 등장 시 실격.
//   2) CG-1/CG-2 통과(`lib/cases/publish-gate.ts`) + 인용 무브 인사이트 등급 A 또는 B.
//
// 순수 함수. 네트워크·DB 없음. 결과는 **3상태**다(CLAUDE.md §7.1):
//   pass        — 전 축 기계 확인 완료
//   fail        — 한 축이라도 실격. `failed` 에 사유
//   needs_human — 기계가 판정할 수 없는 축(BP-1 독점성·BP-2 전이성·CG 미실행·등급 모름)이 남았다.
//                 이걸 pass 로 접지 않는다. 버튼은 pass 에만 뜬다.
//
// 기계가 볼 수 있는 것과 없는 것을 일부러 갈랐다:
//   · BP-1 "수치가 있는가"       → 기계 (숫자 유무)
//   · BP-1 "그 수치가 독점인가"   → 사람/작가 선언 (`declared.exclusiveNumbers`). 검색 가능 여부를 정규식으로 판정하면
//                                  "업계 평균 30%"와 "우리 전환율 30%"를 못 가른다. 추측하지 않는다.
//   · BP-2 전이 가능              → 사람/작가 선언 (`declared.transferable`). 교훈이 이어지는지는 의미 판단이다.
//   · BP-3 금지어                 → 기계 (아래 목록). 목록은 남헌 원문 그대로이고 "등" 뒤는 넣지 않았다 — 늘리면 여기서.
//   · CG · 등급                   → 호출자가 넘긴다 (publish-gate 결과, gradeRankOf 입력). 이 모듈이 다시 계산하지 않는다.

export type InstantGateInput = {
  body: string
  /** 사람 또는 작가(stage.json)가 선언한 판정. `null`/미기재 = 아직 판정 없음 → needs_human. */
  declared?: { exclusiveNumbers?: boolean | null; transferable?: boolean | null } | null
  /** CG-1/CG-2 결과. `null` = 안 돌렸다 → needs_human. */
  cgOk: boolean | null
  /** 인용 무브의 인사이트 등급(`pmf_grade ?? evidence_grade`). `null` = 모른다 → needs_human. */
  grade: string | null
}

export type InstantGateStatus = 'pass' | 'fail' | 'needs_human'

export type InstantGateVerdict = {
  status: InstantGateStatus
  /** 실격 사유. status='fail' 일 때 1개 이상. */
  failed: string[]
  /** 사람이 답해야 남는 축. status='needs_human' 일 때 1개 이상. */
  pending: string[]
}

/** BP-3 금지어 — 남헌 2026-09-25 원문 목록 그대로. 내부 용어가 하나라도 보이면 실격. */
export const BP3_FORBIDDEN: { re: RegExp; label: string }[] = [
  { re: /케이스/, label: '케이스' },
  { re: /무브/, label: '무브' },
  { re: /코퍼스/, label: '코퍼스' },
  { re: /허용\s*목록/, label: '허용목록' },
  { re: /승인|반려/, label: '승인·반려' },
  { re: /PR\s*번호|PR\s*#?\s*\d+/i, label: 'PR번호' },
  { re: /마이그레이션/, label: '마이그레이션' },
  { re: /게이트/, label: '게이트' },
  { re: /발굴\s*엔진/, label: '발굴엔진' },
  { re: /증거\s*등급/, label: '증거등급' },
  { re: /전사/, label: '전사' },
  { re: /처방/, label: '처방' },
]

const PASS_GRADES = new Set(['A', 'B'])

export function instantGate(input: InstantGateInput): InstantGateVerdict {
  const body = (input.body ?? '').replace(/\r/g, '')
  const failed: string[] = []
  const pending: string[] = []

  // BP-1 (기계 절반) — 수치가 아예 없으면 실격.
  if (!/\d/.test(body)) failed.push('BP-1: 수치가 없다')
  // BP-1 (사람 절반) — 독점 실측치인가.
  const ex = input.declared?.exclusiveNumbers
  if (ex === false) failed.push('BP-1: 검색 가능한 통계·업계 평균 (독점 실측치 아님)')
  else if (ex == null) pending.push('BP-1: 수치가 남헌 실측치인지 선언 필요')

  // BP-2 — 독자에게 옮겨지는 교훈인가.
  const tr = input.declared?.transferable
  if (tr === false) failed.push('BP-2: "나 이거 했다"로 끝남 (전이 불가)')
  else if (tr == null) pending.push('BP-2: 독자 작업에 대입되는 교훈인지 선언 필요')

  // BP-3 — 내부 용어.
  const hits = BP3_FORBIDDEN.filter((f) => f.re.test(body)).map((f) => f.label)
  if (hits.length) failed.push(`BP-3: 내부 용어 ${hits.join('·')}`)

  // CG — 근거 게이트.
  if (input.cgOk === false) failed.push('CG: 근거 게이트(CG-1/CG-2) 미통과')
  else if (input.cgOk == null) pending.push('CG: 근거 게이트 미실행')

  // 등급 — A/B 만.
  const g = (input.grade ?? '').trim().toUpperCase()
  if (input.grade == null || g === '') pending.push('등급: 인용 무브 등급 모름')
  else if (!PASS_GRADES.has(g)) failed.push(`등급: ${g} (A/B 만 즉시발행)`)

  const status: InstantGateStatus = failed.length ? 'fail' : pending.length ? 'needs_human' : 'pass'
  return { status, failed, pending }
}
