# Robot Safety 백엔드 (FastAPI)

젯슨이 아직 없어도 지금 이 컴퓨터에서 바로 돌릴 수 있는 백엔드입니다.
나중에 젯슨이 도착하면 이 폴더를 그대로 젯슨에 복사해서 똑같이 실행하면 됩니다.

## 1. VS Code에서 실행하는 방법

1. VS Code에서 이 `backend` 폴더를 열거나, 기존 `safetymonitor` 프로젝트 옆에
   `backend` 폴더를 그대로 복사해 넣고 VS Code로 그 폴더를 여세요.
2. VS Code 터미널 열기: 상단 메뉴 **터미널 → 새 터미널**
3. (처음 한 번만) 가상환경 만들고 패키지 설치:
   ```
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
   (Mac/Linux라면 `venv\Scripts\activate` 대신 `source venv/bin/activate`)
4. 서버 실행:
   ```
   uvicorn app.main:app --reload --port 8000
   ```
5. 터미널에 `Application startup complete` 같은 문구가 뜨면 정상 실행된 겁니다.

## 2. 잘 되는지 확인하기

브라우저에서 아래 주소로 들어가보세요:

```
http://localhost:8000/docs
```

Swagger UI라는 화면이 뜨는데, 여기서 각 API를 클릭해서 "Try it out" 버튼으로
직접 테스트해볼 수 있습니다. 예를 들어 `/api/auth/login`을 열고
`{"username": "admin", "password": "1234"}` 를 넣고 실행해보면 로그인 토큰이 나옵니다.

## 3. 데이터는 어디에 저장되나요

`robot_safety.db` 라는 파일 하나에 전부 저장됩니다 (SQLite). 서버를 껐다 켜도
데이터가 그대로 남아있습니다 (지금 프론트엔드처럼 새로고침하면 사라지지 않음).
이 파일을 지우고 서버를 다시 실행하면 admin/1234 계정과 예시 데이터가 새로 만들어집니다.

## 4. 다음 단계 - React 프론트엔드와 연결하기

지금 `safetymonitor` 프론트엔드는 아직 이 백엔드를 호출하지 않고, 모든 걸 브라우저
안에서만 흉내내고 있어요. 다음 단계로 `App.jsx`와 `Login.jsx`를 수정해서
- 로그인 버튼 → `POST http://localhost:8000/api/auth/login` 호출
- 이벤트 목록 → `GET /api/events` 호출
- 시뮬레이션 버튼 → `POST /api/status`, `POST /api/events` 호출

이렇게 실제 API를 호출하도록 바꾸면 됩니다. 이 부분은 원하시면 이어서 코드로
만들어드릴게요.

## 5. 나중에 젯슨에 연결할 때

젯슨 쪽 코드는 지금 시뮬레이션 버튼이 호출하는 것과 똑같은 API
(`POST /api/status`, `POST /api/events`)를 그대로 호출하면 됩니다.
즉 프론트엔드나 백엔드를 다시 만들 필요 없이, "누가 이 API를 호출하는가"만
시뮬레이션 버튼 → 젯슨 코드로 바뀌는 구조입니다.

## API 목록

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | /api/auth/login | 로그인 (admin/1234) |
| POST | /api/auth/logout | 로그아웃 |
| GET | /api/events | 이벤트 목록 조회 |
| POST | /api/events | 이벤트 생성 |
| POST | /api/events/mark-all-read | 전체 읽음 처리 |
| GET | /api/settings | 구역/임계값 설정 조회 |
| PUT | /api/settings | 구역/임계값 설정 변경 |
| POST | /api/status | 실시간 상태 갱신 (웹소켓으로 브로드캐스트) |
| WS | /ws/status | 실시간 상태 수신 (프론트엔드가 연결) |

인증이 필요한 API는 요청 헤더에 `Authorization: Bearer <로그인때 받은 토큰>` 을
넣어야 합니다.
