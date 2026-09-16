#!/usr/bin/env node
// 칼럼 검수 피드백 추출기 — 남헌이 /columns 에서 남긴 review_note 를 배치로 모아
// "가이드 반영 제안"(column_review_patterns)으로 적립한다. /columns 상단에서 사람이 결정한다.
//
// 사람이 CLI 로 돌린다(무인 루프 아님, cmo-daily.mjs 스텝이 아니다 — column-stage.mjs 와 같다).
// 크론으로 만들면 CLAUDE.md §10.1 의 무인 루프 DB 쓰기 허용범위를 넓히는 일이 된다.
// 한 사이클: column-stage.mjs → /columns 검수 → column-feedback.mjs → /columns 상단에서 반영·기각.
//
//   node --env-file=.env.local scripts/column-feedback.mjs          # 적립한다
//   node --env-file=.env.local scripts/column-feedback.mjs --dry    # 읽고 판정만, 쓰기 0건
//   node scripts/column-feedback.mjs --self-test                    # DB·LLM·env 없이 로직만
//
// ⛔ 이 스크립트는 가이드 문서를 읽지도 쓰지도 않는다. 정적 fs import 가 없다 —
//    파일을 건드릴 경로 자체가 없다. "가이드에 반영함"은 사람이 버튼을 누르고 사람이 문서를
//    고치는 것이고, 여기서는 그 결정의 재료(제안)만 만든다. self-test 가 이 무접촉을 검사한다.
//
// 왜 배치 전체를 한 프롬프트에 넣는가: 칼럼은 내부 전용이라 반응률이 없다. 12편 중 여러 편에서
// 같은 지적이 나왔다는 것이 유일한 근거 강도다. 건별로 호출하면 그 신호를 구조적으로 못 본다.
// 근거 1건도 제안한다(남헌이 직접 남긴 지적은 1건이라도 정답이다) — 강도 판단은 카드에
// evidence_count·source_slugs 를 그대로 보여주고 사람이 한다.
//
// 종료 코드: 0 = 정상(제안 0건 포함) · 1 = 추출·적립 실패 · 2 = 확인 불가(env 없음·마이그 미적용)

import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { activeProvider, extractJsonObject, normalizePatternKey } from '../lib/insight/llm.ts'
import { resolveClaudeBinary, runClaude } from '../lib/insight/claude-cli.ts'

const COLUMN_FIELDS = 'id, slug, review_status, review_note, feedback_at'
const PATTERN_FIELDS = 'id, pattern_key, status, evidence_count, source_slugs'

/** 테이블·컬럼이 없어서 난 오류인가. 이걸 "0건"으로 접으면 마이그 미적용이 정상으로 보인다(§7.1). */
export const isSchemaMissing = (err) =>
  Boolean(err) && ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(err.code)

// ── 대상 고르기 ────────────────────────────────────────────────────────────────

/**
 * 추출 대상 = 사람이 결정을 끝냈고(draft 아님), 메모를 남겼고, 아직 추출에 안 쓴 칼럼.
 * feedback_at 이 멱등성의 핵심이다 — 채워진 행은 다시 안 먹는다.
 */
export function selectTargets(rows) {
  return (rows ?? []).filter(
    (r) =>
      r.review_status !== 'draft' &&
      typeof r.review_note === 'string' &&
      r.review_note.trim().length > 0 &&
      !r.feedback_at,
  )
}

// ── 프롬프트 ──────────────────────────────────────────────────────────────────

/**
 * 배치 1개 = 프롬프트 1개.
 *
 * knownKeys 재사용 지시가 없으면 같은 지적이 매번 다른 key 로 나와 evidence_count 가 1 에서
 * 안 올라간다 — 에러 없이 루프만 죽는 형태다(lib/insight/llm.ts 의 같은 장치, 실측 근거
 * docs/review-collection-design.md §13.9). dismissed 되먹이기가 없으면 사람이 기각한 제안이
 * 다음 배치에 그대로 또 올라온다.
 */
