# AI 사용량 게이지

Claude와 ChatGPT(Codex) 사용 한도가 얼마나 남았는지 VS Code 상태 표시줄에서 바로 확인하세요.

[English](README.md)

```
[Claude 로고] 5h 78% · 7d 55%   [ChatGPT 로고] 5h 100% · 7d 96%
```

> 비공식 확장입니다. Anthropic, OpenAI와 제휴하거나 승인받은 프로젝트가 아닙니다.

## 기능

- **두 서비스를 한눈에.** Claude와 ChatGPT(Codex)가 상태 표시줄 오른쪽 끝에 나란히 표시됩니다.
- **쓴 양이 아니라 남은 양.** `5h 78%`는 5시간 한도가 78% 남았다는 뜻입니다.
- **마우스를 올리면 자세히.** Opus, Sonnet 같은 모델별 주간 한도까지 모든 한도의 남은 양, 초기화까지 남은 시간과
  정확한 시각, 플랜을 보여줍니다.
- **색으로 경고.** 남은 양이 25% 이하이면 경고색, 10% 이하이면 오류색으로 바뀝니다.
- **알아서 갱신.** 기본 2분마다, 그리고 한도가 초기화되면 바로 다시 조회합니다. 클릭하면 즉시 새로고침합니다.
- **API 호출 최소화.** 열려 있는 모든 VS Code 창이 조회 결과 하나를 함께 씁니다.
- **추가 로그인 없음.** 이미 로그인된 Claude Code와 Codex CLI 계정을 그대로 씁니다.
- **영어, 한국어 지원.** VS Code 표시 언어를 따릅니다.

## 시작하기

1. 쓰는 도구에 로그인합니다.
   - **Claude**: 터미널에서 `claude`를 실행해 Claude Code에 로그인합니다.
   - **ChatGPT**: `codex login`을 실행해 ChatGPT 계정으로 로그인합니다.
2. 이 확장을 설치하면 몇 초 안에 상태 표시줄에 사용량이 나타납니다.

하나만 쓰신다면 `aiUsage.showClaude` 또는 `aiUsage.showChatGPT`로 다른 하나를 끄면 됩니다.

## 상태 표시줄 읽는 법

| 표시 | 의미 |
|---|---|
| `5h 78%` | 5시간 한도가 78% 남음 |
| `7d 55%` | 주간 한도가 55% 남음 |
| 경고 아이콘과 배경 | 표시된 한도 중 하나가 25% 이하 |
| 오류 아이콘과 배경 | 표시된 한도 중 하나가 10% 이하이거나 소진됨 |
| 빗금 친 원 | 사용량을 불러오지 못함. 마우스를 올리면 이유가 나옵니다 |
| 회전 아이콘 | 불러오는 중 |

## 명령

| 명령 | 설명 |
|---|---|
| `AI 사용량: 새로고침` | 지금 바로 조회 (항목을 클릭한 것과 같음) |

## 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `aiUsage.refreshIntervalSeconds` | 120 | 조회 간격(초, 최소 60) |
| `aiUsage.showClaude` | true | Claude 항목 표시 |
| `aiUsage.showChatGPT` | true | ChatGPT 항목 표시 |
| `aiUsage.codexPath` | "" | codex 실행 파일 경로 (못 찾을 때만 지정) |

## 문제 해결

먼저 항목에 마우스를 올려 보세요. 툴팁에 무엇이 잘못됐는지 나옵니다.

- **"Claude Code 로그인 정보를 찾지 못했습니다"**: 터미널에서 `claude`를 실행해 로그인하세요.
- **"Claude Code 토큰이 만료되었습니다"**: `claude`를 한 번 실행하면 Claude Code가 토큰을 갱신하고, 다음 조회 때
  정상으로 돌아옵니다. 이 확장은 토큰을 직접 갱신하지 않으므로 Claude Code 로그인이 풀리지 않습니다.
- **"codex CLI를 찾지 못했습니다"**: Dock에서 연 VS Code는 셸의 `PATH`를 못 볼 수 있습니다.
  `which codex` 결과를 `aiUsage.codexPath`에 넣으세요.
- **"Codex에 ChatGPT 계정으로 로그인되어 있지 않습니다"**: `codex login`으로 ChatGPT 계정 로그인을 선택하세요.
  API 키로 로그인한 경우에는 보여줄 플랜 한도가 없습니다.

## 동작 방식과 개인정보

이 확장은 별도 서버 없이 사용자 컴퓨터에서만 동작하며, 사용 통계를 수집하지 않습니다.

- **Claude**: Claude Code가 저장해 둔 로그인 토큰을 읽어 Anthropic 사용량 API(`api.anthropic.com`)를 조회합니다.
  - 토큰 위치: macOS 키체인(`Claude Code-credentials`), 없으면 `~/.claude/.credentials.json`
  - 토큰은 `api.anthropic.com` 으로만 전송되며 화면, 로그, 캐시에 남기지 않습니다.
  - macOS에서 처음 조회할 때 키체인 접근 허용 창이 뜰 수 있습니다.
- **ChatGPT**: 설치된 `codex app-server`를 실행해 사용량을 물어봅니다. 인증은 Codex CLI가 처리하며,
  이 확장은 OpenAI 토큰을 직접 읽지 않습니다.

## 지원 플랫폼

macOS에서 만들고 확인했습니다. Linux와 Windows에서도 같은 방식으로 시도하지만 검증하지 않았습니다.
Windows에서는 codex CLI를 찾지 못할 수 있습니다.

## 주의

Claude 사용량 API는 Anthropic이 공개 문서로 제공하는 API가 아닙니다. 예고 없이 형식이 바뀌거나 막힐 수 있으며,
그러면 툴팁에 오류가 표시됩니다. Codex `app-server`의 응답 형식도 Codex CLI 업데이트에 따라 바뀔 수 있습니다.

## 상표

Claude는 Anthropic의, ChatGPT·Codex는 OpenAI의 상표입니다. 상태 표시줄의 로고는 어떤 서비스의 사용량인지
구분하기 위해서만 사용합니다.

## 라이선스

[MIT](LICENSE)
