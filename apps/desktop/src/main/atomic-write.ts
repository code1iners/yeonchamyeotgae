import {
	closeSync,
	fsyncSync,
	openSync,
	renameSync,
	writeFileSync,
} from "node:fs";

/**
 * 파일을 원자적으로 쓴다 — 임시 파일 → `fsync` → `rename`(스펙 2절).
 *
 * 세 단계가 각각 다른 실패를 막는다. 임시 파일은 원본을 열어둔 채 덮어쓰지 않게
 * 하고, `fsync`는 내용이 디스크에 닿은 뒤에 이름을 바꾸게 하며, `rename`은 같은
 * 볼륨에서 원자적이라 **쓰기 중 강제 종료돼도 원본이 반쯤 덮여 있지 않다** —
 * 남는 것은 완성된 옛 파일과 버려진 `.tmp` 하나다.
 *
 * 디렉터리 자체는 `fsync`하지 않는다. 그것이 지키는 것은 "rename이 있었다는 사실"의
 * 내구성인데, 디렉터리 fd 열기가 Windows에서 통하지 않아 플랫폼 분기를 낳는다.
 * 우리가 막으려는 것은 전원 손실이 아니라 프로세스 강제 종료다.
 */
export function writeFileAtomic(filePath: string, contents: string): void {
	/** 같은 디렉터리에 두는 임시 파일. 볼륨이 같아야 rename이 원자적이다. */
	const tempPath = `${filePath}.tmp`;
	/** 임시 파일의 파일 서술자. `fsync`를 부르려면 서술자가 필요하다. */
	const fd = openSync(tempPath, "w");
	try {
		writeFileSync(fd, contents, "utf8");
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(tempPath, filePath);
}
