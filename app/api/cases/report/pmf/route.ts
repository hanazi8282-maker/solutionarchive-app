import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAllowedUser } from '@/lib/auth/session'
import { loadCaseCorpus } from '@/lib/cases/corpus-db'
import { readPmfRun, runQuestions, runScoring, startPmf, submitAnswers, type PmfDeps } from '@/lib/cases/idea-pmf-run'

// `/cases/report` PMF 판정 사분면 자가진단(P3 — reports/2026-10-01/design-direction-pmf-judgment.md A7).
//
//   POST {q, kind, input:{core_feature, customer, price?, alternative?, bottleneck_override?}, fresh?}
//        → 검증·캐시(본인 행)·상한·행 insert 후 즉시 응답(LLM 대기 없음). 새 행이면 after() 에서 잡 1(병목 → 선례 → 질문).
//   PUT  {run_id, answers:[{id, text|null}]} → awaiting_answers 인 본인 행만(아니면 409). after() 에서 잡 2(점수 → 사분면).
//   GET  ?run=<id> → 폴링(4초). 본인 행만(남의 행 404). 6분 넘은 queued·running·scoring 은 failed('시간 초과').
//
// 인증: `/api/cases/*` 는 proxy 기본 잠김 + 핸들러마다 requireAllowedUser. 인증 경계 변경 0.
// 앵글 API 와 달리 GET 도 본인만 — 답변은 창업자의 사업 계획 원문이다(확인 질문 3).
// 본체는 lib/cases/idea-pmf-run.ts(셀프테스트가 가짜 CLI·가짜 Supabase 로 돌린다). 여기는 HTTP 껍데기.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }
const RUN_ID = /^[0-9a-f-]{36}$/i

const deps = async (): Promise<PmfDeps | null> => {
  const sb = await createClient()
  return sb ? { sb, loadCorpus: () => loadCaseCorpus(sb, 'cases/report/pmf') } : null
}

export async function POST(req: Request) {
  const auth = await requireAllowedUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })
  const d = await deps()
  if (!d) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })
  const body = (await req.json().catch(() => null)) as { q?: unknown; kind?: unknown; input?: unknown; fresh?: unknown } | null
  const r = await startPmf(d, { q: body?.q, kind: body?.kind, input: body?.input, fresh: body?.fresh, email: auth.email })
  if (r.http === 200 && r.schedule) {
    const job = r.schedule
    after(() => runQuestions(d, job))
  }
  return NextResponse.json(r.body, { status: r.http, headers: NO_STORE })
}

export async function PUT(req: Request) {
  const auth = await requireAllowedUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { run_id?: unknown; answers?: unknown } | null
  const run = typeof body?.run_id === 'string' ? body.run_id : ''
  if (!RUN_ID.test(run)) return NextResponse.json({ error: 'run id 형식이 아니다' }, { status: 400 })
  const d = await deps()
  if (!d) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })
  const r = await submitAnswers(d, { runId: run, answers: body?.answers, email: auth.email })
  if (r.http === 200) {
    const job = r.schedule
    after(() => runScoring(d, job))
  }
  return NextResponse.json(r.body, { status: r.http, headers: NO_STORE })
}

export async function GET(req: Request) {
  const auth = await requireAllowedUser()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })
  const run = new URL(req.url).searchParams.get('run') ?? ''
  if (!RUN_ID.test(run)) return NextResponse.json({ error: 'run id 형식이 아니다' }, { status: 400 })
  const d = await deps()
  if (!d) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })
  const r = await readPmfRun(d, run, auth.email)
  return NextResponse.json(r.body, { status: r.http, headers: NO_STORE })
}
