import { getParts } from "./store/pointer_utils"
import { StoreInterface } from "./store_interface";
import { render, renderString } from "nunjucks";

function cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce((acc, curr) => {
        return acc.flatMap(a => curr.map(b => [...a, b]));
    }, [[] as T[]]);
}

type Node = {
    feeders: string[];
    consumers: string[];
    type: 'data' | 'func';
};

type Edge = {
    keyword: string;
};

type ChangeMessage = {
    old: string;
    new: string;
    source: string;
    dest: string;
};


class Graph {
    nodes: Record<string, Node> = {};
    edges: Map<string, Edge> = new Map();
    store: StoreInterface;

    public constructor(store: StoreInterface) {
        this.store = store;
    }

    private getEdgeKey(u: string, path: string): string {
        return `${u}::${path}`;
    }

    private isCyclic(): boolean {
        const visited = new Set<string>();
        const recStack = new Set<string>();

        const dfs = (u: string): boolean => {
            visited.add(u);
            recStack.add(u);

            for (const v of this.nodes[u].consumers) {
                if (!visited.has(v)) {
                    if (dfs(v)) return true;
                } else if (recStack.has(v)) {
                    return true;
                }
            }

            recStack.delete(u);
            return false;
        };

        for (const node in this.nodes) {
            if (!visited.has(node)) {
                if (dfs(node)) return true;
            }
        }
        return false;
    }

    private isAcyclic(): boolean {
        return !this.isCyclic();
    }

    private async fetchContext(path: string): Promise<Record<string, string>> {
        const keys: string[] = [];
        const values: Promise<any>[] = [];
        
        for (const u of this.getFeeders(path)) {
            keys.push(this.edges.get(this.getEdgeKey(u, path))?.keyword || "");
            values.push(this.store.get(u));
        }
        return Promise.all(Object.values(values)).then(() => {
            const entries = keys.map((key, index) => [key, values[index]]);
            return Object.fromEntries(entries)
        }
        )
    }

    private getConsumers(path: string): string[] {
        return this.nodes[path].consumers;
    }

    private getFeeders(path: string): string[] {
        return this.nodes[path].feeders;
    }

    public registerChange(path: string, value: string): void {
        this.store.get(path).then((oldValue) => {
            if (oldValue === value) return;
            this.store.put(path, value).catch(console.error);
            const chain = this.calcChain(path);
            let dirty = new Set<string>(this.getConsumers(path));

            // Sort functions by their execution order (the value in the chain)
            const functions = Object.keys(chain).filter(k => chain[k] % 2 !== 0);
            functions.sort((a, b) => chain[a] - chain[b]);

            for (const funcPath of functions) {
                if (!dirty.has(funcPath)) continue;

                this.evaluate(funcPath).then((change) => {
                    if (change.old !== change.new) {
                        for (const d of change.dest.split(',')) {
                            dirty.add(d);
                        }
                    }
                })
                
            }
        })

    }

    private getTargetPath(funcPath: string): string {
        return this.getConsumers(funcPath)[0];
    }

    public async evaluate(funcPath: string): Promise<ChangeMessage> {
        const func = await this.store.get(funcPath)
        const template = func.template;
        if (typeof template !== "string") console.error("unexpected template type");
        
        const targetPath = this.getTargetPath(funcPath);
        const oldValue = await this.store.get(targetPath);
        const kwargs = this.fetchContext(funcPath);
        const newValue = JSON.parse(renderString(template, kwargs));
        this.store.put(targetPath, newValue);
        return {
            old: oldValue,
            new: newValue,
            source: funcPath,
            dest: targetPath
        };


    }

    private calcChain(path: string, order: number = 0, collector: Record<string, number> = {}): Record<string, number> {
        for (const v of this.getConsumers(path)) {
            collector[v] = Math.max(collector[v] || 0, order + 1);
            this.calcChain(v, order + 1, collector);
        }
        return collector;
    }

    public insertNode(path: string): void {
        if (this.nodes[path]) throw new Error(`Node ${path} already exists`);
        this.nodes[path] = {
            feeders: [],
            consumers: [],
            type: 'data'
        };
    }

    public insertFunc(path: string, context: Record<string, string>, target: string): void {
        // We assume context keys are the IDs of the feeder nodes
        const feeders = Object.keys(context);

        this.nodes[path] = {
            feeders: [], // The context keys will be used to link
            consumers: [target],
            type: 'func'
        };

        // Link feeders to this function
        for (const u of feeders) {
            if (!this.nodes[u]) {
                this.nodes[u] = {
                    feeders: [],
                    consumers: [path],
                    type: "data"
                }
            }
            this.nodes[u].consumers.push(path);
        }

        // Link function to target
        if (!this.nodes[target]) {
            this.nodes[target] = { feeders: [], consumers: [], type: 'data' };
        }

        // In your Python, feeders are the source nodes. In TS we update the structure:
        this.nodes[path].feeders = feeders;
        this.nodes[target].feeders.push(path);

        // Set edges
        for (const [k, u] of Object.entries(context)) {
            this.edges.set(this.getEdgeKey(u, path), { keyword: k });
        }
        this.edges.set(this.getEdgeKey(path, target), { keyword: "" });
        console.assert(this.isAcyclic())
    }

    public registerFunction(
        name: string,
        forEach: string | Array<[string | string[], string]>,
        context: Record<string, string>,
        target: string
    ): void {
        // Normalize forEach
        let normalizedForEach: Array<[string[], string]> = [];
        if (typeof forEach === 'string') {
            normalizedForEach = [[['key'], forEach]]; // Simplified logic for structure
        } else {
            normalizedForEach = forEach.map(([key, prefix]) => {
                const keys = Array.isArray(key) ? key : [key];
                return [keys, prefix] as [string[], string];
            });
        }

        this.insertNode(`/templates/${name}`);

        const key_names: string[][] = []
        const key_promises: Promise<string[][]>[] = []
        normalizedForEach.map(([keyname, prefix]) => {
            key_names.push(keyname);
            key_promises.push(this._discover(prefix));
        })

        Promise.all(key_promises).then((keys) => {
            const combinations = cartesianProduct(keys);

            for (const combination of combinations) {
                const keylist: string[] = combination.flat();
                const namelist: string[] = key_names.flat();

                // Create the unique path for this specific function instance
                const suffix = keylist.join("/");
                const calc_path = `functions/${name}/${suffix}`;

                const zipMap = Object.fromEntries(
                    namelist.map((name, i) => [name, keylist[i]])
                );

                // Calculate dependencies and the final target path
                this._resolveDependencies(context, zipMap).then(([ctx, deps]) => {
                    // Use a simple template replacer for target.format(**ctx)
                    const resolved_target = renderString(target, ctx);
                    this.insertFunc(calc_path, deps, resolved_target);

                });

            }
        })
    }

    private _discover(prefix: string): Promise<string[][]> {
        return this.store.match(prefix)
    }

    private async _resolveDependencies(
        context: Record<string, any>, 
        key: Record<string, string>
    ): Promise<[Record<string, string>, Record<string, string>]> {
        const ctx: Record<string, any> = { ...key };
        const ret: Record<string, string> = {};

        for (const [k, v] of Object.entries(context)) {
            // A simple template replacement to find the pointer
            let pointer = v;
            for (const [ck, cv] of Object.entries(ctx)) {
                pointer = pointer.split(`{${ck}}`).join(cv);
            }
            ctx[k] = this.store.get(pointer);
            ret[k] = pointer;
        }
        return [ctx, ret];
    }
}