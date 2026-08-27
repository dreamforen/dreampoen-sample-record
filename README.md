# 드림포이엔 시료채취기록 웹 v1

업로드한 실제 시료채취기록 Excel을 기준으로 만든 GitHub Pages용 정적 웹 프로토타입입니다.

## 기능
- 먼지 / 중금속 측정 구분
- 일반사항, 기상·가스, 굴뚝·장비 조건 입력
- 수분 자동측정 5회 평균
- 최대 5포인트 시료채취 조건 입력
- 수분량, 배출가스 밀도, 유속, 굴뚝 단면적, 표준상태 유량, 등속흡인계수 자동계산
- 브라우저 LocalStorage 임시저장/불러오기
- Excel(.xlsx) 출력
- 인쇄/PDF
- 별도 서버·Python 없이 GitHub Pages에서 실행 가능

## GitHub Pages 올리기
1. GitHub에서 새 Repository 생성 (예: `sample-record`)
2. 이 폴더의 `index.html`, `style.css`, `app.js` 업로드
3. Repository > Settings > Pages
4. Build and deployment에서 `Deploy from a branch`
5. Branch `main`, Folder `/ (root)` 선택 후 Save
6. 몇 분 후 `https://사용자명.github.io/sample-record/` 형태로 접속

## 중요
v1은 실제 원본의 핵심 계산식을 웹식으로 옮긴 프로토타입입니다. 업무 적용 전 여러 실측 파일과 교차검증 후 사용하세요. 다음 버전에서는 기존 Excel 양식과 동일한 출력 레이아웃, 업체 DB, 이전 기록 불러오기 등을 추가할 수 있습니다.
