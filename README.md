# 중고물품 가격 감정서

선형회귀 기반 중고거래 가격 예측 앱입니다. (Vite + React)

## 가장 쉬운 방법: CodeSandbox / StackBlitz (설치 없이 바로 배포)

1. https://codesandbox.io 또는 https://stackblitz.com 접속 후 로그인
2. "Create" → "Import Project" 또는 "Upload Folder"에서 이 폴더(`price-predictor-app`) 전체를 업로드
3. 자동으로 `npm install`이 실행되고 미리보기가 뜹니다
4. 우측 상단 "Share" 버튼을 누르면 누구나 접속 가능한 URL이 생성됩니다 (이게 배포입니다)

## 더 정식으로: GitHub + Vercel (커스텀 도메인, 자동 재배포)

1. 이 폴더로 새 GitHub 저장소를 만들고 푸시합니다
   ```bash
   cd price-predictor-app
   git init
   git add .
   git commit -m "init"
   git remote add origin <내 저장소 주소>
   git push -u origin main
   ```
2. https://vercel.com 가입 → "Add New Project" → 방금 만든 GitHub 저장소 선택
3. Framework는 Vite로 자동 인식됩니다 → "Deploy" 클릭
4. 2~3분 후 `내프로젝트.vercel.app` 주소가 발급됩니다. 이후 GitHub에 푸시할 때마다 자동 재배포됩니다

## 로컬에서 먼저 확인하고 싶다면

```bash
npm install
npm run dev      # http://localhost:5173 에서 확인
npm run build    # dist/ 폴더 생성 (정적 파일로 어디든 올릴 수 있음)
```

`npm run build`로 만들어지는 `dist/` 폴더는 Netlify Drop(https://app.netlify.com/drop)에
그대로 드래그&드롭해도 즉시 배포됩니다.
