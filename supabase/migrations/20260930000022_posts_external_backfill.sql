-- ============================================================
-- 20260930000022_posts_external_backfill
--
-- 파이프라인 밖에서 직접 게시한 Threads 게시물 4건을 posts 에 등록한다(남헌 2026-09-27 확정).
-- 선행: 20260930000021 (published_via 에 external 허용). 없으면 CHECK 위반으로 전부 실패한다 — 부분 적용 없음.
--
-- 🟢 비파괴. INSERT 4행뿐, 기존 행 UPDATE/DELETE 없음. external_id UNIQUE 라 두 번 돌려도 4행을 넘지 않는다
--    (ON CONFLICT DO NOTHING — 멱등). 본문은 GET /me/threads 가 돌려준 발행본 그대로(매처·linkDraft 와 같은 규약:
--    성과 숫자와 본문이 같은 글을 가리켜야 한다). content_code·hook_type 은 추측하지 않고 NULL. topic_tag 는
--    기존 T3-1(2026-09-07 발행)과 같은 "빌드인퍼블릭".
-- 롤백: 20260930000022_posts_external_backfill_rollback.sql (이 4행만 삭제)
-- ============================================================

INSERT INTO public.posts
  (channel_id, external_id, published_at, permalink, body, char_count, topic_tag, status, published_via, notes)
