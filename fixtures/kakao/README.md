# 카카오 스킬 웹훅 픽스처

`app/api/insight/kakao-webhook/route.ts` 를 실제로 찔러 본 요청 페이로드다.
로컬 `next dev` 로 검증했고(2026-09-02), 각 파일 옆의 `.expected.json` 이
그때 실제로 돌아온 응답이다.

⚠️ **이 페이로드는 카카오 공식 문서의 필드명(`userRequest.utterance`,
`userRequest.user.id`, `bot.id`)을 따랐지만, 최상위 전체 구조
(`intent`/`action`/`flow`/`contexts`)는 축약했다.** 라우트가 그 셋을 읽지
않기 때문이다. **실제 채널을 연결한 뒤 첫 공유의 발화 전문이 서버 로그에
찍히므로**(`[kakao-webhook] utterance(N자): …`), 그때 진짜 페이로드로
이 픽스처를 갱신할 것.

안드로이드 Threads 공유가 URL 만 보내는지 본문까지 보내는지는 **아직
모른다.** 추측으로 설계하지 않고, 첫 공유가 알려주게 해 뒀다.
