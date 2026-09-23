// Copied from packages/twig/pointer_utils.ts
export function getParts(path: string) {
    const ret: string[] = []
    const parts = path.split("/").slice(1);
    for (const part of parts) {
        ret.push(part.replace(/~1/g, "/").replace(/~0/g, "~"))
    } 
    return ret
}

export function cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce<T[][]>(
        (acc, curr) =>
            acc.flatMap(a => curr.map(b => [...a, b])),
        [[]]
    );
}

export function escape(part: string) {
    return part.replace("~", "~0").replace("/", "~1")
}
export function unescape(part: string) {
    return part.replace(/~1/g, "/").replace(/~0/g, "~")
}