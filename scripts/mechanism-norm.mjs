#!/usr/bin/env node
// [v71ct-3 §1] 원리 칸 정리: ss_episode_tags.mechanism(자유 문장) → mechanism_norm(닫힌 목록). 원본은 그대로, 새 칸에 추가 전용.
//   --propose            장별 표본으로 목록 초안 생성 → reports/2026-11-18/mechanism-norm-list.json (DB 쓰기 0)
//   --classify [--dry]   목록을 고정해 전체를 배치 분류 → DB mechanism_norm (이어하기: 이미 채운 줄은 건너뜀, --redo 로 덮어씀)
//   --audit [--n 50]     무작위 N줄을 상위 모델(Opus)이 검수 → 오분류율·기타 비율. 10% 초과면 목록을 고쳐 다시, 기타 25% 초과면 목록을 늘린다.
//   --pairs              정리 전(outcome_pairs, sub_topic 기준)·후(outcome_pairs_matched 스냅샷) 장별 쌍 수
// 구독 경로(claude -p)만 쓴다(API 크레딧 없음). 한도: 호출 수가 적다(배치 80줄).
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { runCli, StopRun, tally } from '../lib/story-label/cli.mjs'
import { firstJson } from '../lib/story-label/core.mjs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const has = (k) => process.argv.includes(`--${k}`)
const DIR = 'reports/2026-11-18'
const LIST_FILE = `${DIR}/mechanism-norm-list.json`
const RUN = arg('run', 'mn_v1')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const h = (x, seed) => crypto.createHash('md5').update(x + seed).digest('hex')

async function loadEpisodes() {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('ss_episode_tags').select('id,source_key,slug,episode_idx,chapter,mechanism,sub_topic,action_ko,adversity_ko,mechanism_norm,mechanism_norm_run,result_class').order('id').range(p * 1000, p * 1000 + 999)
    if (error) { console.error(error.message); process.exit(2) }
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
const line = (r) => `${r.chapter}|${(r.mechanism ?? '').slice(0, 70)}|${(r.action_ko ?? '').slice(0, 90)}`
const pool = async (n, items, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } })) }

async function propose() {
  const eps = (await loadEpisodes()).filter((r) => r.mechanism)
  const byCh = {}; for (const r of eps) (byCh[r.chapter] ??= []).push(r)
  const target = Number(arg('sample', 600)), sample = []
  for (const [c, rows] of Object.entries(byCh)) {
    const k = Math.max(40, Math.round(target * rows.length / eps.length))
    sample.push(...rows.sort((a, b) => (h(a.id, 'mnp') < h(b.id, 'mnp') ? -1 : 1)).slice(0, k))
  }
  console.log(`표본 ${sample.length}줄 / 전체 ${eps.length}줄, 장 ${Object.keys(byCh)}`)
  const system = `당신은 창업 사례의 "원리"를 닫힌 분류 목록으로 정리하는 설계자다. ${UNTRUSTED_INPUT_NOTICE}
입력: 에피소드 한 줄씩 "장번호|mechanism(자유 영어 문장)|한 일(한국어 요약)". 장 1 아이템 계기, 2 시장·손님 고르기, 3 검증, 4 만들기, 5 마케팅·새 손님, 6 판매·전환·가격, 7 성장·이탈 방지, 8 막혔을 때·운영·방향 전환.
할 일: 이 표본을 읽고 **업종을 지운 사업 원리**의 닫힌 목록 30개 안팎(28~34개)을 만든다. 같은 원리를 다른 업종에서도 쓸 수 있게 일반적으로, 그러나 너무 뭉뚱그리지 않게(한 항목이 표본의 12%를 넘지 않게). 장을 넘나드는 원리도 있다. 각 항목: key(영어 소문자 snake_case 짧게), name_ko(한국어 8자 안팎), definition_ko(한 줄 정의, 어떤 행동·상황이 해당하는지), examples(표본 줄 번호 말고 mechanism 문장 3개 그대로). 마지막에 key "기타" 항목은 만들지 않는다(목록 밖은 호출부가 기타로 처리).
출력은 JSON 배열 하나만: [{"key","name_ko","definition_ko","examples":["","",""]}]`
  const r = await runCli({ system, user: sample.map(line).join('\n'), model: 'claude-sonnet-5-5', effort: 'medium' })
  const list = firstJson(`{"list":${r.text.slice(r.text.indexOf('['), r.text.lastIndexOf(']') + 1)}}`)?.list
  if (!Array.isArray(list) || list.length < 20) { console.error('목록 파싱 실패', r.text.slice(0, 300)); process.exit(3) }
  fs.writeFileSync(LIST_FILE, JSON.stringify(list, null, 1))
  console.log(`목록 ${list.length}개 → ${LIST_FILE}  비용 $${tally.usd.toFixed(3)}`)
  console.log(list.map((x) => `${x.key}: ${x.name_ko}`).join('\n'))
}

