// 나이 버킷 — "이 글을 지금 수집해야 하는가, 그리고 몇 시간짜리로 기록할 것인가".
//
// 이 파일에는 네트워크도 DB 도 없다. collect-metrics 라우트가 조용히 틀리는 지점은
// 전부 여기(창 판정 / manual 보호 / insert·update 분기)라서, 순수 함수로 떼어내
// scripts/threads-collect-selftest.mjs 로 검증한다. 라우트는 이 계획을 실행만 한다.

/**
 * ⚠️ 저장값(hours)과 수집 창(minAge~maxAge)은 다른 개념이다.
 *
 * metric_snapshots 의 UNIQUE 는 (post_id, captured_at) 이 아니라
 * (post_id, hours_since_publish) 다. 즉 원설계 의도가 "임의 시각마다 한 번"이
 * 아니라 "정해진 나이 버킷마다 한 번"이다. 실제 경과시간(21.4h 같은 값)을 그대로
 * 넣으면 이 제약이 무력화되고, post_performance 뷰의 FILTER 창과도 어긋난다.
 * → 창 안에 들어오면 수집하되, 저장은 반드시 1 / 24 / 168 로 정규화한다.
 *
 * 창이 저장값보다 넓은 이유: 크론이 한 번 밀리거나 실패해도 그 버킷을 통째로
 * 잃지 않기 위해서다. 지나간 시점의 조회수는 뒤늦게 채울 방법이 없다.
 *
 * 72h 버킷은 일부러 없다. post_performance 가 보는 창은 <=1.5 와 20~30 둘뿐이라
 * 그 사이에 저장된 스냅샷은 뷰에서 완전히 무시된다. 버킷을 늘리려면 뷰를 먼저
 * 고쳐야 한다.
 */
export interface Bucket {
  /** metric_snapshots.hours_since_publish 에 저장할 정규화 값 */
  hours: number
  /** 수집 창 하한(시간, 포함) */
  minAge: number
  /** 수집 창 상한(시간, 포함) */
  maxAge: number
}

export const BUCKETS: readonly Bucket[] = [
  // 하한이 0 이 아니라 0.5 인 이유: 발행 직후에는 Threads 인사이트가 아직
  // 집계되지 않아 views 가 0 으로 내려온다. 그 0 이 저장되면 spread_multiple 의
  // 분모가 되어 지표가 통째로 망가진다.
  //
  // 상한 1.9 는 매시 :30 수집과 맞물린 값이다. 매처(:00) → 수집(:30) 순서에서
  // 글 나이는 0.5~1.5h 로 수렴하고, 한 번 밀려도 1.9 안에 들어온다.
  // post_performance 의 1h 창이 <=1.5 이므로 저장값은 1 로 고정한다.
  { hours: 1, minAge: 0.5, maxAge: 1.9 },

  // 뷰의 24h 창(20~30)과 정확히 같게 맞춘다. 여기서 넓히면 뷰가 못 보는
  // 스냅샷이 생기고, 좁히면 크론 한 번 실패에 버킷이 날아간다.
  { hours: 24, minAge: 20, maxAge: 30 },

  // 168h(7일)는 뷰에 나타나지 않고 원시 지표로만 쓰인다. 장기 꼬리를 보려는
  // 값이라 창을 하루치(±12h)로 넉넉히 잡아도 해석이 흔들리지 않는다.
  { hours: 168, minAge: 156, maxAge: 180 },
] as const

/** 이 기간보다 오래된 글은 아예 조회하지 않는다(가장 늦은 창이 180h = 7.5일). */
export const COLLECT_WINDOW_DAYS = 14

/** 발행 시각과 현재 시각으로 나이(시간)를 낸다. 파싱 불가면 null. */
export function ageInHours(publishedAt: string | null | undefined, now: number): number | null {
  if (!publishedAt) return null
  const t = new Date(publishedAt).getTime()
  if (!Number.isFinite(t)) return null
  return (now - t) / 3_600_000
}

