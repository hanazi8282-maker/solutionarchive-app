#!/usr/bin/env node
// candidate-register-draft.mjs 셀프테스트 — DB 없이. 경계: 승인 시트(실제 renderApprovalSheet 출력) → 사람 답 → approved.json → 마이그 초안.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderApprovalSheet, loadConfig } from './product-name-candidates.mjs'
import { sheetToApproved, suggestedAnchors, evidenceIdsFromTable, planRows, renderSql, renderRollback, main, DB_AREAS, RULE_VER } from './candidate-register-draft.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => {
  if (ok) pass++
  else {
    fail++
    console.error(`✗ ${name}`)
  }
}
const cfg = loadConfig()
const quiet = () => {}

// ── 경계 1: 실제 시트 렌더러로 v53 후보 8개 시트를 만들고 사람 답(Y 4 · N 4 · 미답 1)을 적는다 ──
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const cand = (name, key, area, refs = [], n = 1) => ({ name, key, area, areaShare: area === 'notes' ? null : 1, status: 'adopt', signals: ['midcap'], refs, evidence: [{ input_id: UID(n), source: 'appstore', quote: `we use ${name}` }] })
const rows = [
  cand('HubSpot CRM', 'hubspotcrm', '2', [], 1),
  cand('IndieWeb', 'indieweb', '2', [], 2),
  cand('MRR', 'mrr', '2', [], 3),
  cand('Adobe', 'adobe', '3', [], 4),
  cand('velcdn', 'velcdn', '3', ['img.velcdn.com'], 5),
  cand('Evernote', 'evernote', 'notes', ['appstore:id281796108'], 6),
  cand('Apple Notes', 'applenotes', 'notes', [], 7),
  cand('Bear', 'bear', 'notes', ['googleplay:com.example.bear', 'bear.app'], 8),
  cand('Zorp', 'zorp', '1', [], 9),
]
const sheetMd = renderApprovalSheet(rows, { date: '2026-10-12', ruleVer: cfg.rule_ver, cfg, priorSheet: null, areaNames: {} })
const ANSWER = { hubspotcrm: 'Y', evernote: 'Y', applenotes: '승인', bear: 'y', indieweb: 'N', mrr: 'N: 지표', adobe: '기각', velcdn: 'N' } // zorp: 미답
const answered = sheetMd
  .split('\n')
  .map((l) => {
    const k = /\| `([^`]+)` \|/.exec(l)?.[1]
    return /^\| \d/.test(l) && ANSWER[k] ? l.replace(/승인 Y \/ 기각 N \|$/, `${ANSWER[k]} |`) : l
  })
  .join('\n')
// 후보 표(근거 input_id 원천) — 실제 표와 같은 꼴의 줄만 흉내 낸다.
const tableMd = `| 채택 | HubSpot CRM | \`hubspotcrm\` | 5 | 1 (appstore) | midcap | 대안 0 · 확인 불가 | 2 100% () | ${UID(1)} · appstore · "x"<br>${UID(11)} · hackernews · "y" | 아니오 | - |`

const s = sheetToApproved(answered, tableMd)
const ap = (k) => s.approved.find((a) => a.norm_key === k)
t('시트→approved: Y·승인·y 4건만(HubSpot CRM·Evernote·Apple Notes·Bear)', s.approved.map((a) => a.norm_key).sort().join() === 'applenotes,bear,evernote,hubspotcrm')
t('시트→approved: N·N: 사유·기각 4건은 rejected', s.rejected.map((e) => e.key).sort().join() === 'adobe,indieweb,mrr,velcdn')
t('시트→approved: 빈 답(기본 문구)은 승인 아님 — 미답', s.unanswered.map((e) => e.key).join() === 'zorp')
t('시트→approved: 영역 = 시트 영역 칸(2 · notes)', ap('hubspotcrm').area === '2' && ['evernote', 'applenotes', 'bear'].every((k) => ap(k).area === 'notes'))
t('시트→approved: anchors 는 전부 null(임의 생성 금지)', s.approved.every((a) => Object.values(a.anchors).every((v) => v === null)))
t('시트→approved: 리뷰 속 링크는 anchors_suggested 로만', ap('evernote').anchors_suggested.appstore_id === '281796108' && ap('bear').anchors_suggested.play_pkg === 'com.example.bear' && ap('bear').anchors_suggested.domain === 'bear.app' && ap('applenotes').anchors_suggested.appstore_id === null)
t('시트→approved: 근거 input_id 는 후보 표에서(없으면 [])', JSON.stringify(ap('hubspotcrm').evidence_input_ids) === JSON.stringify([UID(1), UID(11)]) && ap('bear').evidence_input_ids.length === 0)
t('시트→approved: 표 줄 0개면 던진다(빈 시트를 승인 0 으로 접지 않는다)', (() => { try { sheetToApproved('# empty'); return false } catch { return true } })())
t('suggestedAnchors: 이름만 → 전부 null', Object.values(suggestedAnchors('등록 후보: 이름만(앱 ID·도메인 없음 — 수동 확인)')).every((v) => v === null))
t('evidenceIdsFromTable: 키 → uuid', evidenceIdsFromTable(tableMd).get('hubspotcrm')?.length === 2)

