#!/usr/bin/env node
// 컨설팅 승인 테스트 T7(에이전트 도구 호출)·T9(결제 요청 → 수동 활성화 → 유료 판정 → 종료) 실측 하네스(v71ci).
//   node --env-file=.env.local scripts/consult-t7-t9.mjs --run <run_id> [--owner you@x.com]
// T9 는 테스트 계정(@example.invalid)으로만 돈다. 행은 지우지 않고 마지막에 status='ended' 로 남긴다(삭제 금지 훅 — 감사 흔적).
import { db } from '../lib/consult/runs.ts'
import { chatTurn } from '../lib/consult/agent.ts'
import { isActive, isPaid } from '../lib/consult/entitlement.ts'
import { addMonth } from '../lib/consult/period.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const runId = arg('run')
let pass = 0, fail = 0
const t = (name, ok, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }
const sb = await db()

// T7 — 에이전트가 실제로 도구를 부른다(손실 재계산·사례 검색), 도구 결과가 답에 반영된다.
if (runId) {
  const { data: run } = await sb.from('consult_runs').select('*').eq('id', runId).single()
  const q1 = '월 대상자 3000명, 전환율 1.5%, 객단가 10만원이고 놓치는 비율이 10~20%라면 월 손실이 얼마인지 계산해 주세요.'
  const a1 = await chatTurn(run, q1)
  const { data: tools1 } = await sb.from('consult_messages').select('content,tool').eq('run_id', runId).eq('role', 'tool').order('id', { ascending: false }).limit(3)
  const recalc = tools1?.find((x) => x.content === 'recalc_loss')
  t('T7a: recalc_loss 도구를 호출했다', Boolean(recalc))
  t('T7a: 도구 결과(코드 곱셈 4.5~9만원)가 답에 반영됐다', Boolean(recalc) && /4\.5|5만|9만/.test(a1), a1.slice(0, 90))
  const q2 = '구독 모델로 성공한 비슷한 사례를 더 찾아서 알려 주세요.'
  const a2 = await chatTurn(run, q2)
  const { data: tools2 } = await sb.from('consult_messages').select('content').eq('run_id', runId).eq('role', 'tool').order('id', { ascending: false }).limit(3)
  t('T7b: search_cases 도구를 호출했다', Boolean(tools2?.some((x) => x.content === 'search_cases')), a2.slice(0, 90))
}

// T9 — 결제 요청 → 활성화 → 유료 판정 → 종료
const email = `t9-${Date.now()}@example.invalid`
t('T9: 요청 전에는 무료', (await isPaid(email)) === false)
const { data: req, error: e1 } = await sb.from('consult_payment_requests').insert({ owner_email: email, depositor_name: '테스트입금', plan: 'monthly_29000', amount_krw: 29000 }).select('id,status').single()
t('T9: 결제 요청 접수(status=requested)', !e1 && req?.status === 'requested', e1?.message)
t('T9: 요청만으로는 유료가 아니다(입금 확인 전)', (await isPaid(email)) === false)
const now = new Date()
const { error: e2 } = await sb.from('consult_payment_requests').update({ status: 'active', activated_at: now.toISOString(), activated_by: 'selftest', ends_at: addMonth(now).toISOString() }).eq('id', req.id).eq('status', 'requested')
t('T9: 수동 활성화', !e2, e2?.message)
t('T9: 활성화 뒤 유료', (await isPaid(email)) === true)
const { error: e3 } = await sb.from('consult_payment_requests').update({ status: 'ended', ends_at: new Date().toISOString() }).eq('id', req.id).eq('status', 'active')
t('T9: 종료', !e3, e3?.message)
t('T9: 종료 뒤 다시 무료', (await isPaid(email)) === false)
const { error: e4 } = await sb.from('consult_payment_requests').update({ status: 'active' }).eq('id', req.id).eq('status', 'requested')
t('T9: 종료된 요청은 requested 조건 활성화가 먹지 않는다(재활성화 불가)', !e4 && (await isPaid(email)) === false)

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건`)
process.exitCode = fail ? 1 : 0
