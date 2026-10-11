#!/usr/bin/env node
// 창문 프로브 대장 → review_targets 마이그레이션 **초안** + 롤백(v52 §1-2). 파일만 쓴다 — DB 접근·적용 없음.
//
//   node scripts/window-migration-draft.mjs --ledger=reports/<KST 날짜>/window-probe.json [--out-dir=supabase/migrations]
//
// 대상 = verdict 'adopted' ∧ draftable(앱스토어 mostRecent · 구글 플레이) 창문. 없으면 파일을 쓰지 않는다.
// 같은 날짜 초안(*_window_targets_<YYYYMMDD>.sql)이 이미 있으면 덮어쓰지 않고 멈춘다.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseProductRef as appstoreRef } from '../lib/review/adapters/appstore.ts'
import { parseProductRef as googleplayRef } from '../lib/review/adapters/googleplay.ts'
import { GOOGLEPLAY_FROZEN_ACTIVE, SHARE_GATE } from '../lib/review/target-supply.ts'

const REF = { appstore: appstoreRef, googleplay: googleplayRef }
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** 대장 → 초안에 넣을 행. 형식이 어긋난 행은 조용히 넘기지 않고 던진다. */
export function selectRows(ledger) {
  const rows = []
  const seen = new Set()
  for (const w of ledger.windows ?? []) {
    if (w.verdict !== 'adopted' || w.draftable !== true) continue
    const parse = REF[w.source_key]
    if (!parse || !parse(w.product_ref) || !parse(w.anchor_ref)) throw new Error(`bad window ${w.key}`)
    if (typeof w.label !== 'string' || !/^[^\\\r\n]{1,200}$/.test(w.label)) throw new Error(`bad label ${w.key}`)
    const k = `${w.source_key}|${w.product_ref}`
    if (seen.has(k)) continue
    seen.add(k)
    rows.push({ source_key: w.source_key, product_ref: w.product_ref, label: w.label, anchor_ref: w.anchor_ref, new_per_request: w.new_per_request })
  }
  return rows
}

