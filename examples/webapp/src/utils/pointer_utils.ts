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
        ret.push(part.replace(/~1/g, "/").replace(/~0/g, "~"))
    } 
    return ret
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
export function getPrimitives(data: any, prefix:string, collector:Record<string, any> = {}) {
    if (Array.isArray(data)) {
        collector[prefix] = []
        let i = 0
        for (const el of data) {
            getPrimitives(el, `${prefix}/${i++}`, collector)
        }
    } else if (typeof data === "object" && data !== null) {
        collector[prefix] = {}
        for (const [k, v] of Object.entries(data)) {
            getPrimitives(v, `${prefix}/${k}`, collector)
        }
    } else {
        collector[prefix] = data
    }
    // TODO: handle string, number, and object
    // IMPORTANT: Make sure to properly escape the object keys
    return collector
}