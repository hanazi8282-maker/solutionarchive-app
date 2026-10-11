#!/usr/bin/env node
// 제품 이름 후보 채택(등록) 초안 생성기 — 남헌 v53 §1 · §5 2-B 단계 2(2026-10-12). 파일만 쓴다 — DB 접근·적용 없음.
//
// 두 단계, 사람이 사이에 낀다:
//   1) 승인 시트 → approved.json 초안
//      node scripts/candidate-register-draft.mjs --sheet=reports/<KST>/product-candidates-approval.md [--out=<approved.json>]
//      - 답 칸이 Y(승인) 인 줄만 approved 로. 빈 답·기본 문구는 승인 아님(미답으로 세기만). N 은 같은 폴더 대장
//        rejected-candidates.json 의 human_rejected 에 병합(product-name-candidates.mjs ledgerOf·loadPriorRejected 와 같은 구조).
//      - anchors(appstore_id·play_pkg·domain)는 **null 로 둔다.** 시트의 "등록 후보" 칸(리뷰 속 링크에서 뽑은 앱 ID·호스트)은
//        anchors_suggested 로만 옮긴다 — 리뷰 속 링크가 그 제품의 공식 앱이라는 보장이 없다. 사람이 확인해 anchors 로 옮긴다.
//      - evidence_input_ids 는 같은 폴더 product-name-candidates.md 의 근거 칸에서 읽는다(없으면 []).
//   2) approved.json → 마이그레이션 초안 + 롤백
//      node scripts/candidate-register-draft.mjs --approved=<json> [--date=YYYY-MM-DD] [--out-dir=supabase/migrations]
//      approved.json: [{ name, norm_key, area: '1'..'5'|'design'|'notes'|null, anchors: { appstore_id?, appstore_country?, play_pkg?, domain? }, evidence_input_ids[] }]
//
// 영역 'notes'(노트·지식관리, 남헌 v53): DB CHECK analysis_projects_area_code_check(20261009000020)의 어휘가 아니다.
//   → area_code NULL + area_evidence 'notes:<norm_key>' 접두 + 타깃 라벨 'notes:' 접두로 쓴다(새 DDL 없음). 헤더에 적는다.
// 영역 값 hold 규칙: 영역 어휘(areas.json kind=area + notes) 밖이거나 비었으면 area_code NULL, area_evidence 'hold:<사유>'.
//
// 확장 지점(이 PR 범위 밖): 채택 후 이상 반응 알림(등록한 프로젝트의 수집량·관련 비율 급변) — renderSql 이 만든
//   _cr_new 의 norm_key 목록을 그 알림의 감시 대상으로 넘기면 된다. 여기서는 하지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseProductRef as appstoreRef } from '../lib/review/adapters/appstore.ts'
import { parseProductRef as googleplayRef } from '../lib/review/adapters/googleplay.ts'
import { GOOGLEPLAY_FROZEN_ACTIVE } from '../lib/review/target-supply.ts'
import { parseApprovalSheet, normKey, kstDate, loadConfig } from './product-name-candidates.mjs'
import { nextStamp } from './window-migration-draft.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AREAS = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'areas.json'), 'utf8')).areas
export const RULE_VER = 'cand-reg-v1'
const NOTES = loadConfig().notes_area
/** DB area_code 에 그대로 쓸 수 있는 값(20261009000020 CHECK 중 kind=area). notes 는 따로. */
export const DB_AREAS = new Set(AREAS.filter((a) => a.kind === 'area').map((a) => a.code))
const areaName = (code) => (code === NOTES.code ? NOTES.label : AREAS.find((a) => a.code === code)?.name ?? code)

const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const slugOf = (name) => String(name).normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '')