/**
 * 나이가 어느 창에 들어가는지. 어디에도 안 들어가면 null(정상 — 대부분의 글이 그렇다).
 *
 * 창은 서로 겹치지 않으므로 결과는 항상 0개 또는 1개다(셀프테스트가 이를 검증한다).
 */
export function selectBucket(age: number): Bucket | null {
  return BUCKETS.find(b => age >= b.minAge && age <= b.maxAge) ?? null
}

// ── 수집 계획 ──────────────────────────────────────────────────

export interface CollectTarget {
  id: string
  external_id: string | null
  published_at: string | null
}

/** metric_snapshots 에 이미 있는 행. 라우트가 사전 조회로 넘겨준다. */
export interface ExistingSnapshot {
  id: string
  post_id: string
  /** numeric 은 PostgREST 가 number 로도 string 으로도 줄 수 있어 양쪽을 받는다. */
  hours_since_publish: number | string
  source: string
  /**
   * 실제로 언제 측정했는가. hours_since_publish 는 정규화 값(24)이라
   * "몇 시간짜리 값인지"를 여기서만 복원할 수 있다 — 저장 시점 실제 나이는
   * captured_at - posts.published_at 이다. 근접 판정(아래)이 이 값을 쓴다.
   */
  captured_at?: string | null
}

export type CollectAction =
  | { kind: 'insert'; postId: string; mediaId: string; bucket: number; age: number }
  | { kind: 'update'; postId: string; mediaId: string; bucket: number; age: number; snapshotId: string }

export type SkipReason =
  /** 사람이 손으로 넣은 값이다. API 값으로 덮지 않는다. */
  | 'manual'
  /** 이미 저장된 값이 명목 나이에 더 가깝다. 덮으면 오히려 나빠진다. */
  | 'not_closer'
  /** external_id 가 없어 Threads 인사이트를 부를 수 없다(대시보드 수기 기록 글). */
  | 'no_media_id'
  /** published_at 이 없거나 파싱 불가. 상태 제약상 정상적으로는 나올 수 없다. */
  | 'no_published_at'

export interface CollectSkip {
  postId: string
  reason: SkipReason
  bucket: number | null
}

export interface CollectPlan {
  actions: CollectAction[]
  skipped: CollectSkip[]
  /** 어떤 창에도 안 들어온 글 수. 정상이며 대부분이 여기 속한다(로그용 숫자). */
  outOfWindow: number
}

/**
 * 대상 글 목록 + 기존 스냅샷으로 이번 실행에서 할 일을 정한다.
 *
 * 🔴 upsert 를 쓰지 않는 이유
 *    (post_id, hours_since_publish) UNIQUE 에 onConflict 로 upsert 를 걸면
 *    source='manual' 인 행까지 API 값으로 덮어쓴다. PostgREST 의 upsert 에는
 *    "단, manual 이면 건드리지 마라"를 붙일 WHERE 절이 없다. 사람이 손으로 채운
 *    수치는 대개 API 가 못 주는 것(profile_clicks 등)이라 덮이면 복구가 안 된다.
 *    그래서 사전 조회 후 insert / update / skip 으로 직접 가른다.
 *    스킵된 건은 응답에 남긴다 — 안 그러면 "왜 이 글만 안 갱신되지"를 추적할
 *    방법이 없다.
 *
 * 📏 update 는 "명목 나이에 더 가까워질 때만" 한다 (isCloserToNominal).
 *    창이 저장값보다 넓기 때문이다. 24h 버킷의 창은 20~30h 로 10시간이고
 *    크론은 매시간 돈다. 조건 없이 갱신하면 같은 글을 10번 덮어쓰고, 조회수는
 *    단조 증가하므로 최종 저장값은 사실상 30h 시점 값인데 라벨만 24h 다.
 *    post_performance 가 max() 를 쓰니 뷰도 그 값을 집어 spread_multiple(=
 *    views_24h / views_1h)이 25% 가량 부풀려진다. 168h 도 같은 원리로 180h
 *    값이 168h 로 기록된다.
 *
 *    저장 시점의 실제 나이는 captured_at - published_at 으로 복원할 수 있다
 *    (hours_since_publish 는 정규화 값이라 이 정보를 안 갖는다). 새 나이가
 *    명목값에 더 가까울 때만 갱신하면 저장값이 진짜 ~24h 로 수렴하고,
 *    명목값을 지나친 뒤에는 자동으로 멈춰 API 호출도 함께 준다.
 */
