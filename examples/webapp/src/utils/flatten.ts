export function flattenJson(
  value:any,
  basePath = "",
  collector: Record<string, string> = {}
): Record<string, string> {

  // arrays
  if (Array.isArray(value)) {
    for (let i=0; i<value.length; i++) {
        flattenJson(value[i], `${basePath}/${i}`, collector)
    }
  } else if (value === null) {
    collector[basePath] = "null"
  } else if (typeof value === "object") {
    for (const [k,v] of Object.entries(value)) {
      flattenJson(v, `${basePath}/${k}`, collector)
    }
  } else {
    collector[basePath] = JSON.stringify(value)
  }
  return collector
}