/** 같은 날짜 접두 마이그 중 가장 큰 일련번호 + 10. */
export function nextStamp(existingFiles, yyyymmdd) {
  let max = 0
  for (const f of existingFiles) {
    const m = new RegExp(`^${yyyymmdd}(\\d{6})_`).exec(f)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${yyyymmdd}${String(max + 10).padStart(6, '0')}`
}

export function renderSql(rows, { name, ledgerPath, rollbackName }) {
  const values = rows.map((r, i) =>
    `  (${q(r.source_key)}, ${q(r.product_ref)}, ${q(r.label)}, ${q(r.anchor_ref)})${i < rows.length - 1 ? ',' : ''}  -- 요청당 새 글 ${r.new_per_request}`)
  const n = rows.length
  return `-- ============================================================
-- ${name}
--
-- ⛔ 미적용 초안 — scripts/window-migration-draft.mjs 가 ${ledgerPath} 의 채택 창문으로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: review_targets ${n}행 INSERT(같은 앱의 다른 국가 스토어 창문). UPDATE·DELETE·DDL 0.
--   project_id 는 앵커(같은 source_key 의 기존 타깃 anchor_ref)에서 읽는다 — uuid 하드코딩 없음.
--   앵커가 0행이면 사전 검사가 RAISE, 2행 이상이면 스칼라 서브쿼리가 21000 으로 던진다.
--   중복 방지: 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 NOT EXISTS 로 건너뛴다.
--   status='active' · last_run_at NULL(미방문 우선, 20261009000070 과 같은 방식) · 카운터는 컬럼 기본값.
-- 라벨: <영역>:<국가 접두>|<제품> (앱스토어 접두 = 국가, 구글 플레이 = <gl>-<hl>). 영역은 앵커 라벨 첫 ':' 앞.
-- 손대지 않는 것: review_sources · review_source_ramp(요청 예산 불변 — 같은 소스 안 창문이라 예산을 나눠 쓴다).
--
-- 사후 가드(어긋나면 RAISE → 전체 롤백):
--   · 구글 플레이 활성이 늘었고 ${GOOGLEPLAY_FROZEN_ACTIVE}(GOOGLEPLAY_FROZEN_ACTIVE) 초과면 RAISE — 동결선 예외는 PR #464 17개 한정.
--     넘으면 1:1 맞바꾸기(20261009000070 방식) 또는 사람 판단으로 다시 만든다.
--   · 앱스토어 활성 ÷ enabled 소스 활성 > ${SHARE_GATE}(SHARE_GATE) 이고 앱스토어 행을 넣었으면 RAISE.
-- 롤백: ${rollbackName}
--
-- 적용 전 드라이런(읽기만):
--   SELECT v.s, v.a, count(t.id) FROM (VALUES ${rows.map((r) => `(${q(r.source_key)}, ${q(r.anchor_ref)})`).join(', ')}) v(s, a)
--     LEFT JOIN public.review_targets t ON t.source_key = v.s AND t.product_ref = v.a GROUP BY 1, 2;   -- 기대: 전부 1
--   SELECT source_key, status, count(*) FROM public.review_targets WHERE source_key IN ('appstore','googleplay') GROUP BY 1, 2;
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _wt_new (
  source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, anchor_ref text NOT NULL, project_id uuid,
  PRIMARY KEY (source_key, product_ref)
) ON COMMIT DROP;
INSERT INTO _wt_new (source_key, product_ref, label, anchor_ref) VALUES
${values.join('\n')}
;

UPDATE _wt_new n SET project_id = (
  SELECT k.project_id FROM public.review_targets k WHERE k.source_key = n.source_key AND k.product_ref = n.anchor_ref);

CREATE TEMP TABLE _wt_before ON COMMIT DROP AS
SELECT source_key, count(*)::int AS n FROM public.review_targets WHERE status = 'active' GROUP BY 1;

DO $$
DECLARE off_sources text; running_at text; orphan text;
BEGIN
  SELECT string_agg(k, ',') INTO off_sources FROM (SELECT DISTINCT source_key AS k FROM _wt_new) v
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF off_sources IS NOT NULL THEN RAISE EXCEPTION '소스가 꺼져 있거나 없다: %', off_sources; END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _wt_new) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
  SELECT string_agg(source_key || ':' || anchor_ref, ', ') INTO orphan FROM _wt_new WHERE project_id IS NULL;
  IF orphan IS NOT NULL THEN RAISE EXCEPTION '앵커 타깃 없음: %', orphan; END IF;
END $$;

CREATE TEMP TABLE _wt_ins (id uuid, source_key text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, n.source_key, n.product_ref, n.label, 'active', NULL, NULL
    FROM _wt_new n
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = n.source_key AND t.product_ref = n.product_ref)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key
)
INSERT INTO _wt_ins SELECT id, source_key FROM ins;

DO $$
DECLARE ins int; gp_before int; gp_after int; as_ins int; as_active int; total_active int;
BEGIN
  SELECT count(*) INTO ins FROM _wt_ins;
  IF ins > ${n} THEN RAISE EXCEPTION '삽입 %행 > 후보 ${n}행', ins; END IF;
  SELECT coalesce((SELECT n FROM _wt_before WHERE source_key = 'googleplay'), 0) INTO gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after > gp_before AND gp_after > ${GOOGLEPLAY_FROZEN_ACTIVE} THEN
    RAISE EXCEPTION '구글 플레이 활성 % → % (동결선 ${GOOGLEPLAY_FROZEN_ACTIVE} 초과) — 1:1 맞바꾸기 또는 사람 판단', gp_before, gp_after;
  END IF;
  SELECT count(*) INTO as_ins FROM _wt_ins WHERE source_key = 'appstore';
  SELECT count(*) INTO as_active FROM public.review_targets WHERE source_key = 'appstore' AND status = 'active';
  SELECT count(*) INTO total_active FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.status = 'active';
  IF as_ins > 0 AND as_active > ${SHARE_GATE} * total_active THEN
    RAISE EXCEPTION '앱스토어 활성 %/% > ${SHARE_GATE}', as_active, total_active;
  END IF;
  RAISE NOTICE 'window targets: 삽입 %행(후보 ${n}) · googleplay 활성 % → % · appstore 활성 %/%', ins, gp_before, gp_after, as_active, total_active;
