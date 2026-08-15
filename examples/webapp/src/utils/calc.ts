import { renderString } from "nunjucks";
import { StoreInterface } from "./store_interface";
import { getParts } from "./store/pointer_utils";

function cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce<T[][]>(
        (acc, curr) =>
            acc.flatMap(a => curr.map(b => [...a, b])),
        [[]]
    );
}

type NodeType = "data" | "func";

type Node = {
    feeders: string[];
    consumers: string[];
    type: NodeType;
};

type Edge = {
    keyword: string;
};

type ChangeMessage = {
    old: any;
    new: any;
    source: string;
    dest: string;
};

class Graph {
    private nodes: Record<string, Node> = {};
    private edges: Map<string, Edge> = new Map();

    private store: StoreInterface;

    public constructor(store: StoreInterface) {
        this.store = store;
    }

    // -------------------------------------------------------------------------
    // Graph utilities
    // -------------------------------------------------------------------------

    private getEdgeKey(source: string, target: string): string {
        return `${source}::${target}`;
    }

    private getConsumers(path: string): string[] {
        const node = this.nodes[path];

        if (!node) {
            throw new Error(`Unknown node: ${path}`);
        }

        return node.consumers;
    }

    private getFeeders(path: string): string[] {
        const node = this.nodes[path];

        if (!node) {
            throw new Error(`Unknown node: ${path}`);
        }

        return node.feeders;
    }

    private isCyclic(): boolean {
        const visited = new Set<string>();
        const recStack = new Set<string>();

        const dfs = (u: string): boolean => {
            visited.add(u);
            recStack.add(u);

            for (const v of this.nodes[u].consumers) {
                if (!visited.has(v)) {
                    if (dfs(v)) {
                        return true;
                    }
                } else if (recStack.has(v)) {
                    return true;
                }
            }

            recStack.delete(u);
            return false;
        };

        for (const node of Object.keys(this.nodes)) {
            if (!visited.has(node) && dfs(node)) {
                return true;
            }
        }

        return false;
    }

    private assertAcyclic(): void {
        if (this.isCyclic()) {
            throw new Error("Adding the dependency would create a cycle");
        }
    }

    /**
     * Find all nodes downstream from `path` and assign each node a depth.
     *
     * If there are multiple paths to the same node, its depth is the maximum
     * depth encountered. This is important for converging dependencies:
     *
     *       A       B
     *        \     /
     *         F1 F2
     *           \/
     *           F3
     *
     * F3 must execute after both F1 and F2.
     */
    private calcChain(
        path: string
    ): Record<string, number> {
        const depths: Record<string, number> = {};
        const stack: Array<[string, number]> = [[path, 0]];

        while (stack.length > 0) {
            const [current, depth] = stack.pop()!;

            for (const consumer of this.getConsumers(current)) {
                const nextDepth = depth + 1;
                const previousDepth = depths[consumer];

                if (
                    previousDepth === undefined ||
                    nextDepth > previousDepth
                ) {
                    depths[consumer] = nextDepth;
                    stack.push([consumer, nextDepth]);
                }
            }
        }

        return depths;
    }

    // -------------------------------------------------------------------------
    // Store / evaluation
    // -------------------------------------------------------------------------

    private async fetchContext(
        funcPath: string
    ): Promise<Record<string, any>> {
        const feeders = this.getFeeders(funcPath);

        const values = await Promise.all(
            feeders.map(feeder => this.store.get(feeder))
        );

        return Object.fromEntries(
            feeders.map((feeder, index) => {
                const edge = this.edges.get(
                    this.getEdgeKey(feeder, funcPath)
                );

                if (!edge) {
                    throw new Error(
                        `Missing edge from ${feeder} to ${funcPath}`
                    );
                }

                return [edge.keyword, values[index]];
            })
        );
    }

    private getTargetPath(funcPath: string): string {
        const consumers = this.getConsumers(funcPath);

        if (consumers.length !== 1) {
            throw new Error(
                `Function ${funcPath} must have exactly one target; ` +
                `found ${consumers.length}`
            );
        }

        return consumers[0];
    }

    public async evaluate(funcPath: string): Promise<ChangeMessage> {
        const templatePath = this.getTemplatePath(funcPath)
        const template = await this.store.get(templatePath);

        if (!template || typeof templatePath !== "string") {
            throw new Error(
                `Function ${templatePath} does not contain a valid template`
            );
        }

        const targetPath = this.getTargetPath(funcPath);

        const oldValue = await this.store.get(targetPath);

        const context = await this.fetchContext(funcPath);

        const rendered = renderString(
            template,
            context
        );
        // console.log({template, context, rendered, targetPath})

        const newValue = JSON.parse(rendered);

        await this.store.put(targetPath, newValue);

        return {
            old: oldValue,
            new: newValue,
            source: funcPath,
            dest: targetPath
        };
    }