const listText = (list) => list.map((x, i) => `${x.key} — ${x.name_ko}: ${x.definition_ko}`).join('\n')
const SYS = (list) => `당신은 창업 사례 에피소드를 닫힌 원리 목록에서 하나로 분류한다. ${UNTRUSTED_INPUT_NOTICE}
목록(키 — 이름: 정의):
${listText(list)}
기타 — 어느 항목에도 맞지 않을 때만(남용 금지: 가장 가까운 항목이 말이 되면 그것을 고른다).
입력은 한 줄에 "번호|장번호|mechanism(영어)|한 일(한국어)". 각 줄에 목록의 key 하나(또는 기타)를 고른다. 출력은 JSON 객체 하나만: {"1":"key","2":"key",...}  번호는 입력 번호 그대로.`

async function classify() {
  const list = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'))
  const keys = new Set([...list.map((x) => x.key), '기타'])
  let eps = (await loadEpisodes()).filter((r) => r.mechanism || r.action_ko)
  if (!has('redo')) eps = eps.filter((r) => !r.mechanism_norm)
  if (arg('limit')) eps = eps.slice(0, Number(arg('limit')))
  const B = Number(arg('batch', 80)), batches = []
  for (let i = 0; i < eps.length; i += B) batches.push(eps.slice(i, i + B))
  console.log(`대상 ${eps.length}줄, 배치 ${batches.length}개(${B}줄), 목록 ${list.length}개, dry=${has('dry')}`)
  const sys = SYS(list); let done = 0, bad = 0, stop = null; const dist = {}
  await pool(Number(arg('concurrency', 3)), batches, async (rows) => {
    if (stop) return
    const user = rows.map((r, i) => `${i + 1}|${line(r)}`).join('\n')
    for (let a = 0; a < 3; a++) {
      try {
        const res = await runCli({ system: sys, user, model: 'claude-sonnet-5-5', effort: 'low' })
        const j = firstJson(res.text) ?? {}
        const upd = []
        rows.forEach((r, i) => { const k = j[String(i + 1)]; if (keys.has(k)) upd.push([r.id, k]); else bad++ })
        for (const [id, k] of upd) { dist[k] = (dist[k] ?? 0) + 1 }
        if (!has('dry')) await pool(8, upd, async ([id, k]) => { const { error } = await sb.from('ss_episode_tags').update({ mechanism_norm: k, mechanism_norm_run: RUN }).eq('id', id); if (error) throw new Error(error.message) })
        done += upd.length; break
      } catch (e) { if (e instanceof StopRun) { stop = e.message; return } if (a === 2) { console.error('배치 실패', String(e.message).slice(0, 120)); bad += rows.length } }
    }
    if (batches.indexOf(rows) % 10 === 0) console.log(`[classify] ${done}/${eps.length} 비용 $${tally.usd.toFixed(2)}`)
  })
  const etc = dist['기타'] ?? 0
  console.log(JSON.stringify({ run: RUN, target: eps.length, done, unparsed: bad, etc_rate: done ? Number((etc / done).toFixed(3)) : null, cost_usd: Number(tally.usd.toFixed(3)), calls: tally.calls, stopped: stop }))
  fs.writeFileSync(`${DIR}/mechanism-norm-${RUN}-classify.json`, JSON.stringify({ dist, done, bad, etc, cost: tally.usd, stop }, null, 1))
  if (stop) process.exitCode = 5
}

