#!/usr/bin/env sh

set -eu

# 사용자에게 실패 지점과 보존 상태를 함께 알리고 종료한다.
fail_release() {
	printf '%s\n' "[publish-release] $1" >&2
	exit 1
}

# 필수 실행 파일이 없으면 파일·커밋·태그를 건드리기 전에 중단한다.
require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		fail_release "$1 명령을 PATH에서 찾지 못해 중단했습니다. Node.js·pnpm·GitHub CLI 환경을 확인하세요."
	fi
}

# 현재 실행이 대화형 터미널인지 먼저 확인한다.
if [ ! -t 0 ] || [ ! -t 1 ]; then
	fail_release '대화형 터미널에서만 실행할 수 있습니다. 표준 입력과 출력을 터미널에 연결해 다시 실행하세요.'
fi

# 실행 환경의 필수 명령을 Git 저장소 접근보다 먼저 확인한다.
require_command git
require_command node
require_command pnpm
require_command gh

# 확인을 생략하는 --yes 등 비대화형 경로를 제공하지 않는다.
if [ "$#" -ne 0 ]; then
	fail_release '이 명령은 인자를 받지 않습니다. 확인 프롬프트가 있는 대화형 터미널에서 다시 실행하세요.'
fi

# 대화형 릴리스 후보 준비와 정확한 커밋의 CI 대기를 수행하는 저장소 루트.
if ! REPOSITORY_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
	fail_release 'Git 저장소 루트를 찾지 못해 중단했습니다.'
fi
cd "$REPOSITORY_ROOT"

# 버전 계산과 JSON 처리를 담당하는 저장소 고정 Node 보조 스크립트.
SCRIPT_DIRECTORY=$(CDPATH= cd "$(dirname "$0")" && pwd)
VERSION_HELPER="$SCRIPT_DIRECTORY/publish-release-version.mjs"
MANIFEST_PATH='apps/desktop/package.json'
REMOTE_NAME='origin'
CI_LOOKUP_ATTEMPTS="${PUBLISH_RELEASE_CI_LOOKUP_ATTEMPTS:-6}"
CI_LOOKUP_DELAY_SECONDS="${PUBLISH_RELEASE_CI_LOOKUP_DELAY_SECONDS:-1}"

# GitHub Release 목록에서 버전 하나의 사용 상태를 조회한다.
release_status() {
	printf '%s' "$RELEASE_LIST_JSON" | node "$VERSION_HELPER" release-status "$1"
}

# 두 안정 버전의 순서를 보조 스크립트로 비교한다.
compare_versions() {
	node "$VERSION_HELPER" compare "$1" "$2"
}

# 후보 버전이 현재 안정 계보보다 높은지 검증한다.
validate_candidate() {
	node "$VERSION_HELPER" validate-candidate "$1" "$USED_VERSION_FLOOR"
}

# 실행 환경과 인증을 원격 변경 전에 확인한다.
if ! gh auth status >/dev/null 2>&1; then
	fail_release 'GitHub CLI 인증을 확인하지 못해 중단했습니다. `gh auth login` 후 다시 실행하세요.'
fi

# 릴리스는 main 브랜치에서만 허용한다.
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null) ||
	fail_release '현재 Git 브랜치를 확인하지 못해 중단했습니다.'
if [ "$CURRENT_BRANCH" != 'main' ]; then
	fail_release "main 브랜치에서만 실행할 수 있습니다(현재: ${CURRENT_BRANCH:-detached HEAD})."
fi

# 사용자 변경을 릴리스 준비 커밋에 섞지 않는다.
WORKTREE_STATUS=$(git status --porcelain --untracked-files=all 2>/dev/null) ||
	fail_release '작업 트리 상태를 확인하지 못해 중단했습니다.'
if [ -n "$WORKTREE_STATUS" ]; then
	fail_release '작업 트리가 깨끗하지 않아 중단했습니다. 변경사항을 먼저 커밋하거나 정리하세요.'
fi

# origin과 GitHub CLI가 같은 저장소를 가리키는지 확인할 수 있도록 origin 접근을 점검한다.
REMOTE_URL=$(git remote get-url "$REMOTE_NAME" 2>/dev/null) ||
	fail_release "${REMOTE_NAME} 원격을 찾지 못해 중단했습니다."
