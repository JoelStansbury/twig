export function getAncestorPaths(path: string) {
    // Returns all sub-paths including the original path
    const parts = path.split("/").slice(1);
    let current = ""
    const ancestors = [current]
    for (const part of parts) {
        current = `${current}/${part}`
        ancestors.push(current)
    }
    return ancestors
}