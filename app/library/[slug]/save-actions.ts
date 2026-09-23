'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
import { classifySaveError, isDuplicateSave, isSaved } from '@/lib/cases/saves'

// 케이스 저장(북마크) 토글. `case_saves` 행 1개를 넣거나 지운다.
//
// ⚠️ 로그인(허용 목록) 사용자만이다. 저장은 "누구의 저장함인가"가 곧 행의 존재 이유라
//    익명 경로가 아예 없다(마이그레이션의 `user_email NOT NULL` 이 그걸 DB 에서도 막는다).
//    가드는 `scripts/auth-selftest.mjs` §4 가 강제한다 — DB 접근 전에 requireAllowedUser().
//
// ⚠️ 마이그레이션 20260930000002 미적용이면 **성공으로 접지 않는다**(§7.1). 버튼이
//    "저장됨"으로 바뀐 뒤 목록이 비어 있는 것이 가장 나쁜 결과다 — 사람은 저장했다고 믿는다.

export type SaveState = { ok: boolean; saved: boolean | null; message: string } | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function toggleSave(_prev: SaveState, fd: FormData): Promise<SaveState> {
  const auth = await requireAllowedUser()
  if (!auth.ok) return { ok: false, saved: null, message: auth.message }

  const caseStudyId = String(fd.get('case_study_id') ?? '').trim()
  if (!UUID_RE.test(caseStudyId)) return { ok: false, saved: null, message: '어느 케이스인지 알 수 없습니다. 저장하지 않았습니다.' }

  const sb = await createClient()
  if (!sb) return { ok: false, saved: null, message: 'Supabase 환경변수 미설정 — 저장하지 않았습니다.' }

  // 지금 상태를 읽고 반대로 뒤집는다. 폼이 보내온 상태를 믿지 않는다 — 다른 탭에서 이미
  // 바뀌었을 수 있고, 그때 클라이언트 값을 따르면 두 탭이 서로를 덮어쓴다.
  const now = await isSaved(sb, caseStudyId, auth.email)
  if (now.state === 'unavailable') return { ok: false, saved: null, message: `${now.reason} 저장하지 않았습니다.` }

  if (now.state === 'saved') {
    const { error } = await sb.from('case_saves').delete().eq('case_study_id', caseStudyId).eq('user_email', auth.email)
    const failure = classifySaveError(error)
    if (failure) {
      console.error('[library/save] delete error:', error?.code ?? '', error?.message ?? '')
      return { ok: false, saved: true, message: `${failure.reason} 저장 해제하지 못했습니다.` }
    }
    return { ok: true, saved: false, message: '저장함에서 뺐습니다.' }
  }

  const { error } = await sb.from('case_saves').insert({ case_study_id: caseStudyId, user_email: auth.email })
  // 23505 = 더블클릭·두 탭에서 동시에 눌렀다. 실패가 아니라 이미 저장된 것이다.
  if (error && !isDuplicateSave(error)) {
    console.error('[library/save] insert error:', error.code ?? '', error.message)
    return { ok: false, saved: false, message: `${classifySaveError(error)?.reason ?? error.message} 저장하지 않았습니다.` }
  }
  return { ok: true, saved: true, message: '저장했습니다 · /library/saved 에서 볼 수 있습니다.' }
}
