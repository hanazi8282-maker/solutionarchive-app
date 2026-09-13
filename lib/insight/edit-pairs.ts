// 초안 ↔ 발행본 쌍 — "남헌이 어떻게 고쳤는가"를 인사이트 루프 입력으로 만든다.
//
// ★ 방향: 발행본이 정답이다(2026-09-13 남헌 결정). 작가가 초안에서 발행본 쪽으로
//   수렴해야 한다. 그래서 saved_examples 에 넣을 때 raw_text = 발행본(분석 대상),
//   user_note = 초안(고치기 전)으로 고정한다. 반대로 넣으면 루프가 초안을 좋은 글로 배운다.
//
// ★ 정본 위치
//   발행본 = posts.body (status='published'). 매처가 연결하면서 발행본으로 덮어쓴다.
//   초안   = 리포 파일. 순서대로 본다:
//     1) drafts/threads/edit-pairs/<content_code>.draft.txt — 사람이 복원해 둔 원 초안.
//        초안 파일이 이미 발행본으로 덮어써진 옛 글(09-07 T3-1)용. 있으면 이게 이긴다.
//     2) drafts/threads/*.stage.json 의 content_code → body_path.
//   둘 다 없으면 **추측하지 않는다.** missing 으로 보고한다(§7.1).
//
// 새 테이블 없이 간다. saved_examples.notion_page_id 가 멱등키라 `edit:<code>` 로 한 행이다.

import fs from 'node:fs'
import path from 'node:path'

export const EDIT_KEY_PREFIX = 'edit:'
export const EDIT_PATTERN_PREFIX = 'edit-'

export interface PublishedPost {
  content_code: string | null
  body: string | null
  published_at?: string | null
  permalink?: string | null
}

export interface EditPair {
  key: string
  contentCode: string
  published: string
  draft: string
  draftSource: string
  publishedAt: string | null
  permalink: string | null
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 순수 함수. findDraft 는 content_code → {text, source} | null. */
export function buildEditPairs(
  posts: PublishedPost[],
  findDraft: (code: string) => { text: string; source: string } | null,
): { pairs: EditPair[]; missing: string[]; unchanged: string[] } {
  const pairs: EditPair[] = []
  const missing: string[] = []
  const unchanged: string[] = []
  for (const p of posts) {
    const code = p.content_code?.trim()
    const published = p.body?.trim()
    if (!code || !published) continue
    const d = findDraft(code)
    if (!d || !d.text.trim()) { missing.push(code); continue }
    // 손대지 않고 발행한 글은 배울 수정이 없다. 넣으면 "초안 = 정답" 신호가 된다.
    if (norm(d.text) === norm(published)) { unchanged.push(code); continue }
    pairs.push({
      key: `${EDIT_KEY_PREFIX}${code}`,
      contentCode: code,
      published,
      draft: d.text.trim(),
      draftSource: d.source,
      publishedAt: p.published_at ?? null,
      permalink: p.permalink ?? null,
    })
  }
  return { pairs, missing, unchanged }
}

/**
 * drafts/threads/*.stage.json 전부. 폴더가 없으면 던진다 — 체크아웃이 빠진 실행에서
 * "적용 기록 0건"으로 접히면 반응률 판정이 조용히 전부 보류가 된다(§7.1).
 */
export function readStageManifests(repoRoot: string): Array<Record<string, unknown>> {
  const dir = path.join(repoRoot, 'drafts', 'threads')
  if (!fs.existsSync(dir)) throw new Error(`stage.json 폴더 없음(확인 불가): ${dir}`)
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.stage.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')))
}

/** 리포 파일에서 초안을 찾는 findDraft. 읽기 실패는 던진다 — 조용히 missing 으로 접지 않는다. */
export function repoDraftFinder(repoRoot: string) {
  const dir = path.join(repoRoot, 'drafts', 'threads')
  const byCode = new Map<string, string>()
  if (fs.existsSync(dir)) {
    for (const j of readStageManifests(repoRoot)) {
      if (j?.content_code && j?.body_path) byCode.set(String(j.content_code), String(j.body_path))
    }
  }
  return (code: string) => {
    const override = path.join(dir, 'edit-pairs', `${code}.draft.txt`)
    if (fs.existsSync(override)) {
      return { text: fs.readFileSync(override, 'utf-8'), source: path.relative(repoRoot, override).replace(/\\/g, '/') }
    }
    const rel = byCode.get(code)
    if (rel && fs.existsSync(path.join(repoRoot, rel))) {
      return { text: fs.readFileSync(path.join(repoRoot, rel), 'utf-8'), source: rel }
    }
    return null
  }
}