// ── 1) 승인 시트 → approved.json ─────────────────────────────────────────
/** "등록 후보: appstore:id1, googleplay:com.x, foo.io" → 제안 앵커(미확인). */
export function suggestedAnchors(proposal) {
  const refs = String(proposal ?? '').replace(/^등록 후보:\s*/, '').split(/,\s*/).filter((x) => x && !x.startsWith('이름만'))
  return {
    appstore_id: refs.map((r) => /^appstore:id(\d+)$/.exec(r)?.[1]).find(Boolean) ?? null,
    play_pkg: refs.map((r) => /^googleplay:(.+)$/.exec(r)?.[1]).find(Boolean) ?? null,
    domain: refs.find((r) => !/^(appstore|googleplay):/.test(r)) ?? null,
  }
}

/** 후보 표 마크다운에서 키 → 근거 input_id 목록. */
export function evidenceIdsFromTable(md) {
  const out = new Map()
  for (const l of String(md ?? '').split('\n')) {
    const k = /^\|[^|]*\|[^|]*\| `([^`]+)` \|/.exec(l)?.[1]
    if (k && !out.has(k)) out.set(k, [...new Set(l.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])])
  }
  return out
}

/** 순수 함수: 시트 마크다운 → { approved, rejected, unanswered }. */
export function sheetToApproved(sheetMd, tableMd = null) {
  const entries = parseApprovalSheet(sheetMd)
  if (entries.length === 0) throw new Error('승인 시트에서 표 줄을 하나도 못 읽었다 — 형식 확인(빈 시트를 "승인 0"으로 접지 않는다)')
  const ev = evidenceIdsFromTable(tableMd)
  const approved = entries
    .filter((e) => e.answer === 'approved')
    .map((e) => ({
      name: e.name,
      norm_key: e.key,
      area: e.area,
      anchors: { appstore_id: null, appstore_country: null, play_pkg: null, domain: null },
      anchors_suggested: suggestedAnchors(e.proposal),
      evidence_input_ids: ev.get(e.key) ?? [],
    }))
  return { approved, rejected: entries.filter((e) => e.answer === 'rejected'), unanswered: entries.filter((e) => e.answer === 'unanswered') }
}

/** N 답 → 같은 폴더 대장 human_rejected 에 병합(이미 있는 키는 그대로). 대장이 없으면 human_rejected 만 담아 만든다. */
export function mergeHumanRejected(ledgerPath, rejected, sheetDate) {
  const j = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { date: sheetDate, entries: [], human_rejected: [] }
  const have = new Set((j.human_rejected ??= []).map((e) => e.key))
  let added = 0
  for (const e of rejected) if (!have.has(e.key)) (j.human_rejected.push({ key: e.key, name: e.name, area: e.area, sheet_date: sheetDate, reason: 'human_rejected' }), added++)
  fs.writeFileSync(ledgerPath, JSON.stringify(j, null, 2) + '\n')
  return added
}

// ── 2) approved.json → 계획 ─────────────────────────────────────────────
/**
 * 순수 함수: 승인 항목 → 프로젝트·타깃 계획. 형식이 어긋나면 조용히 넘기지 않고 던진다.
 * 영역: DB 어휘면 그대로 · notes 면 NULL + 'notes:' · 그 밖·빈 값이면 NULL + 'hold:<사유>'.
 */
export function planRows(approved, { date }) {
  if (!Array.isArray(approved) || approved.length === 0) throw new Error('approved 가 빈 배열이다 — 초안을 만들지 않는다')
  const seen = new Set()
  const projects = []
  const targets = []
  for (const a of approved) {
    if (typeof a?.name !== 'string' || !/^[^\\\r\n]{1,80}$/.test(a.name)) throw new Error(`bad name: ${JSON.stringify(a?.name)}`)
    if (typeof a.norm_key !== 'string' || !/^[a-z0-9가-힣:._-]{2,120}$/.test(a.norm_key)) throw new Error(`bad norm_key: ${a.norm_key}`)
    if (seen.has(a.norm_key)) throw new Error(`중복 norm_key: ${a.norm_key}`)
    seen.add(a.norm_key)
    const ids = a.evidence_input_ids ?? []
    if (!Array.isArray(ids) || !ids.every((x) => UUID.test(x))) throw new Error(`bad evidence_input_ids: ${a.norm_key}`)

    const area = a.area == null ? null : String(a.area)
    let area_code = null
    let evidence
    let label_prefix = ''
    if (area === NOTES.code) [evidence, label_prefix] = [`notes:${a.norm_key}`, 'notes:']
    else if (DB_AREAS.has(area)) [area_code, evidence, label_prefix] = [area, `manual:${RULE_VER}:${a.norm_key}`, /^[1-5]$/.test(area) ? `${area}:` : '']
    else evidence = `hold:${area == null ? 'area_empty' : `area_not_in_vocab(${area})`}:${a.norm_key}`

    const an = a.anchors ?? {}
    const domain = an.domain ? String(an.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
    if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error(`bad domain: ${a.norm_key} ${an.domain}`)
    const slug = slugOf(a.name)
    projects.push({
      norm_key: a.norm_key,
      // 이름 정규화 키 — 키가 앱 ID·별칭이어도(appstore:id…·노션→notion) 재실행 때 이 마이그가 만든 소개문을 찾는다.
      name_key: normKey(a.name),
      name: a.name,
      // "Name — …" 형식: product-name-candidates.mjs buildRegistry 가 소개문 앞 이름을 읽어 같은 후보를 다시 올리지 않는다.
      pitch: `${a.name} — 승인 후보 등록(${date}, ${areaName(area ?? 'hold')})`,
      // competitor_url 은 NOT NULL 이다. 도메인 앵커가 없으면 'candidate:<키>' 자리표시(링크 아님)로 둔다 — 도메인을 지어내지 않는다.
      competitor_url: domain ? `https://${domain}` : `candidate:${a.norm_key}`,
      area_code,
      area_evidence: evidence,
      evidence_input_ids: ids,
      anchors: { appstore_id: an.appstore_id ?? null, play_pkg: an.play_pkg ?? null, domain },
    })
    if (an.appstore_id != null) {
      const country = String(an.appstore_country ?? 'us').toLowerCase()
      const ref = `${country}:${an.appstore_id}`
      if (!appstoreRef(ref)) throw new Error(`bad appstore anchor: ${a.norm_key} ${ref}`)
      targets.push({ norm_key: a.norm_key, source_key: 'appstore', product_ref: ref, label: `${label_prefix}${country === 'kr' ? '' : `${country}|`}${slug}` })
    }
    if (an.play_pkg != null) {
      const ref = `us:en:${an.play_pkg}`
      if (!googleplayRef(ref)) throw new Error(`bad play anchor: ${a.norm_key} ${an.play_pkg}`)
      targets.push({ norm_key: a.norm_key, source_key: 'googleplay', product_ref: ref, label: `${label_prefix}us-en|${slug}` })
    }
  }
  return { projects, targets }
}

