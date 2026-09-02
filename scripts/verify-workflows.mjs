import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 이 검사기의 저장소 루트. */
const REPOSITORY_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
/** 전체 제품 검증을 호출해야 하는 워크플로 파일. */
const WORKFLOW_FILES = ["ci.yml", "release.yml"];
/** CI와 릴리스가 공유해야 하는 전체 자동 검증 명령. */
const PRODUCT_VERIFY_COMMAND = "pnpm verify:product";
/** 두 워크플로가 공유해야 하는 운영체제 매트릭스. */
const PLATFORM_MATRIX = "os: [macos-latest, windows-latest]";

/** 워크플로 파일을 읽고 기본 텍스트 형식 계약을 확인한다. */
function readWorkflow(fileName) {
	/** 읽을 워크플로의 저장소 기준 경로. */
	const workflowPath = path.join(
		REPOSITORY_ROOT,
		".github",
		"workflows",
		fileName,
	);
	/** 검증할 워크플로 원문. */
	const source = readFileSync(workflowPath, "utf8");

	assert(!source.includes("\t"), `${fileName}에 YAML 들여쓰기 탭이 있습니다.`);
	assert(source.endsWith("\n"), `${fileName}은 줄바꿈으로 끝나야 합니다.`);
	assert(source.includes("name:"), `${fileName}에 워크플로 이름이 없습니다.`);
	assert(source.includes("jobs:"), `${fileName}에 jobs가 없습니다.`);
	return source;
}

/** 워크플로 원문에서 필수 계약 문구를 찾는다. */
function requireText(source, fileName, text) {
	assert(source.includes(text), `${fileName}에 필수 계약이 없습니다: ${text}`);
}

/** 두 운영체제 잡을 계속 독립 실행하는 공통 계약을 확인한다. */
function assertPlatformMatrix(source, fileName) {
	requireText(source, fileName, PLATFORM_MATRIX);
	/** 운영체제 실패 격리를 보장하는 fail-fast 선언 횟수. */
	const failFastDeclarations = source.match(/^\s+fail-fast: false\s*$/gm) ?? [];
	assert.equal(
		failFastDeclarations.length,
		1,
		`${fileName}에는 fail-fast: false가 정확히 한 번 있어야 합니다.`,
	);
}

/** 제품 검증 명령이 기존 후속 단계보다 먼저 실행되는지 확인한다. */
function assertProductVerificationBefore(source, fileName, nextStepText) {
	/** 전체 제품 검증 명령이 나타나는 위치. */
	const verificationIndex = source.indexOf(PRODUCT_VERIFY_COMMAND);
	/** 뒤따라야 할 후속 단계의 위치. */
	const nextStepIndex = source.indexOf(nextStepText);

	assert(
		verificationIndex >= 0,
		`${fileName}이 ${PRODUCT_VERIFY_COMMAND}를 호출하지 않습니다.`,
	);
	assert(
		nextStepIndex > verificationIndex,
		`${fileName}의 ${PRODUCT_VERIFY_COMMAND}가 ${nextStepText}보다 뒤에 있습니다.`,
	);
}

/** CI와 릴리스의 검증 호출이 단순한 기본 검증으로 되돌아가지 않았는지 확인한다. */
function assertProductVerificationCall(source, fileName) {
	/** 전체 제품 검증을 실행하는 run 단계 목록. */
	const productVerificationRuns =
		source.match(/^\s+(?:-\s+)?run:\s+pnpm verify:product\s*$/gm) ?? [];
	/** 기본 검증만 실행하는 run 단계 목록. */
	const defaultVerificationRuns =
		source.match(/^\s+(?:-\s+)?run:\s+pnpm verify\s*$/gm) ?? [];

	assert.equal(
		productVerificationRuns.length,
		1,
		`${fileName}은 ${PRODUCT_VERIFY_COMMAND}를 정확히 한 번 실행해야 합니다.`,
	);
	assert.equal(
		defaultVerificationRuns.length,
		0,
		`${fileName}에 기본 검증만 실행하는 단계가 남아 있습니다.`,
	);
}

/** CI 워크플로의 제품 검증 뒤 전체 빌드 계약을 확인한다. */
function assertCiWorkflow(source, fileName) {
	assertProductVerificationBefore(source, fileName, "run: pnpm build");
}

/** 릴리스 빌드의 검증·앱 빌드·패키징 순서와 단일 게시 구조를 확인한다. */
function assertReleaseWorkflow(source, fileName) {
	assertProductVerificationBefore(source, fileName, "name: 앱 빌드");
	assertProductVerificationBefore(source, fileName, "name: 패키징");
	requireText(source, fileName, "needs: build");
	requireText(source, fileName, "- uses: softprops/action-gh-release@v3");
}

/** 검사할 워크플로와 원문을 함께 보관한다. */
const workflowSources = WORKFLOW_FILES.map((fileName) => [
	fileName,
	readWorkflow(fileName),
]);

/** 워크플로 한 건의 공통 계약과 파일별 후속 단계 계약을 확인한다. */
function assertWorkflowSource(workflowSource) {
	/** 현재 검사할 워크플로 이름과 원문. */
	const [fileName, source] = workflowSource;
	// 공통 계약을 먼저 확인하고 파일별 후속 단계 계약을 확인한다.
	assertPlatformMatrix(source, fileName);
	assertProductVerificationCall(source, fileName);
	if (fileName === "ci.yml") {
		assertCiWorkflow(source, fileName);
	} else {
		assertReleaseWorkflow(source, fileName);
	}
}

workflowSources.forEach(assertWorkflowSource);

/** 모든 워크플로에서 추출한 제품 검증 명령. */
const productVerificationCommands = workflowSources.map(
	([fileName, source]) => {
		/** 명령을 실행하는 run 단계. */
		const runLine = source.match(
			/^\s+(?:-\s+)?run:\s+(pnpm verify:[^\s]+)\s*$/m,
		)?.[1];
		assert(runLine, `${fileName}에서 제품 검증 명령을 찾지 못했습니다.`);
		return runLine;
	},
);

assert(
	productVerificationCommands.every(
		(command) => command === PRODUCT_VERIFY_COMMAND,
	),
	"CI와 릴리스가 서로 다른 제품 검증 명령을 사용합니다.",
);
console.log("워크플로 계약 검사 통과: ci.yml, release.yml");
