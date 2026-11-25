#!/bin/bash
# P4: 처음 보는 6곳(라벨 적재 뒤 재실행). 인자1 = A(라벨링) 사용액. 이미 results.json 이 있는 회사는 건너뛴다(반복 실행 안전).
cd /c/Users/DCU/Desktop/Cowork/sa-v71ee-pr
O=reports/2026-11-25/solution-pipeline/new6b
A=${1:-0}
run(){ [ -f "$O/$1/results.json" ] && return 0; node --env-file=.env.local scripts/solution-pipeline.mjs --company "$2" --out $O/$1 --a-used $A >> $O/run.out 2>&1; }
run taxeasy "https://taxeasy.co.kr/,https://play.google.com/store/apps/details?id=kr.co.taxeasy.app&hl=ko"
run chalkaksiru "https://apps.apple.com/kr/app/id6769615882"
run autoke "https://autoke.ai/ko"
run creazy "https://creazy.app/ko"
run pagemaker "https://pagemaker.ai.kr/"
run metaflyer "https://www.metaflyer.io/"
