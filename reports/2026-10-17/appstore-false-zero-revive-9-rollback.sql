-- v71al §2 러너 재프로브(run 39032104632, 2026-10-17T12:20Z)에서 entry>0 으로 확인된 거짓 0건 9곳을 active 로 되살린 것의 롤백.
-- 정방향(적용됨): UPDATE review_targets SET status='active' WHERE id IN (아래 9개) AND source_key='appstore' AND status='exhausted' AND total_collected=0;
-- 롤백: 아직 수집이 한 번도 안 됐으면(total_collected=0) 원래 상태로. 수집된 뒤에는 되돌리지 않는다(데이터가 쌓였기 때문).
UPDATE review_targets SET status='exhausted'
 WHERE source_key='appstore' AND status='active' AND total_collected=0
   AND id IN ('0223f197-f6e2-4ea5-97db-7353e9e9b9d3','67a00682-8236-4042-8ff8-78522029f2c2','9c31447c-2816-43af-ab63-d8b31ae85f2f','1edd90ae-7975-4ee5-86e1-1412505f41a6','b4109e76-745b-48cc-b67d-6fb86286696d','08da2dd9-c072-4752-b64a-683787e28037','3fbdc913-b78b-414e-a034-cdca7f366d04','d15f5a06-f4cb-46ca-8ce4-a71df4e57824','49031fac-1125-4aee-b6bf-ead4d1fc5573');
