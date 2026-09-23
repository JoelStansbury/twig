export function getAncestorPaths(path: string, includeRoot:boolean=true, includePath:boolean=true) {
    // Returns all sub-paths including the original path
    const parts = path.split("/").slice(1);
    let current = ""
    const ancestors = includeRoot ? [current] : []
    for (const part of parts.slice(0, includePath ? -1 : -2)) {
        current = `${current}/${part}`
        ancestors.push(current)
    }
    return ancestors
}

export function getParts(path: string) {
    const ret: string[] = []
    const parts = path.split("/").slice(1);
    for (const part of parts) {
        ret.push(unescape(part))
    } 
    return ret
}

export function fromParts(parts: string[]) {
    if (parts.length === 0) {
        return ""
    }
    const escapedParts: string[] = []
    parts.map((part) => {escapedParts.push(escape(part))})
    return `/${escapedParts.join("/")}`
}

export function escape(part: string) {
    return part.replace("~", "~0").replace("/", "~1")
}
export function unescape(part: string) {
    return part.replace(/~1/g, "/").replace(/~0/g, "~")
}

export function makeAncestors(data: any, path: string) {
    const parts = getParts(path).slice(0, -2);
    let cursor = data;
    for (const part of parts) {
        if (cursor[part] === undefined) {
            cursor[part] = {}
        }
    }
}

export function getPrimitives(data: any, prefix:string, collector:Record<string, string> = {}) {
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        for (const [k, v] of Object.entries(data)) {
            getPrimitives(v, `${prefix}/${k}`, collector)
        }
    } else {
        collector[prefix] = JSON.stringify(data)
    }
    return collector
}