export function buildFeedbackPrompt(targets, knownKeys = [], dismissed = []) {
  const known = knownKeys.filter(Boolean)
  const no = dismissed.filter(Boolean)

  return [
    '아래는 발행 결정권자(남헌)가 칼럼 검수에서 남긴 승인 메모·반려 사유 모음이다.',
    `이번 배치는 ${targets.length}편이다. 편별로 답하지 말고 **전체를 놓고** 반복되는 지적을 찾아라.`,
    '',
    '목표는 칼럼 작성 가이드에 넣을 규칙 후보를 뽑는 것이다. 개별 칼럼을 고치는 지시가 아니라,',
    '다음 배치의 작가가 처음부터 다르게 쓰게 만들 문장을 뽑는다.',
    '',
    '판단 위계(이 순서로 무게를 둔다):',
    '  1. 남헌의 반려·수정 사유 — 가장 무겁다. 1편에만 나와도 정답으로 취급한다',
    '  2. 독립 검증(.verify.md) 판정',
    '  3. AI 자체 점검',
    '',
    '같은 지적이 여러 편에서 나오면 그게 이 배치에서 얻을 수 있는 유일한 근거 강도다.',
    '**같은 지적은 반드시 제안 1건으로 묶고 source_slugs 에 해당 편의 slug 를 전부 적어라.**',
    '표현이 달라도 고쳐야 할 행동이 같으면 같은 지적이다. 나누면 근거가 흩어져 아무것도 안 쌓인다.',
    '반대로 고쳐야 할 행동이 다르면 억지로 묶지 마라 — 틀리게 뭉친 근거는 없는 근거보다 나쁘다.',
    '',
    ...(known.length
      ? [
          '이미 쓰이고 있는 pattern_key 목록이다:',
          ...known.map((k) => `- ${k}`),
          '',
          '이번 지적이 그중 하나와 같은 행동을 가리키면 **표현을 바꾸지 말고 그 key 를 문자 그대로 다시 써라.**',
          '같은 지적을 다른 말로 적으면 근거가 나뉘어 축적되지 않는다.',
          '',
        ]
      : []),
    ...(no.length
      ? [
          '아래 key 는 사람이 이미 **기각**한 제안이다. 다시 제안하지 마라:',
          ...no.map((k) => `- ${k}`),
          '',
        ]
      : []),
    '다음 JSON 만 출력하라. 코드펜스·설명·서론 없이 객체 하나만.',
    '{',
    '  "proposals": [',
    '    {',
    '      "pattern_key": "영문 소문자 하이픈 slug (예: drop-evidence-labels)",',
    '      "title": "제안 이름 (20자 내외, 한국어)",',
    '      "description": "무엇이 문제였는지 — 근거가 된 메모의 내용을 그대로 근거로 삼아 2~3문장",',
    '      "advice": "가이드에 그대로 넣을 수 있는 규칙 문장 1~3줄. 작가가 읽고 바로 다르게 쓸 수 있게 구체적으로",',
    '      "source_slugs": ["근거가 된 칼럼 slug", "..."]',
    '    }',
    '  ]',
    '}',
    '',
    'source_slugs 에는 아래 목록에 실제로 있는 slug 만 적는다. 없는 slug 를 지어내면 그 제안은 버려진다.',
    '메모 하나가 서로 다른 두 가지를 지적하면 제안 2건으로 나눠도 된다.',
    '뽑을 것이 없으면 proposals 를 빈 배열로 둔다 — 억지로 만들지 마라.',
    '',
    '--- 검수 메모 시작 ---',
    ...targets.map(
      (t) => `[slug: ${t.slug}] (${t.review_status === 'rejected' ? '반려' : '승인'}) ${t.review_note.trim()}`,
    ),
    '--- 검수 메모 끝 ---',
  ].join('\n')
}

// ── 응답 파싱 ─────────────────────────────────────────────────────────────────

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/**
 * LLM 응답 → 제안 배열. 봉투가 통째로 망가졌을 때만 던진다. 개별 항목의 결함은 dropped 로
 * 세어서 보고한다 — 한 항목 때문에 배치 전체를 버리면 사람이 남긴 메모가 통째로 사라진다.
 */
export function parseProposals(text) {
  const obj = extractJsonObject(text)
  const arr = Array.isArray(obj) ? obj : obj?.proposals
  if (!Array.isArray(arr)) throw new Error(`proposals 배열을 찾지 못했다: ${JSON.stringify(obj).slice(0, 200)}`)

  const proposals = []
  const dropped = []
  for (const raw of arr) {
    if (typeof raw !== 'object' || raw === null) {
      dropped.push('객체가 아닌 항목')
      continue
    }
    const title = str(raw.title, 120)
    const description = str(raw.description, 1000)
    const advice = str(raw.advice, 1000)
    const key = normalizePatternKey(str(raw.pattern_key, 60) ?? title ?? '')
    const slugs = Array.isArray(raw.source_slugs) ? raw.source_slugs.map((s) => str(s, 120)).filter(Boolean) : []
    if (!title || !description || !advice) {
      dropped.push(`${key}: title/description/advice 중 빈 값`)
      continue
    }
    // ⚠️ normalizePatternKey 는 NFKD 로 한글 음절을 자모로 분해한 뒤 버린다. 한글만으로 된 key 는
    //    전부 'unnamed-pattern' 한 덩어리가 되어 **서로 다른 제안이 하나로 뭉친다** — 에러 없이
    //    근거가 오염되는 형태다. 그래서 영문 slug 가 아니면 묶지 않고 버리고, 사람에게 보고한다.
    if (key === 'unnamed-pattern' || key.length < 3) {
      dropped.push(`${title}: pattern_key 가 영문 slug 가 아니다 (원본 "${raw.pattern_key}")`)
      continue
    }
    proposals.push({ pattern_key: key, title, description, advice, source_slugs: slugs })
  }
  return { proposals, dropped }
}

// ── 수렴·병합 ─────────────────────────────────────────────────────────────────

