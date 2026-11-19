#!/usr/bin/env node
// 수집 브리핑 md·Notion 요약 셀프테스트(오프라인). 픽스처는 20261119000014 를 PGlite 에 적용해 나온 실제 briefing 행 모양.
import assert from 'node:assert/strict'
import { renderBriefingMd, stabilitySummary } from './collect-briefing-format.mjs'

const lines = [
  { section: 3, sort: 1, label: 'x', value: '4', delta: null, note: '24시간 차단·한도 응답' },
  { section: 9, sort: 0, label: 'heartbeat_summary', value: '2', delta: null, note: '켜진 소스 5 · ok 3 · 26시간 초과 1 · 30일 실행 기록 없음 1' },
  { section: 9, sort: 1, label: 'd', value: 'never', delta: '성공 없음', note: '마지막 성공 없음 · 마지막 상태 -' },
  { section: 10, sort: 0, label: 'canary_summary', value: '4', delta: null, note: 'ok 1 · 파싱 실패 2 · 빈 결과 1 · 확인 불가 1' },
  { section: 10, sort: 1, label: 'b', value: 'parse_fail', delta: '실패율 1.000 / 평소 0.000', note: '24h 실행 1 · 페이지 3 · 파싱 0 · 실패 7' },
  { section: 11, sort: 4, label: 'collected', value: '3', delta: '그제 10', note: '수집(analysis_inputs collected_at) · [경보] 그제의 절반 아래' },
  { section: 11, sort: 5, label: 'judged', value: '0', delta: '그제 0', note: '판정' },
]
const md = renderBriefingMd({ briefing: lines, generated_at: 'T' }, '2026-11-20')
assert.match(md, /## 9\. 심장박동\(26시간\)\n- heartbeat_summary: 2 — 켜진 소스 5/)
assert.match(md, /- d: never \(성공 없음\)/)
assert.match(md, /## 10\. 소스 카나리\n- canary_summary: 4/)
assert.match(md, /- b: parse_fail \(실패율 1\.000/)
assert.match(md, /## 11\. 깔때기 5숫자\n- collected: 3 \(그제 10\) — .*\[경보\]/)
assert.match(md, /## 8\. 판정\n- \(없음\)/) // 기존 섹션 빈 칸은 그대로 (없음)
assert.equal(stabilitySummary(lines), '차단 1곳 · 끌지 볼 곳 0곳 · 심장박동 이상 2곳 · 카나리 이상 4곳 · 깔때기 경보 collected')

// §7.1: 요약 줄이 없으면(마이그 미적용) "정상"이 아니라 확인 불가로 찍는다
const old = renderBriefingMd({ briefing: [], generated_at: 'T' }, '2026-11-20')
assert.match(old, /## 9\. 심장박동\(26시간\)\n- \(집계 없음 — 확인 불가/)
assert.match(old, /## 11\. 깔때기 5숫자\n- \(집계 없음 — 확인 불가/)
assert.equal(stabilitySummary([]), '차단 0곳 · 끌지 볼 곳 0곳 · 심장박동 확인 불가 · 카나리 확인 불가 · 깔때기 확인 불가')
console.log('collect-daily-report selftest OK')
