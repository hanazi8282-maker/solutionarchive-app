# story flow 나란히 비교 — dry

- 생성 2026-11-19T17:04:18.136Z · 원천 합성 픽스처(실제 회사 아님) · 회사 2곳(영역② 1·⑤ 1) · 시드 20261120
- B = enrichDiagnosis(사업 설명·URL·영역 이름) + selectStoryFlow({"stageFirst":true,"topic":true}) · 기존 = retrieveSimilar(카테고리 자리에 영역 이름)
- 진단 단계는 analysis_projects 에 매출 칸이 없어 모름. 장은 bottleneck 칸(없으면 5장 기본) — 회사별 chapter_basis 참고.
- 드라이런 — LLM 호출 없음, 채점 없음

| 회사 | 영역 | 장 | 현재(옵션 없음) | B | B 실패 표시 | B 인용 |
|---|---|---|---|---|---|---|
| fx-compa www.example-reviewpal.test | 5 | 5 | Fx Review A · Fxt A Attributer · ⚠Fxt M Agency | Fx Review A · Fxt W Reviewpages · ⚠Fxt M Agency | 1건 표시 | ok 3 |
| fx-compa example-salesmate.test | 2 | 6 | Fx Sales A · Fx Sales D · ⚠Fx Sales C | Fx Sales A · Fx Sales B · ⚠Fx Sales C | 1건 표시 | ok 3 |

## 회사별 목록
### fx-compa (영역 5, bottleneck:AWARENESS)
- 채운 칸: {"customer":"smb","pricing_model":"subscription","price_band":"<10"} · 주제 개념: seo, review, writing, local_smb
- 현재: Fx Review A · Fxt A Attributer · ⚠Fxt M Agency
- B: Fx Review A · Fxt W Reviewpages · ⚠Fxt M Agency (ok)

### fx-compa (영역 2, bottleneck:CONVERSION)
- 채운 칸: {"customer":"smb","pricing_model":"subscription","price_band":"10-49","team_size":"solo"} · 주제 개념: sales, pricing, local_smb
- 현재: Fx Sales A · Fx Sales D · ⚠Fx Sales C
- B: Fx Sales A · Fx Sales B · ⚠Fx Sales C (ok)