/**
 * 제안 → DB 연산. 여기가 이 스크립트의 판단 전부다(LLM 이 아니라).
 *
 * - 같은 key 가 두 번 나오면 한 건으로 합친다. LLM 이 같은 지적을 두 객체로 뱉는 건 흔하다.
 * - evidence_count 는 증가 연산이 아니라 **source_slugs 합집합의 길이**다. 같은 배치를 두 번
 *   먹여도 값이 부풀지 않는다(feedback_at 과 별개로 한 겹 더).
 * - 이번 배치에 없는 slug 는 버린다. 근거가 하나도 안 남으면 그 제안 자체를 버린다 —
 *   "지어낸 근거로 올라온 제안"은 근거 0건이지 근거 1건이 아니다.
 * - 이미 dismissed 인 key 는 INSERT 도 UPDATE 도 하지 않는다.
 * - 기존 행의 title/description/advice/status 는 덮어쓰지 않는다. 사람이 이미 읽은 문구를
 *   다음 배치의 LLM 이 바꿔 놓으면 결정의 근거가 뒤에서 달라진다.
 */
export function reconcile(proposals, existing, batchSlugs) {
  const prior = new Map((existing ?? []).map((r) => [r.pattern_key, r]))
  const allowed = new Set(batchSlugs ?? [])
  const merged = new Map()
  const skipped = []

  for (const p of proposals) {
    const slugs = p.source_slugs.filter((s) => allowed.has(s))
    if (!slugs.length) {
      skipped.push({ key: p.pattern_key, reason: '근거 slug 가 이번 배치에 없다' })
      continue
    }
    const before = prior.get(p.pattern_key)
    if (before?.status === 'dismissed') {
      skipped.push({ key: p.pattern_key, reason: '사람이 기각한 제안 — 다시 올리지 않는다' })
      continue
    }
    const acc = merged.get(p.pattern_key)
    if (acc) {
      for (const s of slugs) acc.slugs.add(s)
      continue
    }
    merged.set(p.pattern_key, { ...p, slugs: new Set(slugs), before })
  }

  const inserts = []
  const updates = []
  for (const m of merged.values()) {
    const slugs = [...new Set([...(m.before?.source_slugs ?? []), ...m.slugs])].sort()
    if (m.before) {
      updates.push({
        id: m.before.id,
        pattern_key: m.pattern_key,
        evidence_count: slugs.length,
        source_slugs: slugs,
        addedEvidence: slugs.length - (m.before.source_slugs?.length ?? 0),
      })
    } else {
      inserts.push({
        pattern_key: m.pattern_key,
        title: m.title,
        description: m.description,
        advice: m.advice,
        evidence_count: slugs.length,
        source_slugs: slugs,
      })
    }
  }
  return { inserts, updates, skipped }
}

// ── 사람이 읽는 요약 ──────────────────────────────────────────────────────────

/** 넓은 표를 쓰지 않는다. 항목당 한 줄이다. */
export function renderReport({ total, targets, ops, dropped, dry, applied }) {
  const lines = [`## 칼럼 검수 피드백${dry ? ' (dry-run — 판정만)' : ''}`, '']
  lines.push(
    `- 대상: 검수 완료 ${total.decided}편 (review_note 있는 것 ${targets.length}편, 이미 반영된 것 ${total.alreadyFed}편 제외)`,
  )
  for (const i of ops.inserts) {
    lines.push(`- 제안: ${i.pattern_key} · 근거 ${i.evidence_count}편 (${i.source_slugs.join(', ')}) · 신규`)
  }
  for (const u of ops.updates) {
    lines.push(
      `- 제안: ${u.pattern_key} · 근거 ${u.evidence_count}편 (${u.source_slugs.join(', ')}) · 근거 ${u.addedEvidence}편 추가`,
    )
  }
  for (const s of ops.skipped) lines.push(`- 건너뜀: ${s.key} — ${s.reason}`)
  for (const d of dropped) lines.push(`- 버림: ${d}`)
  if (!ops.inserts.length && !ops.updates.length) lines.push('- 제안: 0건 (추출은 정상 — 뽑을 패턴이 없다는 뜻)')
  if (dry) {
    lines.push('- 판정만 했다. 실제 적립은 dry-run 을 끄고 실행한다.')
  } else {
    lines.push(
      `- 적립: 신규 ${applied.inserted}건 · 근거 갱신 ${applied.updated}건 · 반영 표시 ${applied.marked}편`,
    )
    lines.push('- 결정은 /columns 상단 "검수 피드백 제안"에서 사람이 한다. 가이드 문서는 사람이 직접 고친다.')
  }
  return lines
}

// ── LLM ───────────────────────────────────────────────────────────────────────

/**
 * mock — 네트워크·과금·토큰 없이 파이프 전체를 돌리기 위한 결정적 응답.
 *
 * ⚠️ 이건 **파이프 점검용이지 묶음 판정의 근거가 아니다.** 실제로 같은 지적을 하나로 묶는
 *    판단은 LLM 이 하고, 그 뒤의 key 수렴·중복 병합·기각 제외는 reconcile() 이 한다.
 *    self-test 는 mock 을 통과시키는 것으로 묶음을 증명하지 않고, 손으로 쓴 응답으로
 *    reconcile() 을 직접 때린다(부품 테스트를 통합의 근거로 쓰지 않는다 — CLAUDE.md §7.1).
 */
