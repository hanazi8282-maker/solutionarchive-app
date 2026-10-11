#!/usr/bin/env node
// 퍼센트 램프 과민 반응 감사(남헌 v50 §2-1, 2026-10-12) — **읽기 전용**. SELECT 만, 쓰기 0건.
//
// 옛 차단 규칙 cap_base := floor(차단선 × 0.9) 가 googleplay 를 차단 1건에 60→1 로 떨어뜨렸다. 같은 로직으로 다른 소스도
// 비정상으로 낮아졌는지 본다. 읽는 표: review_source_ramp · review_source_ramp_log · review_source_cap_log.
// cap_base 변경은 로그에 숫자 칸이 없어 사유 문구에서 읽는다 — "상한 A→B"(차단) · "상한 복구 A→B"(v50 복구) · "cap_base A→B"(사람 마이그).
//
// 표(소스별): 현재 cap_base · 원래 값(cap_base_origin, 없으면 로그 최대 A, 없으면 현재) · 현재/원래 · 차단 수 · 차단 1건당 최대 감소율 ·
//   cap_base 변경 이력 · daily_request_cap 이력(cap_log) · 판정(과민 = 차단 1건에 50% 넘게 감소 / 하한 아래 = 원래 값 25% 미만).
//
// 사용법:
//   node scripts/ramp-sensitivity-audit.mjs              # DB 읽기(env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY) → 마크다운 표
//   node scripts/ramp-sensitivity-audit.mjs --self-test  # 픽스처 + "쓰기 호출·쓰기 SQL 없음" 정적 검사. 네트워크·DB·env 없음
// 서브에이전트는 DB 모드를 돌리지 않는다(§10.1) — 오케스트레이터가 돌린다.

import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const BLOCK_RE = /상한 (\d+)→(\d+)/
const RECOVER_RE = /상한 복구 (\d+)→(\d+)/
const HUMAN_RE = /cap_base (\d+)→(\d+)/
/** 차단 1건에 이보다 크게 줄면 과민(v50 규칙의 최대 감소 = 절반). */
export const OVERREACT_RATIO = 0.5
export const FLOOR_RATIO = 0.25

/** 사유 한 줄 → cap_base 변경 { kind, from, to } | null. */
export function parseCapChange(reason, event) {
  const s = reason ?? ''
  let m = s.match(RECOVER_RE)
  if (m) return { kind: 'recover', from: +m[1], to: +m[2] }
  m = s.match(HUMAN_RE)
  if (m) return { kind: 'human', from: +m[1], to: +m[2] }
  m = s.match(BLOCK_RE)
  if (m) return { kind: event === 'block' ? 'block' : 'other', from: +m[1], to: +m[2] }
  return null
}

/** 순수 분석. 입력은 세 표의 행 배열(created_at 오름차순이 아니어도 된다). */
export function analyze({ ramp, rampLog, capLog }) {
  const by = (rows, k) => rows.filter((r) => r.source_key === k).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  return ramp
    .filter((r) => r.cap_base != null)
    .map((r) => {
      const logs = by(rampLog, r.source_key)
      const changes = logs.map((l) => ({ at: l.created_at, ...parseCapChange(l.reason, l.event) })).filter((c) => c.kind)
      const blocks = logs.filter((l) => l.event === 'block')
      const blockDrops = changes.filter((c) => c.kind === 'block' && c.from > 0).map((c) => 1 - c.to / c.from)
      const maxDrop = blockDrops.length ? Math.max(...blockDrops) : 0
      const logMax = Math.max(0, ...changes.filter((c) => c.kind === 'block').map((c) => c.from))
      const origin = r.cap_base_origin ?? (Math.max(logMax, r.cap_base) || r.cap_base)
      const originSrc = r.cap_base_origin != null ? 'cap_base_origin' : logMax > r.cap_base ? '로그 최대' : '현재값'
      const ratio = origin > 0 ? r.cap_base / origin : 1
      const caps = by(capLog, r.source_key).filter((c) => c.new_cap != null)
      const flags = [
        ...(maxDrop > OVERREACT_RATIO ? ['과민'] : []),
        ...(r.cap_base < Math.max(1, Math.floor(origin * FLOOR_RATIO)) ? ['하한 아래'] : []),
      ]
      return {
        source_key: r.source_key,
        cap_base: r.cap_base,
        origin,
        originSrc,
        ratio,
        blocks: blocks.length,
        maxDrop,
        history: changes.map((c) => `${String(c.at).slice(0, 10)} ${c.kind} ${c.from}→${c.to}`),
        dailyCap: caps.length ? `${caps[0].previous_cap}→…→${caps.at(-1).new_cap} (${caps.length}회)` : '변경 없음',
        flags,
      }
    })
    .sort((a, b) => a.ratio - b.ratio || a.source_key.localeCompare(b.source_key))
}

