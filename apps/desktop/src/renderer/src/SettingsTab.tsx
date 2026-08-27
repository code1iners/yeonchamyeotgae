import type { Settings } from "@yeoncha/core";
import { useEffect, useRef, useState } from "react";

type Props = {
	/** 저장된 설정. 파일이 아직 없으면 `null`이고 그것이 곧 온보딩이다. */
	settings: Settings | null;
};

/** 기준방식 선택지(CONTEXT.md) — 코어의 `grantBasis` 값과 화면 문구를 잇는다. */
const GRANT_BASIS_OPTIONS = [
	/** 발생을 입사일에 맞춰 준다. */
	{ value: "hireDate", label: "입사일 기준" },
	/** 발생을 회계연도(1/1)에 맞춰 준다. 첫해는 비례분이 붙는다. */
	{ value: "fiscalYear", label: "회계연도 기준 (1/1)" },
] as const satisfies readonly {
	value: Settings["grantBasis"];
	label: string;
}[];

/**
 * 설정 탭 — 입사일과 기준방식. 온보딩의 입구이자 앱에 파일이 생기는 유일한 자리다.
 *
 * 조정 섹션은 22번이 채운다. 입사일이 없으면 그 섹션 자체가 보이지 않는다(5.4절).
 */
export function SettingsTab({ settings }: Props) {
	/** 입력 중인 입사일. 저장하기 전까지는 파일에 없다. */
	const [hireDate, setHireDate] = useState(settings?.hireDate ?? "");
	/** 입력 중인 기준방식. 고르지 않았으면 입사일 기준이다. */
	const [grantBasis, setGrantBasis] = useState<Settings["grantBasis"]>(
		settings?.grantBasis ?? "hireDate",
	);
	/** 저장 실패 문구. 성공하면 비운다. */
	const [error, setError] = useState<string | null>(null);
	/** 커밋이 오가는 중인가. 같은 저장을 두 번 보내지 않게 막는다. */
	const [saving, setSaving] = useState(false);

	/** 폼이 저장된 값과 같은가 — 같으면 저장할 것이 없다. */
	const unchanged =
		settings !== null &&
		settings.hireDate === hireDate &&
		settings.grantBasis === grantBasis;
	/** 마지막으로 폼에 반영한 저장값. 셸이 민 상태가 실제로 달라졌는지 가른다. */
	const syncedRef = useRef(settings);

	useEffect(
		function syncSavedSettingsEffect() {
			// 저장값이 그대로인가요? 셸은 자정·절전 복귀에도 상태를 밀어주므로(21번),
			// 값이 같은 푸시에 폼을 다시 채우면 입력 중이던 것이 되돌아간다.
			if (!settings || isSameSettings(settings, syncedRef.current)) {
				return;
			}
			syncedRef.current = settings;
			setHireDate(settings.hireDate);
			setGrantBasis(settings.grantBasis);
		},
		[settings],
	);

	/** 저장 버튼 핸들러. 커밋 하나로 파일 생성 · 재계산 · 트레이 갱신이 전부 일어난다. */
	const handleSave = async () => {
		setSaving(true);
		try {
			await window.yeoncha.commit({ settings: { hireDate, grantBasis } });
			setError(null);
		} catch (cause) {
			// 거부 사유는 하나가 아니다 — 쓰기 차단(2절)일 수도, 쓰기 자체의 실패일 수도
			// 있다. 원인을 단정하지 않고 셸이 준 사유를 그대로 옮긴다.
			console.error("설정을 저장하지 못했다", cause);
			setError(`저장하지 못했습니다 — ${failureReason(cause)}`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="pane">
			<label className="field">
				<span>입사일</span>
				<input
					type="date"
					value={hireDate}
					onChange={(event) => setHireDate(event.target.value)}
				/>
			</label>
			<label className="field">
				<span>기준방식</span>
				<select
					value={grantBasis}
					onChange={(event) => {
						/** 고른 선택지. 목록에 없는 값은 무시한다. */
						const picked = GRANT_BASIS_OPTIONS.find(
							(option) => option.value === event.target.value,
						);
						if (picked) {
							setGrantBasis(picked.value);
						}
					}}
				>
					{GRANT_BASIS_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			{error && <p className="error">{error}</p>}
			<div className="cta">
				<button
					type="button"
					className="primary"
					disabled={!hireDate || saving || unchanged}
					onClick={handleSave}
				>
					저장
				</button>
			</div>
			{settings && (
				<>
					<div className="sec-title">조정</div>
					<div className="row dim">
						이월·포상 같은 추가분이 있으면 여기에 넣습니다.
					</div>
				</>
			)}
		</div>
	);
}

/** 두 설정이 같은 값인가. 셸이 매번 새 객체를 보내므로 참조 비교로는 알 수 없다. */
function isSameSettings(a: Settings | null, b: Settings | null): boolean {
	return a?.hireDate === b?.hireDate && a?.grantBasis === b?.grantBasis;
}

/**
 * 커밋 거부 사유에서 화면에 옮길 한 줄을 뽑는다.
 *
 * `invoke`의 reject는 메인의 오류 문구를 그대로 실어 오지만 Electron이 채널 안내를
 * 앞에 붙인다. 사용자에게 뜻이 없는 그 접두만 걷어낸다.
 */
function failureReason(cause: unknown): string {
	/** 원본 오류 문구. */
	const message = cause instanceof Error ? cause.message : String(cause);
	return (
		message
			.replace(/^Error invoking remote method '[^']*':\s*/, "")
			.replace(/^Error:\s*/, "")
			.trim() || "알 수 없는 오류"
	);
}
