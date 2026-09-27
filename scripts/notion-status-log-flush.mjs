#!/usr/bin/env node
// 밀린 일일 상태 로그 올리기 — ops/state/status-log-pending/*.md 를 Notion "일일 상태 로그" DB 에 쓰고 파일을 지운다.
//
//   node scripts/notion-status-log-flush.mjs            # NOTION_API_TOKEN 필요(.github/workflows/notion-status-log-flush.yml 이 부른다)
//   node scripts/notion-status-log-flush.mjs --dry      # 파싱·대상만 출력. Notion·파일 쓰기 없음
//
// 왜 있나 (2026-09-27 실측): Claude Code CLI 세션에는 Notion MCP 도 NOTION_API_TOKEN 도 없다. CLAUDE.md §11-1 의
// "대화형 세션은 Notion MCP 로 쓴다" 는 Cowork(claude.ai 데스크톱) 세션에만 맞는다. 그래서 CLI 세션은 §11-3 폴백
// 파일만 남길 수 있는데, 그걸 "다음 세션이 올린다" 는 약속은 같은 이유로 지켜지지 않았다. 이 스크립트가 Actions 의
// 토큰으로 대신 올린다 — 파일이 main 에 머지되면 워크플로가 push 트리거로 돈다.
//
// 지키는 것
//   · 제목 번호는 DB 에서 다시 매긴다(파일 제목은 로컬 기준이라 이미 같은 번호가 있을 수 있다). 원래 파일명은 비고에 남긴다.
//   · 파싱이 안 되는 파일(날짜·트랙 없음)은 올리지 않고 남긴다 — 추측해서 올리지 않는다(§7.1). 종료 코드 1.
//   · 토큰이 없으면 아무것도 지우지 않고 종료 코드 1("안 해 봤다"를 0 으로 접지 않는다).
//   · 페이지가 만들어졌는데 재확인만 실패한 경우도 파일을 지운다(남기면 다음 실행이 중복 행을 만든다). 로그에 남긴다.
//
// 종료 코드: 0 = 전부 올림(대상 0건 포함) · 1 = 하나라도 못 올림(그 파일은 남아 있다)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePending, recordStatusLog } from './notion-status-log.mjs'

export const PENDING_DIR = path.join('ops', 'state', 'status-log-pending')

/** 폴더 → 올릴 항목. 파싱 실패는 { file, error } 로 돌려준다(빼놓지 않는다). */
export function collectPending(dir) {
  if (!fs.existsSync(dir)) return []
  // README 는 폴더 설명이지 로그가 아니다.
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !/^readme\.md$/i.test(f)).sort().map((file) => {
    const entry = parsePending(fs.readFileSync(path.join(dir, file), 'utf-8'))
    return entry ? { file, entry } : { file, error: '날짜·트랙을 읽지 못했다(renderPending 형식이 아니다)' }
  })
}

export async function flushPending({ dir = PENDING_DIR, dry = false, token = process.env.NOTION_API_TOKEN, record = recordStatusLog, rm = fs.unlinkSync, log = console.log } = {}) {
  const items = collectPending(dir)
  if (!items.length) { log(`대상 0건 — ${dir} 에 밀린 로그 없음`); return { code: 0, uploaded: [], failed: [] } }
  const uploaded = []
  const failed = []
  for (const it of items) {
    if (it.error) { failed.push(it.file); log(`❌ ${it.file}: ${it.error} — 남긴다`); continue }
    const e = { ...it.entry, title: undefined, note: [it.entry.note, `폴백 파일 ${it.file} 에서 올림(flush)`].filter(Boolean).join(' · ') }
    if (dry) { log(`· ${it.file} → ${e.date}-${e.track} (${e.needsHuman ? '사람판단필요' : '-'})`); uploaded.push(it.file); continue }
    if (!token) { failed.push(it.file); log(`❌ ${it.file}: 확인 불가(토큰 없음) — NOTION_API_TOKEN 미설정`); continue }
    const w = await record(e, { token })
    if (w.ok || w.pageId) {
      rm(path.join(dir, it.file))
      uploaded.push(it.file)
      log(w.ok ? `✅ ${it.file} → ${w.title} ${w.url ?? w.pageId}` : `⚠️ ${it.file} → 페이지는 생성됨(${w.pageId})·재확인 실패(${w.error}) — 중복 방지로 파일은 지운다`)
    } else {
      failed.push(it.file)
      log(`❌ ${it.file}: ${w.stage}: ${w.error} — 남긴다`)
    }
  }
  return { code: failed.length ? 1 : 0, uploaded, failed }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = await flushPending({ dry: process.argv.includes('--dry') })
  console.log(`올림 ${r.uploaded.length} · 실패 ${r.failed.length}`)
  process.exit(r.code)
}
