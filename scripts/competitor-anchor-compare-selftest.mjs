#!/usr/bin/env node
// competitor-anchor-compare.mjs 셀프테스트 — DB·네트워크·LLM 없이. 부품(평가 수·기준점 고르기·방향 읽기·프로파일) + 경계(대장 파일 → main → 영역 1장) + 정적 검사.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ratingCountOf, pickAnchors, profileOf, parsePublicNotes, switchSides, nameGrams, compareArea, main, latestLedger, UNKNOWN } from './competitor-anchor-compare.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => (ok ? pass++ : (fail++, console.error(`✗ ${name}`)))

// ── 평가 수 · 기준점 ──
t('평가 수: "평가 83172건" · 쉼표 · 없으면 null', ratingCountOf('App Store(us) 평가 83172건(iTunes)') === 83172 && ratingCountOf('평가 1,129건') === 1129 && ratingCountOf('랭킹 근거 미확인') === null)
const dict = [
  { slug: 'bigrec', name: 'BigRec', selection_basis: '평가 9000건', summary_ko: '회의 기록', official_url: 'https://bigrec.example/', sources: { appstore: { status: '확인', url: 'https://apps.apple.com/us/app/x/id1' }, googleplay: { status: '미발견', url: null } }, _file: 'area-01.json', _researched_at: '2026-10-05' },
  { slug: 'midrec', name: 'MidRec', selection_basis: '평가 500건', summary_ko: '', sources: {}, _file: 'area-01.json' },
  { slug: 'norate', name: 'NoRate', selection_basis: '랭킹 근거 미확인', sources: {}, _file: 'area-01.json' },
  { slug: 'salesy', name: 'Salesy', selection_basis: '평가 10건', sources: {}, _file: 'area-03.json' },
]
const amap = { bigrec: '1', midrec: '1', norate: '1', salesy: '2' }
const pk = pickAnchors(dict, amap, '1', 5)
t('기준점: 영역 안에서 평가 수 내림차순 · 평가 수 없는 제품은 순위 밖(미확인 건수)', pk.anchors.map((a) => a.p.slug).join() === 'bigrec,midrec' && pk.unranked === 1 && pk.inArea === 3)
t('기준점: topN 상한', pickAnchors(dict, amap, '1', 1).anchors.length === 1)

// ── 프로파일 ──
const f0 = profileOf(pk.anchors[0])
const fv = (f, field) => f.find((x) => x.field === field)
t('프로파일: DB 없이면 가격대·타깃 미확인 + 사유', fv(f0, '가격대').value === UNKNOWN && /--db/.test(fv(f0, '가격대').source) && fv(f0, '타깃').value === UNKNOWN)
t('프로파일: 핵심 기능 주장 = 사전 요약 + 출처', fv(f0, '핵심 기능 주장').value === '회의 기록' && fv(f0, '핵심 기능 주장').source.includes('bigrec.example'))
t('프로파일: 채널 = 사전 "확인" 스토어만(미발견 제외)', fv(f0, '채널').value === 'App Store' && fv(f0, '채널').source.includes('apps.apple.com'))
t('프로파일: 공개 메모 없으면 랜딩·요금제·무료 체험·스토어 문구 미확인', ['공개 랜딩 문구', '요금제 구조', '무료 체험', '스토어 설명 핵심 문구'].every((k) => fv(f0, k).value === UNKNOWN))
t('프로파일: 요약 없는 제품은 핵심 기능 주장 미확인', fv(profileOf(pk.anchors[1]), '핵심 기능 주장').value === UNKNOWN)
const snap = { status: 'ok', created_at: '2026-10-01T00:00:00Z', sections: { pricing: [{ claim: '월 $30', evidence: [{ input_id: 'in-1' }] }], positioning: [] } }
const f1 = profileOf(pk.anchors[0], { snapshot: snap, notes: { free_trial: { text: '14일 무료', url: 'https://bigrec.example/pricing' } } })
t('프로파일: 스냅샷 주장 + 근거 ID · 빈 섹션은 미확인', fv(f1, '가격대').value.includes('월 $30') && fv(f1, '가격대').value.includes('in-1') && fv(f1, '타깃').value === UNKNOWN)
t('프로파일: 공개 메모는 출처 URL 과 함께', fv(f1, '무료 체험').value === '14일 무료' && fv(f1, '무료 체험').source === 'https://bigrec.example/pricing')
t('프로파일: 스냅샷 없음 사유 그대로', fv(profileOf(pk.anchors[0], { snapshot: { missing: '스냅샷 테이블 미적용(마이그 000037)' } }), '가격대').source.includes('000037'))
t('공개 메모: url 없는 칸·모르는 칸은 던진다', [{ x: { plans: { text: 'a' } } }, { x: { price: { text: 'a', url: 'https://a' } } }].every((j) => { try { parsePublicNotes(j); return false } catch { return true } }) && parsePublicNotes({ _about: 'x', x: { plans: { text: 'a', url: 'https://a' } } }).x.plans.text === 'a')

// ── 방향 읽기 ──
const s1 = switchSides('we switched from BigRec to Snibb last month')
t('방향: switched from X to Y', s1.from.has('bigrec') && s1.to.has('snibb'))
const s2 = switchSides('now using Snibb instead of BigRec')
t('방향: Y instead of X', s2.to.has('snibb') && s2.from.has('bigrec'))
const s3 = switchSides('빅렉에서 스닙으로 갈아탔어요')
t('방향: X에서 Y로 갈아탔', s3.from.has('빅렉') && s3.to.has('스닙'))
const s4 = switchSides('빅렉 대신 스닙 써요')
t('방향: X 대신 Y', s4.from.has('빅렉') && s4.to.has('스닙'))
t('방향: 단순 언급·vs 는 방향 없음', switchSides('Snibb vs BigRec').from.size === 0 && switchSides('I like Snibb').to.size === 0)
t('이름 묶음: 단어 경계로만(Rev 가 review 에 안 걸림) · 두 단어 이름', !nameGrams('great review here').has('rev') && nameGrams('we use Read AI daily').has('readai'))

