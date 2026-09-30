import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { readRun, runAngles, runProbe, startAngles, type AngleDeps } from '@/lib/cases/idea-angles-run'

// `/cases/report` 앵글 검증 수치화(옵션 B, I4 — reports/2026-09-30/design-direction-ia-insights-report.md).
//
//   POST {q, kind}      → 상한·캐시·행 insert 후 즉시 {run_id, status, …}(LLM 대기 없음). 새 행이면 after() 에서 생성.
//   GET  ?run=<id>      → 폴링(4초). 6분 넘은 queued·running 은 여기서 failed('시간 초과')(게으른 청소).
//   POST ?probe=1       → 고정 프롬프트 1회. 결과·실제 모델·소요·바이너리 출처·토큰 존재 여부(값 없음)·런타임.
//
// 인증: `/api/cases/*` 는 proxy 기본 잠김(PUBLIC_* 에 없다) + 핸들러마다 requireAllowedUser. 인증 경계 변경 0.
// GET 은 본인 행이 아니어도 읽는다 — 허용목록 전원 같은 권한(CLAUDE.md §5-1), URL 이 곧 공유 리포트다.
// 본체는 lib/cases/idea-angles-run.ts(셀프테스트가 가짜 CLI·가짜 Supabase 로 돌린다). 여기는 HTTP 껍데기.

export const dynamic = 'force-dynamic'
// after() 는 응답 뒤에도 같은 함수 수명 안에서 돈다 — writer 1 + 앵글 3 × (judge, 최악 +재작성+재판정) 을 담을 여유.
export const maxDuration = 300

const deps = async (): Promise<AngleDeps | null> => {
  const sb = await createClient()
  return sb ? { sb, loadCorpus: () => loadCaseCorpus(sb, 'cases/report/angles') } : null
}

export async function POST(req: Request) {
  const auth = await requireAllowedUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })

  if (new URL(req.url).searchParams.get('probe') === '1') {
    return NextResponse.json(await runProbe({}), { headers: { 'Cache-Control': 'no-store' } })
  }
  const d = await deps()
  if (!d) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })
  const body = (await req.json().catch(() => null)) as { q?: unknown; kind?: unknown } | null
  const r = await startAngles(d, { q: body?.q, kind: body?.kind, email: auth.email })
  if (r.http === 200 && r.schedule) {
    const job = r.schedule
    after(() => runAngles(d, job))
  }
  return NextResponse.json(r.body, { status: r.http, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(req: Request) {
  const auth = await requireAllowedUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })

  const run = new URL(req.url).searchParams.get('run') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(run)) return NextResponse.json({ error: 'run id 형식이 아니다' }, { status: 400 })
  const d = await deps()
  if (!d) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })
  const r = await readRun(d, run)
  return NextResponse.json(r.body, { status: r.http, headers: { 'Cache-Control': 'no-store' } })
}
