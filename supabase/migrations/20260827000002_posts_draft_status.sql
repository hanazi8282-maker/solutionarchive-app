  -- ============================================================
  -- posts 를 초안 저장소로 겸용하기 위한 컬럼·제약 추가 (status / permalink)
  --
  -- 배경: 콘텐츠 루프에 "생성된 초안"을 담을 곳이 필요하다. 별도 drafts 테이블을
  --   만들지 않고 posts 를 쓴다. 이유는 세 가지다:
  --     1. posts.external_id 가 UNIQUE 이면서 nullable 이다. Postgres 는 UNIQUE 에서
  --        NULL 을 서로 다른 값으로 취급하므로, 아직 Threads id 가 없는 초안 행이
  --        제약을 위반하지 않고 여러 개 공존한다.
  --     2. body / hook_type / closing_type / pattern / topic_tag / hypothesis_code /
  --        content_code 가 posts 에 이미 전부 있다. 별도 테이블은 스키마 복제다.
  --     3. 발행 매칭이 "행 이동"이 아니라 "external_id·published_at 채우기"가 된다.
  --        FK 를 재연결할 필요가 없으니 metric_snapshots 가 초안 시점부터 같은
  --        post_id 를 가리킨다.
  --
  -- 상태 전이: draft → published (매처가 Threads 게시물과 연결)
  --            draft → discarded (사람이 버린 초안)
  --   published 에서 되돌아오는 전이는 없다. 발행을 취소하면 discarded 가 아니라
  --   행을 지운다(측정치도 CASCADE 로 함께 사라져야 하므로).
  --
  -- ⛔ 이 마이그레이션은 자동 발행과 무관하다. CLAUDE.md §10 대로 발행은
  --    사람이 Threads 앱에서 직접 한다. status='published' 는 "우리가 발행했다"가
  --    아니라 "사람이 발행한 글을 우리가 찾아 연결했다"는 뜻이다.
  --
  -- 기존 데이터 영향: 아래 백필 절 참조. 파괴적 변경 없음.
  --   published_at 의 NOT NULL 을 푸는 대신 같은 보증을 상태 의존 CHECK 로 옮긴다 —
  --   제약을 없애는 게 아니라 적용 범위를 좁히는 것이다.
  --
  -- ⚠️ 배포 순서: 이 마이그레이션을 **먼저** 적용한 뒤 코드를 배포한다.
  --    순서가 뒤집히면 status 를 포함한 INSERT 가 PostgREST 스키마 캐시에서
  --    PGRST204 로 전부 실패한다.
  --
  -- 선행: 20260827000001_content_loop_baseline.sql (posts 테이블 존재)
  -- 가역: 동명 rollback 파일 참조(20260827000002_posts_draft_status_rollback.sql).
  -- ============================================================


  -- ── 1) 컬럼 추가 ─────────────────────────────────────────────
  -- DEFAULT 'draft' 라 기존 행도 즉시 'draft' 로 채워진다. 그대로 두면 이미
  -- 발행된 글이 초안으로 오인되므로 아래 2) 에서 곧바로 바로잡는다.
  ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

  -- Threads 게시물 URL. 매칭 시점에 채운다. 초안 단계에서는 null.
  ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS permalink text;


  -- ── 2) 기존 행 백필 ──────────────────────────────────────────
  -- 판별 기준을 external_id 유무가 아니라 published_at 유무로 잡는다.
  --
  --   external_id 를 쓰면 오분류가 난다. 지금 posts 에 들어오는 유일한 경로인
  --   /dashboard 의 createPost(app/dashboard/actions.ts)는 external_id 를 채우지
  --   않는다 — 사람이 이미 발행한 글을 사후 기록하는 화면이라 Threads id 를
  --   입력받는 칸 자체가 없다. 그래서 "발행됐지만 external_id 가 null" 인 행이
  --   정상적으로 존재하고, external_id 기준으로 백필하면 그 글들이 전부 draft 가
  --   되어 매처가 다시 붙잡으려 든다.
  --
  --   반면 published_at 은 이 마이그레이션 직전까지 NOT NULL 이었다. 즉 여기
  --   존재하는 모든 행은 발행 시각을 가지고 있고, 초안이라는 개념이 생기기
  --   전에 만들어진 "이미 발행된 글"이다. 이 순서(백필 → 4)에서 NOT NULL 해제)를
  --   지키는 한 published_at IS NOT NULL 은 정확한 판별식이다.
  --
  -- RLS 참고: baseline 은 posts 에 ENABLE 만 걸고 FORCE 는 걸지 않는다. 따라서
  --   테이블 소유자(대시보드 SQL 에디터의 postgres)로 실행하는 이 UPDATE 는
  --   정책 0개와 무관하게 정상 동작한다. FORCE 가 걸려 있었다면 이 UPDATE 는
  --   **에러 없이 0행을 갱신하고 조용히 실패했을 것이다** — 나중에 누군가
  --   posts 에 FORCE 를 추가한다면 이 절을 함께 손봐야 한다.
  UPDATE public.posts
    SET status = 'published'
  WHERE published_at IS NOT NULL
    AND status IS DISTINCT FROM 'published';

  -- 백필 결과 확인용 (0행이 정상일 수 있다 — posts 가 비어 있으면):
  --   SELECT status, count(*) FROM public.posts GROUP BY status;


  -- ── 3) status 를 NOT NULL 로 ─────────────────────────────────
  -- DEFAULT 가 있어 신규 행은 항상 값을 갖지만, 명시적으로 null 을 넣는 INSERT 는
  -- 막지 못한다. 아래 CHECK 는 status IS NULL 을 통과시키므로(NULL 비교는 UNKNOWN)
  -- NOT NULL 이 없으면 상태 없는 행이 생기고, 그 행은 매처에도 리포트에도
  -- 잡히지 않는 유령이 된다.
  ALTER TABLE public.posts
    ALTER COLUMN status SET NOT NULL;


  -- ── 4) published_at 의 NOT NULL 을 상태 의존 CHECK 로 이동 ───
  -- 초안은 아직 발행되지 않았으므로 published_at 을 채울 수 없다. 그렇다고
  -- 아무 값이나(생성 시각 등) 넣으면 "언제 발행됐는가"가 오염되고, 나이 버킷
  -- 계산이 통째로 어긋난다. 컬럼 제약을 풀되 같은 보증을 상태별로 다시 건다.
  ALTER TABLE public.posts
    ALTER COLUMN published_at DROP NOT NULL;


  -- ── 5) 제약 추가 ─────────────────────────────────────────────
  -- ADD CONSTRAINT 에는 IF NOT EXISTS 가 없어서 DO 블록으로 감싼다.
  -- 재실행해도 안전해야 하기 때문(마이그레이션을 두 번 붙여넣는 사고는 흔하다).
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.posts'::regclass
        AND conname  = 'posts_status_check'
    ) THEN
      ALTER TABLE public.posts
        ADD CONSTRAINT posts_status_check
        CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'discarded'::text])));
    END IF;
  END $$;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.posts'::regclass
        AND conname  = 'posts_published_at_required_check'
    ) THEN
      ALTER TABLE public.posts
        ADD CONSTRAINT posts_published_at_required_check
        CHECK (status <> 'published' OR published_at IS NOT NULL);
    END IF;
  END $$;


  -- ── 6) 매처용 인덱스 ─────────────────────────────────────────
  -- 매처가 매일 status='draft' 로 전체 조회한다. 초안은 전체 행의 소수이므로
  -- 부분 인덱스가 더 작지만, discarded 집계·리포트도 status 로 필터하게 되므로
  -- 일반 btree 로 둔다(기존 posts_*_idx 명명 규칙과도 맞다).
  CREATE INDEX IF NOT EXISTS posts_status_idx
    ON public.posts USING btree (status);


  -- ── 7) 컬럼 의미 주석 ────────────────────────────────────────
  COMMENT ON COLUMN public.posts.status IS
    'draft=생성만 된 초안(external_id·published_at 없음), '
    'published=Threads 게시물과 연결됨, discarded=사람이 버린 초안. '
    'published 는 "우리가 자동 발행했다"가 아니라 "사람이 발행한 글을 매처가 찾아 연결했다"는 뜻이다(CLAUDE.md §10).';
  COMMENT ON COLUMN public.posts.permalink IS
    'Threads 게시물 URL. 매칭 시점에 external_id 와 함께 채운다. 초안 단계에서는 null.';
