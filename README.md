# Introduce Special Case

아파트 관리사무소에서 입주자가 확인되지 않은 세대에도 명절 우편과 택배 알림을 보내야 합니다. 이 한국어 튜토리얼은 업무마다 장부의 `'unknown'`을 검사하던 코드를, 창구에서 공용 ‘미확인 입주자 카드’를 건네는 방식으로 바꾸는 과정을 보여 줍니다.

**[GitHub Pages에서 실습 시작](https://technoetic.github.io/introduce-special-case/)**

| 단계 | 해 보는 일 |
| --- | --- |
| [조건 관찰](https://technoetic.github.io/introduce-special-case/#/observe) | 세대를 바꿔 보며 우편·택배·민원 창구의 처리 결과를 확인합니다. |
| [표준 카드 도입](https://technoetic.github.io/introduce-special-case/#/refactor) | 특수한 값을 카드로 바꾸는 창구와 카드를 받는 업무의 코드를 비교합니다. |
| [결과 검증](https://technoetic.github.io/introduce-special-case/#/verify) | 세 세대의 세 가지 업무를 전후 코드로 실행합니다. 민원이 0건인 등록 세대와 미확인 세대를 구별하는 문제도 풀 수 있습니다. |

실습은 마틴 파울러의 리팩토링을 설명하기 위해 만든 가상 사례입니다. 원본 장부에는 `'unknown'`이 남고, 조회할 때만 같은 인터페이스의 읽기 전용 객체를 돌려줍니다. [Martin Fowler, Introduce Special Case](https://refactoring.com/catalog/introduceSpecialCase.html)

## 로컬 실행

Node.js 24 이상에서 아래 명령을 저장소 루트에서 실행하세요. 프로덕션 빌드는 `dist/`에 생성됩니다.

```sh
npm test
npm run build
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

브라우저에서 `http://127.0.0.1:8080/`을 여세요. 학습 데이터와 이미지는 배포본에 들어 있고, 계정이나 API 키가 필요하지 않습니다. 영문 제목 서체 DM Serif Text의 라이선스는 [assets/OFL.txt](assets/OFL.txt)에 있습니다.