const pct = (x) => `${Math.round(x * 100)}%`
export function toMarkdown(rows, notes = []) {
  const head = '| 소스 | 현재 cap_base | 원래 값(근거) | 현재/원래 | 차단 수 | 차단 1건 최대 감소 | cap_base 이력 | daily_request_cap 이력 | 판정 |'
  return [
    '## 램프 과민 반응 감사 (읽기 전용)',
    '',
    ...notes.map((n) => `- ${n}`),
    ...(notes.length ? [''] : []),
    head,
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      `| ${r.source_key} | ${r.cap_base} | ${r.origin}(${r.originSrc}) | ${pct(r.ratio)} | ${r.blocks} | ${r.blocks ? pct(r.maxDrop) : '-'} | ${r.history.join('<br>') || '-'} | ${r.dailyCap} | ${r.flags.join('·') || '정상'} |`),
    '',
    `과민 ${rows.filter((r) => r.flags.includes('과민')).length} · 하한 아래 ${rows.filter((r) => r.flags.includes('하한 아래')).length} · 전체 ${rows.length}`,
    '',
  ].join('\n')
}

/** 페이지 단위로 전부 읽는다(PostgREST 기본 1000행 상한). 3상태: rows / missing(표·칸 없음) / error. */
async function readAll(sb, table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999)
    if (error) return { state: /PGRST205|42P01|42703|PGRST204/.test(String(error.code)) ? 'missing' : 'error', message: error.message, rows: out }
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return { state: 'ok', rows: out }
  }
}

export async function main(sb) {
  const notes = []
  let ramp = await readAll(sb, 'review_source_ramp', 'source_key, cap_base, cap_base_origin')
  if (ramp.state === 'missing') {
    notes.push('cap_base_origin 칸 없음(마이그 20261012000010 미적용) — 원래 값은 로그 최대·현재값으로 추정')
    ramp = await readAll(sb, 'review_source_ramp', 'source_key, cap_base')
  }
  if (ramp.state !== 'ok') throw new Error(`review_source_ramp 확인 불가(${ramp.message}) — 감사 결과 없음(§7.1)`)
  const rampLog = await readAll(sb, 'review_source_ramp_log', 'source_key, event, reason, created_at')
  if (rampLog.state !== 'ok') throw new Error(`review_source_ramp_log 확인 불가(${rampLog.message}) — 이력 없이 판정하지 않는다(§7.1)`)
  const capLog = await readAll(sb, 'review_source_cap_log', 'source_key, previous_cap, new_cap, created_at')
  if (capLog.state !== 'ok') notes.push(`⚠️ review_source_cap_log 확인 불가(${capLog.message}) — daily_request_cap 이력 칸은 비어 있다`)
  return toMarkdown(analyze({ ramp: ramp.rows, rampLog: rampLog.rows, capLog: capLog.state === 'ok' ? capLog.rows : [] }), notes)
}