if [ -z "$REMOTE_URL" ]; then
	fail_release "${REMOTE_NAME} 원격 URL이 비어 있어 중단했습니다."
fi
if ! git ls-remote --exit-code "$REMOTE_NAME" refs/heads/main >/dev/null 2>&1; then
	fail_release "${REMOTE_NAME}/main에 접근하지 못해 중단했습니다. 원격 연결과 권한을 확인하세요."
fi

# 원격 main을 새로 읽고 v* 태그를 갱신한다. 태그 fetch에는 --prune을 쓰지 않아
# 사용자가 만든 로컬 태그를 fetch 과정에서 지우지 않는다.
if ! git fetch --prune "$REMOTE_NAME" main >/dev/null 2>&1; then
	fail_release '원격 main을 새로 조회하지 못해 중단했습니다. 파일과 커밋은 변경하지 않았습니다.'
fi
if ! git fetch "$REMOTE_NAME" 'refs/tags/v*:refs/tags/v*' >/dev/null 2>&1; then
	fail_release '원격 릴리스 태그를 새로 조회하지 못해 중단했습니다. 파일과 커밋은 변경하지 않았습니다.'
fi

# fetch 뒤 로컬 main과 origin/main의 관계를 판정한다.
LOCAL_HEAD=$(git rev-parse --verify HEAD 2>/dev/null) ||
	fail_release '현재 HEAD를 확인하지 못해 중단했습니다.'
REMOTE_MAIN=$(git rev-parse --verify "refs/remotes/${REMOTE_NAME}/main" 2>/dev/null) ||
	fail_release "${REMOTE_NAME}/main 참조를 확인하지 못해 중단했습니다."
if [ "$LOCAL_HEAD" = "$REMOTE_MAIN" ]; then
	SYNC_STATE='equal'
elif git merge-base --is-ancestor "$LOCAL_HEAD" "$REMOTE_MAIN"; then
	SYNC_STATE='behind'
elif git merge-base --is-ancestor "$REMOTE_MAIN" "$LOCAL_HEAD"; then
	SYNC_STATE='ahead'
else
	SYNC_STATE='diverged'
fi
case "$SYNC_STATE" in
	behind)
		fail_release '로컬 main이 origin/main보다 뒤처져 있어 중단했습니다. 자동 pull·merge·rebase는 수행하지 않습니다.'
		;;
	diverged)
		fail_release '로컬 main과 origin/main이 갈라져 있어 중단했습니다. 자동 병합·rebase는 수행하지 않습니다.'
		;;
esac

# GitHub의 공개 안정 Release와 원격에서 읽은 안정 태그를 버전 판단에 사용한다.
if ! RELEASE_LIST_JSON=$(gh release list --limit 1000 --json tagName,isDraft,isPrerelease,publishedAt 2>/dev/null); then
	fail_release 'GitHub 공개 Release 목록을 읽지 못해 중단했습니다. 파일과 커밋은 변경하지 않았습니다.'
fi
if ! LATEST_RELEASE_INFO=$(printf '%s' "$RELEASE_LIST_JSON" | node "$VERSION_HELPER" latest-release); then
	fail_release 'GitHub Release 응답을 해석하지 못해 중단했습니다.'
fi
TAG_NAMES=$(git tag --list 'v*') ||
	fail_release '로컬·fetch된 릴리스 태그를 읽지 못해 중단했습니다.'
if ! TAG_VERSION_MAX=$(printf '%s\n' "$TAG_NAMES" | node "$VERSION_HELPER" max-tags); then
	fail_release '릴리스 태그 버전을 해석하지 못해 중단했습니다.'
fi

# 어떤 안정 태그라도 Release가 없거나 공개 안정 상태가 아니면 새 버전으로 건너뛰지 않는다.
for TAG_NAME in $TAG_NAMES
do
	TAG_VERSION=${TAG_NAME#v}
	TAG_RELEASE_STATUS=$(release_status "$TAG_VERSION") ||
		fail_release "v${TAG_VERSION} 태그의 GitHub Release 상태를 확인하지 못해 중단했습니다."
	case "$TAG_RELEASE_STATUS" in
		public-stable*)
			;;
		missing|not-public)
			fail_release "v${TAG_VERSION} 태그가 공개 안정 Release 없이 남아 있어 기존 릴리스 복구 대상으로 중단했습니다. 태그를 덮어쓰지 않았습니다."
			;;
		*)
			fail_release "v${TAG_VERSION} Release 상태를 해석하지 못해 중단했습니다."
			;;
	esac
