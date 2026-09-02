import { pointerUtils } from "@twig/store";

export function flattenJson(
  value:any,
  basePath = "",
  collector: Record<string, string> = {}
): Record<string, string> {

  return pointerUtils.getPrimitives(value, basePath, collector)
}