// ── 경계 2: approved(시트에서 나온 그대로) → 계획 → SQL ──
const plan = planRows(s.approved, { date: '2026-10-12' })
const pr = (k) => plan.projects.find((p) => p.norm_key === k)
t('계획: 프로젝트 4 · 타깃 0(앵커 null)', plan.projects.length === 4 && plan.targets.length === 0)
t('계획: HubSpot CRM → area_code 2 · manual 근거', pr('hubspotcrm').area_code === '2' && pr('hubspotcrm').area_evidence === `manual:${RULE_VER}:hubspotcrm`)
t('계획: notes 3개 → area_code NULL + notes: 접두(DB 어휘에 notes 없음)', !DB_AREAS.has('notes') && ['evernote', 'applenotes', 'bear'].every((k) => pr(k).area_code === null && pr(k).area_evidence === `notes:${k}`))
t('계획: 소개문 "Name — …"(후보 표 사전이 다시 안 올린다) · competitor_url 자리표시', pr('applenotes').pitch.startsWith('Apple Notes — ') && pr('applenotes').competitor_url === 'candidate:applenotes')
const sql = renderSql(plan, { name: 'X', rollbackName: 'X_rollback.sql', source: 'approved.json' })
const rb = renderRollback(plan, { name: 'X' })
const DESTRUCTIVE = /\b(DELETE\s+FROM|DROP\s+(TABLE|COLUMN|VIEW|INDEX|CONSTRAINT)|TRUNCATE|ALTER\s+TABLE)\b/i
const code = (x) => x.replace(/^\s*--.*$/gm, '')
t('SQL: 미적용 명시 · hold 규칙 · notes 처리 헤더', sql.includes('⛔ 미적용 초안') && sql.includes('영역 값 hold 규칙: 애매하면') && sql.includes("area_code NULL + area_evidence 'notes:<키>' 접두"))
t('SQL: 삭제·DDL 0(본문)', !DESTRUCTIVE.test(code(sql)) && !DESTRUCTIVE.test(code(rb)))
t('SQL(뮤턴트): 검사기가 DELETE·DROP 을 잡는다', DESTRUCTIVE.test(code(sql + '\nDELETE FROM public.x;')) && DESTRUCTIVE.test('DROP TABLE x'))
t('SQL: 트랜잭션 · lock_timeout', /^BEGIN;$/m.test(sql) && /^COMMIT;$/m.test(sql) && sql.includes("SET LOCAL lock_timeout = '5s'"))
t('SQL: 프로젝트 4행 VALUES · notes 는 NULL 영역', (sql.match(/^ {2}\('[a-z]+', '[a-z]+', /gm) ?? []).length === 4 && sql.includes("'candidate:evernote', NULL, 'notes:evernote'") && sql.includes("'candidate:hubspotcrm', '2', 'manual:"))
t('SQL: 중복 방지 — 기존 프로젝트 재사용(정규화 키) · 없을 때만 INSERT', sql.includes('IN (n.norm_key, n.name_key)') && sql.includes('WHERE n.project_id IS NULL'))
t("SQL: status='collecting' · area_basis='manual'", sql.includes("'product_fit', 'collecting', 'forward', 'SAAS', n.area_code, 'manual'"))
t('SQL: 앵커 없으면 review_targets INSERT 없음 · 앵커 확인 후 표기', !/INSERT INTO public\.review_targets/.test(sql) && sql.includes('수집 타깃은 앵커 확인 후'))
t('SQL: review_sources·ramp 안 건드림', !/(INSERT INTO|UPDATE)\s+public\.review_source/.test(sql))
t('롤백: 타깃 0이면 타깃 UPDATE 없음 · 프로젝트는 영역 칸만 NULL(행 삭제 없음)', !/UPDATE public\.review_targets/.test(rb) && rb.includes(`p.area_rule_ver = '${RULE_VER}' AND p.area_basis = 'manual'`))

// 앵커가 확인된 경우(사람이 anchors 로 옮김): 타깃 행·라벨 접두·플레이 동결 가드·롤백 failed
const withAnchors = s.approved.map((a) => (a.norm_key === 'evernote' ? { ...a, anchors: { appstore_id: '281796108', appstore_country: 'us', play_pkg: 'com.evernote', domain: 'https://evernote.com/' } } : a.norm_key === 'hubspotcrm' ? { ...a, anchors: { appstore_id: '1234567890', appstore_country: 'kr' } } : a))
const p2 = planRows(withAnchors, { date: '2026-10-12' })
const sql2 = renderSql(p2, { name: 'Y', rollbackName: 'Y_rollback.sql', source: 'a.json' })
const rb2 = renderRollback(p2, { name: 'Y' })
t('앵커: appstore us:<id> 라벨 notes:us|evernote · 플레이 us:en:<pkg> notes:us-en|evernote · kr 은 국가 접두 없음 2:hubspot-crm', JSON.stringify(p2.targets.map((x) => [x.source_key, x.product_ref, x.label])) === JSON.stringify([['appstore', 'kr:1234567890', '2:hubspot-crm'], ['appstore', 'us:281796108', 'notes:us|evernote'], ['googleplay', 'us:en:com.evernote', 'notes:us-en|evernote']]))
t('앵커: 도메인 → competitor_url', p2.projects.find((p) => p.norm_key === 'evernote').competitor_url === 'https://evernote.com')
t('앵커 SQL: review_targets INSERT · NOT EXISTS(source_key, product_ref) · 소스 enabled 가드 · 동결선', sql2.includes('INSERT INTO public.review_targets') && sql2.includes('WHERE NOT EXISTS (SELECT 1 FROM public.review_targets x WHERE x.source_key = t.source_key AND x.product_ref = t.product_ref)') && sql2.includes('소스가 꺼져 있거나 없다') && sql2.includes('동결선'))
t('앵커 롤백: 넣은 타깃만 failed(정확 일치)', rb2.includes("('googleplay', 'us:en:com.evernote', 'notes:us-en|evernote')") && rb2.includes("SET status = 'failed'") && !DESTRUCTIVE.test(code(rb2)))

// 잘못된 입력은 던진다
const bad = (a) => { try { planRows(a, { date: '2026-10-12' }); return false } catch { return true } }
t('입력 검사: 빈 배열·나쁜 앱 ID·나쁜 패키지·중복 키·나쁜 uuid', bad([]) && bad([{ ...s.approved[0], anchors: { appstore_id: 'abc' } }]) && bad([{ ...s.approved[0], anchors: { play_pkg: 'not a pkg' } }]) && bad([s.approved[0], s.approved[0]]) && bad([{ ...s.approved[0], evidence_input_ids: ['x'] }]))
const holdPlan = planRows([{ ...s.approved[0], area: 'unknown' }, { name: 'Glorp', norm_key: 'glorp', area: null, anchors: {}, evidence_input_ids: [] }], { date: '2026-10-12' })
t('hold 규칙: 영역 어휘 밖·빈 값 → area_code NULL + hold:<사유>', holdPlan.projects[0].area_code === null && holdPlan.projects[0].area_evidence === 'hold:area_not_in_vocab(unknown):hubspotcrm' && holdPlan.projects[1].area_evidence === 'hold:area_empty:glorp')
t("SQL 이스케이프: 이름의 ' 는 ''", renderSql(planRows([{ name: "Bob's Notes", norm_key: 'bobsnotes', area: 'notes', anchors: {}, evidence_input_ids: [] }], { date: 'd' }), { name: 'Z', rollbackName: 'z', source: 's' }).includes("'Bob''s Notes'"))

// ── 경계 3: main — 시트 파일 → approved.json + 대장 human_rejected → main --approved → 마이그 파일 ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crd-'))
const day = path.join(tmp, '2026-10-12')
fs.mkdirSync(day)
fs.writeFileSync(path.join(day, 'product-candidates-approval.md'), answered)
fs.writeFileSync(path.join(day, 'product-name-candidates.md'), tableMd)
fs.writeFileSync(path.join(day, 'rejected-candidates.json'), JSON.stringify({ date: '2026-10-12', entries: [{ key: 'foo', status: 'rejected', reason: 'stopword' }], human_rejected: [{ key: 'mrr', reason: 'human_rejected' }] }))
const m1 = main([`--sheet=${path.join(day, 'product-candidates-approval.md')}`], { log: quiet })
const approvedFile = path.join(day, 'approved-candidates.json')
const led = JSON.parse(fs.readFileSync(path.join(day, 'rejected-candidates.json'), 'utf8'))
t('main --sheet: approved-candidates.json 4건', m1.out === approvedFile && JSON.parse(fs.readFileSync(approvedFile, 'utf8')).length === 4)
t('main --sheet: N 은 대장 human_rejected 에 병합(기존 entries·중복 키 유지)', led.entries.length === 1 && led.human_rejected.map((e) => e.key).sort().join() === 'adobe,indieweb,mrr,velcdn' && led.human_rejected.find((e) => e.key === 'velcdn').sheet_date === '2026-10-12')
const mig = path.join(tmp, 'migrations')
fs.mkdirSync(mig)
fs.writeFileSync(path.join(mig, '20261012000020_window_targets_20261012.sql'), '')
const m2 = main([`--approved=${approvedFile}`, '--date=2026-10-12', `--out-dir=${mig}`], { log: quiet })
t('main --approved: 같은 날 다음 일련번호 · 파일 2개', m2.name === '20261012000030_candidate_register_20261012' && fs.existsSync(path.join(mig, `${m2.name}.sql`)) && fs.existsSync(path.join(mig, `${m2.name}_rollback.sql`)))
t('main --approved: 같은 날 초안이 있으면 덮어쓰지 않는다', (() => { try { main([`--approved=${approvedFile}`, '--date=2026-10-12', `--out-dir=${mig}`], { log: quiet }); return false } catch (e) { return /덮어쓰지 않는다/.test(e.message) } })())
t('main: 인자 없으면 던진다', (() => { try { main([], { log: quiet }); return false } catch { return true } })())
fs.rmSync(tmp, { recursive: true, force: true })

// ── 리포에 커밋된 v53 초안 = 생성기 출력(손으로 고치지 않았다) ──
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const committed = path.join(repo, 'supabase', 'migrations', '20261012000030_candidate_register_20261012.sql')
if (fs.existsSync(committed)) {
  const fx = planRows(JSON.parse(fs.readFileSync(path.join(repo, 'fixtures', 'candidate-register', 'approved-v53.json'), 'utf8')), { date: '2026-10-12' })
  const name = '20261012000030_candidate_register_20261012'
  const lf = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') // Windows 체크아웃(autocrlf)에서도 같게
  // 이미 적용된 마이그의 pitch 에는 당시 영역 표시명이 박혀 있다 — v71bi 영역표 이름 통일(config/areas.json) 뒤에도 같은 출력으로 재현되는지 옛 이름으로 되돌려 비교한다.
  const OLD_NAMES = [['① 회의록·통화 요약', '① 회의·통화 기록'], ['② 영업 도우미', '② 영업'], ['③ 마케팅 콘텐츠·광고 소재', '③ 마케팅(직접 도구만)'], ['④ 인사 운영(근태·급여·평가, 채용 제외)', '④ 인사 운영(근태·급여·평가 포함, 채용 제외)']]
  const oldNames = (x) => OLD_NAMES.reduce((acc, [n, o]) => acc.split(n).join(o), x)
  t('커밋된 초안 = 생성기(fixture approved-v53) 출력', lf(committed) === oldNames(renderSql(fx, { name, rollbackName: `${name}_rollback.sql`, source: 'fixtures/candidate-register/approved-v53.json' })))
  t('커밋된 롤백 = 생성기 출력', lf(committed.replace(/\.sql$/, '_rollback.sql')) === oldNames(renderRollback(fx, { name })))
  t('fixture: HubSpot CRM→2 · Evernote·Apple Notes·Bear→notes · 앵커 전부 null', JSON.stringify(fx.projects.map((p) => [p.norm_key, p.area_code])) === JSON.stringify([['hubspotcrm', '2'], ['evernote', null], ['applenotes', null], ['bear', null]]) && fx.targets.length === 0)
} else t('커밋된 v53 초안 파일이 있어야 한다', false)

// ── 정적: DB 접근·서비스키 없음 ──
const src = fs.readFileSync(new URL('./candidate-register-draft.mjs', import.meta.url), 'utf8')
t('정적: DB 클라이언트·서비스키·fetch 없음', !/supabase\/server|createClient|SERVICE_ROLE|fetch\(/.test(src))

console.log(`\n${fail === 0 ? '✅' : '❌'} 후보 등록 초안 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