END $$;

COMMIT;

-- 확인: SELECT source_key, product_ref, label, status, last_run_at FROM public.review_targets
--   WHERE (source_key, product_ref) IN (${rows.map((r) => `(${q(r.source_key)}, ${q(r.product_ref)})`).join(', ')});   -- 기대 ${n}행 active
`
}

export function renderRollback(rows, { name }) {
  const triples = rows.map((r) => `  (${q(r.source_key)}, ${q(r.product_ref)}, ${q(r.label)})`).join(',\n')
  return `-- ============================================================
-- ${name} — ROLLBACK
--
-- ⛔ 미적용 초안. 삭제 없음: 이 마이그가 넣은 행만 status='failed'(planRevive 대상 아님 — 자동 부활 없음).
--   식별 = (source_key, product_ref, label) 정확히 일치 — LIKE 를 쓰지 않는다. 같은 쌍이 미리 있어 건너뛴 행은
--   라벨이 달라 안 잡힌다(라벨까지 같은 기존 행이 있었다면 적용 전 드라이런에서 걸렀어야 한다).
--   수집된 리뷰(analysis_inputs)는 그대로 남는다. 완전 삭제는 §10.2 예외 1번 — 사람 판단.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _wt_rb (source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _wt_rb (source_key, product_ref, label) VALUES
${triples};

DO $$
DECLARE running_at text;
BEGIN
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _wt_rb) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

UPDATE public.review_targets t SET status = 'failed'
  FROM _wt_rb r
 WHERE t.source_key = r.source_key AND t.product_ref = r.product_ref AND t.label = r.label AND t.status <> 'failed';

DO $$
DECLARE still int;
BEGIN
  SELECT count(*) INTO still FROM public.review_targets t JOIN _wt_rb r USING (source_key, product_ref, label) WHERE t.status <> 'failed';
  IF still <> 0 THEN RAISE EXCEPTION '%행이 아직 failed 가 아니다', still; END IF;
END $$;

COMMIT;
`
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }))
  if (!args.ledger) {
    console.error('usage: node scripts/window-migration-draft.mjs --ledger=reports/<YYYY-MM-DD>/window-probe.json [--out-dir=supabase/migrations]')
    process.exit(2)
  }
  const ledgerPath = String(args.ledger).replace(/\\/g, '/')
  const date = /(\d{4}-\d{2}-\d{2})/.exec(ledgerPath)?.[1]
  if (!date) throw new Error('대장 경로에 날짜(YYYY-MM-DD)가 없다')
  const ymd = date.replace(/-/g, '')
  const outDir = args['out-dir'] ?? 'supabase/migrations'
  const rows = selectRows(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')))
  if (rows.length === 0) {
    console.log('채택된(초안 대상) 창문 0 — 파일을 쓰지 않는다')
    return
  }
  const files = fs.readdirSync(outDir)
  if (files.some((f) => f.endsWith(`_window_targets_${ymd}.sql`))) {
    console.error(`이미 ${ymd} 초안이 있다 — 덮어쓰지 않는다`)
    process.exit(1)
  }
  const name = `${nextStamp(files, ymd)}_window_targets_${ymd}`
  const rollbackName = `${name}_rollback.sql`
  fs.writeFileSync(path.join(outDir, `${name}.sql`), renderSql(rows, { name, ledgerPath, rollbackName }))
  fs.writeFileSync(path.join(outDir, rollbackName), renderRollback(rows, { name }))
  console.log(`wrote ${outDir}/${name}.sql + ${rollbackName} (${rows.length}행, 미적용)`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main()
