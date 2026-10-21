#!/usr/bin/env node
// v71ba P0-1 — 언급 루프 대장 SQL(mention-loop-nightly 아티팩트의 mention-ledger.sql) → 마이그레이션 초안 + 롤백. DB 에 쓰지 않는다.
// 끊긴 자리(진단): 언급 루프는 매일 돌아 대장 SQL 을 아티팩트로만 내고, 그것을 DB 에 넣는 단계가 어디에도 없다(워크플로 contents: read,
//   "대화형·역할 세션이 적용" 이라고만 적혀 있고 실제 적용 0회). 그래서 origin='mention' 의 진짜 언급 행이 한 번도 생기지 않았다.
//   이 스크립트는 그 SQL 을 마이그레이션 파일로 감싸 오케스트레이터가 적용하는 경로(§10.2)에 올린다.
//   node scripts/mention-ledger-migrate.mjs --sql=<mention-ledger.sql> [--date=YYYY-MM-DD] [--seq=000030] [--out-dir=supabase/migrations] [--write]
//   기본 드라이런(계획만 출력). --write 일 때만 <out-dir>/<date>…_mention_ledger_<날짜>.sql · _rollback.sql 을 쓴다.
// 갱신 조건은 lib/discovery/mention-loop.ts LEDGER_UPDATE_GUARD 한 벌 — 옛 아티팩트(가드 없는 WHERE)는 여기서 가드로 바꿔 끼운다.
// 종료 코드: 0 · 1(입력 실패)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { LEDGER_UPDATE_GUARD } from '../lib/discovery/mention-loop.ts'

const OLD_WHERE = "WHERE public.discovery_candidates.origin = 'mention' AND public.discovery_candidates.verdict <> 'accepted';"
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** 순수 — 대장 SQL → {names, date, body}. 형태가 다르면 던진다(못 읽은 것을 0행으로 접지 않는다). */
export function parseLedgerSql(sql) {
  if (/^-- 대장 행 없음/.test(sql.trim())) return { names: [], date: null, body: null }
  if (!/^INSERT INTO public\.discovery_candidates \(kind, name, why,/m.test(sql)) throw new Error('mention-ledger.sql 형태가 아니다(INSERT INTO public.discovery_candidates 없음)')
  if (!/ON CONFLICT \(kind, lower\(name\)\) DO UPDATE/.test(sql)) throw new Error('ON CONFLICT 절 없음 — HN 발굴 행을 덮을 수 있어 감싸지 않는다')
  const names = [...sql.matchAll(/^ {2}\('saas', '((?:[^']|'')*)'/gm)].map((m) => m[1].replace(/''/g, "'"))
  const dates = new Set([...sql.matchAll(/'(\d{4}-\d{2}-\d{2})T00:00:00\+09:00'\)/g)].map((m) => m[1]))
  if (dates.size !== 1) throw new Error(`last_seen_at 날짜가 하나가 아니다(${[...dates].join(',') || '없음'})`)
  if (/, 'new_release', /.test(sql)) throw new Error('새 출시 행이 섞여 있다 — 이 스크립트는 언급 대장 전용')
  let body = sql.trim()
  if (body.includes(OLD_WHERE)) body = body.replace(OLD_WHERE, `WHERE ${LEDGER_UPDATE_GUARD};`)
  if (!body.includes(LEDGER_UPDATE_GUARD)) throw new Error('갱신 가드를 끼울 수 없다(WHERE 절이 예상과 다르다)')
  return { names, date: [...dates][0], body }
}