// SQL 쪽 정규화 키 = normKey 와 같은 규칙(TLD 제거 → 소문자 → 공백·하이픈·점·밑줄·가운뎃점·따옴표 제거), 소개문 앞 이름에 적용.
const SQL_PITCH_KEY = `regexp_replace(lower(regexp_replace(substring(p.product_elevator_pitch from '^(.{2,40}?)\\s(?:—|\\()'), '\\.(co\\.kr|ai|io|app|com|so|co|me|kr|net|dev|xyz)$', '', 'i')), '[[:space:]._·''’-]', '', 'g')`

export function renderSql({ projects, targets }, { name, rollbackName, source }) {
  const n = projects.length
  const notesN = projects.filter((p) => p.area_evidence.startsWith('notes:')).length
  const holdN = projects.filter((p) => p.area_evidence.startsWith('hold:')).length
  const pv = projects.map((p, i) => `  (${[q(p.norm_key), q(p.name_key), q(p.name), q(p.pitch), q(p.competitor_url), q(p.area_code), q(p.area_evidence)].join(', ')})${i < n - 1 ? ',' : ''}  -- 근거 input ${p.evidence_input_ids.length}건${p.evidence_input_ids.length ? `: ${p.evidence_input_ids.join(' ')}` : ''}`)
  const noAnchor = projects.filter((p) => !targets.some((t) => t.norm_key === p.norm_key)).map((p) => p.name)
  const tgtBlock = targets.length
    ? `
CREATE TEMP TABLE _cr_tgt (norm_key text NOT NULL, source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _cr_tgt (norm_key, source_key, product_ref, label) VALUES
${targets.map((t, i) => `  (${[q(t.norm_key), q(t.source_key), q(t.product_ref), q(t.label)].join(', ')})${i < targets.length - 1 ? ',' : ''}`).join('\n')}
;

CREATE TEMP TABLE _cr_gp_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

DO $$
DECLARE off_sources text; running_at text;
BEGIN
  SELECT string_agg(k, ',') INTO off_sources FROM (SELECT DISTINCT source_key AS k FROM _cr_tgt) v
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF off_sources IS NOT NULL THEN RAISE EXCEPTION '소스가 꺼져 있거나 없다: %', off_sources; END IF;
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _cr_tgt) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

-- (2) 수집 타깃 — 앵커가 있는 소스만. 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 건너뛴다(dictionary-targets 와 같은 멱등).
CREATE TEMP TABLE _cr_tgt_ins (id uuid, source_key text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, t.source_key, t.product_ref, t.label, 'active', NULL, NULL
    FROM _cr_tgt t JOIN _cr_new n USING (norm_key)
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets x WHERE x.source_key = t.source_key AND x.product_ref = t.product_ref)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, source_key
)
INSERT INTO _cr_tgt_ins SELECT id, source_key FROM ins;

DO $$
DECLARE gp_before int; gp_after int;
BEGIN
  SELECT n INTO gp_before FROM _cr_gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  IF gp_after > gp_before AND gp_after > ${GOOGLEPLAY_FROZEN_ACTIVE} THEN
    RAISE EXCEPTION '구글 플레이 활성 % → % (동결선 ${GOOGLEPLAY_FROZEN_ACTIVE} 초과) — 1:1 맞바꾸기 또는 사람 판단', gp_before, gp_after;
  END IF;
  RAISE NOTICE 'candidate targets: 삽입 %행(후보 ${targets.length})', (SELECT count(*) FROM _cr_tgt_ins);
END $$;
`
    : `
-- (2) 수집 타깃 0행 — 앵커(앱스토어 ID·플레이 패키지)가 확인된 후보가 없다. 수집 타깃은 앵커 확인 후 다시 생성한다.
`
  return `-- ============================================================
-- ${name}
--
-- ⛔ 미적용 초안 — scripts/candidate-register-draft.mjs 가 ${source} 로 만들었다.
--    적용은 오케스트레이터(대화형·역할 세션) 판단(CLAUDE.md §10.2). 서브에이전트·무인 루프는 적용하지 않는다.
--
-- 무엇을: 사람이 승인 시트에서 Y 한 제품 후보 ${n}개를 등록한다. DELETE·DROP·DDL 0.
--   (1) analysis_projects INSERT(status='collecting', purpose='product_fit', mode='forward', business_model='SAAS')
--       area_basis='manual'(사람 결정 — 20261009000020 롤백이 건드리지 않는다) · area_rule_ver='${RULE_VER}' · area_evidence 아래.
--   (2) review_targets INSERT — 앵커가 있는 소스만(${targets.length}행). review_sources·review_source_ramp(cap_base·램프)는 건드리지 않는다.
--   (3) 제품 사전 연결은 이 SQL 밖 — 생성기 콘솔 목록대로 사람이 reports/2026-10-05/product-dictionary 에 옮긴다.
--   (4) 중복 방지: 같은 정규화 키의 프로젝트(소개문 앞 이름을 normKey 와 같은 규칙으로 정규화)가 이미 있으면 새로 만들지 않고 그 프로젝트를 쓴다.
--       타깃은 같은 (source_key, product_ref) 가 어느 프로젝트에든 있으면 건너뛴다.
--       재사용한 기존 프로젝트의 영역 칸은 바꾸지 않는다(UPDATE 0 — 끝의 NOTICE 가 재사용 수를 낸다. 재사용이 있으면 그 행 영역은 사람이 본다).
--
-- 영역 'notes'(노트·지식관리, 남헌 v53 — 영역 ①~⑤ 밖) ${notesN}개: area_code CHECK(20261009000020) 어휘에 'notes' 가 없다.
--   새 DDL 대신 **area_code NULL + area_evidence 'notes:<키>' 접두 + 타깃 라벨 'notes:' 접두**로 쓴다.
--   ⚠️ v37-1 영역 소급(20261009000020)을 재실행하면 area_code IS NULL 인 이 행들도 대상이 된다(입력이 생기면 out-* 로 채워질 수 있다)
--      — 재실행 전에 area_evidence LIKE 'notes:%' 행을 제외할 것.
-- 영역 값 hold 규칙: 애매하면(영역 어휘 밖·빈 값) area_code NULL 로 두고 area_evidence 'hold:<사유>:<키>' 로 hold 사유를 기록한다(${holdN}개).
-- competitor_url(NOT NULL): 도메인 앵커가 없으면 'candidate:<키>' 자리표시 — 도메인을 지어내지 않는다.
-- 앵커 없음(수집 타깃은 앵커 확인 후): ${noAnchor.join(', ') || '-'}
-- 롤백: ${rollbackName}
--
-- 적용 전 드라이런(읽기만):
--   SELECT p.id, p.product_elevator_pitch FROM public.analysis_projects p
--    WHERE ${SQL_PITCH_KEY.replace(/\n/g, ' ')} IN (${projects.map((p) => q(p.norm_key)).join(', ')});   -- 기대: 0행(있으면 그 프로젝트를 재사용)
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _cr_new (
  norm_key text PRIMARY KEY, name_key text NOT NULL, name text NOT NULL, pitch text NOT NULL UNIQUE, competitor_url text NOT NULL,
  area_code text, area_evidence text NOT NULL, project_id uuid, created boolean NOT NULL DEFAULT false
) ON COMMIT DROP;
INSERT INTO _cr_new (norm_key, name_key, name, pitch, competitor_url, area_code, area_evidence) VALUES
${pv.join('\n')}
;

-- (4) 이미 있는 프로젝트(소개문 앞 이름의 정규화 키 = 후보 키 또는 이름 키) → 재사용. 두 개 이상이면 21000 으로 멈춘다(사람이 고른다).
UPDATE _cr_new n SET project_id = (
  SELECT p.id FROM public.analysis_projects p WHERE ${SQL_PITCH_KEY} IN (n.norm_key, n.name_key));

-- (1) 프로젝트 — 없는 것만.
WITH ins AS (
  INSERT INTO public.analysis_projects
    (competitor_url, product_elevator_pitch, purpose, status, mode, business_model, area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
  SELECT n.competitor_url, n.pitch, 'product_fit', 'collecting', 'forward', 'SAAS', n.area_code, 'manual', n.area_evidence, '${RULE_VER}', now()
    FROM _cr_new n
   WHERE n.project_id IS NULL
  RETURNING id, product_elevator_pitch
)
UPDATE _cr_new n SET project_id = ins.id, created = true FROM ins WHERE ins.product_elevator_pitch = n.pitch;
${tgtBlock}
DO $$
DECLARE orphan text; bad_area int; bad_notes int; created_n int;
BEGIN
  SELECT string_agg(norm_key, ',') INTO orphan FROM _cr_new WHERE project_id IS NULL;
  IF orphan IS NOT NULL THEN RAISE EXCEPTION '프로젝트 없음: %', orphan; END IF;
  SELECT count(*) INTO bad_area FROM _cr_new n JOIN public.analysis_projects p ON p.id = n.project_id
   WHERE n.created AND p.area_code IS DISTINCT FROM n.area_code;
  IF bad_area <> 0 THEN RAISE EXCEPTION '영역이 계획과 다르다 %행', bad_area; END IF;
  SELECT count(*) INTO bad_notes FROM _cr_new n JOIN public.analysis_projects p ON p.id = n.project_id
   WHERE n.created AND n.area_evidence LIKE 'notes:%' AND (p.area_code IS NOT NULL OR p.area_evidence NOT LIKE 'notes:%');
  IF bad_notes <> 0 THEN RAISE EXCEPTION 'notes 행이 area_code NULL + notes: 접두가 아니다 %행', bad_notes; END IF;
  SELECT count(*) INTO created_n FROM _cr_new WHERE created;
  RAISE NOTICE 'candidate register: 프로젝트 생성 % · 재사용 % (후보 ${n})', created_n, ${n} - created_n;
END $$;

COMMIT;

-- 확인: SELECT id, product_elevator_pitch, status, area_code, area_basis, area_evidence, area_rule_ver FROM public.analysis_projects
--   WHERE area_rule_ver = '${RULE_VER}' AND product_elevator_pitch IN (${projects.map((p) => q(p.pitch)).join(', ')});   -- 기대 ${n}행
`
}

