#!/usr/bin/env node
// "[에이전트 상태판 YYYY-MM-DD]" 생성기 (v71av). **읽기 전용**(SELECT/count 만).
// 열: 에이전트 / 상태 / 마지막 실행 시각 / 오늘 산출 / 어제 대비 / 막힌 이유 / 완료 날짜. 24h 넘게 갱신이 없으면 '고장 의심'.
// 상태 = DB 에 흔적이 있으면 실측([직접 실행 확인]), 흔적을 읽을 길이 없으면 정적 칸([코드만 확인]) — 둘을 섞어 쓰지 않는다.
//   node scripts/agent-status-board.mjs [--out=<파일>]
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import { openDb } from './target-supply.mjs'

const H = 3_600_000
const UNK = '확인 불가'
// v71ba: 언급 대장 행은 언제나 mention_count 를 채운다. origin='mention' ∧ mention_count NULL = 새 출시 입력 우회분(소급 전).
const MENTION_ONLY = (q) => q.eq('origin', 'mention').not('mention_count', 'is', null)
/** 1번 누적 분리 — 항목마다 합산할 필터들. 새 출시 = origin new_release + 소급 전 mention·집계 NULL 행. */
export const SPLIT_1 = [
  { label: '리뷰 속 언급', parts: [MENTION_ONLY] },
  { label: '새 출시 입력', parts: [(q) => q.eq('origin', 'new_release'), (q) => q.eq('origin', 'mention').is('mention_count', null)] },
]

/**
 * 에이전트 정의. probe = DB 에서 마지막 실행·오늘/어제 산출을 읽는 명세({table, ts, where?}), 없으면 static 칸을 쓴다.
 * static = {status, why, done} — 코드만 보고 적은 것이라 라벨이 [코드만 확인]. 실제 가동되면 probe 를 달아 실측으로 바꾼다.
 * ponytail: 10·15 처럼 흔적이 reports/ 파일뿐인 것은 DB 근사(15 = cap_log). 정확한 마지막 실행은 Actions 로그를 읽는 별도 단계가 필요.
 */
export const AGENTS = [
  // v71ba: origin='mention' 18행은 새 출시 입력(CHECK 때문에 mention 으로 들어감, mention_count NULL)이었다 — 언급 산출로 세지 않는다. 누적은 두 갈래를 따로 적는다.
  { n: 1, name: '새 회사 자동 등록(언급 루프)', probe: { table: 'discovery_candidates', ts: 'created_at', where: MENTION_ONLY, split: SPLIT_1 }, empty: '원인: 리뷰 속 언급 후보 0행 — 대장 SQL 을 DB 에 넣는 단계 없음(scripts/mention-ledger-migrate.mjs → 마이그)' },
  { n: 2, name: '해외·영어 리뷰', probe: { table: 'analysis_inputs', ts: 'created_at', where: (q) => q.eq('lang', 'en') } },
  { n: 3, name: '다국어 리뷰', probe: { table: 'analysis_inputs', ts: 'created_at', where: (q) => q.not('lang', 'in', '(ko,en)') }, empty: '원인: ko/en 외 언어 리뷰 0건 — 타깃 미등록' },
  { n: 4, name: '새 커뮤니티 발굴 루프', probe: { table: 'review_sources', ts: 'created_at', where: (q) => q.neq('key', 'itunes_search') }, empty: '원인: 신규 소스 행 없음(탐색 루프 미연결)' },
  { n: 5, name: '하위 게시판 목록 발굴', static: { status: '미구현', why: '서브보드 목록 발굴기 없음', done: '구현 PR 후 날짜 확정' } },
  { n: 6, name: '검색 기반 신규 제품 발견', probe: { table: 'discovery_candidates', ts: 'created_at' } },
  { n: 7, name: '국가·키워드·정렬 자동 발굴(창문)', probe: { table: 'review_targets', ts: 'created_at' } },
  { n: 8, name: '후보 생성기 등록 모드', static: { status: '부분', why: '드라이런만(등록 모드 전환 전)', done: '30건 90% 확인 후' } },
  { n: 9, name: '임시→정식 자동 승격·폐기', static: { status: '미구현', why: '승격·폐기 스크립트 없음', done: '구현 PR 후 날짜 확정' } },
  { n: 10, name: '타깃 재고 보충(재방문 시계·게이지)', static: { status: '작동', why: 'nightly-review-collect pre-step(target-revive --auto)이 슬롯마다 실행 — 실행 시각은 reports/ 롤백 파일명이 정본', done: '게이지 블록은 이 PR' } },
  { n: 11, name: '공식 API 소스(GitHub·SE·YouTube)', probe: { table: 'review_collection_runs', ts: 'started_at', sumCol: 'new_reviews', where: (q) => q.in('source_key', ['github_issues', 'stackexchange', 'youtube']).eq('dry_run', false) } },
  { n: 12, name: '영업(②) 우선 발굴', static: { status: '범위 밖', why: '이번 개정 제외', done: '기존 일정' } },
  { n: 13, name: '수확률 기반 예산 재배분', static: { status: '범위 밖', why: '이번 개정 제외', done: '기존 일정' } },
  { n: 14, name: '이상 반응 알림', static: { status: '범위 밖', why: '이번 개정 제외', done: '기존 일정' } },
  { n: 15, name: '병목 자동감시·한도 대장', probe: { table: 'review_source_cap_log', ts: 'created_at' }, empty: '원인: 한도 변경 기록 없음' },
  { n: 16, name: '안정화 A~I', static: { status: '부분', why: 'A·B·D 설계(#577)까지, C·E~I 구현 증거 미확인', done: '이번 주(날짜 미확정)' } },
]

