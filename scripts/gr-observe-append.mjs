#!/usr/bin/env node
// 역방향 관찰(G-R) 결과를 결정론적으로 적립한다.
//
//   node scripts/gr-observe-append.mjs <input.json> [--dry-run]
//
// 하는 일 (이 순서):
//   1) methodology/content/gr-observations.jsonl 에 append (기계가 읽는 정본, append-only)
//      - 같은 URL 이 이미 있으면 그 건은 건너뛴다. 재실행해도 중복되지 않는다.
//   2) methodology/content/threads-playbook.md 의 두 표에 행을 추가
//      - §1 코드표  (T-코드 자동 채번, 기존 최대값 + 1)
//      - §3-0 실측표 (좋아요율·도달률 자동 계산)
//   3) reports/gr/<날짜>-gr-entries.md 에 판정 로그 엔트리를 **붙여넣기 대기** 상태로 생성
//      - 이 스크립트는 04-decisions.md 에 직접 쓰지 않는다. SEED 보호 구역이라
//        사람이/에이전트가 확인하고 붙인다. DIGEST 의 "붙여넣기 대기: N건" 과 같은 관행.
//
// 하지 않는 일:
//   - 브라우저를 열지 않는다. 수치는 사람이(또는 브라우저 도구를 가진 에이전트가) 읽어서 입력한다.
//     화면에서 읽은 값만 넣는다 — 추정치를 실측표에 넣으면 표 전체가 죽는다.
//   - 04-decisions.md / cross-decisions.md 를 수정하지 않는다.
//
// 입력 스키마: .claude/commands/gr-observe.md 참조.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const JSONL = path.join(ROOT, 'methodology/content/gr-observations.jsonl');
const PLAYBOOK = path.join(ROOT, 'methodology/content/threads-playbook.md');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const inputPath = args.find((a) => !a.startsWith('--'));

if (!inputPath) die('사용: node scripts/gr-observe-append.mjs <input.json> [--dry-run]');

function die(msg) {
  console.error(msg);
  process.exit(2);
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const comma = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
const pct = (a, b) => (num(a) == null || !num(b) ? '—' : `${((a / b) * 100).toFixed(1)}%`);

// ── 입력 검증 ────────────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
} catch (e) {
  die(`입력 JSON 을 읽을 수 없다: ${e.message}`);
}
const obs = input.observations;
if (!Array.isArray(obs) || obs.length === 0) die('observations 배열이 비어 있다.');

const REQUIRED = ['url', 'handle', 'title', 'type', 'views', 'likes'];
const TYPES = ['리스트', '짧은통찰', '장문연재', '서사'];
const VERDICT = /^(통과|탈락:[^\s|]+|예외통과:[^\s|]+)$/;

const issues = [];
obs.forEach((o, i) => {
  for (const k of REQUIRED) {
    if (o[k] === undefined || o[k] === null || o[k] === '') issues.push(`[${i}] ${k} 누락`);
  }
  if (o.type && !TYPES.includes(o.type)) issues.push(`[${i}] type 은 ${TYPES.join('|')} 중 하나`);
  for (const k of ['solfa_verdict', 'pdp_verdict']) {
    if (!o[k]) issues.push(`[${i}] ${k} 누락 — 역방향은 양쪽 게이트를 다 돌린다`);
    else if (!VERDICT.test(o[k])) issues.push(`[${i}] ${k} 형식: 통과 | 탈락:G-x | 예외통과:G-x`);
  }
  if (num(o.views) != null && num(o.likes) != null && o.likes > o.views) {
    issues.push(`[${i}] likes > views — 화면을 다시 읽어라`);
  }
});
if (issues.length) {
  console.error('입력 검증 실패. 한 건도 쓰지 않는다.\n' + issues.map((s) => '  - ' + s).join('\n'));
  process.exit(2);
}

// ── 중복 제거 ────────────────────────────────────────────────────────────────
const existing = fs.existsSync(JSONL)
  ? fs.readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const seen = new Set(existing.map((e) => e.url));
const fresh = obs.filter((o) => !seen.has(o.url));
const skipped = obs.length - fresh.length;

if (fresh.length === 0) {
  console.log(`새 관찰 0건 (중복 ${skipped}건). 아무것도 쓰지 않았다.`);
  process.exit(0);
}

// ── T-코드 채번 ──────────────────────────────────────────────────────────────
let book = fs.readFileSync(PLAYBOOK, 'utf8');
const maxT = Math.max(
  0,
  ...[...book.matchAll(/\|\s*\*\*T-(\d{2,})\*\*/g)].map((m) => parseInt(m[1], 10)),
  ...existing.map((e) => parseInt(String(e.code || 'T-0').slice(2), 10) || 0),
);
fresh.forEach((o, i) => {
  o.code = `T-${String(maxT + 1 + i).padStart(2, '0')}`;
  o.observed_at = input.session_date || new Date().toISOString().slice(0, 10);
  o.like_rate = num(o.views) && num(o.likes) ? +(o.likes / o.views).toFixed(4) : null;
  o.reach_rate = num(o.views) && num(o.followers) ? +(o.views / o.followers).toFixed(4) : null;
});

// ── 표 삽입 헬퍼 ─────────────────────────────────────────────────────────────
function insertAfterTable(text, headerIncludes, rows) {
  const lines = text.split('\n');
  const h = lines.findIndex((l) => headerIncludes.every((s) => l.includes(s)));
  if (h === -1) return { ok: false, text };
  let end = h + 1; // 구분선
  while (end + 1 < lines.length && lines[end + 1].trimStart().startsWith('|')) end++;
  lines.splice(end + 1, 0, ...rows);
  return { ok: true, text: lines.join('\n') };
}

