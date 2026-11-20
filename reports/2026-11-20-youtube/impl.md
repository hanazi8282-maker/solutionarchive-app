# v71cu S8-2 유튜브 q:·ch: 확장 구현

## 구조 (추가 전용)
- `lib/review/youtube-expand.ts` — 키 파싱(`q:`, 기존 `parseChannelRef`), 쿼터 예약(`makeQuota`), 확장 루프(`expand`).
- `scripts/youtube-expand.mjs` — DB·fetch 연결. `YT_EXPAND_ON=1` 이 아니면 즉시 종료(기본 OFF).
- 타깃: `review_targets.layer` = `yt_query`(q:) / `yt_channel`(ch:). 러너는 이 두 layer 를 건너뛴다(`lib/review/store.ts` due()). 확장기가 찾은 댓글 30+ 영상은 `v:` 타깃(layer `video`, onboard_batch `yt_YYYYMMDD`)으로 등록 → 댓글은 기존 러너가 수집.
- 흐름: q: → `search.list`(search 통) → `videos.list` / ch: → `playlistItems.list`(UU 재생목록) → `videos.list` → 댓글 30+ 만, 이미 있는 `v:` 는 건너뜀, 댓글 꺼진 영상(commentCount 없음)은 등록 안 함.

## 쿼터 보호 (초과 0회)
- 모든 호출 직전 `reserve(bucket)`: `api_quota_log`(date, api='youtube', bucket) 의 used 를 읽어 `used+1 > 한도`면 호출하지 않고 중단, 아니면 **먼저 used+1 을 기록한 뒤** 호출(죽어도 과소집계 없음).
- 한도: search = `YT_SEARCH_DAILY`(60), other = `YT_UNITS_DAILY`(2000) − `YT_COMMENT_RESERVE`(200, 러너의 commentThreads 는 이 표에 안 적히므로 미리 뗌).
- 403·429 응답은 재시도 없이 즉시 중단(종료코드 2). 그 밖 4xx/5xx 는 그 타깃만 건너뜀.
- 기존 `youtube-discover` 와 같은 표·같은 날짜식(UTC−8)을 쓰고 워크플로 concurrency 그룹을 공유한다.
- 셀프테스트 `scripts/youtube-expand-selftest.mjs`(CI build-check 에 추가): 경계(한도 3 → 4번째 거부, 기록값 ≤ 한도), 한도 0 → fetch 0회, 403/429 즉시 중단, 키 파싱, 중복·댓글 적음 스킵, URL 에 key 미포함.

## 오케스트레이터 실행 순서
1. PR 머지 후 마이그 적용: `supabase/migrations/20261120000001_youtube_q_ch_targets.sql` (롤백 `_rollback.sql`). 적용 전 `review_sources` youtube 존재·이 저장소의 project 확인(§10.2). 양성: `select layer,count(*) from review_targets where onboard_batch='yt_q_ch_20261120' group by 1;` → yt_query 12 · yt_channel 6.
2. 드라이런(쓰기 없음): Actions → **YouTube Expand** → Run workflow, `enable=true`, `dry=true`. 로컬이면 `YT_EXPAND_ON=1 node --env-file=.env.local scripts/youtube-expand.mjs --dry`.
3. 실제 실행: 같은 워크플로 `enable=true`, `dry=false`. 로컬: `YT_EXPAND_ON=1 node --env-file=.env.local scripts/youtube-expand.mjs [--max-q 12] [--max-ch 6] [--max-new 40]`.
4. 확인: `select date,bucket,used,"limit" from api_quota_log where api='youtube' order by 1 desc limit 6;` (used ≤ limit) 와 `select count(*) from review_targets where source_key='youtube' and layer='video' and onboard_batch like 'yt_%';`. 이후 평소 수집 러너가 새 `v:` 를 돈다.
- 1회 최대 사용: search 12 + other 약 (ch 6 × 2 + q 12 × 1) = 24. 일 한도 대비 충분히 작다.
- 스케줄은 일부러 안 걸었다(수동). 매일 돌리려면 워크플로에 cron 추가 + 변수 결정은 사람/오케스트레이터.

## 미확인
- 실제 API 호출은 이 세션에서 하지 않았다(키·DB 접근 금지). 채널 6개의 ID 는 채널 페이지에서 읽었으나 playlistItems 응답은 미실측.
- `review_targets` 의 label 유일 제약 가정 — 라벨을 영역:사유로 전부 다르게 해 두었다. 적용 시 충돌하면 트랜잭션이 되돌려진다.
- 기존 `youtube-discover` 가 등록하는 ch:(layer `channel`)는 그대로 러너가 채널 전체 댓글로 수집한다(이 PR 과 별개).
