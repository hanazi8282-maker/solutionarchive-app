-- 2026-09-16 케이스 재검수 — 새 evidence_grade(독자 인사이트) 기준 1차 반려.
-- claude-code 가 준비했으나 review_status 대량 변경은 harness 안전장치가 막아
-- 직접 실행하지 못했다. 사람이 `supabase db query --linked -f` 또는 대시보드로 실행한다.
--
-- 전제: node --env-file=.env.local scripts/case-review.mjs regrade 를 먼저 돌려
-- evidence_grade 가 새 산식으로 갱신돼 있어야 한다(2026-09-16 이미 실행·적용 완료).
--
-- 결과 요약(재계산 후 실측): 무브 67개 중 evidence_grade A/B(통과)는 3개뿐 —
-- convertkit-concierge-migration-conversion/OFFER(A), homejoy-discount-conversion-collapse/
-- PRICING(A)·OPERATIONS(A). 나머지 62개는 D(transfer_note 미기재), 2개는 C.
-- 통과 무브가 1건이라도 있는 케이스는 2개(convertkit, homejoy) — 그 안의 미달 무브만
-- 개별 반려하고 케이스는 draft 유지. 나머지 31개 케이스는 통과 무브가 0건이라 케이스+
-- 무브 전부 반려.

BEGIN;

-- 1) 통과 케이스 안의 미달 무브 2건만 개별 반려 (케이스는 draft 유지)
UPDATE case_moves SET
  review_status = 'rejected',
  review_note = '2026-09-16 재검수(evidence_grade 재설계, 남헌 지시) — claude-code 1차 검수. 인사이트 등급 C: transfer_note는 구체적이나 뒷받침 근거가 없음(사실확인 D). 같은 케이스의 다른 무브는 통과해 케이스 자체는 draft 유지, 이 무브만 반려.',
  reviewed_by = 'claude-code (Sonnet 5) — 남헌 명시 지시 2026-09-16',
  reviewed_at = now()
WHERE id IN ('ebcf11aa-fb1a-4f90-b3e5-93e46dbd8d5f', 'b306437e-e5bf-4ab0-9c03-ebced2561ddf');

-- 2) 통과 무브가 0건인 31개 케이스: 케이스 자체를 반려
UPDATE case_studies SET
  review_status = 'rejected',
  review_note = '2026-09-16 재검수(evidence_grade 재설계, 남헌 지시) — claude-code 1차 검수. 이 케이스의 무브 전부가 인사이트 등급 C/D(대부분 transfer_note 미기재 — 독자가 할 구체적 행동이 기록 안 됨). 옛 evidence_grade(사실확인) 기준으로는 approved 였더라도 새 기준(독자 인사이트)으로는 통과 무브가 0건이라 반려. drafts/columns/_review/2026-09-15-case-triage.md 의 구조 문제 지적("④사고의 흐름·⑤적용이 33건 전 건 공통으로 빠졌다")과 일치.'
WHERE id NOT IN ('86ca7342-2880-4e94-a436-0f9b5210f9ae', 'c8bc7e62-fd5e-4965-b231-5b20272ed419')
  AND review_status != 'rejected';

-- 3) 그 31개 케이스에 속한 무브 전부도 반려 (케이스 반려와 세트)
UPDATE case_moves SET
  review_status = 'rejected',
  review_note = CASE WHEN evidence_grade = 'D'
    THEN '2026-09-16 재검수(evidence_grade 재설계, 남헌 지시) — claude-code 1차 검수. 인사이트 등급 D: transfer_note 미기재로 독자가 할 구체적 행동이 없음. 케이스 전체가 반려돼 함께 반려.'
    ELSE '2026-09-16 재검수(evidence_grade 재설계, 남헌 지시) — claude-code 1차 검수. 인사이트 등급 ' || evidence_grade || '. 케이스 전체가 반려돼 함께 반려.'
    END,
  reviewed_by = 'claude-code (Sonnet 5) — 남헌 명시 지시 2026-09-16',
  reviewed_at = now()
WHERE case_study_id NOT IN ('86ca7342-2880-4e94-a436-0f9b5210f9ae', 'c8bc7e62-fd5e-4965-b231-5b20272ed419')
  AND review_status != 'rejected';

COMMIT;

-- 실행 후 확인:
--   SELECT review_status, count(*) FROM case_studies GROUP BY 1;
--   SELECT review_status, count(*) FROM case_moves GROUP BY 1;
-- 기대값: case_studies rejected=31, draft=2 / case_moves rejected=64, draft·approved 합쳐 3
--   (approved 로 남아있던 행이 있었다면 그 행도 이번에 rejected 로 바뀐다 — WHERE 절이
--   현재 review_status 를 안 가리고 rejected 가 아닌 모든 상태를 대상으로 하기 때문).