const kstDayStart = (now) => new Date(Math.floor((now.getTime() + 9 * H) / 86_400_000) * 86_400_000 - 9 * H)

/** 순수 함수 — 프로브 결과 맵 {n: {last, today, yday}|{error}} 로 블록을 만든다. */
export function statusBoard({ date, now, probes }) {
  const L = [`[에이전트 상태판 ${date}]`, '| # | 에이전트 | 상태 | 마지막 실행 | 오늘 산출 | 어제 대비 | 막힌 이유 | 완료 날짜 |', '|---|---|---|---|---|---|---|---|']
  for (const a of AGENTS) {
    let row
    if (a.static) {
      row = [a.n, a.name, `${a.static.status} [코드만 확인]`, UNK, UNK, UNK, a.static.why, a.static.done]
    } else {
      const p = probes[a.n]
      if (!p || p.error) row = [a.n, a.name, `${UNK} [직접 실행 확인 실패]`, UNK, UNK, UNK, p?.error ?? '프로브 없음', '-']
      else {
        const age = p.last ? (now.getTime() - Date.parse(p.last)) / H : null
        const status = age === null ? '미작동' : age > 24 ? '고장 의심(24h↑ 갱신 없음)' : '작동'
        const delta = p.today - p.yday
        const split = p.split ? ` · 누적 ${p.split.map((x) => `${x.label} ${x.n}`).join(' / ')}` : ''
        row = [a.n, a.name, `${status} [직접 실행 확인]`, p.last ? p.last.slice(0, 16) + 'Z' : '없음', `${p.today}${split}`, `${delta >= 0 ? '+' : ''}${delta} (어제 ${p.yday})`, age === null ? (a.empty ?? '실행 기록 없음') : age > 24 ? `마지막 실행 ${Math.round(age)}h 전` : '-', '-']
      }
    }
    L.push(`| ${row.join(' | ')} |`)
  }
  L.push('', '- 오늘 = KST 자정부터 지금까지, 어제 = KST 전일 하루 전체(시간대 길이가 달라 오늘이 작아 보일 수 있다). 11번 산출 = 신규 리뷰 합, 그 외 = 행 수.')
  return L.join('\n')
}

async function probe(sb, p, now) {
  const t0 = kstDayStart(now).toISOString(), y0 = new Date(kstDayStart(now).getTime() - 24 * H).toISOString()
  const w = p.where ?? ((q) => q)
  const one = async (build) => { const { data, error } = await build; if (error) throw new Error(error.message); return data }
  const lastRow = await one(w(sb.from(p.table).select(p.ts)).order(p.ts, { ascending: false }).limit(1))
  const win = async (a, b) => {
    if (p.sumCol) {
      const rows = await one(w(sb.from(p.table).select(p.sumCol)).gte(p.ts, a).lt(p.ts, b).limit(20000))
      return rows.reduce((s, r) => s + (Number(r[p.sumCol]) || 0), 0)
    }
    const { count, error } = await w(sb.from(p.table).select(p.ts, { count: 'exact', head: true })).gte(p.ts, a).lt(p.ts, b)
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  const total = async (f) => {
    const { count, error } = await f(sb.from(p.table).select(p.ts, { count: 'exact', head: true }))
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  const split = p.split ? await Promise.all(p.split.map(async (x) => ({ label: x.label, n: (await Promise.all(x.parts.map(total))).reduce((s, v) => s + v, 0) }))) : undefined
  return { last: lastRow[0]?.[p.ts] ?? null, today: await win(t0, new Date(now.getTime() + 1000).toISOString()), yday: await win(y0, t0), split }
}

export async function readProbes(sb, now) {
  const out = {}
  for (const a of AGENTS) {
    if (!a.probe) continue
    try { out[a.n] = await probe(sb, a.probe, now) } catch (e) { out[a.n] = { error: e.message } }
  }
  return out
}

export async function main(argv, { db, now = new Date() } = {}) {
  const sb = db ?? (await openDb())
  const date = new Date(now.getTime() + 9 * H).toISOString().slice(0, 10)
  const block = statusBoard({ date, now, probes: await readProbes(sb, now) })
  const out = argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (out) fs.writeFileSync(out, block + '\n')
  console.log(block)
  return block
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => { console.error(`❌ agent-status-board: ${e.message}`); process.exit(1) })
}
