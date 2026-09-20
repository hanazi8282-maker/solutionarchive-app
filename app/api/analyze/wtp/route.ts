import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAuthVerdict } from '@/lib/auth/session'
import { denyStatus, guardFromVerdict } from '@/lib/auth/policy'
import { parseWtpBody } from '@/lib/analysis/wtp'

// 지불의사(WTP) 신호 — POST 로 담고 GET 으로 되읽는다. 가격을 계산하거나 보여 주지 않는다.
// 가격 정책은 사업 방향 결정이라 사람이 정한다(CLAUDE.md §10.2) — 여기는 그 재료만 쌓는 자리다.
//
// 신원은 **세션에서만** 온다. 본문의 owner_email 은 읽지 않는다 — 읽으면 허용 목록에 있는 아무나
// 남의 이름으로 신호를 넣을 수 있고, 조회는 service_role 이라 RLS 가 막아 주지 않는다(/api/profile 과 같은 규칙).
//
// 상태 코드가 사건을 가른다(§7.1):
//   400 답의 형태가 틀렸다   — 어떤 필드인지 말한다
//   401/403/503 신원 3상태   — 미로그인 / 목록 밖 / 확인 불가
//   500 조회·저장이 실패했다 — "답 없음" 으로 접지 않는다
//   201 한 줄 쌓았다         — 덮어쓰지 않는다. 생각이 바뀌면 행이 하나 더 쌓인다.

/** 최근 몇 건까지 돌려주나. 가격을 내는 집계가 아니라 "사람이 뭐라고 했나" 를 보는 창이다. */
const RECENT_LIMIT = 20

async function sessionEmail(): Promise<{ email: string } | { deny: NextResponse }> {
  const verdict = await getAuthVerdict()
  const guard = guardFromVerdict(verdict)
  if (!guard.ok) {
    return { deny: NextResponse.json({ error: guard.message }, { status: denyStatus(verdict) }) }
  }
  return { email: guard.email }
}

export async function POST(req: Request) {
  const who = await sessionEmail()
  if ('deny' in who) return who.deny

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const body = await req.json().catch(() => null)
  const projectId = typeof (body as { project_id?: unknown } | null)?.project_id === 'string'
    ? String((body as { project_id: string }).project_id).trim()
    : ''
  if (!projectId) return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })

  const parsed = parseWtpBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await supabase
    .from('wtp_signals')
    .insert({ project_id: projectId, owner_email: who.email, ...parsed.row })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[wtp] insert error:', error.message)
    return NextResponse.json({ error: '답을 저장하지 못했습니다 — 다시 눌러 주세요.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, created_at: data.created_at }, { status: 201 })
}

export async function GET(req: Request) {
  const who = await sessionEmail()
  if ('deny' in who) return who.deny

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })

  const cols = 'id, would_pay, amount_krw, billing, note, surface, created_at'

  // 조회 실패를 빈 배열로 접지 않는다 — 접으면 화면이 "아직 아무도 안 답했다" 라고 말한다(§7.1).
  const { data: signals, error } = await supabase
    .from('wtp_signals')
    .select(cols)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT)

  if (error) {
    console.error('[wtp] select error:', error.message)
    return NextResponse.json({ error: '지불의사 신호를 읽지 못했습니다.' }, { status: 500 })
  }

  // 내 최신 답은 따로 묻는다. 최근 20건 안에 내 답이 없을 수 있는데, 그걸 "답한 적 없음" 으로 읽으면
  // 화면이 빈 폼을 보여 주고 사람이 같은 답을 다시 넣는다.
  const { data: mine, error: mineError } = await supabase
    .from('wtp_signals')
    .select(cols)
    .eq('project_id', projectId)
    .eq('owner_email', who.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (mineError) {
    console.error('[wtp] mine select error:', mineError.message)
    return NextResponse.json({ error: '이전 답을 읽지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ signals: signals ?? [], mine: mine ?? null })
}