export function mockResponse(targets) {
  // 편별 제안 1건씩 + 배치 전체를 묶은 제안 1건. 근거 1편짜리 카드와 N편짜리 카드를
  // dry-run 이 실제로 한 번씩 밟게 하려는 것이지, 묶음을 판정한 결과가 아니다.
  const proposals = targets.map((t) => ({
    pattern_key: normalizePatternKey(`mock-${t.slug}`),
    title: `mock 제안 (${t.slug})`,
    description: `mock — ${t.review_note.trim().slice(0, 120)}`,
    advice: 'mock 규칙 문장',
    source_slugs: [t.slug],
  }))
  if (targets.length > 1) {
    proposals.push({
      pattern_key: 'mock-batch-wide',
      title: 'mock 배치 전체 제안',
      description: 'mock — 배치 전체를 근거로 잡은 제안',
      advice: 'mock 규칙 문장',
      source_slugs: targets.map((t) => t.slug),
    })
  }
  return JSON.stringify({ proposals })
}

async function askLlm(prompt, targets) {
  const provider = activeProvider()
  if (provider === 'mock') return mockResponse(targets)

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('INSIGHT_LLM_PROVIDER=anthropic 인데 ANTHROPIC_API_KEY 가 없다')
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const msg = await new Anthropic({ apiKey }).messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })
    return msg.content.map((b) => (b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
  }

  const bin = await resolveClaudeBinary()
  const res = await runClaude(bin.path, ['-p', '--output-format', 'json', '--max-turns', '1'], {
    // 배치 전체가 한 프롬프트라 건별 호출보다 길다. 기본 120초로는 모자란다.
    timeoutMs: 300_000,
    input: prompt,
    // runClaude 기본 cwd 는 /tmp(Vercel 전용)다. 이건 사람이 로컬에서 돌린다.
    cwd: os.tmpdir(),
  })
  if (res.exitCode !== 0) {
    throw new Error(`claude -p 실패 (exit ${res.exitCode}${res.timedOut ? ', timeout' : ''}): ${res.stderr.slice(0, 500)}`)
  }
  // --output-format json 은 봉투를 씌운다. 본문은 봉투의 result 안에 있다.
  let payload = res.stdout
  try {
    const envelope = JSON.parse(res.stdout)
    if (envelope.is_error === true) {
      throw new Error(`claude 가 오류를 보고했다: ${String(envelope.result ?? '').slice(0, 300)}`)
    }
    if (typeof envelope.result === 'string') payload = envelope.result
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('claude 가 오류를')) throw e
    // 봉투 파싱 실패는 치명적이지 않다 — 본문이 그대로 온 경우다.
  }
  return payload
}

// ── DB ────────────────────────────────────────────────────────────────────────

async function loadState(sb) {
  const cols = await sb.from('content_columns').select(COLUMN_FIELDS)
  if (cols.error) return { error: cols.error, where: 'content_columns' }
  const pats = await sb.from('column_review_patterns').select(PATTERN_FIELDS)
  if (pats.error) return { error: pats.error, where: 'column_review_patterns' }
  return { columns: cols.data ?? [], patterns: pats.data ?? [] }
}

/**
 * 쓰기는 전부 여기 한 곳이다. --dry 는 이 함수를 **부르지 않는다**(호출부 참조) —
 * 안쪽에 dry 플래그를 두면 언젠가 한 분기가 그 플래그를 안 보고 쓴다.
 */
async function applyOps(sb, ops, targetIds) {
  let inserted = 0
  let updated = 0

  if (ops.inserts.length) {
    const res = await sb.from('column_review_patterns').insert(ops.inserts).select('pattern_key')
    if (res.error) return { error: res.error }
    inserted = res.data?.length ?? 0
    // insert() 는 0행이 들어가도 error 를 주지 않는 경우가 있다 — select() 로 실제 건수를 본다.
    if (inserted !== ops.inserts.length) {
      return { error: { message: `INSERT 기대 ${ops.inserts.length}건 · 실제 ${inserted}건` } }
    }
  }

  for (const u of ops.updates) {
    const res = await sb
      .from('column_review_patterns')
      .update({ evidence_count: u.evidence_count, source_slugs: u.source_slugs })
      .eq('id', u.id)
      .select('id')
    if (res.error) return { error: res.error }
    if (!res.data?.length) return { error: { message: `UPDATE 0행: ${u.pattern_key} (행이 사라졌다)` } }
    updated++
  }

  // 마지막에 표시한다 — 적립이 실패했는데 "이미 먹었다"로 찍히면 그 메모는 영영 안 쓰인다.
  const mark = await sb
    .from('content_columns')
    .update({ feedback_at: new Date().toISOString() })
    .in('id', targetIds)
    .select('id')
  if (mark.error) return { error: mark.error }

  return { inserted, updated, marked: mark.data?.length ?? 0 }
}