done

# 권위 있는 데스크톱 manifest에서 현재 앱 버전을 읽고 안정 버전인지 확인한다.
if ! APP_VERSION=$(node "$VERSION_HELPER" read-manifest "$MANIFEST_PATH" 2>/dev/null); then
	fail_release "${MANIFEST_PATH}의 version을 읽지 못해 중단했습니다."
fi
if ! APP_VERSION_VALIDATION=$(node "$VERSION_HELPER" validate "$APP_VERSION" 2>&1); then
	fail_release "현재 앱 버전이 유효하지 않아 중단했습니다: $APP_VERSION_VALIDATION"
fi

# 최신 공개 안정 Release와 안정 태그 중 더 높은 버전을 기존 계보의 하한으로 삼는다.
case "$LATEST_RELEASE_INFO" in
	none)
		LATEST_PUBLIC_VERSION='none'
		LATEST_PUBLIC_TAG='없음'
		;;
	*)
		IFS="$(printf '\t')" read -r LATEST_PUBLIC_VERSION LATEST_PUBLIC_TAG LATEST_PUBLIC_URL <<EOF
$LATEST_RELEASE_INFO
EOF
		;;
esac
if ! USED_VERSION_FLOOR=$(node "$VERSION_HELPER" max "$LATEST_PUBLIC_VERSION" "$TAG_VERSION_MAX"); then
	fail_release '기존 안정 버전의 하한을 계산하지 못해 중단했습니다.'
fi

# 현재 버전의 Release·태그 상태를 확인해 태그만 남은 복구 대상을 덮어쓰지 않는다.
CURRENT_RELEASE_STATUS=$(release_status "$APP_VERSION") ||
	fail_release '현재 버전의 GitHub Release 상태를 확인하지 못해 중단했습니다.'
CURRENT_HAS_TAG=0
if git show-ref --verify --quiet "refs/tags/v${APP_VERSION}"; then
	CURRENT_HAS_TAG=1
fi
case "$CURRENT_RELEASE_STATUS" in
	public-stable*)
		;;
	not-public)
		fail_release "v${APP_VERSION} 태그에 공개 안정 Release가 없어 기존 릴리스 복구 대상으로 중단했습니다. 원격 태그를 삭제하거나 덮어쓰지 않았습니다."
		;;
	missing)
		if [ "$CURRENT_HAS_TAG" -eq 1 ]; then
			fail_release "v${APP_VERSION} 태그가 있지만 공개 안정 Release가 없어 기존 릴리스 복구 대상으로 중단했습니다. 태그를 덮어쓰지 않았습니다."
		fi
		;;
	*)
		fail_release "v${APP_VERSION} Release 상태를 해석하지 못해 중단했습니다."
		;;
esac

# 현재 버전과 최신 공개 안정 Release를 먼저 보여준다.
printf '%s\n' '[publish-release] 릴리스 후보 준비를 시작합니다.'
printf '%s\n' "현재 앱 버전: $APP_VERSION"
if [ "$LATEST_PUBLIC_VERSION" = 'none' ]; then
	printf '%s\n' '최신 공개 안정 릴리스: 없음'
else
	printf '%s\n' "최신 공개 안정 릴리스: ${LATEST_PUBLIC_TAG} (${LATEST_PUBLIC_VERSION})"
fi
printf '%s\n' "기존 안정 버전 하한: $USED_VERSION_FLOOR"

# 이미 커밋된 미게시 버전이면 새 버전 선택과 중복 커밋을 생략한다.
PREPARED_VERSION=0
if [ "$CURRENT_RELEASE_STATUS" = 'missing' ] && [ "$CURRENT_HAS_TAG" -eq 0 ]; then
	if [ "$USED_VERSION_FLOOR" = 'none' ]; then
		CURRENT_IS_NEWER=1
	else
		CURRENT_IS_NEWER=$(compare_versions "$APP_VERSION" "$USED_VERSION_FLOOR")
	fi
	if [ "$CURRENT_IS_NEWER" -gt 0 ]; then
		PREPARED_VERSION=1
		CANDIDATE_VERSION="$APP_VERSION"
		printf '%s\n' "이미 준비된 미게시 버전 v${CANDIDATE_VERSION}을 재사용합니다."
	fi
