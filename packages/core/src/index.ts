// 코어 공개 API. 계산 · 표시 문자열 · 직렬화 세 seam이 전부 여기로 나간다.
export {
	type AdjustmentDraft,
	type AdjustmentDraftResult,
	type AdjustmentIssue,
	type AdjustmentValue,
	validateAdjustmentDraft,
} from "./adjustment-input.ts";
export {
	type Allocation,
	type AllocationResult,
	allocate,
	type Balance,
	computeBalance,
	type Draw,
	type Excess,
	type GrantDetail,
	latestLivingExpiry,
} from "./balance.ts";
export { computeGrants, type Grant, type GrantSource } from "./grants.ts";
export {
	type HireDateSplit,
	type HireDateSplitInput,
	splitRecordsByHireDate,
} from "./hire-date-change.ts";
export {
	type ExpiryLoss,
	expiryLosses,
	groupHistory,
	type HistorySections,
	type LeaveYearSection,
} from "./history.ts";
export {
	type Adjustment,
	APP_SCHEMA_VERSION,
	type LeaveData,
	type LeaveEntry,
	ParseError,
	type ParseErrorKind,
	parse,
	type Settings,
	serialize,
} from "./storage.ts";
export { type LivingGrant, livingGrants } from "./summary.ts";
export { formatTrayLabel } from "./tray-label.ts";
