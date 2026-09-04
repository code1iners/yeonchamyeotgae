import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** 외부 명령 실패도 예외 대신 테스트 가능한 결과로 다루기 위한 Promise 래퍼. */
const execFileAsync = promisify(execFile);
/** fixture 저장소에서도 실제 작업 트리의 릴리스 명령을 실행하기 위한 절대 경로. */
const SCRIPT_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"publish-release.sh",
);
/** PATH를 격리해도 현재 Node 런타임은 사용할 수 있도록 보존하는 디렉터리. */
const NODE_BIN_DIRECTORY = path.dirname(process.execPath);
/** 모든 버전 증가·중복 검증의 공통 출발점. */
const BASELINE_VERSION = "0.1.3";
/** 새 후보를 선택하게 만드는 이미 게시된 안정 Release. */
const BASELINE_RELEASE = {
	isDraft: false,
	isPrerelease: false,
	publishedAt: "2026-09-01T00:00:00Z",
	tagName: `v${BASELINE_VERSION}`,
	url: `https://github.com/example/yeonchamyeotgae/releases/tag/v${BASELINE_VERSION}`,
};

/** 테스트 저장소에서 Git 명령을 실행한다. */
async function runGit(repositoryPath, args) {
	/** 테스트 저장소에서 실행한 Git 명령 결과. */
	const result = await execFileAsync("git", args, {
		cwd: repositoryPath,
		encoding: "utf8",
	});
	return result.stdout.trim();
}

/** 종료 코드와 표준 출력·오류를 모두 관찰할 수 있게 명령을 실행한다. */
function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		/** 실행할 외부 명령 프로세스. */
		const child = execFile(
			command,
			args,
			{
				cwd: options.cwd,
				env: options.env,
				encoding: "utf8",
				maxBuffer: 1024 * 1024,
			},
			(error, stdout, stderr) => {
				if (error && typeof error.code !== "number") {
					reject(error);
					return;
				}
				resolve({
					code: typeof error?.code === "number" ? error.code : 0,
					output: `${stdout}${stderr}`,
				});
			},
		);
		if (options.input !== undefined) {
			child.stdin.end(options.input);
		}
	});
}

/** Tcl 문자열 안에서 테스트 경로와 입력을 안전하게 감싼다. */
function tclQuote(value) {
	/** 닫는 중괄호를 이스케이프한 Tcl 값. */
	const escaped = value.replaceAll("}", "\\}");
	return `{${escaped}}`;
}

/** 명령을 pseudo-terminal에서 실행해 대화형 터미널 계약도 함께 충족시킨다. */
async function runInteractive(
	fixture,
	input = "",
	environmentOverrides = {},
	scriptArguments = [],
) {
	/** 줄바꿈을 터미널 Enter 입력으로 바꾼 값. */
	const terminalInput = input.replaceAll("\n", "\r");
	/** 셸에서 실행할 게시 명령과 인자. */
	const spawnCommand = [
		"spawn -noecho sh",
		tclQuote(SCRIPT_PATH),
		...scriptArguments.map(tclQuote),
	].join(" ");
	/** 자식 셸을 실행할 expect 프로그램. */
	const expectProgram = [
		"set timeout 30",
		spawnCommand,
		`send -- ${tclQuote(terminalInput)}`,
		"expect eof",
		"set waitResult [wait]",
		"exit [lindex $waitResult 3]",
	].join("\n");
	return runCommand("expect", ["-c", expectProgram], {
		cwd: fixture.repositoryPath,
		env: { ...fixture.environment, ...environmentOverrides },
	});
}

/** fixture의 명령 로그를 읽고 없으면 빈 문자열을 반환한다. */
async function readCommandLog(fixture) {
	try {
		return await readFile(fixture.commandLogPath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			return "";
		}
		throw error;
	}
}

/** 테스트 fixture에서 현재 local HEAD와 원격 main SHA를 읽는다. */
async function readHeadState(fixture) {
	/** fixture local HEAD. */
	const local = await runGit(fixture.repositoryPath, ["rev-parse", "HEAD"]);
	/** bare remote가 가리키는 main. */
	const remote = await runGit(fixture.remotePath, [
		"rev-parse",
		"refs/heads/main",
	]);
	return { local, remote };
}

/** bare 원격에 게시된 태그가 가리키는 커밋을 읽고 없으면 빈 문자열을 반환한다. */
async function readRemoteTagCommit(fixture, tagName) {
	try {
		return await runGit(fixture.remotePath, [
			"rev-parse",
			`${tagName}^{commit}`,
		]);
	} catch (error) {
		if (error?.code === 128) {
			return "";
		}
		throw error;
	}
}

/** 가짜 GitHub CLI가 반환할 Actions JSON을 쓰는 파일 경로. */
async function writeRunMode(fixture, mode) {
	await writeFile(fixture.runModePath, `${mode}\n`, "utf8");
}

/** 다른 clone에서 원격 main만 앞당긴다. */
async function advanceRemote(fixture, fileName, message) {
	/** 원격을 앞당길 임시 clone. */
	const clonePath = await mkdtemp(
		path.join(os.tmpdir(), "yeoncha-release-remote-"),
	);
	try {
		await runGit(clonePath, ["clone", "--quiet", fixture.remotePath, "."]);
		await runGit(clonePath, ["config", "user.email", "test@example.com"]);
		await runGit(clonePath, ["config", "user.name", "Test User"]);
		await writeFile(path.join(clonePath, fileName), `${message}\n`, "utf8");
		await runGit(clonePath, ["add", fileName]);
		await runGit(clonePath, ["commit", "--quiet", "-m", message]);
		await runGit(clonePath, ["push", "--quiet", "origin", "main"]);
	} finally {
		await rm(clonePath, { force: true, recursive: true });
	}
}

