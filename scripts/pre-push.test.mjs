import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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

/** Node child process API를 Promise로 사용할 함수. */
const execFileAsync = promisify(execFile);
/** 이 테스트가 검증할 저장소 pre-push 훅 경로. */
const HOOK_SOURCE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	".husky",
	"pre-push",
);
/** 이 테스트가 검증할 루트 패키지 설정 경로. */
const PACKAGE_JSON_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"package.json",
);
/** 에이전트의 push 훅 우회 정책을 확인할 안내 파일 경로. */
const AGENTS_MD_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"AGENTS.md",
);
/** 제품 훅이 읽을 삭제가 아닌 가짜 원격 SHA. */
const REMOTE_SHA = "0000000000000000000000000000000000000000";
/** 테스트에서 사용할 POSIX 셸 명령. */
const SHELL_COMMAND = process.platform === "win32" ? "sh.exe" : "sh";
/** 현재 Node 실행 파일이 있는 디렉터리. */
const NODE_BIN_DIRECTORY = path.dirname(process.execPath);

/** Git 명령을 테스트 저장소에서 실행한다. */
async function runGit(repositoryPath, args) {
	/** 테스트 저장소에서 실행한 Git 명령 결과. */
	const result = await execFileAsync("git", args, {
		cwd: repositoryPath,
		encoding: "utf8",
	});
	return result.stdout.trim();
}

/** 훅을 시험할 최소 Git 저장소와 가짜 pnpm 실행 파일을 만든다. */
async function createFixture({ prepared = true } = {}) {
	/** 테스트 중 생성할 임시 저장소 경로. */
	const repositoryPath = await mkdtemp(
		path.join(os.tmpdir(), "yeoncha-pre-push-"),
	);
	/** 훅이 호출한 명령을 기록할 로그 경로. */
	const commandLogPath = path.join(repositoryPath, "pnpm.log");
	/** 가짜 pnpm을 PATH 앞에 놓을 디렉터리. */
	const binPath = path.join(repositoryPath, "bin");
	/** 임시 저장소의 Husky 파일 경로. */
	const huskyPath = path.join(repositoryPath, ".husky");

	await mkdir(binPath, { recursive: true });
	await mkdir(path.join(huskyPath, "_"), { recursive: true });
	await writeFile(
		path.join(repositoryPath, ".gitignore"),
		"ignored/\n.husky/_/\nbin/\npnpm.log\n",
		"utf8",
	);
	await writeFile(
		path.join(repositoryPath, "tracked.txt"),
		"initial\n",
		"utf8",
	);
	await runGit(repositoryPath, ["init", "--quiet"]);
	await runGit(repositoryPath, ["config", "user.email", "test@example.com"]);
	await runGit(repositoryPath, ["config", "user.name", "Test User"]);
	await runGit(repositoryPath, ["add", "."]);
	await runGit(repositoryPath, ["commit", "--quiet", "-m", "fixture"]);
	if (prepared) {
		await runGit(repositoryPath, ["config", "core.hooksPath", ".husky/_"]);
	}

	/** 테스트 대상 훅의 현재 원문. */
	const hookSource = await readFile(HOOK_SOURCE, "utf8");
	await writeFile(path.join(huskyPath, "pre-push"), hookSource, "utf8");
	if (prepared) {
		await writeFile(path.join(huskyPath, "_", "h"), "# prepared\n", "utf8");
	}
	/** 가짜 pnpm이 읽을 POSIX 스크립트의 셸 변수 접두사. */
	const shellVariablePrefix = "$";
	/** 훅 실행 순서와 종료 코드를 기록하는 가짜 pnpm 스크립트. */
	const fakePnpmScript = [
		"#!/usr/bin/env sh",
		`printf 'fake-pnpm:%s\\n' "${shellVariablePrefix}*"`,
		`printf '%s\\n' "${shellVariablePrefix}*" >> "${shellVariablePrefix}FAKE_PNPM_LOG"`,
		`case "${shellVariablePrefix}*" in`,
		`  verify) exit "${shellVariablePrefix}{FAKE_VERIFY_EXIT:-0}" ;;`,
		`  test:product:foreground) exit "${shellVariablePrefix}{FAKE_FOREGROUND_EXIT:-0}" ;;`,
		"  *) exit 99 ;;",
		"esac",
	].join("\n");
	await writeFile(path.join(binPath, "pnpm"), `${fakePnpmScript}\n`, "utf8");
	await chmod(path.join(binPath, "pnpm"), 0o755);
	await chmod(path.join(huskyPath, "pre-push"), 0o755);
	await runGit(repositoryPath, ["add", path.join(".husky", "pre-push")]);
	await runGit(repositoryPath, ["commit", "--quiet", "-m", "hook"]);

	/** 현재 커밋을 검사 대상으로 가리키는 pre-push 입력. */
	const headSha = await runGit(repositoryPath, ["rev-parse", "HEAD"]);
	/** 테스트 저장소에서 훅을 실행할 환경. */
	const environment = {
		...process.env,
		FAKE_PNPM_LOG: commandLogPath,
		PATH: [binPath, NODE_BIN_DIRECTORY, process.env.PATH]
			.filter(Boolean)
			.join(path.delimiter),
	};

	return {
		commandLogPath,
		environment,
		headSha,
		repositoryPath,
		hookPath: path.join(huskyPath, "pre-push"),
	};
}

