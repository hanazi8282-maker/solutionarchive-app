#!/usr/bin/env node
// 감사 표본 시트(v71al §2-2) 셀프테스트 — 픽스처만(DB·네트워크 없음).
//   node scripts/audit-sheet-selftest.mjs

import { readFileSync } from 'node:fs'
import { buildAuditSheet, isSheetDay } from '../lib/analysis/audit-sheet.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}`) } }

// 1) 3일 주기 — 연속 30일 중 정확히 10일, 생성일 사이 간격은 늘 3일
{
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10))
  const on = days.filter((d) => isSheetDay(d, 3))
  t('주기: 30일 중 10일', on.length === 10)
  const gaps = on.slice(1).map((d, i) => (Date.parse(d) - Date.parse(on[i])) / 86_400_000)
  t('주기: 간격 전부 3일', gaps.every((g) => g === 3))
  t('주기: 연말 경계도 3일 간격', (() => { const a = ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'].filter((d) => isSheetDay(d, 3)); return a.length === 2 && (Date.parse(a[1]) - Date.parse(a[0])) / 86_400_000 === 3 })())
  t('주기: every 1 = 매일', days.every((d) => isSheetDay(d, 1)))
  t('주기: 날짜 형식이 틀리면 false', !isSheetDay('2026/10/17', 3) && !isSheetDay('', 3))
}

// 2) 시트 — 번호·원문 일부·빈 human_verdict, 모델 판정·input_id 없음
{
  const rows = [
    { input_id: 'aaaa-1', verdict: 'relevant', text: '좋아요, "정말"\n여러 줄' },
    { input_id: 'bbbb-2', verdict: 'irrelevant', text: 'x'.repeat(500) },
  ]
  const { sheet, key } = buildAuditSheet(rows)
  const lines = sheet.replace(/^﻿/, '').trim().split('\n')
  t('시트: BOM', sheet.startsWith('﻿'))
  t('시트: 머리글', lines[0] === '번호,원문 일부,human_verdict')
  t('시트: 2행 + 머리글', lines.length === 3)
  t('시트: 따옴표 이스케이프·줄바꿈 제거', lines[1] === '1,"좋아요, ""정말"" 여러 줄",')
  t('시트: human_verdict 칸은 비어 있음', lines.slice(1).every((l) => l.endsWith(',')))
  t('시트: 원문 300자로 자름', lines[2].includes('x'.repeat(300) + '…') && !lines[2].includes('x'.repeat(301)))
  t('시트: 모델 판정 가림', !/relevant|irrelevant|관련|무관/.test(sheet))
  t('시트: input_id 없음', !sheet.includes('aaaa-1') && !sheet.includes('bbbb-2'))
  const k = key.replace(/^﻿/, '').trim().split('\n')
  t('대조표: 번호가 시트와 같은 순서로 input_id·판정', k[0] === '번호,input_id,model_verdict' && k[1] === '1,"aaaa-1","relevant"' && k[2] === '2,"bbbb-2","irrelevant"')
}

// 3) 배선(문자열 검사) — 기존 표본 스크립트가 함수를 부르고, 워크플로가 3일·20건·아티팩트로 부른다
{
  const src = readFileSync(new URL('./relevance-grading-sample.mjs', import.meta.url), 'utf8')
  t('배선(문자열 검사): 표본 스크립트가 isSheetDay·buildAuditSheet 를 쓴다', src.includes('isSheetDay(today, every)') && src.includes('buildAuditSheet(sample)'))
  t('배선(문자열 검사): 생성일 아니면 DB 연결 전에 끝난다', src.indexOf('isSheetDay(today, every)') < src.indexOf('await createClient()'))
  const y = readFileSync(new URL('../.github/workflows/nightly-relevance.yml', import.meta.url), 'utf8')
  const step = y.slice(y.indexOf('- name: Audit sample sheet'), y.indexOf('retention-days'))
  t('워크플로: --n 0 --audit 20 --every 3 --sheet', step.includes('--n 0 --audit 20 --every 3 --sheet audit-sheet'))
  t('워크플로: continue-on-error 둘 다', (step.match(/continue-on-error: true/g) ?? []).length === 2)
  t('워크플로: 정규 슬롯만', step.includes("github.event.schedule == '3 19 * * *'"))
  t('워크플로: 아티팩트 업로드', step.includes('actions/upload-artifact@v4') && step.includes('path: audit-sheet/'))
  t('워크플로: 시크릿은 기존 두 이름만', [...step.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]).sort().join() === 'NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY')
  t('워크플로: cron 줄 수 그대로(3)', (y.match(/^\s*- cron:/gm) ?? []).length === 3)
}

console.log(`audit-sheet-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