    /**
     * Determine whether two stored values are equal by JSON value rather than
     * JavaScript object identity.
     */
    private valuesEqual(a: any, b: any): boolean {
        if (a === b) {
            return true;
        }

        if (
            typeof a !== "object" ||
            typeof b !== "object" ||
            a === null ||
            b === null
        ) {
            return false;
        }

        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch {
            return false;
        }
    }


    private getTemplatePath(funcPath: string): string {
        const parts = getParts(funcPath);

        if (parts[0] !== "functions" || parts.length < 2) {
            throw new Error(`Invalid function path: ${funcPath}`);
        }

        const name = parts[1];

        return `/templates/${name}`;
    }

    /**
     * Register a change to a data node and propagate it through the graph.
     *
     * Functions are evaluated in dependency order. A downstream function is
     * only marked dirty when the function feeding it actually changes its
     * output.
     */
    public async registerChange(
        path: string,
        value: any
    ): Promise<void> {
        const oldValue = await this.store.get(path);

        if (this.valuesEqual(oldValue, value)) {
            return;
        }

        await this.store.put(path, value);

        const chain = this.calcChain(path);

        /*
         * Only function nodes participate in evaluation.
         *
         * Sort by depth so that upstream functions always execute before
         * downstream functions.
         */
        const functions = Object.entries(chain)
            .filter(([nodePath]) => {
                // const functionName = ...
                // Get name from function path
                // Get templatePath from name
                // return templatePath
                const node = this.nodes[nodePath];
                return node?.type === "func";
            })
            .sort(([, depthA], [, depthB]) => depthA - depthB);

        /*
         * Initially, only functions directly consuming the changed node
         * are dirty.
         */
        const dirty = new Set<string>(
            this.getConsumers(path).filter(
                consumer => this.nodes[consumer]?.type === "func"
            )
        );

        for (const [funcPath] of functions) {
            if (!dirty.has(funcPath)) {
                continue;
            }

            const change = await this.evaluate(funcPath);

            /*
             * Only propagate invalidation if the function actually changed
             * its output.
             */
            if (this.valuesEqual(change.old, change.new)) {
                continue;
            }

            /*
             * The function's target is a data node. Mark any functions
             * consuming that data node as dirty.
             */
            for (const consumer of this.getConsumers(change.dest)) {
                if (this.nodes[consumer]?.type === "func") {
                    dirty.add(consumer);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Node insertion
    // -------------------------------------------------------------------------

    public insertNode(path: string): void {
        if (this.nodes[path]) {
            throw new Error(`Node ${path} already exists`);
        }

        this.nodes[path] = {
            feeders: [],
            consumers: [],
            type: "data"
        };
    }

    /**
     * Add a consumer to a node if it isn't already present.
     */
    private addConsumer(
        source: string,
        target: string
    ): void {
        const consumers = this.nodes[source].consumers;

        if (!consumers.includes(target)) {
            consumers.push(target);
        }
    }

    /**
     * Add a feeder to a node if it isn't already present.
     */
    private addFeeder(
        target: string,
        source: string
    ): void {
        const feeders = this.nodes[target].feeders;

        if (!feeders.includes(source)) {
            feeders.push(source);
        }
    }

    /**
     * Insert a single instantiated function into the graph.
     *
     * `context` maps template variable names to source node paths.
     *
     * For example:
     *
     *     {
     *         price: "/products/123/price",
     *         quantity: "/cart/123/quantity"
     *     }
     *
     * creates:
     *
     *     /products/123/price    \
     *                              -> function -> target
     *     /cart/123/quantity     /
     */
    public insertFunc(
        path: string,
        context: Record<string, string>,
        target: string,
        template?: string
    ): void {
        // console.log("INSERT FUNCTION", {path,context,target})
        if (this.nodes[path]) {
            throw new Error(`Node ${path} already exists`);
        }

        if (template) {
            const templatePath = this.getTemplatePath(path);
            this.insertNode(templatePath)
            this.store.put(templatePath, template)
        }

        /*
         * Create missing data nodes first.
         */
        for (const source of Object.values(context)) {
            if (!this.nodes[source]) {
                this.insertNode(source);
            }
        }

        if (!this.nodes[target]) {
            this.insertNode(target);
        }

        /*
         * Create the function node.
         */
        this.nodes[path] = {
            feeders: [],
            consumers: [target],
            type: "func"
        };

        /*
         * Link source nodes to the function.
         */
        for (const [keyword, source] of Object.entries(context)) {
            this.addConsumer(source, path);
            this.addFeeder(path, source);

            this.edges.set(
                this.getEdgeKey(source, path),
                { keyword }
            );
        }

        /*
         * Link the function to its output.
         */
        this.addFeeder(target, path);

        this.edges.set(
            this.getEdgeKey(path, target),
            { keyword: "" }
        );

        /*
         * Make sure this new dependency hasn't introduced a cycle.
         */
        this.assertAcyclic();
    }

    // -------------------------------------------------------------------------
    // Parameterized function registration
    // -------------------------------------------------------------------------

    public async registerFunction(
        name: string,
        forEach: string | Array<[string | string[], string]>,
        context: Record<string, string>,
        target: string
    ): Promise<void> {
        /*
         * Normalize `forEach`.
         */
        let normalizedForEach: Array<[string[], string]>;

        if (typeof forEach === "string") {
            normalizedForEach = [
                [["key"], forEach]
            ];
        } else {
            normalizedForEach = forEach.map(
                ([key, prefix]) => {
                    const keys = Array.isArray(key)
                        ? key
                        : [key];

                    return [keys, prefix];
                }
            );
        }

        /*
         * The template itself is represented as a node in the graph.
         * This node is not an executable function instance.
         */
        const templatePath = `/templates/${name}`;

        if (!this.nodes[templatePath]) {
            this.insertNode(templatePath);
        }

        /*
         * Discover the concrete keys for each `forEach` expression.
         */
        const keyNames: string[][] = [];
        const keyPromises: Promise<string[][]>[] = [];

        for (const [names, prefix] of normalizedForEach) {
            keyNames.push(names);
            keyPromises.push(this.discover(prefix));
        }

        const discoveredKeys = await Promise.all(keyPromises);

        /*
         * Create one function instance for every Cartesian-product
         * combination.
         */
        const combinations = cartesianProduct(discoveredKeys);

        for (const combination of combinations) {
            const keyList = combination.flat();
            const nameList = keyNames.flat();

            const suffix = keyList.join("/");
            const funcPath = `/functions/${name}/${suffix}`;
            

            const zipMap = Object.fromEntries(
                nameList.map((key, index) => [
                    key,
                    keyList[index]
                ])
            );

            const [resolvedContext, dependencies] =
                await this.resolveDependencies(
                    context,
                    zipMap
                );

            const resolvedTarget = renderString(
                target,
                resolvedContext
            );
            // console.log({target, resolvedContext, resolvedTarget})

            /*
             * The resolved context is used to render the target.
             *
             * The dependencies are what the graph actually needs:
             *
             *     template keyword -> concrete source path
             */
            this.insertFunc(
                funcPath,
                dependencies,
                resolvedTarget
            );
        }
    }

    private async discover(
        prefix: string
    ): Promise<string[][]> {
        return this.store.match(prefix);
    }

    /**
     * Resolve the parameterized context.
     *
     * Example:
     *
     * context:
     *     {
     *         price: "/products/{id}/price"
     *     }
     *
     * key:
     *     {
     *         id: "123"
     *     }
     *
     * produces:
     *
     *     resolved context:
     *         {
     *             id: "123",
     *             price: <value at /products/123/price>
     *         }
     *
     *     dependencies:
     *         {
     *             price: "/products/123/price"
     *         }
     */
    private async resolveDependencies(
        context: Record<string, any>,
        key: Record<string, string>
    ): Promise<
        [Record<string, any>, Record<string, string>]
    > {
        const resolvedContext: Record<string, any> = {
            ...key
        };

        const dependencies: Record<string, string> = {};

        for (const [keyword, templatePath] of Object.entries(context)) {
            // console.log("RENDERING", {templatePath, resolvedContext})
            let pointer = renderString(templatePath, resolvedContext);
            resolvedContext[keyword] =
                await this.store.get(pointer);

            dependencies[keyword] = pointer;
        }
        // console.log({resolvedContext})
        return [
            resolvedContext,
            dependencies
        ];
    }
}

export {
    Graph
};

export type {
    Node,
    Edge,
    ChangeMessage
};