export function renderMigration({ names, date, body }, file) {
  return [
    `-- ${file} — 언급 루프 대장 ${date} (v71ba P0-1, scripts/mention-ledger-migrate.mjs 가 아티팩트 mention-ledger.sql 을 감쌌다)`,
    `-- discovery_candidates origin='mention' ${names.length}행 INSERT(같은 이름이 있으면 언급 행만 집계 칸 갱신 — HN 발굴·accepted·새 출시 입력 행은 안 덮음).`,
    '-- 🟢 비파괴: INSERT … ON CONFLICT 가드 갱신만. DELETE·DDL 없음. §10.1 발굴 적재(discovery_candidates 전체) 범위.',
    '-- ⚠️ 미적용 초안 — 적용은 오케스트레이터(§10.2). 근거 글 id 만 있고 원문 조각은 없다.',
    `-- 롤백: ${file.replace(/\.sql$/, '_rollback.sql')}`,
    '',
    'BEGIN;',
    '',
    body,
    '',
    'DO $$',
    'DECLARE n int;',
    'BEGIN',
    `  SELECT count(*) INTO n FROM public.discovery_candidates WHERE origin = 'mention' AND last_seen_at = ${q(`${date}T00:00:00+09:00`)};`,
    `  RAISE NOTICE '언급 대장 ${date}: origin=mention·이 날짜 행 % / 대장 ${names.length}(차이 = 같은 이름의 HN 발굴·새 출시 행)', n;`,
    'END $$;',
    '',
    'COMMIT;',
    '',
    '-- 확인: SELECT count(*) FROM public.discovery_candidates WHERE origin = \'mention\' AND coalesce(verdict_reason,\'\') NOT LIKE \'새 출시 입력%\';  -- 기대 ≥ 1',
    '',
  ].join('\n')
}

/** 롤백 — 지우지 않고 기각으로 접는다(§10.2 예외 1 회피). 이 날짜로 갱신된 기존 언급 행도 같이 접힌다(집계 칸 원래 값은 남지 않는다). */
export function renderRollback({ names, date }, file) {
  return [
    `-- ${file} 롤백 — 언급 대장 ${date} 이 넣거나 갱신한 언급 행을 기각으로 접는다. 삭제 없음. 멱등.`,
    'BEGIN;',
    `UPDATE public.discovery_candidates SET verdict = 'rejected', verdict_reason = ${q(`v71ba 롤백(mention_ledger ${date})`)}`,
    ` WHERE origin = 'mention' AND verdict <> 'accepted' AND last_seen_at = ${q(`${date}T00:00:00+09:00`)}`,
    `   AND coalesce(verdict_reason, '') NOT LIKE '새 출시 입력%'`,
    `   AND lower(name) IN (${names.map((n) => q(n.toLowerCase())).join(', ')});`,
    'COMMIT;',
    '',
  ].join('\n')
}

export function main(argv, { log = console.log } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  if (!opt('sql')) throw new Error('--sql=<mention-ledger.sql> 필요')
  const parsed = parseLedgerSql(fs.readFileSync(opt('sql'), 'utf8'))
  if (!parsed.names.length) {
    log('[언급 대장 → 마이그] 대장 행 0 — 파일 안 만듦')
    return { ...parsed, files: [] }
  }
  const date = opt('date') ?? parsed.date
  const file = `${date.replace(/-/g, '')}${opt('seq') ?? '000030'}_mention_ledger_${parsed.date.replace(/-/g, '')}.sql`
  const dir = opt('out-dir') ?? 'supabase/migrations'
  log(`[언급 대장 → 마이그] ${argv.includes('--write') ? '쓰기' : '드라이런'} · 대장 ${parsed.date} · ${parsed.names.length}행 · ${path.join(dir, file)}`)
  log(`  이름: ${parsed.names.join(' · ')}`)
  if (!argv.includes('--write')) return { ...parsed, files: [] }
  fs.mkdirSync(dir, { recursive: true })
  const files = [path.join(dir, file), path.join(dir, file.replace(/\.sql$/, '_rollback.sql'))]
  fs.writeFileSync(files[0], renderMigration(parsed, file))
  fs.writeFileSync(files[1], renderRollback(parsed, file))
  return { ...parsed, files }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(`❌ mention-ledger-migrate: ${e.message}`)
    process.exit(1)
  }
}