function selfTest() {
  let pass = 0, fail = 0
  const t = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) pass++
    else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
  }
  t('파싱: 옛 차단 사유', parseCapChange('차단 응답 1건 — 퍼센트 50%→50%, 연속정상 0, 3일 동결 · 차단선 2, 상한 60→1', 'block'), { kind: 'block', from: 60, to: 1 })
  t('파싱: v50 복구', parseCapChange('2026-10-12 ok … · 상한 복구 15→30(…)', 'day'), { kind: 'recover', from: 15, to: 30 })
  t('파싱: 사람 마이그', parseCapChange('남헌 v40 — 구글 플레이 cap_base 60→100(…)', null), { kind: 'human', from: 60, to: 100 })
  t('파싱: 변경 없음', parseCapChange('2026-10-10 ok (요청 7/목표 7) — 50% 유지', 'day'), null)
  const rows = analyze({
    ramp: [
      { source_key: 'googleplay', cap_base: 1 },
      { source_key: 'clien', cap_base: 462 },
      { source_key: 'velog', cap_base: 150, cap_base_origin: 300 },
      { source_key: 'off', cap_base: null },
    ],
    rampLog: [
      { source_key: 'googleplay', event: 'block', reason: '… 차단선 2, 상한 60→1', created_at: '2026-10-09T05:41:00Z' },
      { source_key: 'googleplay', event: 'start', reason: '남헌 v40 — cap_base 60→100', created_at: '2026-10-08T00:00:00Z' },
      { source_key: 'velog', event: 'block', reason: '… 차단선 9, 상한 300→150(절반, …)', created_at: '2026-10-12T05:41:00Z' },
    ],
    capLog: [
      { source_key: 'clien', previous_cap: 300, new_cap: 462, created_at: '2026-10-01T00:00:00Z' },
      { source_key: 'clien', previous_cap: 462, new_cap: null, created_at: '2026-10-02T00:00:00Z' },
    ],
  })
  const g = rows.find((r) => r.source_key === 'googleplay')
  t('googleplay: 원래 60(로그) · 1/60 · 차단 1 · 감소 98% · 과민·하한 아래', [g.origin, g.originSrc, g.blocks, Math.round(g.maxDrop * 100), g.flags], [60, '로그 최대', 1, 98, ['과민', '하한 아래']])
  const v = rows.find((r) => r.source_key === 'velog')
  t('velog: v50 절반은 과민 아님(=50%), 원래 칸 우선', [v.origin, v.originSrc, v.flags], [300, 'cap_base_origin', []])
  const c = rows.find((r) => r.source_key === 'clien')
  t('clien: 차단 없음 · 정상 · cap_log 반영분만', [c.blocks, c.flags, c.dailyCap], [0, [], '300→…→462 (1회)'])
  t('cap_base NULL 소스 제외 · 비율 낮은 순', rows.map((r) => r.source_key), ['googleplay', 'velog', 'clien'])
  const md = toMarkdown(rows, ['메모'])
  t('표: 헤더·소스 행·합계', [md.includes('| 소스 |'), md.split('\n').filter((l) => l.startsWith('| googleplay')).length, md.includes('과민 1 · 하한 아래 1 · 전체 3')], [true, 1, true])

  // 정적 검사 — 이 파일에 쓰기 호출·쓰기 SQL 이 없다(패턴은 조각으로 만들어 자기 자신에 걸리지 않게).
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const calls = ['ins' + 'ert', 'up' + 'date', 'up' + 'sert', 'del' + 'ete', 'r' + 'pc']
  const sql = ['INS' + 'ERT', 'UPD' + 'ATE', 'DEL' + 'ETE', 'DR' + 'OP', 'ALT' + 'ER', 'TRUN' + 'CATE', 'CRE' + 'ATE']
  t('정적: 쓰기 호출 없음(.insert/.update/.upsert/.delete/.rpc)', src.match(new RegExp(`\\.(${calls.join('|')})\\s*\\(`, 'g')), null)
  t('정적: 쓰기 SQL 키워드 없음', src.match(new RegExp(`\\b(${sql.join('|')})\\b`, 'g')), null)
  t('정적: select 만 쓴다', /\.select\(/.test(src), true)
  // 정적 검사가 실제로 잡는지(음성 대조) — 같은 정규식이 쓰기 줄을 잡아야 한다.
  t('정적 음성 대조: 쓰기 줄이면 잡힌다', ['sb.from(x).' + calls[1] + '({})', sql[0] + ' INTO x'].map((s) => new RegExp(`\\.(${calls.join('|')})\\s*\\(|\\b(${sql.join('|')})\\b`).test(s)), [true, true])

  console.log(`ramp-sensitivity-audit selftest: ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    const { openDb } = await import('./target-supply.mjs')
    const md = await main(await openDb())
    console.log(md)
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
  }
}
