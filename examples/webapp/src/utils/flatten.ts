import { getPrimitives } from "./store/pointer_utils";

export function flattenJson(
  value:any,
  basePath = "",
  collector: Record<string, string> = {}
): Record<string, string> {

  return getPrimitives(value, basePath, collector)
}