fi

# 새 버전 후보를 대화형으로 선택하고 모든 후보를 안정 SemVer와 계보 하한으로 검증한다.
if [ "$PREPARED_VERSION" -eq 0 ]; then
	if ! VERSION_BASE=$(node "$VERSION_HELPER" max "$APP_VERSION" "$USED_VERSION_FLOOR"); then
		fail_release '새 버전 계산의 기준을 정하지 못해 중단했습니다.'
	fi
	PATCH_VERSION=$(node "$VERSION_HELPER" bump "$VERSION_BASE" patch)
	MINOR_VERSION=$(node "$VERSION_HELPER" bump "$VERSION_BASE" minor)
	MAJOR_VERSION=$(node "$VERSION_HELPER" bump "$VERSION_BASE" major)
	while :
	do
		printf '%s\n' "선택지: patch=${PATCH_VERSION} (기본), minor=${MINOR_VERSION}, major=${MAJOR_VERSION}, direct=직접 입력"
		printf '%s' '버전 증가를 선택하세요 [patch]: '
		if ! IFS= read -r VERSION_SELECTION; then
			fail_release '버전 선택 입력을 읽지 못해 중단했습니다. 원격 변경은 없습니다.'
		fi
		case "$VERSION_SELECTION" in
			''|patch|1)
				CANDIDATE_VERSION="$PATCH_VERSION"
				;;
			minor|2)
				CANDIDATE_VERSION="$MINOR_VERSION"
				;;
			major|3)
				CANDIDATE_VERSION="$MAJOR_VERSION"
				;;
			direct|4|직접)
				printf '%s' '직접 입력할 안정 버전: '
				if ! IFS= read -r CANDIDATE_VERSION; then
					fail_release '직접 입력을 읽지 못해 중단했습니다. 원격 변경은 없습니다.'
				fi
				;;
			*)
				# 숫자 버전은 별도 선택 없이 직접 입력한 것으로도 받아 반복 입력 비용을 줄인다.
				CANDIDATE_VERSION="$VERSION_SELECTION"
				;;
		esac

		if git show-ref --verify --quiet "refs/tags/v${CANDIDATE_VERSION}"; then
			fail_release "v${CANDIDATE_VERSION} 태그가 이미 있어 새 태그를 만들지 않고 중단했습니다. 기존 태그와 Release를 확인하세요."
		fi
		if ! CANDIDATE_VALIDATION=$(validate_candidate "$CANDIDATE_VERSION" 2>&1); then
			printf '%s\n' "[publish-release] 후보 버전을 거부했습니다: $CANDIDATE_VALIDATION" >&2
			continue
		fi
		CANDIDATE_RELEASE_STATUS=$(release_status "$CANDIDATE_VERSION") ||
			fail_release '선택한 버전의 GitHub Release 상태를 확인하지 못해 중단했습니다.'
		case "$CANDIDATE_RELEASE_STATUS" in
			missing)
				break
				;;
			not-public)
				fail_release "v${CANDIDATE_VERSION} Release가 공개 안정 상태가 아니어서 기존 릴리스 복구 대상으로 중단했습니다. 덮어쓰지 않았습니다."
				;;
			public-stable*)
				fail_release "v${CANDIDATE_VERSION}가 이미 공개 안정 Release에 사용되어 중단했습니다."
				;;
			*)
				fail_release '선택한 버전의 Release 상태를 해석하지 못해 중단했습니다.'
				;;
		esac
	done
else
	# 이미 준비된 버전도 동일한 후보 검증을 거쳐 잘못된 상태를 방지한다.
	if ! CANDIDATE_VALIDATION=$(validate_candidate "$CANDIDATE_VERSION" 2>&1); then
		fail_release "이미 준비된 버전이 현재 안정 계보보다 높지 않아 중단했습니다: $CANDIDATE_VALIDATION"
	fi
fi

