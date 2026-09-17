'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'

// ⛔ 사람 전용 쓰기 경로. /discovery 화면의 버튼으로만 부른다 — /columns · /cases 의
// actions.ts 와 같은 규약(로그인 확인 → 현재 상태 읽기 → 낙관적 락 → select() 로 실제 갱신 확인).
//
// ⛔ `verdict` 는 **절대 건드리지 않는다.** 그건 프로브가 실측한 결과다. 사람이 뒤집는 것은
//    `human_review`(그 판정을 받아들일지) 뿐이고, 둘은 다른 질문에 답한다.
//    실측을 사람이 덮어쓰면 "hits 가 채택을 정한다"는 이 엔진의 전제가 무너진다.

export type ReviewActionState = { ok: boolean; message: string } | null

const LABEL: Record<'kept' | 'killed', string> = { kept: '유지', killed: '무효화' }

export async function decideCandidate(_prev: ReviewActionState, fd: FormData): Promise<ReviewActionState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, message: auth.message }

  const id = String(fd.get('id') ?? '').trim()
  const decisionRaw = String(fd.get('decision') ?? '')
  if (!id) return { ok: false, message: '대상 후보가 없습니다. 새로고침 후 다시 시도하세요.' }
  if (decisionRaw !== 'kept' && decisionRaw !== 'killed') {
    return { ok: false, message: '유지 또는 무효화 중 하나를 골라야 합니다.' }
  }
  const decision = decisionRaw

  const sb = await createClient()
  if (!sb) return { ok: false, message: 'Supabase 환경변수가 설정되지 않았습니다.' }

  const { data: row, error: readErr } = await sb
    .from('discovery_candidates')
    .select('id, name, human_review, project_id')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return { ok: false, message: `조회 실패 — 확인하지 못해 바꾸지 않았습니다: ${readErr.message}` }
  if (!row) return { ok: false, message: '후보를 찾지 못했습니다. 새로고침 후 확인하세요.' }
  if (row.human_review === decision) {
    return { ok: false, message: `이미 ${LABEL[decision]} 상태입니다. 새로고침 후 확인하세요.` }
  }

  const prev = row.human_review as string

  const { data, error: writeErr } = await sb
    .from('discovery_candidates')
    .update({ human_review: decision })
    .eq('id', id)
    .eq('human_review', prev) // 낙관적 락 — 읽은 뒤 사이에 바뀌었으면 0행 갱신.
    .select('id')

  if (writeErr) return { ok: false, message: `저장 실패: ${writeErr.message}` }
  // update() 는 0행이 바뀌어도 error 를 주지 않는다 — select() 로 실제 갱신 여부를 본다.
  if (!data || data.length === 0) return { ok: false, message: '방금 다른 곳에서 결정됐습니다. 새로고침 후 확인하세요.' }

  // ── 무효화는 표시만으로 끝나면 안 된다 ────────────────────────────────────
  //
  // 채택된 후보는 이미 analysis_projects + review_targets 를 만들어 뒀다. human_review 만
  // 바꾸면 화면에는 "무효"라고 뜨는데 야간 수집은 그 타깃을 계속 긁는다 — 이 리포에는
  // "승인 버튼이 둘이라 하나만 눌러 효과가 정확히 0이었던" 전례가 있다.
  //
  // 러너는 `listDueTargets` 에서 `status='active'` 만 집어 간다(lib/review/store.ts). 그리고
  // 집어 간 타깃만 `saveTargetProgress` 로 status 를 도로 쓴다 — 즉 active 에서 빼면 다시
  // 켜지지 않는다. CHECK 어휘가 active|exhausted|failed 셋뿐이라 'exhausted'(더 가져올 것
  // 없음)를 쓴다. 'failed' 는 수집이 깨졌다는 뜻이라 거짓이 된다.
  //
  // analysis_projects 는 건드리지 않는다. 데이터가 흘러 들어오는 길은 타깃이고, 빈 프로젝트
  // 행은 해롭지 않다. status 어휘에 '취소'가 없어서 억지로 넣으면 /analyze 가 깨진다.
  let sideEffect = ''
  if (decision === 'killed' && row.project_id) {
    const { data: stopped, error: stopErr } = await sb
      .from('review_targets')
      .update({ status: 'exhausted' })
      .eq('project_id', row.project_id)
      .eq('status', 'active')
      .select('id')

    // 표시는 이미 바뀌었다. 수집 중단만 실패한 경우를 성공으로 뭉뚱그리지 않는다(§7.1).
    if (stopErr) {
      sideEffect = ` ⚠️ 다만 수집 중단에 실패했습니다(${stopErr.message}) — 이 타깃은 계속 수집됩니다. 다시 눌러 주세요.`
    } else {
      const n = stopped?.length ?? 0
      sideEffect = n > 0
        ? ` 수집 대상 ${n}건도 함께 멈췄습니다.`
        : ' (멈출 활성 수집 대상은 없었습니다.)'
    }
  }
  // 되살리기는 자동으로 하지 않는다. 원래 스스로 exhausted 가 된 타깃까지 같이 살아나
  // 헛요청을 쓴다 — 어느 쪽이었는지 여기서는 구분할 수 없다.
  if (decision === 'kept' && prev === 'killed') {
    sideEffect = ' 표시만 되돌렸습니다 — 멈춘 수집은 자동으로 다시 켜지지 않습니다.'
  }

  revalidatePath('/discovery')
  return { ok: true, message: `${row.name} ${LABEL[decision]} 완료.${sideEffect}` }
}
