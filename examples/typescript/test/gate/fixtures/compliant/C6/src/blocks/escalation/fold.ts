import { rejected } from "@adr/spine/pure/notice";
export const boom = rejected(5, "confirmEscalation", "unknown ticket");
