import type { Adjustment, GrantDetail, Settings } from "@yeoncha/core";
import { useEffect, useRef, useState } from "react";
import { AdjustmentsSection } from "./AdjustmentsSection";
import { useCommit } from "./use-commit";

type Props = {
	/** 저장된 설정. 파일이 아직 없으면 `null`이고 그것이 곧 온보딩이다. */
	settings: Settings | null;
	/** 저장된 조정 레코드. */
	adjustments: Adjustment[];
	/** 조회일 기준 발생 레코드별 내역. 조정 소멸일의 기본값이 여기서 나온다. */
	grants: GrantDetail[];
	/** 조회일. */
	today: string;
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
 * 입사일이 없으면 조정 섹션 자체가 보이지 않는다 — 입사일도 없는데 조정을 넣을
 * 이유가 없다(5.4절).
 */
export function SettingsTab({ settings, adjustments, grants, today }: Props) {
	/** 입력 중인 입사일. 저장하기 전까지는 파일에 없다. */
	const [hireDate, setHireDate] = useState(settings?.hireDate ?? "");
	/** 입력 중인 기준방식. 고르지 않았으면 입사일 기준이다. */
	const [grantBasis, setGrantBasis] = useState<Settings["grantBasis"]>(
		settings?.grantBasis ?? "hireDate",
	);
	/** 셸에 변경을 커밋하는 통로 — 진행 중 잠금과 실패 문구가 함께 온다. */
	const { commit, saving, error } = useCommit();

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
		await commit({ settings: { hireDate, grantBasis } });
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
				<AdjustmentsSection
					adjustments={adjustments}
					grants={grants}
					today={today}
				/>
			)}
		</div>
	);
}

/** 두 설정이 같은 값인가. 셸이 매번 새 객체를 보내므로 참조 비교로는 알 수 없다. */
function isSameSettings(a: Settings | null, b: Settings | null): boolean {
	return a?.hireDate === b?.hireDate && a?.grantBasis === b?.grantBasis;
}