VALUES
  ((SELECT id FROM public.channels WHERE owner_type='self' AND platform='threads' LIMIT 1),
   '18109270787178013', '2026-09-23T16:37:31+0000', 'https://www.threads.com/@solution_arch_/post/DdowYdGmsVO',
   $body$ai로 Saas를 만들고 있습니다. 사실 무언가를 만드는 것은 '딸깍'으로 전부 되는 시대죠.
하지만 그렇게 만들어 진게 진짜 쓸만한가는 또 다른 이야기입니다.

이번에 구현하는 기능에는 사용자들의 리뷰가 필요해서 커뮤니티를 돌며 12,443건 모으도록 시켰습니다. 그리고 결과를 봤는데... 그중 실제로 쓸 수 있게 구조화된 건 40개뿐이더군요.

이유는 단순했습니다. AI가 단순히 정보를 모으는 것은 1만건 이상 금방 할 수 있지만, 그것이 진짜 쓸만한지 파악하는 것은 제가 직접 해야 하거든요.
물론 나름의  검증 루프를 만들어 두기도 하지만, 결국 사람의 손이 들어가야 합니다.

ai의 발전이 굉장해 지면서 모든 것을 '딸깍'으로 만드려고 하는 사람들이 많은  것 같습니다.
하지만, 딸깍 만으로는 무언가가 나올지언정 그걸로 판매까지 이어지기는 힘듭니다.

아직까지, 진짜 가치있는 정보들에는 사람의 힘이 필요하다는 것을 한 번 더 느끼네요.$body$,
   477, '빌드인퍼블릭', 'published', 'external', $body$[external] 파이프라인 초안 없음 — 남헌이 별도 Claude 세션에서 첨삭받아 Threads 에 직접 게시. 2026-09-27 CEO-STAFF 등록(대시보드 미연결 4건 해소, 남헌 확정). 본문은 Threads API 발행본 그대로.$body$),
  ((SELECT id FROM public.channels WHERE owner_type='self' AND platform='threads' LIMIT 1),
   '18097760243339156', '2026-09-24T11:45:16+0000', 'https://www.threads.com/@solution_arch_/post/Ddqzu22mqd2',
   $body$"기능 만드는 건 이제 하루면 된다" — 요즘 다들 이렇게 말하죠. 저도 어제 하루에 6개를 붙여놓고 같은 생각을 했습니다.

만들 때는 좋았습니다. 뭔가 되고 있는 느낌이 드니까요.

그런데 다 붙이고 화면을 열어보니 알겠더군요. 구조도 있고 기능도 있는데 제대로 돌아가지를 않습니다. 그 6개가 보여줄 수 있는, 제가 직접 검수해서 통과시킨 자료가 6건뿐이었거든요. 화면 하나에 딱 하나씩입니다.

만드는 속도가 빨라진 만큼 빈 화면이 도착하는 속도도 빨라진 겁니다.

이제 기능 자체는 차별점이 아닌 것 같습니다. 같은 걸 누구나 하루면 만드니까요. 남는 건 그 안에 무엇이 들어 있는지, 그걸 무슨 기준으로 걸러냈는지입니다.

Ai 시대에 어떤 차별점을 가져가야 할지 조금씩 느껴지는 것 같네요$body$,
   392, '빌드인퍼블릭', 'published', 'external', $body$[external] 파이프라인 초안 없음 — 남헌이 별도 Claude 세션에서 첨삭받아 Threads 에 직접 게시. 2026-09-27 CEO-STAFF 등록(대시보드 미연결 4건 해소, 남헌 확정). 본문은 Threads API 발행본 그대로.$body$),
  ((SELECT id FROM public.channels WHERE owner_type='self' AND platform='threads' LIMIT 1),
   '18379137238228689', '2026-09-25T00:00:56+0000', 'https://www.threads.com/@solution_arch_/post/DdsH7AvjkB6',
   $body$AI로 제품을 만들다 보면 '자동화'라는 단어가 제일 먼저 눈앞에 아른거리죠. 저도 그랬습니다.

그래서 데이터  분류 작업을 통째로 AI에 맡겼습니다. "데이터를 분석해서 주제와 관련 있는지 없는지 구별해줘" 라고 물었고요.
그런데 데이터가 조용히 망가지더군요.  처음에는 놀랐습니다. 데이터 퀄리티가 너무 안좋아서요.

무슨일이지 하고 살펴보니 관련 데이터 분류가 개판으로 되고 있더군요. 관련이 있는지, 없는지 선택지를 2개만 주면 뭔가 애매한 것까지 억지로 둘 중 하나로 분류해 버렸던 것입니다.

그래서 지금은 세가지 선택지를 줍니다. 관련 / 무관 / 판단보류. 

그리고 판단보류에 해당하는 부분을 사람이 결정해 주는거죠. 처음에는 물론 귀찮고 힘들지만, 데이터가 점점 쌓이면서 학습이 되면 이러한 부분도 없어집니다.
자동화는 사람 손을 없애는 단어가 아니라, 사람이 봐야 할 자리를 좁히는 단어에 가까운 것 같습니다.$body$,
   465, '빌드인퍼블릭', 'published', 'external', $body$[external] 파이프라인 초안 없음 — 남헌이 별도 Claude 세션에서 첨삭받아 Threads 에 직접 게시. 2026-09-27 CEO-STAFF 등록(대시보드 미연결 4건 해소, 남헌 확정). 본문은 Threads API 발행본 그대로.$body$),
  ((SELECT id FROM public.channels WHERE owner_type='self' AND platform='threads' LIMIT 1),
   '18088869200679739', '2026-09-25T09:18:52+0000', 'https://www.threads.com/@solution_arch_/post/DdtHxctGqov',
   $body$AI SaaS를 만들고 있는데, UI를 정하는 데만 시간이 너무 많이 흐르고 있습니다. AI가 만들고 제가 검수하고, 수정하고, 다시 검수하고. 도저히 끝날 기미가 안 보이더군요.

AI는 잘해주고 있습니다. 문제는 저죠.
디자인을 배운 적은 없고, 만든 걸 슥 보고 괜찮으면 패스 아니면 말고를 반복했습니다. 기준이 없으니 이랬다 저랬다 하고, 답이 안 보이는 거죠.

이럴 때는 레퍼런스를 참조하는 게 가장 중요합니다. 못하는 디자인을 하겠다고 설치다 흐지부지되느니, 조금 불만족스럽더라도 하나나 둘을 잡고 확실하게 밀고 가는 겁니다.

AI에게 "이 사이트들의 색감·구조·간격을 참조해서 내 시스템에 맞게 만들어줘"라고 말하면 됩니다. 그랬더니 레퍼런스 4곳의 CSS를 직접 읽어서 배경색, 서체, 모서리 반경, 그림자, 모션까지 실측치로 토큰을 전부 다시 뽑아주더군요.

잘 된 화면은 '만들어 내는' 게 아니라 '찾아내는' 거였습니다.
일단 만들고, 조금씩 고쳐나가면 됩니다$body$,
   494, '빌드인퍼블릭', 'published', 'external', $body$[external] 파이프라인 초안 없음 — 남헌이 별도 Claude 세션에서 첨삭받아 Threads 에 직접 게시. 2026-09-27 CEO-STAFF 등록(대시보드 미연결 4건 해소, 남헌 확정). 본문은 Threads API 발행본 그대로.$body$)
ON CONFLICT (external_id) DO NOTHING;

-- 확인 쿼리
--   양성: SELECT external_id, published_at, char_count FROM public.posts WHERE published_via='external' ORDER BY published_at;  -- 4행
--   음성: 같은 파일을 다시 돌려도 행 수가 4 를 넘지 않는다(ON CONFLICT).
--   효과: 다음 정각 매처(match-posts) 기록 agent_run_steps.threads_unlinked counts.unlinked = 0.
