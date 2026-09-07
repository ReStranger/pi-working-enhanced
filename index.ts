import { installWorkingIndicatorShimmer } from "./src/index.ts";
import type { ExtensionAPI } from "./src/index.ts";

export default function workingShimmerExtension(pi: ExtensionAPI): void {
  installWorkingIndicatorShimmer(pi);
}