const codeRows = fresh.map(
  (o) =>
    `| **${o.code}** | ${o.title} | ${o.type} | ${o.length || '—'} | ${o.style || '—'} | ${o.move || '—'} |`,
);
const measRows = fresh.map(
  (o) =>
    `| **${o.code}** ${o.title} | ${o.type} | ${o.part || '1/1'} | ${comma(num(o.views))} | **${comma(num(o.likes))}** | ` +
    `${comma(num(o.replies))} | ${comma(num(o.reposts))} | ${comma(num(o.shares))} | ` +
    `**${pct(o.likes, o.views)}** | ${pct(o.views, o.followers)} |`,
);

const r1 = insertAfterTable(book, ['| 코드 |', '제목/첫줄'], codeRows);
if (!r1.ok) die('§1 코드표를 찾지 못했다. 표 헤더가 바뀌었는지 확인하라.');
const r2 = insertAfterTable(r1.text, ['좋아요율', '도달/팔로워'], measRows);
if (!r2.ok) die('§3-0 실측표를 찾지 못했다. 표 헤더가 바뀌었는지 확인하라.');
book = r2.text;

// ── 판정 로그 엔트리 (붙여넣기 대기) ─────────────────────────────────────────
const date = input.session_date || new Date().toISOString().slice(0, 10);
const holes = [];
const entries = fresh
  .map((o) => {
    const s = o.solfa_verdict, p = o.pdp_verdict;
    const sFail = s !== '통과', pFail = p !== '통과';
    let verdict, route;
    if (!sFail && !pFail) {
      verdict = '둘 다 통과 → 신뢰도 +1';
      route = 'pdp/04-decisions.md `## 4. 판정 로그`';
    } else if (sFail && pFail) {
      verdict = '★ 둘 다 탈락 → 양쪽 공통 구멍. 최고 가치';
      route = 'pdp/04-decisions.md + solfa/04-decisions.md 양쪽';
      holes.push(o);
    } else {
      verdict = '★★ 한쪽만 탈락 → 조건부 규칙의 증거';
      route = 'cross-decisions.md **갱신 대상**';
      holes.push(o);
    }
    return `### GR-${date.replace(/-/g, '')}-${o.code}  |  ${o.title}
- **출처**: \`외부관찰\`
- **대상**: ${o.url} (@${o.handle}${o.posted_at ? ', ' + o.posted_at : ''})
- **유형**: ${o.type}${o.part ? ' · ' + o.part : ''}
- **실측**: 조회 ${comma(num(o.views))} / 좋아요 ${comma(num(o.likes))} (${pct(o.likes, o.views)}) / 답글 ${comma(num(o.replies))} / 리포스트 ${comma(num(o.reposts))} / 공유 ${comma(num(o.shares))}${o.followers ? ` / 도달·팔로워 ${pct(o.views, o.followers)}` : ''}
- **인용문(실물)**: ${o.quotes?.length ? o.quotes.map((q) => `"${q}"`).join(' / ') : '**미확보** — R-0·R-6 을 채우지 못했다. 답글을 열어 다시 읽어라'}
- **핵심 판정**: 솔파 \`${s}\` / 프드프 \`${p}\` → ${verdict}
- **적재 위치**: ${route}
- **메모**: ${o.note || '—'}
`;
  })
  .join('\n');

const reportDir = path.join(ROOT, 'reports/gr');
const reportPath = path.join(reportDir, `${date}-gr-entries.md`);
const noQuote = fresh.filter((o) => !o.quotes?.length).length;
const report = `# 역방향 관찰 판정 로그 — ${date}

붙여넣기 대기: **${fresh.length}건**
구멍 발견(신규 규칙 후보): **${holes.length}건**
인용문 미확보: **${noQuote}건**${noQuote ? ' ⚠️ R-0·R-6 을 추측으로 채우지 마라' : ''}

> 이 파일은 자동 생성이다. 아래 엔트리를 해당 \`04-decisions.md\` 의 \`## 4. 판정 로그\` 에
> **사람이 확인하고** append 한다. \`## 2. 규칙 SEED\` 는 수정 금지.
${holes.length ? `> 구멍 ${holes.length}건은 \`## 5. 신규 규칙 후보\` 에 \`발견 경로: 외부관찰(G-R 구멍)\` 로 별도 엔트리를 만든다.\n` : ''}
---

${entries}`;

// ── 쓰기 ─────────────────────────────────────────────────────────────────────
if (DRY) {
  console.log('--dry-run: 아무것도 쓰지 않았다.\n');
  console.log(`신규 ${fresh.length}건 (중복 건너뜀 ${skipped}건)`);
  fresh.forEach((o) => console.log(`  ${o.code}  ${o.title}  ${pct(o.likes, o.views)}  [솔파 ${o.solfa_verdict} / 프드프 ${o.pdp_verdict}]`));
  console.log(`\n생성 예정: ${path.relative(ROOT, reportPath)}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(JSONL), { recursive: true });
fs.appendFileSync(JSONL, fresh.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');
fs.writeFileSync(PLAYBOOK, book, 'utf8');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, report, 'utf8');

console.log(`적립 ${fresh.length}건 (중복 건너뜀 ${skipped}건)`);
fresh.forEach((o) => console.log(`  ${o.code}  ${o.title}  ${pct(o.likes, o.views)}  [솔파 ${o.solfa_verdict} / 프드프 ${o.pdp_verdict}]`));
console.log(`\n  ${path.relative(ROOT, JSONL)}`);
console.log(`  ${path.relative(ROOT, PLAYBOOK)}  (§1 코드표 · §3-0 실측표)`);
console.log(`  ${path.relative(ROOT, reportPath)}  ← 붙여넣기 대기 ${fresh.length}건 / 구멍 ${holes.length}건`);
console.log(`\n다음: bash scripts/sync-content-skill.sh`);