# 새 후보만 권위 있는 manifest에 쓰고 해당 파일만 stage하여 준비 커밋을 만든다.
if [ "$CANDIDATE_VERSION" != "$APP_VERSION" ]; then
	if ! node "$VERSION_HELPER" write-manifest "$MANIFEST_PATH" "$CANDIDATE_VERSION"; then
		fail_release "${MANIFEST_PATH}에 버전을 쓰지 못했습니다. 현재 파일 상태를 확인하세요."
	fi
	if ! git add -- "$MANIFEST_PATH"; then
		fail_release '릴리스 manifest만 stage하지 못해 중단했습니다.'
	fi
	STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACDMRTUXB --) ||
		fail_release 'stage된 파일 목록을 확인하지 못해 중단했습니다.'
	if [ "$STAGED_FILES" != "$MANIFEST_PATH" ]; then
		fail_release "릴리스 manifest 외 파일이 stage되어 커밋하지 않았습니다: ${STAGED_FILES:-없음}"
	fi
	if ! git commit --only -m "릴리스: v${CANDIDATE_VERSION} 준비" -- "$MANIFEST_PATH"; then
		fail_release '릴리스 준비 커밋에 실패했습니다. stage된 manifest와 변경사항을 보존했습니다.'
	fi
fi

# 태그는 다음 게시 단계에서 만들 수 있도록 같은 대상 커밋 SHA를 고정한다.
RELEASE_SHA=$(git rev-parse --verify HEAD 2>/dev/null) ||
	fail_release '릴리스 대상 전체 커밋 SHA를 확인하지 못해 중단했습니다.'
INCLUDED_COMMITS=$(git log --format='%H %s' --reverse "refs/remotes/${REMOTE_NAME}/main..${RELEASE_SHA}" 2>/dev/null || true)
if [ -z "$INCLUDED_COMMITS" ]; then
	INCLUDED_COMMITS='없음'
fi
if [ "$RELEASE_SHA" = "$REMOTE_MAIN" ]; then
	MAIN_PUSH_SUMMARY='생략 (이미 origin/main과 같은 커밋)'
	MAIN_PUSH_REQUIRED=0
else
	MAIN_PUSH_SUMMARY='필요'
	MAIN_PUSH_REQUIRED=1
fi

# 첫 원격 변경 전에 대상과 포함 범위를 요약하고 명시적 승인을 받는다.
printf '%s\n' ''
printf '%s\n' '[publish-release] 원격 변경 전 최종 확인'
printf '%s\n' "버전: ${CANDIDATE_VERSION}"
printf '%s\n' "대상 전체 커밋 SHA: ${RELEASE_SHA}"
printf '%s\n' "원격: ${REMOTE_NAME}"
printf '%s\n' '포함할 로컬 커밋:'
printf '%s\n' "$INCLUDED_COMMITS"
printf '%s\n' "main push: ${MAIN_PUSH_SUMMARY}"
printf '%s\n' "후속 태그: v${CANDIDATE_VERSION} (정확한 CI 성공 뒤 생성)"
printf '%s' '이 내용으로 진행할까요? [y/N] '
if ! IFS= read -r APPROVAL; then
	fail_release '최종 확인 입력을 읽지 못해 원격 변경 없이 중단했습니다.'
fi
case "$APPROVAL" in
	y|Y|yes|YES|예)
		;;
	*)
		printf '%s\n' '[publish-release] 사용자가 취소했습니다. 원격 변경은 없습니다.'
		exit 0
		;;
esac

# 일반 git push를 사용해 기존 pre-push 훅을 그대로 실행한다.
if [ "$MAIN_PUSH_REQUIRED" -eq 1 ]; then
	printf '%s\n' "[publish-release] origin/main에 ${RELEASE_SHA}를 push합니다. 기존 pre-push 검증이 실행됩니다."
	if ! git push "$REMOTE_NAME" main; then
		fail_release "main push에 실패했습니다. 로컬 준비 커밋 ${RELEASE_SHA}는 보존했고 태그는 만들지 않았습니다. 원인을 해결한 뒤 같은 명령을 다시 실행하세요."
	fi
else
	printf '%s\n' '[publish-release] 대상 커밋이 이미 origin/main에 있어 main push를 생략합니다.'
fi

