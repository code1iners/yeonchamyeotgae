import type { YeonchaApi } from "../../preload/index";

declare global {
	interface Window {
		/** preload가 노출한 셸 API. */
		yeoncha: YeonchaApi;
	}
}
