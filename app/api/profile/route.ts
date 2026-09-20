import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { denyStatus, guardFromVerdict } from '@/lib/auth/policy'
import { parseFacets } from '@/lib/analysis/facets'

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

  const { data, error } = await supabase
    .from('seller_profiles')
    .upsert(
      { owner_email: who.email, pitch, ...facets.values, updated_at: new Date().toISOString() },
      { onConflict: 'owner_email' },
    )
    .select()
    .single()

  if (error) {
    console.error('[profile] upsert error:', error.message)
    return NextResponse.json({ error: '프로필 저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