# push 이벤트가 GitHub에 나타날 때까지 제한된 횟수로 정확한 SHA의 CI 실행을 찾는다.
CI_RUN_INFO='none'
CI_ATTEMPT=1
while [ "$CI_ATTEMPT" -le "$CI_LOOKUP_ATTEMPTS" ]
do
	if ! CI_RUN_LIST_JSON=$(gh run list --workflow ci.yml --branch main --event push --commit "$RELEASE_SHA" --limit 20 --json databaseId,headSha,status,conclusion,event,url 2>/dev/null); then
		fail_release "정확한 커밋 ${RELEASE_SHA}의 CI 실행을 검색하지 못했습니다. main push는 보존했고 태그는 만들지 않았습니다."
	fi
	if ! CI_RUN_INFO=$(printf '%s' "$CI_RUN_LIST_JSON" | node "$VERSION_HELPER" select-ci "$RELEASE_SHA"); then
		fail_release "GitHub Actions 실행 응답을 해석하지 못했습니다. main push는 보존했고 태그는 만들지 않았습니다."
	fi
	if [ "$CI_RUN_INFO" != 'none' ]; then
		break
	fi
	if [ "$CI_ATTEMPT" -lt "$CI_LOOKUP_ATTEMPTS" ]; then
		printf '%s\n' "[publish-release] CI 실행이 아직 보이지 않습니다(${CI_ATTEMPT}/${CI_LOOKUP_ATTEMPTS}). 잠시 후 다시 검색합니다."
		sleep "$CI_LOOKUP_DELAY_SECONDS"
	fi
	CI_ATTEMPT=$((CI_ATTEMPT + 1))
done
if [ "$CI_RUN_INFO" = 'none' ]; then
	fail_release "정확한 커밋 ${RELEASE_SHA}의 push CI를 제한된 재시도 안에 찾지 못했습니다. main push는 보존했고 태그는 만들지 않았습니다. 같은 명령으로 다시 검색하거나 GitHub Actions에서 실행을 확인하세요."
fi

# 탭으로 분리한 실행 정보를 읽고, 완료 실패는 태그 단계로 진행하지 않는다.
IFS="$(printf '\t')" read -r CI_RUN_ID CI_STATUS CI_CONCLUSION CI_RUN_URL CI_HEAD_SHA CI_EVENT <<EOF
$CI_RUN_INFO
EOF
if [ "$CI_HEAD_SHA" != "$RELEASE_SHA" ] || [ "$CI_EVENT" != 'push' ]; then
	fail_release "정확한 커밋 ${RELEASE_SHA}의 push CI가 아니어서 중단했습니다. 태그는 만들지 않았습니다."
fi
if [ "$CI_CONCLUSION" = 'success' ]; then
	CI_SUCCESS=1
elif [ "$CI_STATUS" = 'completed' ]; then
	fail_release "정확한 커밋 ${RELEASE_SHA}의 CI가 ${CI_CONCLUSION:-알 수 없는 결과}로 끝났습니다. main push는 보존했고 태그는 만들지 않았습니다. 실행을 재실행한 뒤 다시 확인하세요: ${CI_RUN_URL:-URL 없음}"
else
	printf '%s\n' "[publish-release] 정확한 CI 실행(${CI_RUN_ID})을 기다립니다: ${CI_RUN_URL:-URL 없음}"
	if ! gh run watch "$CI_RUN_ID" --exit-status; then
		fail_release "정확한 커밋 ${RELEASE_SHA}의 CI가 성공하지 못했습니다. main push는 보존했고 태그는 만들지 않았습니다. 실행을 재실행한 뒤 같은 명령으로 확인하세요: ${CI_RUN_URL:-URL 없음}"
	fi
	CI_SUCCESS=1
fi

# 이번 티켓의 경계는 CI 승인까지이며 태그는 생성하지 않는다.
if [ "$CI_SUCCESS" -eq 1 ]; then
	printf '%s\n' ''
	printf '%s\n' '[publish-release] 릴리스 후보 준비와 정확한 커밋의 CI 승인이 완료되었습니다.'
	printf '%s\n' "버전: ${CANDIDATE_VERSION}"
	printf '%s\n' "커밋: ${RELEASE_SHA}"
	if [ -n "$CI_RUN_URL" ]; then
		printf '%s\n' "CI: 성공 (${CI_RUN_URL})"
	else
		printf '%s\n' 'CI: 성공'
	fi
	printf '%s\n' "후속 태그: v${CANDIDATE_VERSION} (아직 생성하지 않음)"
fi