/**
 * 이미 저장된 스냅샷보다 지금 값이 명목 나이에 더 가까운가.
 *
 * captured_at 이 없거나 파싱 불가면 true 를 돌려준다 — 비교 근거가 없을 때는
 * 갱신하는 쪽이 안전하다. 낡은 값을 영구히 붙박이로 만드는 것보다 낫다.
 * (captured_at 은 metric_snapshots 에서 NOT NULL DEFAULT now() 라 실제로는
 *  비어 있을 수 없지만, 사전 조회 select 에서 컬럼이 빠지면 조용히 undefined 가
 *  되므로 그 경우를 예전 동작으로 되돌려 둔다.)
 */
export function isCloserToNominal(
  newAge: number,
  nominalHours: number,
  storedCapturedAt: string | null | undefined,
  publishedAt: string | null | undefined,
): boolean {
  const storedAge = ageInHours(publishedAt, Date.parse(storedCapturedAt ?? ''))
  if (storedAge === null || !Number.isFinite(storedAge)) return true
  return Math.abs(newAge - nominalHours) < Math.abs(storedAge - nominalHours)
}

export function planCollection(
  targets: CollectTarget[],
  existing: ExistingSnapshot[],
  now: number,
): CollectPlan {
  // (post_id, bucket) → 기존 행. 버킷은 정규화된 정수라 키가 안정적이다.
  const byKey = new Map<string, ExistingSnapshot>()
  for (const e of existing) {
    byKey.set(`${e.post_id}:${Number(e.hours_since_publish)}`, e)
  }

  const actions: CollectAction[] = []
  const skipped: CollectSkip[] = []
  let outOfWindow = 0

  for (const t of targets) {
    const age = ageInHours(t.published_at, now)
    if (age === null) {
      skipped.push({ postId: t.id, reason: 'no_published_at', bucket: null })
      continue
    }

    const bucket = selectBucket(age)
    if (!bucket) { outOfWindow++; continue }

    // 창 판정 뒤에 external_id 를 본다. 순서를 뒤집으면 대시보드에서 수기로 기록한
    // 글(external_id 없음)이 발행 후 14일 내내 매 실행마다 skip 목록에 쌓여
    // 응답이 소음으로 덮인다. 창에 든 순간에만 한 번씩 알린다.
    if (!t.external_id) {
      skipped.push({ postId: t.id, reason: 'no_media_id', bucket: bucket.hours })
      continue
    }

    const found = byKey.get(`${t.id}:${bucket.hours}`)

    if (found && found.source === 'manual') {
      skipped.push({ postId: t.id, reason: 'manual', bucket: bucket.hours })
      continue
    }

    if (found) {
      if (!isCloserToNominal(age, bucket.hours, found.captured_at, t.published_at)) {
        skipped.push({ postId: t.id, reason: 'not_closer', bucket: bucket.hours })
        continue
      }
      actions.push({
        kind: 'update',
        postId: t.id,
        mediaId: t.external_id,
        bucket: bucket.hours,
        age,
        snapshotId: found.id,
      })
      continue
    }

    actions.push({ kind: 'insert', postId: t.id, mediaId: t.external_id, bucket: bucket.hours, age })
  }

  return { actions, skipped, outOfWindow }
}
