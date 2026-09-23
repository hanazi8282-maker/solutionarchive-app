import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { denyStatus, guardFromVerdict } from '@/lib/auth/policy'
import {
  isMissingColumn, MIGRATION_20260930000003_KEYS, MISSING_COLUMN_HINT, omitKeys, parseFacets,
} from '@/lib/analysis/facets'
import { parseCompetitorUrl } from '@/lib/analysis/inputs'

// 판매자 프로필 — 로그인 이메일당 1행(seller_profiles.owner_email UNIQUE).
// /analyze/new 1단계를 프리필하고 /settings/profile 이 편집한다.
//
// 신원은 **세션에서만** 온다. 본문의 owner_email 은 읽지 않는다 — 읽으면 허용 목록에
// 있는 아무나 남의 프로필을 덮어쓸 수 있고(§5-1: 로그인한 전원이 같은 권한),
// 조회는 service_role 이라 RLS 가 막아 주지 않는다.

/** 세션 이메일 또는 거절 응답. 3상태를 접지 않는다: 미로그인 401 · 목록 밖 403 · 확인 불가 503. */
async function sessionEmail(): Promise<{ email: string } | { deny: NextResponse }> {
  const verdict = await getAuthVerdict()
  const guard = guardFromVerdict(verdict)
  if (!guard.ok) {
    return { deny: NextResponse.json({ error: guard.message }, { status: denyStatus(verdict) }) }
  }
  return { email: guard.email }
}

export async function GET() {
  const who = await sessionEmail()
  if ('deny' in who) return who.deny

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const { data, error } = await supabase
    .from('seller_profiles')
    .select('*')
    .eq('owner_email', who.email)
    .maybeSingle()

  // 조회 실패는 "프로필 없음"이 아니다. 200 { profile: null } 로 돌려주면 화면이 빈 폼을
  // 보여주고, 사람이 그 위에 다시 입력해 멀쩡한 행을 덮어쓴다(§7.1).
  if (error) {
    console.error('[profile] select error:', error.message)
    return NextResponse.json({ error: '프로필 조회에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ profile: data ?? null })
}

export async function PUT(req: Request) {
  const who = await sessionEmail()
  if ('deny' in who) return who.deny

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)

  const facets = parseFacets(body)
  if (!facets.ok) return NextResponse.json({ error: facets.error, field: facets.field }, { status: 400 })

  const rawPitch = (body as { pitch?: unknown } | null)?.pitch
  if (rawPitch != null && typeof rawPitch !== 'string') {
    return NextResponse.json({ error: '상품 한 줄 소개(pitch) 값이 문자열이 아니다.', field: 'pitch' }, { status: 400 })
  }
  const pitch = typeof rawPitch === 'string' ? rawPitch.trim() || null : null

  // 경쟁사·비교 대상 URL(선택, 남헌 2026-09-23 Q3-A). 검증은 /analyze/new 와 **같은 함수**를
  // 재사용한다 — 두 곳이 각자 판정하면 프로필에 저장된 URL 이 새 분석에서 거절되는 꼴이 난다.
  // 빈 문자열은 null 로 저장한다(= "비웠다"). mode 는 forward 고정 — 프로필은 역설계 대상이 아니다.
  const competitor = parseCompetitorUrl((body as { competitor_url?: unknown } | null)?.competitor_url, 'forward')
  if (!competitor.ok) return NextResponse.json({ error: competitor.error, field: 'competitor_url' }, { status: 400 })

  const row: Record<string, unknown> = {
    owner_email: who.email,
    pitch,
    competitor_url: competitor.value,
    ...facets.values,
    updated_at: new Date().toISOString(),
  }
  const save = (payload: Record<string, unknown>) =>
    supabase.from('seller_profiles').upsert(payload, { onConflict: 'owner_email' }).select().single()

  let { data, error } = await save(row)

  // 마이그 20260930000003 이 아직 안 갔으면 PostgREST 가 PGRST204(또는 42703)로 거절한다.
  // 그 키만 빼고 **1회** 다시 보낸다. 조용히 넘기지 않고 무엇을 뺐는지 로그에 남긴다 —
  // 안 남기면 사람이 고른 문제 유형이 저장되지 않은 것을 아무도 모른다(§7.1 · §7.2).
  if (error && isMissingColumn(error.code)) {
    console.warn('[profile] upsert ' + error.code + ' — ' + MISSING_COLUMN_HINT + '. '
      + MIGRATION_20260930000003_KEYS.join('·') + ' 를 빼고 1회 재시도한다 (그 값은 저장되지 않는다): ' + error.message)
    ;({ data, error } = await save(omitKeys(row, MIGRATION_20260930000003_KEYS)))
  }

  if (error) {
    console.error('[profile] upsert error:', error.code ?? '', error.message)
    return NextResponse.json({ error: '프로필 저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