export function renderRollback({ projects, targets }, { name }) {
  const pitches = projects.map((p) => `  (${q(p.pitch)})`).join(',\n')
  const tgt = targets.length
    ? `
CREATE TEMP TABLE _cr_rb_t (source_key text NOT NULL, product_ref text NOT NULL, label text NOT NULL, PRIMARY KEY (source_key, product_ref)) ON COMMIT DROP;
INSERT INTO _cr_rb_t (source_key, product_ref, label) VALUES
${targets.map((t) => `  (${q(t.source_key)}, ${q(t.product_ref)}, ${q(t.label)})`).join(',\n')};

DO $$
DECLARE running_at text;
BEGIN
  SELECT string_agg(source_key || '@' || started_at::text, ', ') INTO running_at
    FROM public.review_collection_runs WHERE source_key IN (SELECT source_key FROM _cr_rb_t) AND status = 'running';
  IF running_at IS NOT NULL THEN RAISE EXCEPTION '수집 실행 중(%) — 슬롯 사이에 다시 실행하라', running_at; END IF;
END $$;

UPDATE public.review_targets t SET status = 'failed'
  FROM _cr_rb_t r
 WHERE t.source_key = r.source_key AND t.product_ref = r.product_ref AND t.label = r.label AND t.status <> 'failed';
`
    : '\n-- 타깃 0행 — 되돌릴 review_targets 없음.\n'
  return `-- ============================================================
-- ${name} — ROLLBACK
--
-- ⛔ 미적용 초안. 삭제 없음:
--   · review_targets: 이 마이그가 넣은 행만(source_key, product_ref, label 정확히 일치) status='failed' — 자동 부활 대상 아님.
--   · analysis_projects: 이 마이그가 만든 행(소개문 정확히 일치 ∧ area_rule_ver='${RULE_VER}' ∧ area_basis='manual')의 영역 칸만 NULL.
--     행 자체는 남는다(수집 0건이면 아무 루프도 건드리지 않는 빈 collecting 프로젝트). 완전 삭제는 §10.2 예외 1번 — 사람 판단.
--     이 마이그가 재사용한(이미 있던) 프로젝트는 소개문이 달라 안 잡힌다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
${tgt}
CREATE TEMP TABLE _cr_rb_p (pitch text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _cr_rb_p (pitch) VALUES
${pitches};

UPDATE public.analysis_projects p
   SET area_code = NULL, area_basis = NULL, area_evidence = NULL, area_rule_ver = NULL, area_assigned_at = NULL
  FROM _cr_rb_p r
 WHERE p.product_elevator_pitch = r.pitch AND p.area_rule_ver = '${RULE_VER}' AND p.area_basis = 'manual';

DO $$
DECLARE still int;
BEGIN
  SELECT count(*) INTO still FROM public.analysis_projects p JOIN _cr_rb_p r ON r.pitch = p.product_elevator_pitch WHERE p.area_rule_ver = '${RULE_VER}';
  IF still <> 0 THEN RAISE EXCEPTION '%행의 영역이 아직 남아 있다', still; END IF;
END $$;

COMMIT;
`
}

