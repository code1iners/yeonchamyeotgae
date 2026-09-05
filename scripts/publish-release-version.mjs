import { readFile, writeFile } from "node:fs/promises";

/** 안정 버전으로 허용할 정식 SemVer 패턴. prerelease와 build metadata는 제외한다. */
const STABLE_VERSION_PATTERN =
	/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
/** JSON manifest에서 version 항목 한 줄을 찾아 원문 형식을 보존하는 패턴. */
const VERSION_LINE_PATTERN = /^(\s*"version"\s*:\s*")[^"]+(".*)$/gm;
/** GitHub Release의 targetCommitish가 커밋 SHA인지 판별하는 패턴. */
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
/** 전체 SHA가 아닌 hexadecimal targetCommitish를 구분하는 패턴. */
const HEX_VALUE_PATTERN = /^[0-9a-f]+$/i;

/** 정식 안정 버전을 BigInt 세 묶음으로 파싱한다. */
function parseStableVersion(input) {
	/** null과 숫자 입력도 일관된 검증 오류로 처리하기 위한 문자열 표현. */
	const value = String(input ?? "");
	/** 선행 0 없는 major·minor·patch를 분리한 결과. */
	const match = value.match(STABLE_VERSION_PATTERN);
	if (!match) {
		throw new Error(
			`정식 안정 SemVer여야 합니다(prerelease·build metadata 불가): ${value}`,
		);
	}

	return {
		major: BigInt(match[1]),
		minor: BigInt(match[2]),
		patch: BigInt(match[3]),
	};
}

/** 두 안정 버전을 SemVer 순서로 비교한다. */
function compareStableVersions(first, second) {
	/** 비교할 첫 번째 버전 묶음. */
	const firstVersion = parseStableVersion(first);
	/** 비교할 두 번째 버전 묶음. */
	const secondVersion = parseStableVersion(second);
	for (const part of ["major", "minor", "patch"]) {
		if (firstVersion[part] > secondVersion[part]) {
			return 1;
		}
		if (firstVersion[part] < secondVersion[part]) {
			return -1;
		}
	}
	return 0;
}

/** BigInt 버전 묶음을 출력 가능한 안정 버전으로 되돌린다. */
function formatStableVersion(version) {
	return `${version.major}.${version.minor}.${version.patch}`;
}

/** 안정 버전을 patch·minor·major 중 하나로 증가시킨다. */
function bumpStableVersion(base, kind) {
	/** 증가 기준 버전. */
	const version = parseStableVersion(base);
	if (kind === "patch") {
		version.patch += 1n;
	} else if (kind === "minor") {
		version.minor += 1n;
		version.patch = 0n;
	} else if (kind === "major") {
		version.major += 1n;
		version.minor = 0n;
		version.patch = 0n;
	} else {
		throw new Error(`알 수 없는 버전 증가 종류입니다: ${kind}`);
	}
	return formatStableVersion(version);
}

/** 표준 입력 전체를 읽는다. */
async function readStandardInput() {
	/** 표준 입력으로 들어온 JSON 또는 태그 목록 조각. */
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

/** 파일 경로 또는 -에서 텍스트를 읽는다. */
async function readText(filePath) {
	/** 읽을 파일 또는 표준 입력. */
	return filePath === "-" ? readStandardInput() : readFile(filePath, "utf8");
}

/** JSON manifest에서 앱 버전을 읽는다. */
async function readManifestVersion(filePath) {
	/** manifest 원문. */
	const source = await readText(filePath);
	/** 파싱한 manifest. */
	const manifest = JSON.parse(source);
	if (typeof manifest.version !== "string") {
		throw new Error("manifest에 문자열 version이 없습니다.");
	}
	return manifest.version;
}

/** manifest의 version만 바꾸고 나머지 원문 형식을 보존한다. */
async function writeManifestVersion(filePath, version) {
	/** 기록할 안정 버전을 먼저 검증한다. */
	parseStableVersion(version);
	/** 수정 전 manifest 원문. */
	const source = await readText(filePath);
	/** version 항목의 줄 목록. */
	const matches = [...source.matchAll(VERSION_LINE_PATTERN)];
	if (matches.length !== 1) {
		throw new Error(
			"manifest의 최상위 version 항목을 정확히 하나 찾지 못했습니다.",
		);
	}
	/** version만 바꾼 manifest 원문. */
	const updated = source.replace(VERSION_LINE_PATTERN, `$1${version}$2`);
	/** 수정 결과가 여전히 유효한 JSON인지 확인한다. */
	JSON.parse(updated);
	await writeFile(filePath, updated, "utf8");
}

/** GitHub Release 목록 JSON을 검증하고 배열로 반환한다. */
function parseReleaseList(source) {
	/** 비어 있을 때 사용할 GitHub Release 목록. */
	const releases = JSON.parse(source.trim() || "[]");
	if (!Array.isArray(releases)) {
		throw new Error("GitHub Release 목록이 배열이 아닙니다.");
	}
	return releases;
}

/** v 접두사를 제거한 안정 태그 버전을 반환하거나 무시한다. */
function stableVersionFromTag(tagName) {
	/** 태그 이름 원문. */
	const value = String(tagName ?? "");
	/** refs/tags/ 형태가 들어와도 같은 태그로 처리한다. */
	const normalized = value.startsWith("refs/tags/")
		? value.slice("refs/tags/".length)
		: value;
	if (!normalized.startsWith("v")) {
		return null;
	}
	/** v를 제외한 태그 버전. */
	const version = normalized.slice(1);
	try {
		parseStableVersion(version);
		return version;
	} catch {
		return null;
	}
}

/** 목록에서 가장 높은 안정 버전을 반환한다. */
function maxStableVersion(values) {
	/** 현재까지 확인한 가장 높은 버전. */
	let maximum = null;
	for (const value of values) {
		if (value === "none" || value === "") {
			continue;
		}
		parseStableVersion(value);
		if (maximum === null || compareStableVersions(value, maximum) > 0) {
			maximum = value;
		}
	}
	return maximum;
}

/** GitHub Release가 현재 버전을 어떻게 사용하는지 판정한다. */
function releaseStatus(releases, version) {
	/** 조회할 태그 이름. */
	const tagName = `v${version}`;
	/** 같은 태그를 가진 Release. */
	const release = releases.find((item) => item?.tagName === tagName);
	if (!release) {
		return "missing";
	}
	if (!release.isDraft && !release.isPrerelease) {
		return `public-stable\t${release.url ?? ""}`;
	}
	return "not-public";
}

/** 공개 안정 Release 중 가장 높은 버전과 URL을 반환한다. */
function latestPublicRelease(releases) {
	/** 현재까지 확인한 공개 안정 Release. */
	let latest = null;
	for (const release of releases) {
		if (release?.isDraft || release?.isPrerelease) {
			continue;
		}
		/** Release의 안정 태그 버전. */
		const version = stableVersionFromTag(release?.tagName);
		if (
			version &&
			(latest === null || compareStableVersions(version, latest.version) > 0)
		) {
			latest = {
				tagName: release.tagName,
				url: release.url ?? "",
				version,
			};
		}
	}
	return latest;
}

/** 탭 구분 출력으로 Actions 실행 정보를 셸에 전달한다. */
function printWorkflowRun(run) {
	if (!run || run.id === "") {
		console.log("none");
		return;
	}
	console.log(
		[run.id, run.status, run.conclusion, run.url, run.headSha, run.event].join(
			"\t",
		),
	);
}

/** 태그 push로 시작된 정확한 Release 워크플로 실행을 고른다. */
function selectReleaseRun(runs, targetTag, targetSha) {
	/** 대상 커밋·태그의 push로 시작된 Release 실행. */
	const run = runs.find((item) => {
		if (item?.headSha !== targetSha || item?.event !== "push") {
			return false;
		}

		/** GitHub가 제공하는 실행의 브랜치 또는 태그 이름. */
		const headBranch = String(item?.headBranch ?? "");
		/** workflow 파일 필터가 보장하는 이름을 응답에서도 확인한다. */
		const workflowName = String(item?.workflowName ?? "");
		return (
			headBranch === targetTag &&
			(workflowName === "Release" || workflowName === "release.yml")
		);
	});
	if (!run) {
		return null;
	}
	return {
		conclusion: run.conclusion || "pending",
		event: run.event,
		headSha: run.headSha,
		id: String(run.databaseId ?? run.id ?? ""),
		status: run.status ?? "",
		url: run.url ?? "",
	};
}

/** GitHub Release의 공개 상태·태그·커밋·macOS·Windows 자산을 검증한다. */
function verifyRelease(release, expectedTag, expectedSha, expectedAssets) {
	if (!release || typeof release !== "object" || Array.isArray(release)) {
		throw new Error("GitHub Release 상세 응답이 객체가 아닙니다.");
	}
	if (release.tagName !== expectedTag) {
		throw new Error(
			`GitHub Release 태그가 다릅니다: 기대값 ${expectedTag}, 실제값 ${release.tagName ?? "없음"}`,
		);
	}
	if (release.isDraft !== false || release.isPrerelease !== false) {
		throw new Error(
			"GitHub Release가 공개 안정 상태가 아닙니다(draft/prerelease).",
		);
	}

	/** Release API가 커밋 SHA 또는 기준 브랜치로 반환하는 대상 값. */
	const targetCommitish = String(release.targetCommitish ?? "");
	if (!targetCommitish) {
		throw new Error("GitHub Release 대상 커밋 정보가 없습니다.");
	}
	if (
		FULL_SHA_PATTERN.test(targetCommitish) &&
		targetCommitish.toLowerCase() !== expectedSha.toLowerCase()
	) {
		throw new Error(
			`GitHub Release 대상 커밋이 다릅니다: 기대값 ${expectedSha}, 실제값 ${targetCommitish}`,
		);
	}
	if (
		HEX_VALUE_PATTERN.test(targetCommitish) &&
		!FULL_SHA_PATTERN.test(targetCommitish)
	) {
		throw new Error(
			`GitHub Release 대상 값이 전체 SHA가 아닙니다: ${targetCommitish}`,
		);
	}

	/** Release에 올라온 예상 macOS·Windows 자산. */
	const assets = Array.isArray(release.assets) ? release.assets : [];
	const verifiedAssets = expectedAssets.map((expectedAsset) => {
		const asset = assets.find((item) => item?.name === expectedAsset);
		if (!asset) {
			throw new Error(`예상한 Release 자산이 없습니다: ${expectedAsset}`);
		}
		return asset.name;
	});
	/** 결과 요약에 사용할 공개 Release URL. */
	const url = String(release.url ?? "");
	if (!url) {
		throw new Error("GitHub Release URL이 없습니다.");
	}
	console.log([url, ...verifiedAssets].join("\t"));
}

/** 명령행 인자를 검사한다. */
function requireArguments(argumentsList, expectedCount, usage) {
	if (argumentsList.length !== expectedCount) {
		throw new Error(`사용법: ${usage}`);
	}
}

/** 보조 스크립트의 명령을 실행한다. */
async function main() {
	/** 보조 스크립트 명령 이름. */
	const [command, ...argumentsList] = process.argv.slice(2);
	switch (command) {
		case "read-manifest":
			requireArguments(argumentsList, 1, "read-manifest <path>");
			console.log(await readManifestVersion(argumentsList[0]));
			return;
		case "write-manifest":
			requireArguments(argumentsList, 2, "write-manifest <path> <version>");
			await writeManifestVersion(argumentsList[0], argumentsList[1]);
			return;
		case "validate":
			requireArguments(argumentsList, 1, "validate <version>");
			parseStableVersion(argumentsList[0]);
			console.log(argumentsList[0]);
			return;
		case "validate-candidate": {
			requireArguments(
				argumentsList,
				2,
				"validate-candidate <version> <minimum-version|none>",
			);
			/** 검증할 후보 버전. */
			const candidate = argumentsList[0];
			/** 기존 안정 버전의 하한. */
			const minimum = argumentsList[1];
			parseStableVersion(candidate);
			if (
				minimum !== "none" &&
				compareStableVersions(candidate, minimum) <= 0
			) {
				throw new Error(
					`기존 안정 버전(${minimum})보다 높은 버전이어야 합니다: ${candidate}`,
				);
			}
			console.log(candidate);
			return;
		}
		case "bump":
			requireArguments(argumentsList, 2, "bump <version> <patch|minor|major>");
			console.log(bumpStableVersion(argumentsList[0], argumentsList[1]));
			return;
		case "compare":
			requireArguments(argumentsList, 2, "compare <first> <second>");
			console.log(compareStableVersions(argumentsList[0], argumentsList[1]));
			return;
		case "max":
			console.log(maxStableVersion(argumentsList) ?? "none");
			return;
		case "max-tags": {
			/** 줄 단위로 들어온 태그 목록. */
			const tagNames = (await readStandardInput()).split(/\r?\n/);
			/** 안정 태그에서 추출한 버전 목록. */
			const versions = tagNames
				.map(stableVersionFromTag)
				.filter((version) => version !== null);
			console.log(maxStableVersion(versions) ?? "none");
			return;
		}
		case "release-status": {
			requireArguments(argumentsList, 1, "release-status <version>");
			/** GitHub Release 목록 원문. */
			const releases = parseReleaseList(await readStandardInput());
			console.log(releaseStatus(releases, argumentsList[0]));
			return;
		}
		case "latest-release": {
			/** GitHub Release 목록 원문. */
			const releases = parseReleaseList(await readStandardInput());
			/** 공개 안정 Release 중 가장 최신 항목. */
			const latest = latestPublicRelease(releases);
			console.log(
				latest
					? [latest.version, latest.tagName, latest.url].join("\t")
					: "none",
			);
			return;
		}
		case "select-release": {
			requireArguments(
				argumentsList,
				2,
				"select-release <tag-name> <commit-sha>",
			);
			/** GitHub Actions Release 실행 목록 원문. */
			const runs = JSON.parse((await readStandardInput()).trim() || "[]");
			if (!Array.isArray(runs)) {
				throw new Error("GitHub Actions Release 실행 목록이 배열이 아닙니다.");
			}
			printWorkflowRun(
				selectReleaseRun(runs, argumentsList[0], argumentsList[1]),
			);
			return;
		}
		case "verify-release": {
			requireArguments(
				argumentsList,
				4,
				"verify-release <tag-name> <commit-sha> <macos-asset-name> <windows-asset-name>",
			);
			/** GitHub Release 상세 응답 원문. */
			const release = JSON.parse((await readStandardInput()).trim() || "null");
			verifyRelease(
				release,
				argumentsList[0],
				argumentsList[1],
				argumentsList.slice(2),
			);
			return;
		}
		default:
			throw new Error(
				"알 수 없는 명령입니다: read-manifest, write-manifest, validate, validate-candidate, bump, compare, max, max-tags, release-status, select-release, verify-release",
			);
	}
}

try {
	await main();
} catch (error) {
	/** 사용자에게 보여줄 보조 스크립트 오류. */
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
}
