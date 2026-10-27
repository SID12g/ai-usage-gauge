# AI 사용량 게이지

[English](README.md)

Claude와 ChatGPT(Codex)의 남은 사용량을 VS Code 하단 상태 표시줄에 보여줍니다.

> **비공식 확장입니다.** Anthropic, OpenAI와 제휴하거나 승인받은 프로젝트가 아닙니다.
> Claude는 Anthropic의, ChatGPT·Codex는 OpenAI의 상표이며, 상태 표시줄의 로고는 어떤 서비스의
> 사용량인지 구분하기 위해서만 사용합니다.

```
[Claude 로고] 5h 78% · 7d 55%    [ChatGPT 로고] 5h 100% · 7d 100%
```

- 마우스를 올리면 한도별 남은 양, 초기화 시각, 플랜이 표로 나옵니다.
- 클릭하면 바로 새로고침합니다. 기본 조회 간격은 2분입니다.
- 남은 양이 25% 이하이면 경고색, 10% 이하이면 오류색으로 바뀝니다.

## 필요 조건

- **Claude**: Claude Code에 로그인되어 있어야 합니다 (`claude`).
- **ChatGPT**: Codex CLI에 ChatGPT 계정으로 로그인되어 있어야 합니다 (`codex login`).
  ChatGPT 채팅 메시지 한도는 OpenAI가 조회 방법을 제공하지 않아 Codex 한도를 보여줍니다.

macOS에서 만들고 확인했습니다. 다른 OS에서는 아래 동작 방식대로 시도하지만 검증하지 않았습니다.

## 동작 방식과 개인정보

이 확장은 별도 서버 없이 사용자 컴퓨터에서만 동작하며, 사용 통계를 수집하지 않습니다.

- **Claude**: Claude Code가 저장해 둔 로그인 토큰을 읽어 Anthropic 사용량 API(`api.anthropic.com`)를 조회합니다.
  - 토큰 위치: macOS 키체인(`Claude Code-credentials`), 없으면 `~/.claude/.credentials.json`
  - 토큰은 `api.anthropic.com` 으로만 전송되며 화면, 로그, 캐시에 남기지 않습니다.
  - 토큰을 직접 갱신하지 않습니다. 만료되면 터미널에서 `claude`를 한 번 실행하라고 안내합니다.
  - macOS에서 처음 조회할 때 키체인 접근 허용 창이 뜰 수 있습니다.
- **ChatGPT**: 설치된 `codex app-server`를 실행해 사용량을 물어봅니다. 인증은 Codex CLI가 처리하며,
  이 확장은 OpenAI 토큰을 직접 읽지 않습니다.

### 주의

Claude 사용량 API는 Anthropic이 공개 문서로 제공하는 API가 아닙니다. 예고 없이 형식이 바뀌거나 막힐 수 있으며,
그러면 툴팁에 오류가 표시됩니다. Codex `app-server`의 응답 형식도 Codex CLI 업데이트에 따라 바뀔 수 있습니다.

## 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `aiUsage.refreshIntervalSeconds` | 120 | 조회 간격(초, 최소 60) |
| `aiUsage.showClaude` | true | Claude 항목 표시 |
| `aiUsage.showChatGPT` | true | ChatGPT 항목 표시 |
| `aiUsage.codexPath` | "" | codex 실행 파일 경로 (못 찾을 때만 지정) |

## 언어

English, 한국어를 지원합니다. VS Code 표시 언어를 따릅니다.

## 라이선스

[MIT](LICENSE)
