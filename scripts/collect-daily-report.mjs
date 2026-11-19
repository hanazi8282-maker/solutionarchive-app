#!/usr/bin/env node
// [v71cu S6] 매일 06:30 KST 전: 수집 브리핑 집계를 굳힌다. v_collect_briefing_daily(+v_collect_new_onboarded) → collect_daily_report(그날 1행, 멱등 upsert)
// + ops/state/collect-briefing/<브리핑 날짜>.md + (토큰 있으면) Notion 일일 상태 로그 1행(브리핑이 읽는 입구, S0 Q11). 읽기 + 그 표 한 줄만 쓴다.
// 사용: node --env-file=.env.local scripts/collect-daily-report.mjs [--no-notion]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { kstDate, writeStatusLog } from './notion-status-log.mjs'
import { renderBriefingMd, stabilitySummary } from './collect-briefing-format.mjs'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const today = kstDate()
const hourKst = (new Date().getUTCHours() + 9) % 24
const briefDate = hourKst >= 12 ? kstDate(new Date(Date.now() + 864e5)) : today
const { data: payload, error: err } = await sb.rpc('collect_build_report', { p_date: today })
if (err) { console.error('collect_build_report 실패:', err.message); process.exit(2) }
const lines = payload.briefing

const md = renderBriefingMd(payload, briefDate)
fs.mkdirSync('ops/state/collect-briefing', { recursive: true })
fs.writeFileSync(`ops/state/collect-briefing/${briefDate}.md`, md)
console.log(`collect_daily_report ${today} 저장 · ${lines.length}줄 · md ${briefDate}`)

if (!process.argv.includes('--no-notion') && process.env.NOTION_API_TOKEN) {
  const top = lines.filter((l) => l.section === 1).slice(0, 12).map((l) => `${l.label}(${l.value}건·${l.note})`).join(' / ') || '새로 켠 소스 없음'
  const res = await writeStatusLog({ date: today, track: '기타', title: `${today}-수집브리핑`, done: `수집 집계 저장(collect_daily_report). 어제 새로 켠 곳: ${top}`.slice(0, 1800), blocked: stabilitySummary(lines), next: `상세: ops/state/collect-briefing/${briefDate}.md`, needsHuman: false, note: 'v71cu S6 자동' })
  console.log('notion', res.status ?? JSON.stringify(res).slice(0, 120))
}