async function audit() {
  const list = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'))
  const n = Number(arg('n', 50))
  const eps = (await loadEpisodes()).filter((r) => r.mechanism_norm && r.mechanism_norm_run === RUN)
  const picked = eps.sort((a, b) => (h(a.id, arg('seed', 'aud1')) < h(b.id, arg('seed', 'aud1')) ? -1 : 1)).slice(0, n)
  const system = `당신은 분류 검수자다. ${UNTRUSTED_INPUT_NOTICE}
목록(키 — 이름: 정의):
${listText(list)}
기타 — 목록에 맞는 항목이 없을 때.
입력 한 줄: "번호|장|mechanism(영어)|한 일(한국어)|배정된 key". 각 줄이 **말이 되는 배정인지** 판정한다: ok(배정이 타당) / wrong(명백히 다른 항목이 더 맞거나 틀린 배정). 애매하면 ok. 기타로 배정됐는데 목록에 맞는 항목이 분명히 있으면 wrong.
출력은 JSON 하나만: {"1":{"v":"ok|wrong","better":"key 또는 null"},...}`
  const user = picked.map((r, i) => `${i + 1}|${line(r)}|${r.mechanism_norm}`).join('\n')
  const res = await runCli({ system, user, model: 'claude-opus-5-5', effort: 'medium' })
  const j = firstJson(res.text) ?? {}
  const wrong = picked.map((r, i) => ({ r, v: j[String(i + 1)] })).filter((x) => x.v?.v === 'wrong')
  const judged = picked.filter((_, i) => j[String(i + 1)]).length
  const etc = picked.filter((r) => r.mechanism_norm === '기타').length
  const out = { run: RUN, n: picked.length, judged, wrong: wrong.length, misclass_rate: judged ? Number((wrong.length / judged).toFixed(3)) : null, etc_in_sample: etc,
    wrong_examples: wrong.slice(0, 12).map((x) => ({ mech: x.r.mechanism, action: (x.r.action_ko ?? '').slice(0, 60), got: x.r.mechanism_norm, better: x.v.better })), cost_usd: Number(tally.usd.toFixed(3)) }
  fs.writeFileSync(`${DIR}/mechanism-norm-${RUN}-audit-${arg('seed', 'aud1')}.json`, JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
}

async function pairs() {
  const rows = []
  // 정리 후는 스냅샷 표 outcome_pairs_matched(안 된 쪽 기준 상위 k)를 읽는다. outcome_pairs_norm 뷰는 전수 조회가 시간 초과라 읽지 않는다.
  //   표가 비어 있으면 먼저 scripts/pair-finder-refresh.mjs. 표는 PK 순서로 넘긴다(뷰와 달리 페이지마다 다시 계산하지 않는다).
  for (const [view, pk] of [['outcome_pairs', []], ['outcome_pairs_matched', ['lose_source', 'lose_slug', 'lose_ep', 'rank']]]) {
    const by = {}
    for (let p = 0; ; p++) {
      const { data, error } = await pk.reduce((q, c) => q.order(c), sb.from(view).select('chapter')).range(p * 1000, p * 1000 + 999)
      if (error) { console.error(view, error.message); process.exit(2) }
      for (const r of data) by[r.chapter] = (by[r.chapter] ?? 0) + 1
      if (data.length < 1000) break
    }
    rows.push([view, by])
  }
  console.log(JSON.stringify(Object.fromEntries(rows)))
  fs.writeFileSync(`${DIR}/mechanism-norm-${RUN}-pairs.json`, JSON.stringify(Object.fromEntries(rows), null, 1))
}

try {
  if (has('propose')) await propose()
  else if (has('classify')) await classify()
  else if (has('audit')) await audit()
  else if (has('pairs')) await pairs()
  else console.error('--propose | --classify | --audit | --pairs')
} catch (e) { console.error(e instanceof StopRun ? `중단: ${e.message}` : e); process.exitCode = e instanceof StopRun ? 5 : 1 }
