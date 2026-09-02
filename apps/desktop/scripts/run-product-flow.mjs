import { spawn } from "node:child_process";

/** 제품 흐름이 사용할 표시 모드 인자. */
const mode = process.argv[2];
/** 러너가 허용하는 제품 표시 모드. */
const validModes = new Set(["inactive", "foreground"]);

if (typeof mode !== "string" || !validModes.has(mode)) {
	console.error(
		"제품 흐름 표시 모드는 `inactive` 또는 `foreground`여야 합니다.",
	);
	process.exitCode = 1;
} else {
	/** Windows에서도 같은 명령을 실행할 pnpm 파일 이름. */
	const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
	/** 빌드와 제품 테스트에 함께 전달할 제품 흐름 실행 환경. */
	const productEnvironment = {
		...process.env,
		YEONCHA_PRODUCT_FLOW_MODE: mode,
	};

	/** 빌드 또는 제품 테스트를 앞 단계가 끝난 뒤 실행한다. */
	const runCommand = (args) =>
		new Promise((resolve) => {
			/** 명령이 종료됐는지 나타내는 상태. error와 exit의 중복 종료를 막는다. */
			let settled = false;
			/** 하위 pnpm 프로세스. 표준 입출력은 호출자에게 그대로 연결한다. */
			const child = spawn(pnpmCommand, args, {
				env: productEnvironment,
				stdio: "inherit",
			});
			/** 하위 프로세스 결과를 한 번만 부모에게 전달한다. */
			const finish = (exitCode) => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(exitCode);
			};

			child.once("error", (error) => {
				console.error("제품 흐름 명령을 시작하지 못했습니다.", error);
				finish(1);
			});
			child.once("exit", (exitCode, signal) => {
				if (signal) {
					console.error(`제품 흐름 명령이 ${signal}로 중단됐습니다.`);
					finish(1);
					return;
				}
				finish(exitCode ?? 1);
			});
		});

	/** 먼저 실행할 데스크톱 빌드 결과. */
	const buildExitCode = await runCommand(["build"]);
	if (buildExitCode !== 0) {
		process.exitCode = buildExitCode;
	} else {
		/** 빌드된 앱에서 실행할 기존 전체 제품 흐름. */
		process.exitCode = await runCommand([
			"exec",
			"vitest",
			"run",
			"--config",
			"vitest.product.config.ts",
		]);
	}
}