// ── 실행 ──────────────────────────────────────────────────────────────────────

export async function runFeedback(sb, { dry = false } = {}) {
  const state = await loadState(sb)
  if (state.error) {
    return {
      code: isSchemaMissing(state.error) ? 2 : 1,
      lines: [
        isSchemaMissing(state.error)
          ? `❌ 마이그레이션 미적용 — ${state.where} 를 읽지 못했다 (${state.error.code}). ` +
            'supabase db query --linked -f supabase/migrations/20260917000001_column_review_patterns.sql'
          : `❌ 확인 불가 — ${state.where} 조회 실패: ${state.error.message}. 제안이 없다는 뜻이 아니다.`,
      ],
    }
  }

  const decided = state.columns.filter((c) => c.review_status !== 'draft' && c.review_note?.trim())
  const targets = selectTargets(state.columns)
  const total = { decided: decided.length, alreadyFed: decided.length - targets.length }

  if (!targets.length) {
    return { code: 0, lines: [`- 대상: 검수 완료 ${decided.length}편 중 새 메모 0건 (조회는 정상)`] }
  }

  const known = state.patterns.filter((p) => p.status !== 'dismissed').map((p) => p.pattern_key)
  const dismissed = state.patterns.filter((p) => p.status === 'dismissed').map((p) => p.pattern_key)
  const prompt = buildFeedbackPrompt(targets, known, dismissed)

  let parsed
  try {
    parsed = parseProposals(await askLlm(prompt, targets))
  } catch (e) {
    return { code: 1, lines: [`❌ 추출 실패 — ${e.message}`, '- 아무것도 적립하지 않았다. 대상 칼럼도 그대로 남는다.'] }
  }

  const ops = reconcile(parsed.proposals, state.patterns, targets.map((t) => t.slug))

  if (dry) {
    return {
      code: 0,
      lines: renderReport({ total, targets, ops, dropped: parsed.dropped, dry: true }),
    }
  }

  const applied = await applyOps(sb, ops, targets.map((t) => t.id))
  if (applied.error) {
    return { code: 1, lines: [`❌ 적립 실패 — ${applied.error.message}`, '- 반영 표시를 안 했으므로 다음 실행이 같은 메모를 다시 먹는다.'] }
  }
  return { code: 0, lines: renderReport({ total, targets, ops, dropped: parsed.dropped, dry: false, applied }) }
}

// ── self-test ─────────────────────────────────────────────────────────────────

/**
 * 픽스처는 지어낸 게 아니라 2026-09-17 남헌이 실제로 지적한 3종이다
 * (케이스-작성-가이드.md §7-2 AI 티 · §8-1 근거 라벨 폐지 · 롱폼-스레드-대시보드-관계.md §B-3
 *  스레드 독립성. 그날 개정된 문구를 검수 메모 형태로 옮겨 적었다).
 */
export const FIXTURE_COLUMNS = [
  {
    id: 'c1',
    slug: 'juicero',
    review_status: 'rejected',
    review_note:
      '근거 라벨을 문장마다 붙여서 보고서처럼 읽힌다. "회사가 밝힌", "~로 보인다", "이 사례에서 읽히는"이 한 편에 열 번 넘게 나온다. 이건 B2C 일반 독자용 글이지 보고서가 아니다. 근거가 조금 부족해도 그냥 서술로 써라. 원문에 없는 걸 지어내는 것과는 다른 얘기다.',
    feedback_at: null,
  },
  {
    id: 'c2',
    slug: 'hoka',
    review_status: 'rejected',
    review_note:
      'AI가 쓴 티가 난다. "활성고객 증가율 9%, 객단가 +6.6%, 매장 352곳" 같은 동사 없는 명사구를 계단식으로 쌓았고, 태도 없는 매끈한 중립만 이어진다. "장치", "몸으로 안다" 같은 에세이 어휘도 걸린다. 누군가 이 사례를 조사해서 사람 말로 풀어준 글로 읽혀야 한다.',
    feedback_at: null,
  },
  {
    id: 'c3',
    slug: 'pets-com',
    review_status: 'rejected',
    review_note:
      '전신형 단문만 이어 붙였고 실제 쓰인 서비스 이름을 일반화해서 시대 세탁을 했다. 원문에 구체적 명사가 있으면 그대로 쓰라고 했다. AI 티 점검을 안 한 것으로 본다.',
    feedback_at: null,
  },
  {
    id: 'c4',
    slug: 'carvana',
    review_status: 'approved',
    review_note:
      '스레드 3편이 1편을 읽어야만 이해된다. 각 편은 독립 콘텐츠다 — 3편만 본 독자도 그 한 편으로 인사이트를 얻어야 한다. 무슨 회사 무슨 상황이었는지 배경 한두 줄은 그 편 안에 넣어라. 시리즈처럼 번호 순서로 읽어야 하는 글로 쓰지 마라.',
    feedback_at: null,
  },
  // 입력에서 빠져야 하는 것들 ↓
  { id: 'c5', slug: 'notion', review_status: 'draft', review_note: '아직 안 봤다', feedback_at: null },
  { id: 'c6', slug: 'quibi', review_status: 'approved', review_note: null, feedback_at: null },
  {
    id: 'c7',
    slug: 'chewy',
    review_status: 'rejected',
    review_note: '이미 지난 배치에서 패턴으로 뽑았다',
    feedback_at: '2026-09-17T00:00:00Z',
  },
]

