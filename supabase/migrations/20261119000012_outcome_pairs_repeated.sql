-- v71ct-4 후속(11/19 새벽 지시 3): "쌍 3개 이상 + 차이 반복" 필터. outcome_pairs_norm 뷰는 전수 스캔이 타임아웃이라 ss_episode_tags_current 에서 직접 센다.
-- 조건: 같은 장·같은 mechanism_norm(기타 제외)에서 성공(positive, signal 제외) 스토리 ≥2 ∧ 실패·혼합 스토리 ≥2 (쌍 수 = 곱 ≥4 ≥ 3, 같은 스토리 하나로 반복된 쌍은 제외 = "차이가 반복"의 대리 기준). 결과 표 outcome_pairs_repeated(스냅샷, 함수로 갱신).
-- 이 파일은 MCP 로 이미 적용한 표·함수와 동일한 의미(표 정의는 20261119 apply_migration outcome_pairs_repeated_20261119, 함수 본문은 위 조건으로 교체됨). 롤백: _rollback.
SELECT 1;