/** 테스트 저장소에서 훅을 실행하고 표준 출력과 종료 코드를 모은다. */
async function runHook(fixture, input, environmentOverrides = {}) {
	return new Promise((resolve, reject) => {
		/** 훅을 실행하는 셸 프로세스. */
		const child = execFile(
			SHELL_COMMAND,
			[fixture.hookPath],
			{
				cwd: fixture.repositoryPath,
				env: { ...fixture.environment, ...environmentOverrides },
				encoding: "utf8",
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
		child.stdin.end(input);
	});
}

/** 테스트가 끝나면 명시적으로 만든 임시 저장소를 제거한다. */
async function withFixture(callback, options = {}) {
	/** 이번 테스트가 사용할 격리 저장소. */
	const fixture = await createFixture(options);
	try {
		return await callback(fixture);
	} finally {
		await rm(fixture.repositoryPath, { force: true, recursive: true });
	}
}

/** 현재 HEAD를 가리키는 Git pre-push 입력을 만든다. */
function createPushInput(fixture, localSha = fixture.headSha) {
	return `refs/heads/main ${localSha} refs/heads/main ${REMOTE_SHA}\n`;
}

/** 훅이 호출한 가짜 pnpm 명령을 읽고, 호출되지 않았으면 빈 목록을 반환한다. */
async function readCommands(fixture) {
	try {
		/** 가짜 pnpm 실행 로그 원문. */
		const log = await readFile(fixture.commandLogPath, "utf8");
		return log.trim() === "" ? [] : log.trim().split("\n");
	} catch (error) {
		if (error?.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

/** 지정한 실행 파일을 PATH의 모든 후보에서 제거한다. */
function removeCommandFromPath(environmentPath, command) {
	/** Windows에서 확인할 실행 파일 이름 후보. */
	const commandNames =
		process.platform === "win32"
			? [command, `${command}.cmd`, `${command}.exe`]
			: [command];
	return environmentPath
		.split(path.delimiter)
		.filter(
			(directory) =>
				directory !== "" &&
				!commandNames.some((name) => existsSync(path.join(directory, name))),
		)
		.join(path.delimiter);
}

test("깨끗한 push 대상은 verify 후 foreground 제품 흐름을 순서대로 실행한다", async () => {
	await withFixture(async (fixture) => {
		/** 현재 HEAD를 push하는 Git pre-push 입력. */
		const pushInput = createPushInput(fixture);
		/** 훅 실행 결과. */
		const result = await runHook(fixture, pushInput);
		/** 가짜 pnpm이 관찰한 실행 순서. */
		const commands = await readCommands(fixture);

		assert.equal(result.code, 0);
		assert.match(result.output, /전면 Electron 제품 흐름/);
		/** 전면 흐름 안내가 가짜 pnpm 실행보다 먼저 출력된 위치. */
		const noticeIndex = result.output.indexOf(
			"전면 Electron 제품 흐름을 시작합니다",
		);
		/** 전면 흐름 명령 표식이 출력된 위치. */
		const foregroundCommandIndex = result.output.indexOf(
			"fake-pnpm:test:product:foreground",
		);
		assert.ok(noticeIndex >= 0);
		assert.ok(foregroundCommandIndex >= 0);
		assert.ok(noticeIndex < foregroundCommandIndex);
		assert.deepEqual(commands, ["verify", "test:product:foreground"]);
	});
});

test("루트 패키지는 Husky prepare와 훅 회귀 테스트 명령을 제공한다", async () => {
	/** 훅 설치 계약을 확인할 루트 package.json. */
	const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));

	assert.equal(packageJson.scripts.prepare, "husky");
	assert.equal(
		packageJson.scripts["test:hooks"],
		"node --test scripts/pre-push.test.mjs",
	);
	assert.ok(packageJson.devDependencies.husky);
});

test("push 대상 입력이 없으면 검증 전에 push를 차단한다", async () => {
	await withFixture(async (fixture) => {
		/** Git pre-push 입력이 비어 있는 훅 실행 결과. */
		const result = await runHook(fixture, "");

		assert.equal(result.code, 1);
		assert.match(
			result.output,
			/Git pre-push 입력에서 push 대상을 읽지 못했습니다/,
		);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("pre-push 훅은 POSIX 셸 진입점과 셸 호환 문법을 사용한다", async () => {
	/** 저장소 훅 원문. */
	const hookSource = await readFile(HOOK_SOURCE, "utf8");

	assert.match(hookSource, /^#!\/usr\/bin\/env sh\n/);
	assert.doesNotMatch(hookSource, /\[\[/);
	assert.doesNotMatch(hookSource, /\b(local|declare|function)\b/);
});

test("에이전트 안내는 훅 우회 금지와 원격 재검증 경계를 기록한다", async () => {
	/** 에이전트가 지켜야 할 push 정책 원문. */
	const agentsGuide = await readFile(AGENTS_MD_PATH, "utf8");

	assert.match(agentsGuide, /git push --no-verify/);
	assert.match(agentsGuide, /HUSKY=0/);
	assert.match(agentsGuide, /pnpm verify:product/);
});

test("검사한 HEAD와 다른 push 대상은 검증 전에 차단한다", async () => {
	await withFixture(async (fixture) => {
		/** 현재 HEAD와 다른 유효한 push 대상 커밋. */
		const previousSha = await runGit(fixture.repositoryPath, [
			"rev-parse",
			"HEAD^",
		]);
		/** 이전 커밋을 push하려는 Git pre-push 입력. */
		const result = await runHook(
			fixture,
			createPushInput(fixture, previousSha),
		);

		assert.equal(result.code, 1);
		assert.match(result.output, /검사한 HEAD와 push 대상 커밋이 다릅니다/);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("수정된 추적 파일이 있으면 검증 전에 push를 차단한다", async () => {
	await withFixture(async (fixture) => {
		await writeFile(
			path.join(fixture.repositoryPath, "tracked.txt"),
			"changed\n",
			"utf8",
		);
		/** 수정된 추적 파일 상태에서 훅을 실행한 결과. */
		const result = await runHook(fixture, createPushInput(fixture));

		assert.equal(result.code, 1);
		assert.match(result.output, /수정된 추적 파일이 있어 push를 차단했습니다/);
		assert.match(result.output, /tracked\.txt/);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("스테이징된 파일이 있으면 검증 전에 push를 차단한다", async () => {
	await withFixture(async (fixture) => {
		await writeFile(
			path.join(fixture.repositoryPath, "tracked.txt"),
			"staged\n",
			"utf8",
		);
		await runGit(fixture.repositoryPath, ["add", "tracked.txt"]);
		/** 스테이징된 파일 상태에서 훅을 실행한 결과. */
		const result = await runHook(fixture, createPushInput(fixture));

		assert.equal(result.code, 1);
		assert.match(result.output, /스테이징된 파일이 있어 push를 차단했습니다/);
		assert.match(result.output, /tracked\.txt/);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("무시되지 않은 새 파일이 있으면 검증 전에 push를 차단한다", async () => {
	await withFixture(async (fixture) => {
		await writeFile(
			path.join(fixture.repositoryPath, "new-file.txt"),
			"new\n",
			"utf8",
		);
		/** 무시되지 않은 새 파일 상태에서 훅을 실행한 결과. */
		const result = await runHook(fixture, createPushInput(fixture));

		assert.equal(result.code, 1);
		assert.match(
			result.output,
			/Git이 무시하지 않는 새 파일이 있어 push를 차단했습니다/,
		);
		assert.match(result.output, /new-file\.txt/);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("무시된 파일만 있으면 깨끗한 작업 트리로 보고 검증한다", async () => {
	await withFixture(async (fixture) => {
		await mkdir(path.join(fixture.repositoryPath, "ignored"), {
			recursive: true,
		});
		await writeFile(
			path.join(fixture.repositoryPath, "ignored", "build.txt"),
			"ignored\n",
			"utf8",
		);
		/** 무시된 파일만 있는 상태에서 훅을 실행한 결과. */
		const result = await runHook(fixture, createPushInput(fixture));

		assert.equal(result.code, 0);
		assert.deepEqual(await readCommands(fixture), [
			"verify",
			"test:product:foreground",
		]);
	});
});

test("기본 검증이 실패하면 전면 제품 흐름을 시작하지 않는다", async () => {
	await withFixture(async (fixture) => {
		/** 기본 검증을 실패시킬 가짜 종료 코드. */
		const result = await runHook(fixture, createPushInput(fixture), {
			FAKE_VERIFY_EXIT: "17",
		});

		assert.equal(result.code, 17);
		assert.match(result.output, /기본 검증이 실패해 push를 차단했습니다/);
		assert.match(result.output, /pnpm install/);
		assert.match(result.output, /pnpm run prepare/);
		assert.match(result.output, /pnpm exec husky init/);
		assert.match(result.output, /command -v node/);
		assert.deepEqual(await readCommands(fixture), ["verify"]);
	});
});

test("전면 제품 흐름이 실패하면 push를 차단한다", async () => {
	await withFixture(async (fixture) => {
		/** 전면 제품 흐름을 실패시킬 가짜 종료 코드. */
		const result = await runHook(fixture, createPushInput(fixture), {
			FAKE_FOREGROUND_EXIT: "19",
		});

		assert.equal(result.code, 19);
		assert.match(
			result.output,
			/전면 Electron 제품 흐름이 실패해 push를 차단했습니다/,
		);
		assert.match(result.output, /pnpm install/);
		assert.match(result.output, /pnpm run prepare/);
		assert.deepEqual(await readCommands(fixture), [
			"verify",
			"test:product:foreground",
		]);
	});
});

test("Node가 PATH에 없으면 검증 성공으로 폴백하지 않고 복구 방법을 안내한다", async () => {
	await withFixture(async (fixture) => {
		/** Node 실행 파일을 제거한 PATH. */
		const pathWithoutNode = removeCommandFromPath(
			fixture.environment.PATH,
			"node",
		);
		/** Node가 없는 환경에서 훅을 실행한 결과. */
		const result = await runHook(fixture, createPushInput(fixture), {
			PATH: pathWithoutNode,
		});

		assert.equal(result.code, 1);
		assert.match(result.output, /Node를 PATH에서 찾지 못했습니다/);
		assert.match(result.output, /pnpm install/);
		assert.match(result.output, /pnpm run prepare/);
		assert.match(result.output, /pnpm exec husky init/);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("pnpm이 PATH에 없으면 검증 성공으로 폴백하지 않고 복구 방법을 안내한다", async () => {
	await withFixture(async (fixture) => {
		/** pnpm 실행 파일을 제거한 PATH. */
		const pathWithoutPnpm = removeCommandFromPath(
			fixture.environment.PATH,
			"pnpm",
		);
		/** pnpm이 없는 환경에서 훅을 실행한 결과. */
		const result = await runHook(fixture, createPushInput(fixture), {
			PATH: pathWithoutPnpm,
		});

		assert.equal(result.code, 1);
		assert.match(result.output, /pnpm을 PATH에서 찾지 못했습니다/);
		assert.match(result.output, /pnpm install/);
		assert.match(result.output, /pnpm run prepare/);
		assert.deepEqual(await readCommands(fixture), []);
	});
});

test("Husky가 준비되지 않으면 검증 성공으로 폴백하지 않고 복구 방법을 안내한다", async () => {
	await withFixture(
		async (fixture) => {
			/** Husky 생성 파일이 없는 환경에서 훅을 실행한 결과. */
			const result = await runHook(fixture, createPushInput(fixture));

			assert.equal(result.code, 1);
			assert.match(result.output, /Husky 훅이 준비되지 않았습니다/);
			assert.match(result.output, /pnpm run prepare/);
			assert.deepEqual(await readCommands(fixture), []);
		},
		{ prepared: false },
	);
});