/** 실제 LLM 이 위 픽스처를 보고 돌려줄 법한 응답. 손으로 썼다 — mock 을 통과시키는 게 아니라
 *  reconcile() 의 묶음·수렴·기각 처리를 직접 때리기 위한 입력이다. */
const FIXTURE_RESPONSE = JSON.stringify({
  proposals: [
    {
      pattern_key: 'Remove-AI-Tone',
      title: 'AI 티 제거',
      description: '전신형 단문 쌓기, 매끈한 중립, 에세이 어휘, 추상화가 반복 지적됐다.',
      advice: '동사 없는 명사구를 계단식으로 나열하지 않는다. 실제 쓰인 도구·서비스 이름은 일반화하지 않고 그대로 쓴다.',
      source_slugs: ['hoka'],
    },
    // 같은 지적이 표기만 다르게 한 번 더 온 경우 — 묶여야 한다(2건으로 갈리면 근거가 흩어진다).
    {
      pattern_key: '  remove ai tone ',
      title: 'AI 티 제거(중복)',
      description: '같은 지적이 두 객체로 나뉘어 왔다.',
      advice: '중복',
      source_slugs: ['pets-com'],
    },
    {
      pattern_key: 'drop-evidence-labels',
      title: '근거 라벨 의무 폐지',
      description: '표지 문구를 문장마다 붙여 보고서처럼 읽힌다는 지적.',
      advice: '"회사가 밝힌", "~로 보인다" 같은 라벨은 자연스러우면 남기고 불필요하면 뺀다. 지어내는 것은 여전히 금지다.',
      source_slugs: ['juicero'],
    },
    {
      pattern_key: 'thread-standalone',
      title: '스레드 독립성',
      description: '각 편이 그 편만으로 인사이트가 서야 한다.',
      advice: '스레드 각 편에 배경 한두 줄을 넣는다. 번호 순서로 읽어야 이해되는 시리즈로 쓰지 않는다.',
      source_slugs: ['carvana'],
    },
    // 이미 기각된 key — 되먹였는데도 또 왔다면 여기서 막혀야 한다.
    {
      pattern_key: 'shorter-sentences',
      title: '문장을 더 짧게',
      description: '사람이 이미 기각했다.',
      advice: '짧게 써라',
      source_slugs: ['hoka'],
    },
    // 이번 배치에 없는 slug 만 가진 제안 — 근거 0건이므로 버려져야 한다.
    {
      pattern_key: 'made-up',
      title: '지어낸 근거',
      description: '배치에 없는 slug.',
      advice: 'x',
      source_slugs: ['not-in-batch'],
    },
    // 한글만으로 된 key — 정규화하면 전부 같은 덩어리가 되어 서로 다른 제안을 뭉친다. 파싱에서 버린다.
    {
      pattern_key: '근거 라벨 폐지',
      title: '한글 key',
      description: '영문 slug 가 아니다.',
      advice: 'x',
      source_slugs: ['juicero'],
    },
  ],
})

const FIXTURE_PATTERNS = [
  { id: 'p1', pattern_key: 'shorter-sentences', status: 'dismissed', evidence_count: 1, source_slugs: ['old'] },
  { id: 'p2', pattern_key: 'thread-standalone', status: 'proposed', evidence_count: 1, source_slugs: ['chewy'] },
]

/** 최소 PostgREST 스텁. 모든 쓰기를 기록한다 — --dry 가 정말 0건인지 보려면 이게 있어야 한다. */
function stubClient({ columns, patterns, writes }) {
  const data = { content_columns: columns, column_review_patterns: patterns }
  return {
    from(table) {
      const done = (rows) => Promise.resolve({ data: rows, error: null })
      const chain = (kind, payload) => {
        const rec = { table, kind, payload }
        writes.push(rec)
        const self = {
          eq: () => self,
          in: (_c, ids) => {
            rec.ids = ids
            return self
          },
          select: () => done(Array.isArray(payload) ? payload : [{ id: 'x', pattern_key: payload.pattern_key }]),
          then: (r) => done([]).then(r),
        }
        return self
      }
      return {
        select: () => done(data[table] ?? []),
        insert: (rows) => chain('insert', rows),
        update: (patch) => chain('update', patch),
      }
    },
  }
}

