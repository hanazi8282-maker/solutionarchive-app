#!/usr/bin/env node
// [꼬리표] 샘플: 유료본 상황(손님 종류 × 새 손님 얻기 행동 묶음)에 닮은 5장 꼬리표 줄을 꺼내 "N곳이 했고 M곳이 됐다"로 묶는다.
// 사용: node --env-file=.env.local scripts/chapter-tag-sample.mjs --bucket outbound --customer smb
import { createClient } from '@supabase/supabase-js'
import { summarize } from '../lib/consult/chapter-tags.ts'
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const rows = []
for (let p = 0; ; p++) {
  const { data, error } = await sb.from('ss_move_tags_current').select('action_kind,customer,result_class,result_ko,why_worked_ko,condition_ko').eq('chapter', '5').range(p * 1000, p * 1000 + 999)
  if (error) { console.error(error.message); process.exit(2) }
  rows.push(...data); if (data.length < 1000) break
}
const s = summarize(rows, arg('bucket', 'paid_ads'), arg('customer', 'consumer'))
console.log(JSON.stringify({ n: s.n, won: s.won, failedOrMixed: s.failedOrMixed, enough: s.enough, hasFailure: s.hasFailure }))
console.log(s.lines.join('\n'))
