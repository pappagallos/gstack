# cso의 큰 저장소 지원과 macOS 소켓 호환성

## 스냅샷 입력 한도

`start --max-source-mib N`은 감사용 스냅샷이 읽는 전체 원본 파일 크기의 상한을 MiB 단위로 정한다. 기본값은 64이며 1부터 1024까지의 정수만 허용한다. 큰 저장소는 필요한 실행에서만 명시적으로 한도를 늘린다.

```sh
~/.codex/skills/gstack/bin/gstack-cso-launcher start --repo /absolute/repository --comprehensive --max-source-mib 512
```

선택한 값은 보고서의 `policy.maxSourceMiB`와 Markdown 보고서에 기록된다. `resume`과 해당 감사의 `recheck`는 이 값을 보존한다. 파일 하나의 64 MiB 읽기 한도, 1 MiB 가림 처리 한도, 파일 수 제한, 감사 시간 제한은 유지한다. 큰 파일과 바이너리는 기존 정책에 따라 미검토 입력으로 명시된다. 한도를 늘려도 전체 파일 검토를 보장하지 않는다.

파일 경로와 식별값만 담는 스냅샷 목록은 별도의 16 MiB 상한을 사용한다. 파일이 많은 저장소에서 원본 입력 한도보다 먼저 목록 크기 제한에 걸리는 문제를 해결한다. 보고서와 제어 JSON의 1 MiB 제한, 파일 소유자와 권한 검사, 링크와 경합 검사는 유지한다.

## macOS의 Docker 소켓

macOS에서 Bun의 `realpathSync`는 Unix 소켓을 대상으로 `EOPNOTSUPP`를 반환할 수 있다. cso는 이제 부모 디렉터리를 정규화한 뒤 최대 40개의 링크를 따라가며 최종 입력이 실제 Unix 소켓인지 검사한다. Docker 엔드포인트의 장치와 inode 확인, 로컬 소켓 제한, registry socket의 소유자와 권한 검사는 유지한다.

Docker Desktop이 이미 설치되어 있다면 실행 파일이 cso의 신뢰 경로에 있고 Docker 컨텍스트가 실제 실행 중인 로컬 엔진을 가리켜야 한다. `doctor --repo /absolute/repository`로 확인한다. 스캐너 이미지는 `provision-images`가 카탈로그에 고정된 이미지 식별자로 준비한다.

검증에는 실제 Unix 소켓과 링크, 일반 파일과 순환 링크의 거부, 기본 용량 제한과 명시적 확장, CLI 정책 저장과 재개, 재점검 시 정책 보존을 포함한다.