// ── 비교 ──
const anchorKeys = new Map([['bigrec', 'BigRec']])
const rows = [
  { key: 'snibb', name: 'Snibb', tier: 'small', status: 'adopt', area: '1', score: 3, altN: 2, indieN: 1, priceN: 0, launchN: 0, evidence: [{ input_id: 'e1', quote: 'we switched from BigRec to Snibb' }, { input_id: 'e2', quote: 'Snibb is nice' }] },
  { key: 'plorbo', name: 'Plorbo', tier: 'new', status: 'adopt', area: '1', score: 2, altN: 1, indieN: 0, priceN: 1, launchN: 1, evidence: [{ input_id: 'e3', quote: 'moved from Plorbo to Glipr' }, { input_id: 'e4', quote: 'Plorbo and BigRec both' }] },
]
const cmp = compareArea(rows, anchorKeys)
t('비교: 기준점 → 후보 = 장점 근거(글 ID)', cmp[0].pros.length === 1 && cmp[0].pros[0].id === 'e1' && cmp[0].pros[0].text.includes('BigRec'))
t('비교: 후보 → 다른 것 = 단점 근거 · 방향 없으면 아무것도 안 붙음', cmp[1].cons.length === 1 && cmp[1].cons[0].id === 'e3' && cmp[1].pros.length === 0)
t('비교: 같이 언급된 기준점', cmp[1].coAnchors.has('BigRec') && cmp[0].coAnchors.has('BigRec'))

// ── 경계: 대장 파일 → main ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acmp-'))
fs.mkdirSync(path.join(tmp, '2026-10-10'))
fs.mkdirSync(path.join(tmp, '2026-10-11'))
fs.writeFileSync(path.join(tmp, '2026-10-10', 'rejected-candidates.json'), JSON.stringify({ entries: [], tier_rows: rows }))
fs.writeFileSync(path.join(tmp, '2026-10-11', 'rejected-candidates.json'), JSON.stringify({ entries: [] })) // tier_rows 없는 옛 대장 — 건너뛴다
t('최신 대장: tier_rows 있는 것만', latestLedger(tmp) === path.join(tmp, '2026-10-10', 'rejected-candidates.json') && latestLedger(path.join(tmp, 'nope')) === null)
const quiet = () => {}
const base = { reportsDir: tmp, dictionary: dict, areaMap: amap, log: quiet, now: new Date('2026-10-12T03:00:00Z') }
const dry = await main([], base)
t('드라이런: 파일 안 씀 · DB 안 읽음', dry.files.length === 0 && dry.snaps === null && !fs.existsSync(path.join(tmp, '2026-10-12')))
let dbCalls = 0
const port = { snapshotsBySlug: async (slugs) => (dbCalls++, new Map(slugs.map((s) => [s, s === 'bigrec' ? { ...snap, sections: { ...snap.sections, weaknesses: [{ claim: '모바일 느림', evidence: [{ input_id: 'w9' }] }] } } : { missing: '스냅샷 없음' }]))) }
const r = await main(['--run', '--db', '--areas=1,2'], { ...base, port })
const md1 = fs.readFileSync(path.join(tmp, '2026-10-12', 'anchor-compare-1.md'), 'utf8')
const md2 = fs.readFileSync(path.join(tmp, '2026-10-12', 'anchor-compare-2.md'), 'utf8')
t('run: 영역별 1장 · DB 는 --db 일 때 한 번', r.files.length === 2 && dbCalls === 1)
t('1장: 기준점 프로파일 · 장단점 표 · 경쟁 장점 후보 3소절', ['## 1. 경쟁 기준점 프로파일', '## 2. 기준점 대비 소형·신규 장단점', '## 3. 우리가 파고들 경쟁 장점 후보'].every((h) => md1.includes(h)))
t('1장: 근거 글 ID 가 표에 · 기준점 약점(스냅샷)이 후보로', md1.includes('(e1)') && md1.includes('(e3)') && md1.includes('BigRec 약점: 모바일 느림 (근거 w9)'))
t('1장: 영역 2 는 소형·신규 없음 → 미확인 문구', md2.includes(`소형·신규 채택 후보 ${UNKNOWN}`))
t('1장: 표 행 열 수 일정(파이프 이스케이프)', md1.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('|---')).every((l) => { const n = l.split(/(?<!\\)\|/).length; return n === 6 || n === 8 }))
t('잘못된 날짜는 던진다', await main(['--date=2026/10/12'], base).then(() => false, () => true))

// ── 정적 검사 ──
const src = fs.readFileSync(new URL('./competitor-anchor-compare.mjs', import.meta.url), 'utf8')
t('정적: 쓰기 메서드·쓰기 SQL 0', !/\.(insert|update|upsert|delete|rpc)\s*\(/i.test(src) && !/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(src))
t('정적: 네트워크 호출 0(fetch 없음)', !/\bfetch\s*\(/.test(src))
t('정적: LLM 호출 없음', !/anthropic|gemini|claude-cli|messages\.create/i.test(src.replace(/^\s*\/\/.*$/gm, '')))
t('정적: 파일 쓰기는 영역 1장 한 곳', (src.match(/writeFileSync\(/g) ?? []).length === 1)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '❌'} 경쟁 기준점 비교 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