/** 릴리스 명령을 시험할 최소 Git 저장소와 가짜 외부 명령을 만든다. */
async function createFixture(options = {}) {
	/** 테스트 저장소 경로. */
	const repositoryPath = await mkdtemp(
		path.join(os.tmpdir(), "yeoncha-publish-release-"),
	);
	/** 실제 push 대상인 bare 원격 저장소. */
	const remotePath = path.join(repositoryPath, "remote.git");
	/** fixture 실행 파일 디렉터리. */
	const binPath = path.join(repositoryPath, "bin");
	/** desktop manifest 경로. */
	const manifestPath = path.join(
		repositoryPath,
		"apps",
		"desktop",
		"package.json",
	);
	/** 외부 명령 순서를 기록할 파일. */
	const commandLogPath = path.join(repositoryPath, "command.log");
	/** 가짜 GitHub Release 목록 파일. */
	const releasesPath = path.join(repositoryPath, "releases.json");
	/** 가짜 Actions 실행 상태 파일. */
	const runModePath = path.join(repositoryPath, "run-mode");
	/** Actions 목록 조회 횟수 파일. */
	const runListCountPath = path.join(repositoryPath, "run-list-count");
	/** Release Actions 목록 조회 횟수 파일. */
	const releaseRunListCountPath = path.join(
		repositoryPath,
		"release-run-list-count",
	);
	/** 가짜 Release Actions 실행 상태 파일. */
	const releaseRunModePath = path.join(repositoryPath, "release-run-mode");
	/** 가짜 GitHub Release 상세 상태 파일. */
	const releaseViewModePath = path.join(repositoryPath, "release-view-mode");
	/** fixture에 넣을 현재 앱 버전. */
	const manifestVersion = options.manifestVersion ?? BASELINE_VERSION;
	/** fixture에 넣을 기존 공개 안정 Release 목록. */
	const releases = options.releases ?? [BASELINE_RELEASE];
	/** 가짜 외부 명령을 선택할 기본 Actions 모드. */
	const runMode = options.runMode ?? "success";
	/** 가짜 Release Actions 실행을 선택할 상태. */
	const releaseRunMode = options.releaseRunMode ?? "success";
	/** 가짜 GitHub Release 상세 응답을 선택할 상태. */
	const releaseViewMode = options.releaseViewMode ?? "success";

	await runGit(repositoryPath, ["init", "--quiet", "--initial-branch=main"]);
	await runGit(repositoryPath, ["config", "user.email", "test@example.com"]);
	await runGit(repositoryPath, ["config", "user.name", "Test User"]);
	await runGit(repositoryPath, ["init", "--bare", "--quiet", remotePath]);
	await runGit(repositoryPath, ["remote", "add", "origin", remotePath]);
	await mkdir(binPath, { recursive: true });
	/** JavaScript 보간 없이 가짜 셸 변수식을 조립하기 위한 접두사. */
	const dollar = "$";
	/** 운영체제 경계를 호스트 환경과 무관하게 재현하는 uname 대역. */
	const fakeUnameSource = [
		"#!/usr/bin/env sh",
		`printf '%s\\n' "${dollar}{FAKE_UNAME_SYSTEM:-Darwin}"`,
	].join("\n");
	await writeFile(path.join(binPath, "uname"), `${fakeUnameSource}\n`, "utf8");
	await chmod(path.join(binPath, "uname"), 0o755);
	await writeFile(
		path.join(repositoryPath, ".gitignore"),
		"bin/\n*.log\nrun-mode\nrun-list-count\nrelease-run-mode\nrelease-run-list-count\nrelease-view-mode\nreleases.json\nremote.git/\n",
		"utf8",
	);
	await writeFile(
		path.join(repositoryPath, "tracked.txt"),
		"initial\n",
		"utf8",
	);
	await mkdir(path.dirname(manifestPath), { recursive: true });
	await writeFile(
		manifestPath,
		`{\n\t"name": "@yeoncha/desktop",\n\t"version": "${manifestVersion}",\n\t"private": true\n}\n`,
		"utf8",
	);
	await runGit(repositoryPath, ["add", "."]);
	await runGit(repositoryPath, ["commit", "--quiet", "-m", "fixture"]);
	await runGit(repositoryPath, [
		"push",
		"--quiet",
		"--set-upstream",
		"origin",
		"main",
	]);

	if (options.baselineTag !== false) {
		await runGit(repositoryPath, [
			"tag",
			"-a",
			`v${BASELINE_VERSION}`,
			"-m",
			`v${BASELINE_VERSION}`,
		]);
		await runGit(repositoryPath, [
			"push",
			"--quiet",
			"origin",
			`v${BASELINE_VERSION}`,
		]);
	}
	if (options.localTag) {
		await runGit(repositoryPath, [
			"tag",
			"-a",
			options.localTag,
			"-m",
			options.localTag,
		]);
	}
	if (options.remoteTag) {
		await runGit(repositoryPath, [
			"tag",
			"-a",
			options.remoteTag,
			"-m",
			options.remoteTag,
		]);
		await runGit(repositoryPath, [
			"push",
			"--quiet",
			"origin",
			options.remoteTag,
		]);
	}

	await writeFile(releasesPath, `${JSON.stringify(releases)}\n`, "utf8");
	await writeFile(runModePath, `${runMode}\n`, "utf8");
	await writeFile(runListCountPath, "0\n", "utf8");
	await writeFile(releaseRunModePath, `${releaseRunMode}\n`, "utf8");
	await writeFile(releaseViewModePath, `${releaseViewMode}\n`, "utf8");
	await writeFile(releaseRunListCountPath, "0\n", "utf8");

	/** push 때 실행되는 fixture용 pre-push 훅. */
	const hookSource = [
		"#!/usr/bin/env sh",
		"tag_push=0",
		"while read -r local_ref local_sha remote_ref remote_sha; do",
		`  case "${dollar}{local_ref:-}" in refs/tags/*) tag_push=1 ;; esac`,
		"done",
		`printf '%s\\n' 'pre-push' >> "${dollar}PUBLISH_RELEASE_COMMAND_LOG"`,
		`if [ "${dollar}tag_push" -eq 1 ]; then exit "${dollar}{FAKE_TAG_PRE_PUSH_EXIT:-0}"; fi`,
		`exit "${dollar}{FAKE_PRE_PUSH_EXIT:-0}"`,
	].join("\n");
	await writeFile(
		path.join(repositoryPath, ".git", "hooks", "pre-push"),
		`${hookSource}\n`,
		"utf8",
	);
	await chmod(path.join(repositoryPath, ".git", "hooks", "pre-push"), 0o755);

	/** 가짜 GitHub CLI. CI·Release 실행과 Release 상세 응답을 외부 명령으로 기록한다. */
	const fakeGhSource = [
		"#!/usr/bin/env sh",
		`printf 'gh:%s\\n' "${dollar}*" >> "${dollar}PUBLISH_RELEASE_COMMAND_LOG"`,
		`if [ "${dollar}1 ${dollar}2" = 'auth status' ]; then exit "${dollar}{FAKE_GH_AUTH_EXIT:-0}"; fi`,
		`if [ "${dollar}1 ${dollar}2" = 'release list' ]; then cat "${dollar}FAKE_RELEASES_PATH"; exit 0; fi`,
		`if [ "${dollar}1 ${dollar}2" = 'run list' ]; then`,
		`  workflow='ci'`,
		`  case "${dollar}*" in *release.yml*) workflow='release' ;; esac`,
		`  if [ "${dollar}workflow" = 'release' ]; then`,
		`    count=$(cat "${dollar}FAKE_RELEASE_RUN_LIST_COUNT_PATH")`,
		`    count=$((count + 1))`,
		`    printf '%s\\n' "${dollar}count" > "${dollar}FAKE_RELEASE_RUN_LIST_COUNT_PATH"`,
		`    mode=$(cat "${dollar}FAKE_RELEASE_RUN_MODE_PATH")`,
		`    head_sha=$(git rev-parse HEAD)`,
		`    tag_name=''`,
		`    previous=''`,
		`    for arg in "${dollar}@"; do`,
		`      if [ "${dollar}previous" = '--branch' ]; then tag_name="${dollar}arg"; fi`,
		`      previous="${dollar}arg"`,
		`    done`,
		`    case "${dollar}mode" in`,
		`      delayed) if [ "${dollar}count" -lt 2 ]; then printf '%s\\n' '[]'; exit 0; fi ;;`,
		`      no-run) printf '%s\\n' '[]'; exit 0 ;;`,
		`      pull-only) printf '[{"databaseId":302,"headSha":"%s","status":"completed","conclusion":"success","event":"pull_request","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/302"}]\\n' "${dollar}head_sha" "${dollar}tag_name"; exit 0 ;;`,
		`      wrong-sha) printf '[{"databaseId":303,"headSha":"0000000000000000000000000000000000000000","status":"completed","conclusion":"success","event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/303"}]\\n' "${dollar}tag_name"; exit 0 ;;`,
		`      wrong-tag) printf '[{"databaseId":304,"headSha":"%s","status":"completed","conclusion":"success","event":"push","headBranch":"v9.9.9","workflowName":"Release","url":"https://example.test/run/304"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`      failure) printf '[{"databaseId":305,"headSha":"%s","status":"completed","conclusion":"failure","event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/305"}]\\n' "${dollar}head_sha" "${dollar}tag_name"; exit 0 ;;`,
		`      cancelled) printf '[{"databaseId":306,"headSha":"%s","status":"completed","conclusion":"cancelled","event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/306"}]\\n' "${dollar}head_sha" "${dollar}tag_name"; exit 0 ;;`,
		`      skipped) printf '[{"databaseId":307,"headSha":"%s","status":"completed","conclusion":"skipped","event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/307"}]\\n' "${dollar}head_sha" "${dollar}tag_name"; exit 0 ;;`,
		`      in-progress) printf '[{"databaseId":308,"headSha":"%s","status":"in_progress","conclusion":null,"event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/308"}]\\n' "${dollar}head_sha" "${dollar}tag_name"; exit 0 ;;`,
		`      timeout) printf '[{"databaseId":309,"headSha":"%s","status":"in_progress","conclusion":null,"event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/309"}]\\n' "${dollar}head_sha" "${dollar}tag_name"; exit 0 ;;`,
		`    esac`,
		`    printf '[{"databaseId":301,"headSha":"%s","status":"completed","conclusion":"success","event":"push","headBranch":"%s","workflowName":"Release","url":"https://example.test/run/301"}]\\n' "${dollar}head_sha" "${dollar}tag_name"`,
		"    exit 0",
		"  fi",
		`  count=$(cat "${dollar}FAKE_RUN_LIST_COUNT_PATH")`,
		`  count=$((count + 1))`,
		`  printf '%s\\n' "${dollar}count" > "${dollar}FAKE_RUN_LIST_COUNT_PATH"`,
		`  mode=$(cat "${dollar}FAKE_RUN_MODE_PATH")`,
		`  head_sha=$(git rev-parse HEAD)`,
		`  if [ "${dollar}workflow" = 'ci' ] && [ "${dollar}{FAKE_REMOTE_TAG_ON_CI:-0}" -eq 1 ] && [ "${dollar}count" -eq 1 ]; then git --git-dir "${dollar}FAKE_REMOTE_PATH" update-ref "refs/tags/${dollar}FAKE_REMOTE_TAG_NAME" "${dollar}head_sha"; fi`,
		`  case "${dollar}mode" in`,
		`    delayed) if [ "${dollar}count" -lt 2 ]; then printf '%s\\n' '[]'; exit 0; fi ;;`,
		`    no-run) printf '%s\\n' '[]'; exit 0 ;;`,
		`    pull-only) printf '[{"databaseId":201,"headSha":"%s","status":"completed","conclusion":"success","event":"pull_request","url":"https://example.test/run/201"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`    wrong-sha) printf '%s\\n' '[{"databaseId":202,"headSha":"0000000000000000000000000000000000000000","status":"completed","conclusion":"success","event":"push","url":"https://example.test/run/202"}]'; exit 0 ;;`,
		`    failure) printf '[{"databaseId":103,"headSha":"%s","status":"completed","conclusion":"failure","event":"push","url":"https://example.test/run/103"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`    cancelled) printf '[{"databaseId":104,"headSha":"%s","status":"completed","conclusion":"cancelled","event":"push","url":"https://example.test/run/104"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`    skipped) printf '[{"databaseId":106,"headSha":"%s","status":"completed","conclusion":"skipped","event":"push","url":"https://example.test/run/106"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`    in-progress) printf '[{"databaseId":105,"headSha":"%s","status":"in_progress","conclusion":null,"event":"push","url":"https://example.test/run/105"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`    timeout) printf '[{"databaseId":107,"headSha":"%s","status":"in_progress","conclusion":null,"event":"push","url":"https://example.test/run/107"}]\\n' "${dollar}head_sha"; exit 0 ;;`,
		`  esac`,
		`  printf '[{"databaseId":101,"headSha":"%s","status":"completed","conclusion":"success","event":"push","url":"https://example.test/run/101"}]\\n' "${dollar}head_sha"`,
		"  exit 0",
		"fi",
		`if [ "${dollar}1 ${dollar}2" = 'run watch' ]; then`,
		`  case "${dollar}3" in 301|302|303|304|305|306|307|308|309) exit "${dollar}{FAKE_RELEASE_WATCH_EXIT:-0}" ;; esac`,
		`  exit "${dollar}{FAKE_GH_WATCH_EXIT:-0}"`,
		"fi",
		`if [ "${dollar}1 ${dollar}2" = 'release view' ]; then`,
		`  tag_name="${dollar}3"`,
		`  version="${dollar}{tag_name#v}"`,
		`  head_sha=$(git rev-parse --verify "${dollar}{tag_name}^{commit}" 2>/dev/null || git rev-parse HEAD)`,
		`  mode=$(cat "${dollar}FAKE_RELEASE_VIEW_MODE_PATH")`,
		`  release_tag="${dollar}tag_name"`,
		`  target_commitish='main'`,
		`  is_draft=false`,
		`  is_prerelease=false`,
		`  asset_name="yeonchamyeotgae-${dollar}version-arm64.dmg"`,
		`  case "${dollar}mode" in`,
		`    error) exit 1 ;;`,
		`    wrong-sha) target_commitish='0000000000000000000000000000000000000000' ;;`,
		`    short-sha) target_commitish='deadbeef' ;;`,
		`    missing-target) target_commitish='' ;;`,
		`    wrong-tag) release_tag='v9.9.9' ;;`,
		`    draft) is_draft=true ;;`,
		`    prerelease) is_prerelease=true ;;`,
		`    missing-dmg) asset_name='' ;;`,
		`  esac`,
		`  if [ -n "${dollar}asset_name" ]; then`,
		`    printf '{"tagName":"%s","isDraft":%s,"isPrerelease":%s,"targetCommitish":"%s","url":"https://example.test/releases/%s","assets":[{"name":"%s"}]}\\n' "${dollar}release_tag" "${dollar}is_draft" "${dollar}is_prerelease" "${dollar}target_commitish" "${dollar}tag_name" "${dollar}asset_name"`,
		"  else",
		`    printf '{"tagName":"%s","isDraft":%s,"isPrerelease":%s,"targetCommitish":"%s","url":"https://example.test/releases/%s","assets":[]}\\n' "${dollar}release_tag" "${dollar}is_draft" "${dollar}is_prerelease" "${dollar}target_commitish" "${dollar}tag_name"`,
		"  fi",
		"  exit 0",
		"fi",
		"exit 99",
	].join("\n");
	await writeFile(path.join(binPath, "gh"), `${fakeGhSource}\n`, "utf8");
	await chmod(path.join(binPath, "gh"), 0o755);

	/** require_command를 통과시키는 가짜 pnpm. */
	const fakePnpmSource = [
		"#!/usr/bin/env sh",
		`printf 'pnpm:%s\\n' "${dollar}*" >> "${dollar}PUBLISH_RELEASE_COMMAND_LOG"`,
		"exit 0",
	].join("\n");
	await writeFile(path.join(binPath, "pnpm"), `${fakePnpmSource}\n`, "utf8");
	await chmod(path.join(binPath, "pnpm"), 0o755);

	if (options.fetchExit !== undefined) {
		/** fetch 실패만 가로채고 나머지 Git 동작은 실제 Git에 위임한다. */
		const realGitPath = (
			await execFileAsync("sh", ["-c", "command -v git"], {
				encoding: "utf8",
			})
		).stdout.trim();
		const fakeGitSource = [
			"#!/usr/bin/env sh",
			`if [ "${dollar}1" = 'fetch' ]; then exit "${dollar}FAKE_GIT_FETCH_EXIT"; fi`,
			`exec "${dollar}FAKE_REAL_GIT" "${dollar}@"`,
		].join("\n");
		await writeFile(path.join(binPath, "git"), `${fakeGitSource}\n`, "utf8");
		await chmod(path.join(binPath, "git"), 0o755);
		options.realGitPath = realGitPath;
	}
	if (options.missingCommand) {
		await rm(path.join(binPath, options.missingCommand), { force: true });
	}
	/** 누락 도구의 시스템 경로까지 PATH에서 제외할 경로. */
	const blockedCommandPath = options.missingCommand
		? (
				await execFileAsync(
					"sh",
					["-c", `command -v ${options.missingCommand}`],
					{
						encoding: "utf8",
					},
				)
			).stdout.trim()
		: "";
	/** fixture 도구를 제외한 부모 환경 PATH. */
	const inheritedPath = (process.env.PATH ?? "")
		.split(path.delimiter)
		.filter((entry) => entry !== path.dirname(blockedCommandPath))
		.join(path.delimiter);

	/** 셸 명령과 fake CLI가 공유할 fixture 실행 환경. */
	const environment = {
		...process.env,
		FAKE_GH_AUTH_EXIT: String(options.ghAuthExit ?? 0),
		FAKE_GH_WATCH_EXIT: String(options.ghWatchExit ?? 0),
		FAKE_RELEASE_WATCH_EXIT: String(
			options.releaseWatchExit ?? options.ghWatchExit ?? 0,
		),
		FAKE_GIT_FETCH_EXIT: String(options.fetchExit ?? 1),
		FAKE_REAL_GIT: options.realGitPath ?? "",
		FAKE_RELEASES_PATH: releasesPath,
		FAKE_PRE_PUSH_EXIT: String(options.prePushExit ?? 0),
		FAKE_TAG_PRE_PUSH_EXIT: String(options.tagPrePushExit ?? 0),
		FAKE_UNAME_SYSTEM: String(options.operatingSystem ?? "Darwin"),
		FAKE_RELEASE_RUN_LIST_COUNT_PATH: releaseRunListCountPath,
		FAKE_RELEASE_RUN_MODE_PATH: releaseRunModePath,
		FAKE_RELEASE_VIEW_MODE_PATH: releaseViewModePath,
		FAKE_REMOTE_PATH: remotePath,
		FAKE_REMOTE_TAG_NAME: String(options.remoteTagAfterFetch ?? ""),
		FAKE_REMOTE_TAG_ON_CI: String(options.remoteTagAfterFetch ? 1 : 0),
		FAKE_RUN_LIST_COUNT_PATH: runListCountPath,
		FAKE_RUN_MODE_PATH: runModePath,
		PATH: [binPath, NODE_BIN_DIRECTORY, inheritedPath]
			.filter(Boolean)
			.join(path.delimiter),
		PUBLISH_RELEASE_CI_LOOKUP_ATTEMPTS: String(options.lookupAttempts ?? 3),
		PUBLISH_RELEASE_CI_LOOKUP_DELAY_SECONDS: String(options.lookupDelay ?? 0),
		PUBLISH_RELEASE_RELEASE_LOOKUP_ATTEMPTS: String(
			options.releaseLookupAttempts ?? options.lookupAttempts ?? 3,
		),
		PUBLISH_RELEASE_RELEASE_LOOKUP_DELAY_SECONDS: String(
			options.releaseLookupDelay ?? options.lookupDelay ?? 0,
		),
		PUBLISH_RELEASE_COMMAND_LOG: commandLogPath,
	};

	return {
		commandLogPath,
		environment,
		manifestPath,
		releasesPath,
		repositoryPath,
		remotePath,
		runModePath,
	};
}

/** fixture를 정리하면서 테스트 본문을 실행한다. */
async function withFixture(callback, options = {}) {
	/** 이번 테스트의 격리 저장소. */
	const fixture = await createFixture(options);
	try {
		return await callback(fixture);
	} finally {
		await rm(fixture.repositoryPath, { force: true, recursive: true });
	}
}

test("정상 기본 patch는 manifest 준비 커밋과 main push 뒤 정확한 CI 성공까지 확인한다", async () => {
	await withFixture(async (fixture) => {
		await runGit(fixture.repositoryPath, [
			"tag",
			"-a",
			"maintenance-note",
			"-m",
			"maintenance-note",
		]);
		/** Enter로 기본 patch와 최종 승인을 선택하는 터미널 입력. */
		const result = await runInteractive(fixture, "\ny\n");
		/** 명령이 실제로 수정한 현재 manifest. */
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
		/** 로컬·원격 main의 최종 상태. */
		const heads = await readHeadState(fixture);
		/** 가짜 pre-push와 GitHub CLI의 호출 순서. */
		const commandLog = await readCommandLog(fixture);

		assert.equal(result.code, 0);
		assert.equal(manifest.version, "0.1.4");
		assert.equal(heads.local, heads.remote);
		assert.match(result.output, /현재 앱 버전: 0\.1\.3/);
		assert.match(result.output, /최신 공개 안정 릴리스: v0\.1\.3/);
		assert.match(result.output, /원격: origin/);
		assert.match(result.output, /릴리스 게시와 검증이 완료되었습니다/);
		assert.match(result.output, /태그: v0\.1\.4/);
		assert.match(
			result.output,
			/Release URL: https:\/\/example\.test\/releases\/v0\.1\.4/,
		);
		assert.match(
			result.output,
			/확인한 DMG: yeonchamyeotgae-0\.1\.4-arm64\.dmg/,
		);
		assert.equal((commandLog.match(/^pre-push$/gm) ?? []).length, 2);
		assert.match(commandLog, /gh:run list --workflow ci\.yml/);
		assert.match(commandLog, /gh:run list --workflow release\.yml/);
		assert.match(commandLog, /gh:release view v0\.1\.4/);
		assert.ok(
			commandLog.indexOf("gh:run list --workflow ci.yml") <
				commandLog.indexOf(
					"pre-push\n",
					commandLog.indexOf("gh:run list --workflow ci.yml"),
				),
		);
		assert.ok(
			commandLog.indexOf(
				"pre-push\n",
				commandLog.indexOf("gh:run list --workflow ci.yml"),
			) < commandLog.indexOf("gh:run list --workflow release.yml"),
		);
		assert.ok(
			commandLog.indexOf("gh:run list --workflow release.yml") <
				commandLog.indexOf("gh:release view v0.1.4"),
		);
		assert.doesNotMatch(commandLog, /--no-verify|--tags|--force/);
		assert.equal(
			await runGit(fixture.repositoryPath, ["log", "-1", "--format=%s"]),
			"릴리스: v0.1.4 준비",
		);
		assert.equal(
			await runGit(fixture.repositoryPath, [
				"diff-tree",
				"--no-commit-id",
				"--name-only",
				"-r",
				"HEAD",
			]),
			"apps/desktop/package.json",
		);
		assert.equal(
			await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
			"v0.1.4",
		);
		assert.equal(
			await runGit(fixture.repositoryPath, ["cat-file", "-t", "v0.1.4"]),
			"tag",
		);
		assert.equal(
			await runGit(fixture.repositoryPath, ["rev-parse", "v0.1.4^{commit}"]),
			heads.local,
		);
		assert.equal(
			await runGit(fixture.repositoryPath, [
				"for-each-ref",
				"--format=%(contents:subject)",
				"refs/tags/v0.1.4",
			]),
			"v0.1.4",
		);
		assert.equal(await readRemoteTagCommit(fixture, "v0.1.4"), heads.local);
		assert.equal(await readRemoteTagCommit(fixture, "maintenance-note"), "");
	});
});

test("minor·major·직접 입력은 선택한 안정 버전을 커밋한다", async () => {
	const cases = [
		{ input: "minor\ny\n", version: "0.2.0" },
		{ input: "major\ny\n", version: "1.0.0" },
		{ input: "direct\n0.1.7\ny\n", version: "0.1.7" },
	];
	for (const currentCase of cases) {
		await withFixture(async (fixture) => {
			/** 선택 입력에 대한 명령 결과. */
			const result = await runInteractive(fixture, currentCase.input);
			/** 버전 선택 뒤 저장된 manifest. */
			const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
			assert.equal(result.code, 0);
			assert.equal(manifest.version, currentCase.version);
			assert.match(
				result.output,
				new RegExp(`버전: ${currentCase.version.replaceAll(".", "\\.")}`),
			);
			assert.equal(
				await runGit(fixture.repositoryPath, ["log", "-1", "--format=%s"]),
				`릴리스: v${currentCase.version} 준비`,
			);
		});
	}
});

test("이미 origin/main에 있는 미게시 manifest는 커밋과 main push를 중복하지 않는다", async () => {
	await withFixture(
		async (fixture) => {
			/** 이미 origin/main과 같은 준비 커밋의 SHA. */
			const before = await runGit(fixture.repositoryPath, [
				"rev-parse",
				"HEAD",
			]);
			/** 이미 준비된 버전에서 승인을 진행하는 입력. */
			const result = await runInteractive(fixture, "y\n");
			/** 중복 커밋·push가 있었는지 확인할 최종 상태. */
			const after = await readHeadState(fixture);
			/** 실행된 외부 명령 로그. */
			const commandLog = await readCommandLog(fixture);

			assert.equal(result.code, 0);
			assert.equal(before, after.local);
			assert.equal(after.local, after.remote);
			assert.match(
				result.output,
				/이미 준비된 미게시 버전 v0\.1\.4을 재사용합니다/,
			);
			assert.match(result.output, /main push: 생략/);
			assert.equal((commandLog.match(/^pre-push$/gm) ?? []).length, 1);
			assert.equal(
				await runGit(fixture.repositoryPath, ["log", "-1", "--format=%s"]),
				"fixture",
			);
		},
		{ manifestVersion: "0.1.4" },
	);
});

test("ahead 커밋은 최종 확인에 표시하고 승인 시 준비 커밋과 함께 push한다", async () => {
	await withFixture(async (fixture) => {
		await writeFile(
			path.join(fixture.repositoryPath, "ahead.txt"),
			"ahead\n",
			"utf8",
		);
		await runGit(fixture.repositoryPath, ["add", "ahead.txt"]);
		await runGit(fixture.repositoryPath, [
			"commit",
			"--quiet",
			"-m",
			"로컬 선행 커밋",
		]);
		/** 로컬 선행 커밋을 포함해 승인하는 입력. */
		const result = await runInteractive(fixture, "\ny\n");

		assert.equal(result.code, 0);
		assert.match(result.output, /로컬 선행 커밋/);
		assert.match(result.output, /릴리스: v0\.1\.4 준비/);
		assert.deepEqual(
			await readHeadState(fixture).then(
				({ local, remote }) => local === remote,
			),
			true,
		);
	});
});

test("최종 확인을 거부하면 로컬 준비 커밋은 남기고 원격은 바꾸지 않는다", async () => {
	await withFixture(async (fixture) => {
		/** 사용자가 원격 변경을 거부하는 입력. */
		const result = await runInteractive(fixture, "\nn\n");
		/** 거부 전후 원격 main을 비교할 현재 상태. */
		const heads = await readHeadState(fixture);

		assert.equal(result.code, 0);
		assert.match(result.output, /사용자가 취소했습니다/);
		assert.notEqual(heads.local, heads.remote);
		assert.equal(
			await runGit(fixture.repositoryPath, ["log", "-1", "--format=%s"]),
			"릴리스: v0.1.4 준비",
		);
		assert.equal(
			await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
			"",
		);
	});
});

test("잘못된 SemVer 후보는 manifest·커밋·원격 push 전에 거부한다", async () => {
	await withFixture(async (fixture) => {
		/** prerelease를 직접 입력하고 EOF로 안전하게 종료하는 입력. */
		const result = await runInteractive(fixture, "direct\n1.2.3-beta\n\u0004");
		/** 실패 후에도 기준 manifest를 유지하는 상태. */
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
		/** 실패 후 local·remote가 같은 기준 커밋인지 확인한다. */
		const heads = await readHeadState(fixture);

		assert.notEqual(result.code, 0);
		assert.match(result.output, /후보 버전을 거부했습니다/);
		assert.match(result.output, /prerelease·build metadata 불가/);
		assert.equal(manifest.version, BASELINE_VERSION);
		assert.equal(heads.local, heads.remote);
	});
});

test("build metadata와 현재 이하 버전 후보는 저장하지 않는다", async () => {
	await withFixture(async (fixture) => {
		/** 안정 릴리스에서 금지하는 build metadata 입력. */
		const result = await runInteractive(fixture, "direct\n1.2.3+build\n\u0004");
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));

		assert.notEqual(result.code, 0);
		assert.match(result.output, /후보 버전을 거부했습니다/);
		assert.equal(manifest.version, BASELINE_VERSION);
	});

	await withFixture(
		async (fixture) => {
			/** 기존 안정 릴리스와 같아 계보를 역행하는 입력. */
			const result = await runInteractive(fixture, "direct\n0.1.3\n\u0004");
			const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));

			assert.notEqual(result.code, 0);
			assert.match(
				result.output,
				/기존 안정 버전\(0\.1\.3\)보다 높은 버전이어야 합니다/,
			);
			assert.equal(manifest.version, BASELINE_VERSION);
		},
		{ baselineTag: false },
	);
});

test("이미 존재하는 후보 태그는 덮어쓰지 않고 중단한다", async () => {
	await withFixture(
		async (fixture) => {
			/** 이미 존재하는 태그 버전을 직접 선택하는 입력. */
			const result = await runInteractive(fixture, "direct\n0.1.4\ny\n", {
				FAKE_RUN_MODE: "success",
			});
			/** 태그 충돌 뒤 원격 main이 유지되는 상태. */
			const heads = await readHeadState(fixture);

			assert.notEqual(result.code, 0);
			assert.match(result.output, /v0\.1\.4 태그가 공개 안정 Release 없이/);
			assert.equal(heads.local, heads.remote);
			assert.equal(
				await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
				"v0.1.4",
			);
		},
		{ localTag: "v0.1.4" },
	);
});

test("태그만 있고 공개 안정 Release가 없는 현재 버전은 복구 대상으로 중단한다", async () => {
	await withFixture(
		async (fixture) => {
			/** 현재 manifest 버전의 미완료 태그 상태. */
			const result = await runInteractive(fixture);
			assert.notEqual(result.code, 0);
			assert.match(result.output, /기존 릴리스 복구 대상으로 중단했습니다/);
			assert.match(result.output, /v0\.1\.4 태그가 공개 안정 Release 없이/);
		},
		{ manifestVersion: "0.1.4", localTag: "v0.1.4" },
	);
});

test("main push 훅이 실패하면 준비 커밋을 보존하고 태그를 만들지 않는다", async () => {
	await withFixture(
		async (fixture) => {
			/** pre-push 훅 실패를 시뮬레이션하는 실행 결과. */
			const result = await runInteractive(fixture, "\ny\n");
			/** 훅 실패 뒤 local·remote main 상태. */
			const heads = await readHeadState(fixture);

			assert.notEqual(result.code, 0);
			assert.match(result.output, /main push에 실패했습니다/);
			assert.equal(heads.local !== heads.remote, true);
			assert.equal(
				await runGit(fixture.repositoryPath, ["log", "-1", "--format=%s"]),
				"릴리스: v0.1.4 준비",
			);
			assert.equal(
				await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
				"",
			);
		},
		{ prePushExit: 23 },
	);
});

test("CI 실패·취소는 정확한 SHA를 보존하되 태그 단계로 진행하지 않는다", async () => {
	for (const mode of ["failure", "cancelled"]) {
		await withFixture(async (fixture) => {
			await writeRunMode(fixture, mode);
			/** CI 실패 또는 취소를 받은 명령 결과. */
			const result = await runInteractive(fixture, "\ny\n");
			/** main push까지 반영된 최종 SHA. */
			const heads = await readHeadState(fixture);

			assert.notEqual(result.code, 0);
			assert.match(result.output, /CI가 (failure|cancelled)로 끝났습니다/);
			assert.equal(heads.local, heads.remote);
			assert.equal(
				await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
				"",
			);
		});
	}
});

test("CI 건너뜀과 watch 시간 초과는 태그 단계로 진행하지 않는다", async () => {
	await withFixture(async (fixture) => {
		await writeRunMode(fixture, "skipped");
		/** 건너뛴 정확한 push CI를 받은 결과. */
		const result = await runInteractive(fixture, "\ny\n");

		assert.notEqual(result.code, 0);
		assert.match(result.output, /CI가 skipped로 끝났습니다/);
		assert.equal(
			await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
			"",
		);
	});

	await withFixture(async (fixture) => {
		await writeRunMode(fixture, "timeout");
		/** watch가 시간 초과로 실패한 정확한 push CI 결과. */
		const result = await runInteractive(fixture, "\ny\n", {
			FAKE_GH_WATCH_EXIT: "124",
		});
		const commandLog = await readCommandLog(fixture);

		assert.notEqual(result.code, 0);
		assert.match(result.output, /CI가 성공하지 못했습니다/);
		assert.match(commandLog, /gh:run watch 107 --exit-status/);
		assert.equal(
			await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
			"",
		);
	});
});

test("CI 검색 지연은 제한된 재시도로 흡수하고 정확한 push 실행을 기다린다", async () => {
	await withFixture(async (fixture) => {
		await writeRunMode(fixture, "delayed");
		/** 첫 조회가 비어 있다가 성공하는 명령 결과. */
		const result = await runInteractive(fixture, "\ny\n");
		/** run list 조회 횟수. */
		const lookupCount = await readFile(
			path.join(fixture.repositoryPath, "run-list-count"),
			"utf8",
		);

		assert.equal(result.code, 0);
		assert.match(result.output, /아직 보이지 않습니다/);
		assert.match(result.output, /릴리스 게시와 검증이 완료되었습니다/);
		assert.equal(lookupCount.trim(), "2");
	});
});

test("정확한 SHA의 push CI를 제한 안에 찾지 못하면 실패한다", async () => {
	for (const mode of ["no-run", "pull-only", "wrong-sha"]) {
		await withFixture(
			async (fixture) => {
				await writeRunMode(fixture, mode);
				/** 정확한 CI가 없는 명령 결과. */
				const result = await runInteractive(fixture, "\ny\n");
				assert.notEqual(result.code, 0);
				assert.match(result.output, /정확한 커밋 .*의 push CI/);
				assert.equal(
					await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
					"",
				);
			},
			{ lookupAttempts: 2 },
		);
	}
});

test("진행 중인 정확한 CI는 run watch 성공까지 기다린다", async () => {
	await withFixture(async (fixture) => {
		await writeRunMode(fixture, "in-progress");
		/** queued/in-progress 실행을 watch한 결과. */
		const result = await runInteractive(fixture, "\ny\n");
		/** watch 호출이 실제로 기록됐는지 확인한다. */
		const commandLog = await readCommandLog(fixture);

		assert.equal(result.code, 0);
		assert.match(result.output, /정확한 CI 실행\(105\)을 기다립니다/);
		assert.match(commandLog, /gh:run watch 105 --exit-status/);
	});
});

test("GitHub 인증 실패는 manifest 버전 변경 전에 중단한다", async () => {
	await withFixture(async (fixture) => {
		/** gh auth status 실패를 시뮬레이션한 결과. */
		const result = await runInteractive(fixture, "", {
			FAKE_GH_AUTH_EXIT: "7",
		});
		/** 인증 실패 뒤 기준 상태. */
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
		const heads = await readHeadState(fixture);

		assert.equal(result.code, 1);
		assert.match(result.output, /GitHub CLI 인증을 확인하지 못해 중단했습니다/);
		assert.equal(manifest.version, BASELINE_VERSION);
		assert.equal(heads.local, heads.remote);
	});
});

test("macOS가 아니면 저장소와 원격을 변경하기 전에 중단한다", async () => {
	await withFixture(
		async (fixture) => {
			/** 운영체제 검사에 거부된 릴리스 명령 결과. */
			const result = await runInteractive(fixture);
			/** 사전 조건 검사 전후가 같은지 확인할 manifest 원문. */
			const manifest = await readFile(fixture.manifestPath, "utf8");
			/** 원격 접근이 시작되지 않았음을 확인할 외부 명령 로그. */
			const commandLog = await readCommandLog(fixture);

			assert.notEqual(result.code, 0);
			assert.match(result.output, /이 릴리스 명령은 macOS에서만 실행/);
			assert.match(manifest, /"version": "0\.1\.3"/);
			assert.equal(commandLog, "");
		},
		{ operatingSystem: "Linux" },
	);
});

test("필수 GitHub CLI가 없으면 manifest 버전 변경 전에 중단한다", async () => {
	await withFixture(
		async (fixture) => {
			/** gh 실행 파일 누락을 시뮬레이션한 결과. */
			const result = await runInteractive(fixture);
			const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
			const heads = await readHeadState(fixture);

			assert.equal(result.code, 1);
			assert.match(result.output, /gh 명령을 PATH에서 찾지 못해 중단했습니다/);
			assert.equal(manifest.version, BASELINE_VERSION);
			assert.equal(heads.local, heads.remote);
		},
		{ missingCommand: "gh" },
	);
});

test("원격 fetch 실패는 manifest 버전 변경 전에 중단한다", async () => {
	await withFixture(
		async (fixture) => {
			/** 원격 참조 조회 뒤 fetch 실패를 시뮬레이션한 결과. */
			const result = await runInteractive(fixture);
			const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
			const heads = await readHeadState(fixture);

			assert.notEqual(result.code, 0);
			assert.match(
				result.output,
				/원격 main을 새로 조회하지 못해 중단했습니다/,
			);
			assert.equal(manifest.version, BASELINE_VERSION);
			assert.equal(heads.local, heads.remote);
		},
		{ fetchExit: 17 },
	);
});

test("비대화형 표준 입력은 원격 변경 전에 중단한다", async () => {
	await withFixture(async (fixture) => {
		/** 파이프로 입력한 비대화형 명령 결과. */
		const result = await runCommand("sh", [SCRIPT_PATH], {
			cwd: fixture.repositoryPath,
			env: fixture.environment,
			input: "y\n",
		});
		/** 비대화형 실패 뒤 기준 상태. */
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
		const heads = await readHeadState(fixture);

		assert.equal(result.code, 1);
		assert.match(result.output, /대화형 터미널에서만 실행할 수 있습니다/);
		assert.equal(manifest.version, BASELINE_VERSION);
		assert.equal(heads.local, heads.remote);
	});
});

test("인자를 전달하면 확인 우회 경로 없이 중단한다", async () => {
	await withFixture(async (fixture) => {
		/** --yes와 같은 인자 우회 경로를 거부하는 결과. */
		const result = await runInteractive(fixture, "", {}, ["--yes"]);
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
		const heads = await readHeadState(fixture);

		assert.equal(result.code, 1);
		assert.match(result.output, /이 명령은 인자를 받지 않습니다/);
		assert.equal(manifest.version, BASELINE_VERSION);
		assert.equal(heads.local, heads.remote);
	});
});

test("dirty·비 main·behind·diverged 상태는 버전 변경 전에 중단한다", async () => {
	await withFixture(async (fixture) => {
		await writeFile(
			path.join(fixture.repositoryPath, "tracked.txt"),
			"dirty\n",
			"utf8",
		);
		/** dirty 작업 트리 결과. */
		const dirtyResult = await runInteractive(fixture);
		assert.match(dirtyResult.output, /작업 트리가 깨끗하지 않아 중단했습니다/);
	});

	await withFixture(async (fixture) => {
		await runGit(fixture.repositoryPath, [
			"switch",
			"--quiet",
			"-c",
			"feature",
		]);
		/** main이 아닌 브랜치 결과. */
		const branchResult = await runInteractive(fixture);
		assert.match(branchResult.output, /main 브랜치에서만 실행할 수 있습니다/);
	});

	await withFixture(async (fixture) => {
		await advanceRemote(fixture, "remote-only.txt", "원격 선행 커밋");
		/** local main이 behind인 결과. */
		const behindResult = await runInteractive(fixture);
		assert.match(behindResult.output, /뒤처져 있어 중단했습니다/);
		const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
		assert.equal(manifest.version, BASELINE_VERSION);
	});

	await withFixture(async (fixture) => {
		await writeFile(
			path.join(fixture.repositoryPath, "local-only.txt"),
			"local\n",
			"utf8",
		);
		await runGit(fixture.repositoryPath, ["add", "local-only.txt"]);
		await runGit(fixture.repositoryPath, [
			"commit",
			"--quiet",
			"-m",
			"로컬 분기 커밋",
		]);
		await advanceRemote(fixture, "remote-only.txt", "원격 분기 커밋");
		/** local과 origin/main이 diverged인 결과. */
		const divergedResult = await runInteractive(fixture);
		assert.match(divergedResult.output, /갈라져 있어 중단했습니다/);
	});
});

test("초기 조회 뒤 원격에만 나타난 기존 태그는 덮어쓰지 않고 복구 대상으로 안내한다", async () => {
	await withFixture(
		async (fixture) => {
			/** 초기 원격 조회 뒤 생긴 태그 때문에 중단한 결과. */
			const result = await runInteractive(fixture, "\ny\n");
			/** 원격에만 생긴 태그가 가리키는 커밋. */
			const remoteTagCommit = await readRemoteTagCommit(fixture, "v0.1.4");
			/** 실행 전후의 main 상태. */
			const heads = await readHeadState(fixture);

			assert.notEqual(result.code, 0);
			assert.match(
				result.output,
				/원격 태그가 이미 있어 덮어쓰지 않고 중단했습니다/,
			);
			assert.equal(remoteTagCommit, heads.remote);
			assert.equal(heads.local, heads.remote);
			assert.equal(
				await runGit(fixture.repositoryPath, ["tag", "--list", "v0.1.4"]),
				"",
			);
			assert.doesNotMatch(
				await readCommandLog(fixture),
				/gh:run list --workflow release\.yml|gh:release view/,
			);
		},
		{ remoteTagAfterFetch: "v0.1.4" },
	);
});

test("태그 push가 실패해도 로컬 주석 태그를 보존하고 Release 단계로 진행하지 않는다", async () => {
	await withFixture(
		async (fixture) => {
			/** 태그 push의 pre-push 실패를 시뮬레이션한 결과. */
			const result = await runInteractive(fixture, "\ny\n");
			/** 실패 시점의 local·remote main 상태. */
			const heads = await readHeadState(fixture);
			/** 실패 뒤에도 남아 있는 로컬 태그. */
			const localTagTarget = await runGit(fixture.repositoryPath, [
				"rev-parse",
				"v0.1.4^{commit}",
			]);
			/** 태그 push 실패 뒤 외부 명령 순서. */
			const commandLog = await readCommandLog(fixture);

			assert.notEqual(result.code, 0);
			assert.match(result.output, /로컬 주석 태그 v0\.1\.4는 보존했습니다/);
			assert.match(result.output, /원격 태그: 없음/);
			assert.equal(localTagTarget, heads.local);
			assert.equal(
				await runGit(fixture.repositoryPath, ["cat-file", "-t", "v0.1.4"]),
				"tag",
			);
			assert.equal(await readRemoteTagCommit(fixture, "v0.1.4"), "");
			assert.equal((commandLog.match(/^pre-push$/gm) ?? []).length, 2);
			assert.doesNotMatch(
				commandLog,
				/gh:run list --workflow release\.yml|gh:release view/,
			);
			assert.doesNotMatch(commandLog, /--no-verify|--force|--delete/);
		},
		{ tagPrePushExit: 23 },
	);
});

test("Release 워크플로 실패와 정확하지 않은 실행은 원격 태그를 보존한다", async () => {
	/** Release 실행을 실패·불일치로 만드는 가짜 상태와 기대 메시지. */
	const cases = [
		{ mode: "failure", message: /Release 워크플로가 failure로 끝났습니다/ },
		{ mode: "pull-only", message: /정확한 태그 v0\.1\.4와 .*Release 워크플로/ },
		{ mode: "wrong-sha", message: /정확한 태그 v0\.1\.4와 .*Release 워크플로/ },
		{ mode: "wrong-tag", message: /정확한 태그 v0\.1\.4와 .*Release 워크플로/ },
	];
	// 각 Release 실행 상태를 순서대로 검증한다.
	/** 현재 Release 실행 실패 상태. */
	for (const currentCase of cases) {
		await withFixture(
			async (fixture) => {
				/** Release 워크플로 실패 또는 불일치 결과. */
				const result = await runInteractive(fixture, "\ny\n", {
					releaseRunMode: currentCase.mode,
					releaseLookupAttempts: 1,
				});
				/** 태그 push 뒤 보존된 main과 원격 태그 상태. */
				const heads = await readHeadState(fixture);
				/** Release 실패 뒤 외부 명령 순서. */
				const commandLog = await readCommandLog(fixture);

				assert.notEqual(result.code, 0);
				assert.match(result.output, currentCase.message);
				assert.match(result.output, /원격 태그 .*보존/);
				assert.equal(await readRemoteTagCommit(fixture, "v0.1.4"), heads.local);
				assert.doesNotMatch(commandLog, /gh:release view/);
				assert.doesNotMatch(commandLog, /--no-verify|--force|--delete/);
			},
			{ releaseRunMode: currentCase.mode, releaseLookupAttempts: 1 },
		);
	}
});

test("Release 실행 검색 지연과 진행 중 실행을 정확한 태그로 기다린다", async () => {
	await withFixture(
		async (fixture) => {
			/** Release 실행이 늦게 나타난 정상 게시 결과. */
			const result = await runInteractive(fixture, "\ny\n");
			/** Release 실행 검색 횟수. */
			const lookupCount = await readFile(
				path.join(fixture.repositoryPath, "release-run-list-count"),
				"utf8",
			);

			assert.equal(result.code, 0);
			assert.match(result.output, /릴리스 게시와 검증이 완료되었습니다/);
			assert.equal(lookupCount.trim(), "2");
		},
		{ releaseRunMode: "delayed", releaseLookupAttempts: 2 },
	);

	await withFixture(
		async (fixture) => {
			/** 완료 전 Release 실행을 watch한 정상 게시 결과. */
			const result = await runInteractive(fixture, "\ny\n", {
				releaseRunMode: "in-progress",
			});
			/** 진행 중 Release 실행을 기다린 외부 명령 로그. */
			const commandLog = await readCommandLog(fixture);

			assert.equal(result.code, 0);
			assert.match(commandLog, /gh:run watch 308 --exit-status/);
		},
		{ releaseRunMode: "in-progress" },
	);
});

test("공개 Release의 태그·SHA·상태·DMG가 맞지 않으면 원격 태그를 삭제하지 않는다", async () => {
	/** Release 상세 응답을 일부러 실패시키는 가짜 상태 목록. */
	const modes = [
		"error",
		"wrong-sha",
		"short-sha",
		"missing-target",
		"wrong-tag",
		"draft",
		"prerelease",
		"missing-dmg",
	];
	// 각 Release 상세 응답 상태를 순서대로 검증한다.
	/** 현재 Release 상세 응답 상태. */
	for (const releaseViewMode of modes) {
		await withFixture(
			async (fixture) => {
				/** Release 상세 검증 실패 결과. */
				const result = await runInteractive(fixture, "\ny\n", {
					releaseViewMode,
				});
				/** Release 검증 실패 뒤에도 남아 있는 원격 태그. */
				const heads = await readHeadState(fixture);
				/** Release 상세 검증까지 진행한 외부 명령 로그. */
				const commandLog = await readCommandLog(fixture);

				assert.notEqual(result.code, 0);
				assert.match(result.output, /GitHub Release 검증에 실패했습니다/);
				assert.equal(await readRemoteTagCommit(fixture, "v0.1.4"), heads.local);
				assert.match(commandLog, /gh:release view v0\.1\.4/);
				assert.doesNotMatch(commandLog, /--no-verify|--force|--delete/);
			},
			{ releaseViewMode },
		);
	}
});