/** (3) 제품 사전 연결 대상 — 콘솔 출력용 줄. */
export function dictionaryLines({ projects }) {
  return projects.map((p) => {
    const a = p.anchors
    const anchor = [a.appstore_id && `appstore:id${a.appstore_id}`, a.play_pkg && `googleplay:${a.play_pkg}`, a.domain].filter(Boolean).join(', ') || '앵커 없음(수집 타깃은 앵커 확인 후)'
    return `  - ${p.name} (${p.norm_key}) · ${p.area_evidence.split(':')[0] === 'notes' ? NOTES.label : p.area_code ? areaName(p.area_code) : 'hold'} · ${anchor} → 제품 사전(reports/2026-10-05/product-dictionary/)에 수동 연결 — 파일은 사람이 고른다`
  })
}

// ── 실행 ────────────────────────────────────────────────────────────────
export function main(argv, { log = console.log, now = new Date() } = {}) {
  const args = Object.fromEntries(argv.map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }))
  if (args.sheet) {
    const sheetPath = String(args.sheet)
    const dir = path.dirname(sheetPath)
    const sheetDate = /(\d{4}-\d{2}-\d{2})/.exec(sheetPath.replace(/\\/g, '/'))?.[1] ?? kstDate(now)
    const tablePath = path.join(dir, 'product-name-candidates.md')
    const { approved, rejected, unanswered } = sheetToApproved(fs.readFileSync(sheetPath, 'utf8'), fs.existsSync(tablePath) ? fs.readFileSync(tablePath, 'utf8') : null)
    const out = String(args.out ?? path.join(dir, 'approved-candidates.json'))
    fs.writeFileSync(out, JSON.stringify(approved, null, 2) + '\n')
    const added = rejected.length ? mergeHumanRejected(path.join(dir, 'rejected-candidates.json'), rejected, sheetDate) : 0
    log(`승인 ${approved.length} · 기각 ${rejected.length}(대장 human_rejected 새로 ${added}) · 미답 ${unanswered.length}(승인 아님)`)
    log(`approved.json 초안: ${out} — anchors 는 null. anchors_suggested(리뷰 속 링크)를 사람이 확인해 anchors 로 옮긴 뒤 --approved 로 넘긴다.`)
    return { mode: 'sheet', approved, rejected, unanswered, out }
  }
  if (!args.approved) throw new Error('usage: --sheet=<product-candidates-approval.md> [--out=<json>]  |  --approved=<json> [--date=YYYY-MM-DD] [--out-dir=supabase/migrations]')
  const date = args.date ? String(args.date) : kstDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date 형식 YYYY-MM-DD: ${date}`)
  const ymd = date.replace(/-/g, '')
  const outDir = String(args['out-dir'] ?? path.join(repoRoot, 'supabase', 'migrations'))
  const source = String(args.approved).replace(/\\/g, '/')
  const plan = planRows(JSON.parse(fs.readFileSync(String(args.approved), 'utf8')), { date })
  const files = fs.readdirSync(outDir)
  if (files.some((f) => f.endsWith(`_candidate_register_${ymd}.sql`))) throw new Error(`이미 ${ymd} 등록 초안이 있다 — 덮어쓰지 않는다`)
  const name = `${nextStamp(files, ymd)}_candidate_register_${ymd}`
  const rollbackName = `${name}_rollback.sql`
  fs.writeFileSync(path.join(outDir, `${name}.sql`), renderSql(plan, { name, rollbackName, source }))
  fs.writeFileSync(path.join(outDir, rollbackName), renderRollback(plan, { name }))
  log(`wrote ${outDir}/${name}.sql + ${rollbackName} (프로젝트 ${plan.projects.length} · 타깃 ${plan.targets.length}, 미적용)`)
  log('제품 사전 연결 대상:')
  for (const l of dictionaryLines(plan)) log(l)
  return { mode: 'approved', plan, name, outDir }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  }
}
