# AI 사용량 상태 표시줄

Claude와 ChatGPT(Codex)의 남은 사용량을 VS Code 하단 상태 표시줄에 보여줍니다.

```
[Claude 로고] 5h 78% · 7d 55%    [ChatGPT 로고] 5h 100% · 7d 100%
```

- 마우스를 올리면 한도별 남은 양, 초기화 시각, 플랜이 표로 나옵니다.
- 클릭하면 바로 새로고침합니다. 기본 조회 간격은 2분입니다.
- 남은 양이 25% 이하이면 경고색, 10% 이하이면 오류색으로 바뀝니다.

## 필요 조건

- **Claude**: Claude Code에 로그인되어 있어야 합니다 (`claude`). macOS 키체인의 Claude Code 토큰으로
  Anthropic 사용량 API를 조회하며, 토큰은 `api.anthropic.com` 으로만 전송됩니다. 이 API는 공개 문서가 없는
  엔드포인트라 형식이 바뀌면 툴팁에 오류가 표시됩니다.
- **ChatGPT**: Codex CLI에 ChatGPT 계정으로 로그인되어 있어야 합니다 (`codex login`). `codex app-server`가
  조회와 인증을 처리합니다. ChatGPT 채팅 메시지 한도는 OpenAI가 조회 방법을 제공하지 않아 Codex 한도를 보여줍니다.

## 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `aiUsage.refreshIntervalSeconds` | 120 | 조회 간격(초, 최소 60) |
| `aiUsage.showClaude` | true | Claude 항목 표시 |
| `aiUsage.showChatGPT` | true | ChatGPT 항목 표시 |
| `aiUsage.codexPath` | "" | codex 실행 파일 경로 (못 찾을 때만 지정) |