async function selfTest() {
  const fail = (m) => {
    console.error('FAIL', m)
    process.exit(1)
  }
  const assert = (c, m) => {
    if (!c) fail(m)
  }
  let n = 0
  const check = (c, m) => {
    n++
    assert(c, m)
  }

  // 1) 대상 필터 — draft / 메모 없음 / 이미 반영됨은 빠진다.
  const targets = selectTargets(FIXTURE_COLUMNS)
  check(targets.length === 4, `대상 4편이어야 — 실제 ${targets.length}`)
  check(!targets.some((t) => t.review_status === 'draft'), 'draft 가 입력에 들어갔다')
  check(!targets.some((t) => !t.review_note), 'review_note 없는 행이 입력에 들어갔다')
  check(!targets.some((t) => t.feedback_at), 'feedback_at 채워진 행이 입력에 들어갔다 — 멱등성이 깨진다')

  // 2) 프롬프트 — 배치 전체가 한 프롬프트에 들어가고, 수렴 키·기각 키가 실제로 박힌다.
  const prompt = buildFeedbackPrompt(targets, ['thread-standalone'], ['shorter-sentences'])
  for (const t of targets) check(prompt.includes(t.slug), `프롬프트에 ${t.slug} 가 없다 — 배치 빈도를 못 본다`)
  check(prompt.includes('thread-standalone'), '기존 key 목록이 프롬프트에 없다 — key 가 매번 갈린다')
  check(prompt.includes('shorter-sentences'), '기각 key 되먹이기가 없다 — 기각한 제안이 또 올라온다')
  check(!buildFeedbackPrompt(targets, [], []).includes('pattern_key 목록이다'), '빈 목록을 보여주면 안 된다')

  // 3) 파싱 + 수렴 — 같은 지적은 1건으로, 기각·근거 0건은 제외.
  const parsed = parseProposals(FIXTURE_RESPONSE)
  check(parsed.proposals.length === 6, `제안 6건 파싱 — 실제 ${parsed.proposals.length}`)
  check(
    parsed.dropped.length === 1 && parsed.dropped[0].includes('영문 slug'),
    `한글 key 가 안 걸러졌다 — 서로 다른 제안이 한 덩어리로 뭉친다: ${parsed.dropped}`,
  )
  const ops = reconcile(parsed.proposals, FIXTURE_PATTERNS, targets.map((t) => t.slug))

  const aiTi = ops.inserts.filter((i) => i.pattern_key === 'remove-ai-tone')
  check(aiTi.length === 1, `같은 지적이 갈렸다 — insert ${aiTi.length}건 (${ops.inserts.map((x) => x.pattern_key)})`)
  check(aiTi[0].evidence_count === 2, `evidence_count 2 여야 — 실제 ${aiTi[0].evidence_count}`)
  check(aiTi[0].source_slugs.length === 2, `source_slugs 길이 2 여야 — 실제 ${aiTi[0].source_slugs.length}`)
  check(
    aiTi[0].source_slugs.includes('hoka') && aiTi[0].source_slugs.includes('pets-com'),
    `근거 slug 가 틀렸다: ${aiTi[0].source_slugs}`,
  )
  check(!ops.inserts.some((i) => i.pattern_key === 'shorter-sentences'), 'dismissed 인 key 를 다시 INSERT 했다')
  check(!ops.updates.some((u) => u.pattern_key === 'shorter-sentences'), 'dismissed 인 key 를 UPDATE 했다')
  check(ops.skipped.some((s) => s.key === 'shorter-sentences'), 'dismissed 건너뜀이 보고되지 않았다')
  check(!ops.inserts.some((i) => i.pattern_key === 'made-up'), '배치에 없는 slug 만 가진 제안이 적립됐다')

  // 기존 proposed 행은 UPDATE 로, 근거는 합집합(중복 없이).
  const upd = ops.updates.find((u) => u.pattern_key === 'thread-standalone')
  check(Boolean(upd), '기존 key 가 UPDATE 로 안 갔다 — UNIQUE 위반으로 터진다')
  check(upd.evidence_count === 2 && upd.source_slugs.join() === 'carvana,chewy', `합집합이 틀렸다: ${upd.source_slugs}`)

  // 멱등: 같은 응답을 한 번 더 먹여도 INSERT 0건이고 evidence_count 가 안 부푼다
  // (증가 연산이 아니라 source_slugs 합집합의 길이라서). feedback_at 과 별개의 두 번째 겹이다.
  const firstCounts = new Map([...ops.inserts, ...ops.updates].map((o) => [o.pattern_key, o.evidence_count]))
  const afterFirst = [...FIXTURE_PATTERNS.filter((p) => !firstCounts.has(p.pattern_key)),
    ...[...ops.inserts, ...ops.updates].map((o, k) => ({ id: `n${k}`, status: 'proposed', ...o }))]
  const again = reconcile(parsed.proposals, afterFirst, targets.map((t) => t.slug))
  check(again.inserts.length === 0, `두 번째 실행에서 또 INSERT 했다 — ${again.inserts.length}건`)
  for (const u of again.updates) {
    check(
      u.evidence_count === firstCounts.get(u.pattern_key),
      `evidence_count 가 부풀었다: ${u.pattern_key} ${firstCounts.get(u.pattern_key)} → ${u.evidence_count}`,
    )
  }

  // 4) mock 프로바이더로 전 단계가 돈다(env·네트워크 없이).
  const prevProvider = process.env.INSIGHT_LLM_PROVIDER
  process.env.INSIGHT_LLM_PROVIDER = 'mock'
  try {
    const mockParsed = parseProposals(await askLlm(prompt, targets))
    check(mockParsed.proposals.length === targets.length + 1, `mock 파이프가 끊겼다 — 제안 ${mockParsed.proposals.length}건`)
    const mockOps = reconcile(mockParsed.proposals, [], targets.map((t) => t.slug))
    check(
      mockOps.inserts.some((i) => i.evidence_count === targets.length),
      'mock 경로에서 근거 N편짜리 카드가 안 나왔다 — dry-run 이 그 렌더를 안 밟는다',
    )

    // 5) --dry 는 쓰기 0건. 스텁이 모든 insert/update 를 기록한다.
    const dryWrites = []
    const dryRes = await runFeedback(
      stubClient({ columns: FIXTURE_COLUMNS, patterns: FIXTURE_PATTERNS, writes: dryWrites }),
      { dry: true },
    )
    check(dryRes.code === 0, `dry-run exit ${dryRes.code}`)
    check(dryWrites.length === 0, `--dry 인데 쓰기 ${dryWrites.length}건 — ${JSON.stringify(dryWrites).slice(0, 200)}`)
    check(dryRes.lines.some((l) => l.includes('판정만 했다')), 'dry-run 안내 문구가 없다')

    // 6) dry 를 끄면 실제로 쓴다(5번이 "원래 안 쓰는 코드"를 보고 통과한 게 아님을 가른다).
    const wetWrites = []
    const wetRes = await runFeedback(
      stubClient({ columns: FIXTURE_COLUMNS, patterns: FIXTURE_PATTERNS, writes: wetWrites }),
      { dry: false },
    )
    check(wetRes.code === 0, `실행 exit ${wetRes.code} — ${wetRes.lines.join(' / ')}`)
    check(wetWrites.some((w) => w.kind === 'insert'), '실행인데 INSERT 가 0건')
    const mark = wetWrites.find((w) => w.table === 'content_columns' && w.kind === 'update')
    check(Boolean(mark?.payload?.feedback_at), 'feedback_at 표시를 안 했다 — 다음 실행이 같은 메모를 또 먹는다')
    check(mark.ids?.length === 4, `반영 표시 대상이 4편이어야 — 실제 ${mark.ids?.length}`)

    // 7) 마이그레이션 미적용을 "0건 정상"으로 접지 않는다 (§7.1).
    const missing = await runFeedback(
      { from: () => ({ select: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }) }) },
      { dry: true },
    )
    check(missing.code === 2, `테이블 없음은 exit 2 여야 — 실제 ${missing.code}`)
    check(missing.lines.join().includes('마이그레이션 미적용'), '테이블 없음이 조용히 0건으로 접혔다')
  } finally {
    if (prevProvider === undefined) delete process.env.INSIGHT_LLM_PROVIDER
    else process.env.INSIGHT_LLM_PROVIDER = prevProvider
  }

  // 8) 가이드 문서 무접촉 — 이 스크립트에 정적 fs import 도, 가이드 경로 문자열도 없다.
  //    self-test 만 자기 소스를 읽으려고 fs 를 동적으로 가져온다(실행 경로는 fs 를 안 부른다).
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  check(!/^import .*['"]node:fs/m.test(src), '정적 fs import 가 생겼다 — 가이드 파일을 건드릴 경로')
  // 동적 import 도 self-test 안쪽에만 있어야 한다. 실행·dry 경로에는 fs 가 아예 없다.
  const selfTestAt = src.indexOf('async function selfTest')
  check(
    [...src.matchAll(/node:fs/g)].every((m) => m.index > selfTestAt),
    'self-test 밖에서 fs 를 쓴다 — 가이드 파일을 건드릴 경로가 생겼다',
  )
  // 아래 바늘은 조립해서 만든다. 소스에 리터럴로 적으면 이 검사가 자기 자신에 걸린다.
  const guideDir = ['content', 'guides'].join('/')
  check(!src.includes(guideDir), `가이드 경로 문자열이 스크립트에 들어왔다 — ${guideDir}`)

  console.log(`self-test ok (${n}건)`)
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

// import 만 해도 DB 를 때리는 일이 없게 한다(cmo-daily.mjs 등과 같은 규약).
const isMain = (() => {
  if (!process.argv[1]) return false
  try {
    return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

const args = isMain ? process.argv.slice(2) : ['--noop']
if (!isMain) {
  // 모듈로 불린 경우 — 아무것도 실행하지 않는다.
} else if (args[0] === '--self-test') {
  await selfTest()
} else if (args[0] === '--help') {
  console.log('usage: node --env-file=.env.local scripts/column-feedback.mjs [--dry] | --self-test')
} else {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) {
    console.error('❌ 확인 불가 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    process.exit(2)
  }
  const { code, lines } = await runFeedback(sb, { dry: args.includes('--dry') })
  for (const l of lines) console.log(l)
  process.exit(code)
}
