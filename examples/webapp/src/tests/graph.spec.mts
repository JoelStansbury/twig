import { describe, expect, it } from "vitest";
import { Graph } from "../utils/calc";
import { StoreInterface } from "../utils/store_interface";
import { IDataClient } from "../utils/store/client/types";
import TwigStore from "../utils/store/store";

//
// A very small JSON-pointer store for testing.
//
// Internally it stores one ordinary JSON object. Paths such as:
//
//     /users/123/name
//
// are resolved against that object.
//
// This intentionally implements only the behavior Graph needs.
//
class JsonPointerStore extends StoreInterface {
    private data: any;
    // private client: IDataClient
    // store: TwigStore



    async initialize(onchange: (value: any) => void): Promise<void> {
        return void (0);
    }

    async peek(path: string): Promise<string[]> {
        return Object.keys(this.get(path))
    }

    constructor(initial: any = {}) {
        super()
        this.data = structuredClone(initial);
    }

    async get(path: string): Promise<any> {
        return this.getPointer(path);
    }

    async put(path: string, value: any): Promise<Response> {
        this.setPointer(path, value);
        return {} as Response
    }

    async match(prefix: string): Promise<string[][]> {
        const value = this.getPointer(prefix);

        if (
            value === undefined ||
            value === null ||
            typeof value !== "object"
        ) {
            return [];
        }

        return Object.keys(value).map(key => [key]);
    }

    //
    // Test helper: inspect the entire JSON document.
    //
    snapshot(): any {
        return structuredClone(this.data);
    }

    //
    // Test helper: count a particular path's value.
    //
    async value(path: string): Promise<any> {
        return this.get(path);
    }

    private parsePointer(pointer: string): string[] {
        if (pointer === "") {
            return [];
        }

        if (!pointer.startsWith("/")) {
            throw new Error(`Invalid JSON pointer: ${pointer}`);
        }

        return pointer
            .slice(1)
            .split("/")
            .map(part =>
                part
                    .replace(/~1/g, "/")
                    .replace(/~0/g, "~")
            );
    }

    private pointer(parts: string[]): string {
        return parts
            .map(part =>
                part
                    .replace(/~/g, "~0")
                    .replace(/\//g, "~1")
            )
            .map(part => `/${part}`)
            .join("");
    }

    private getPointer(pointer: string): any {
        const parts = this.parsePointer(pointer);

        let current = this.data;

        for (const part of parts) {
            if (
                current === null ||
                current === undefined ||
                typeof current !== "object" ||
                !(part in current)
            ) {
                return undefined;
            }

            current = current[part];
        }

        return structuredClone(current);
    }

    private setPointer(pointer: string, value: any): void {
        const parts = this.parsePointer(pointer);

        if (parts.length === 0) {
            this.data = structuredClone(value);
            return;
        }

        let current = this.data;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];

            if (
                current[part] === undefined ||
                current[part] === null ||
                typeof current[part] !== "object"
            ) {
                current[part] = {};
            }

            current = current[part];
        }

        current[parts[parts.length - 1]] =
            structuredClone(value);
    }
}


//
// Helper for creating a graph and store together.
//
function createGraph(initial: any) {
    const store = new JsonPointerStore(initial);
    const graph = new Graph(store);

    return { graph, store };
}


describe("Graph", () => {
    describe("basic function evaluation", () => {
        it("evaluates a function when its input changes", async () => {
            const { graph, store } = createGraph({
                input: 10,
                output: 0
            });

            await store.put("/templates/double", "{{ value * 2 }}");
            graph.insertFunc(
                "/functions/double",
                {
                    value: "/input"
                },
                "/output"
            );

            await graph.registerChange("/input", 20);

            expect(await store.value("/output"))
                .toBe(40);
        });
    });


    describe("multiple dependencies", () => {
        it("reevaluates when any dependency changes", async () => {
            const { graph, store } = createGraph({
                price: 10,
                quantity: 2,
                total: 0
            });

            graph.insertFunc(
                "/functions/total",
                {
                    price: "/price",
                    quantity: "/quantity"
                },
                "/total"
            );

            await store.put("/templates/total","{{ price * quantity }}");

            await graph.registerChange("/price", 15);

            expect(await store.value("/total"))
                .toBe(30);

            await graph.registerChange("/quantity", 4);

            expect(await store.value("/total"))
                .toBe(60);
        });
    });


    describe("calculation chains", () => {
        it("evaluates downstream functions in dependency order", async () => {
            const { graph, store } = createGraph({
                input: 2,
                intermediate: 0,
                output: 0
            });

            graph.insertFunc(
                "/functions/double",
                {
                    value: "/input"
                },
                "/intermediate"
            );

            graph.insertFunc(
                "/functions/addOne",
                {
                    value: "/intermediate"
                },
                "/output"
            );

            await store.put(
                "/templates/double","{{ value * 2 }}"
            );

            await store.put(
                "/templates/addOne","{{ value + 1 }}"
            );

            await graph.registerChange("/input", 10);

            /*
             * If the functions were evaluated concurrently, addOne could
             * observe the old value of intermediate.
             */
            expect(await store.value("/intermediate"))
                .toBe(20);

            expect(await store.value("/output"))
                .toBe(21);
        });
    });


    describe("converging dependencies", () => {
        it("evaluates converging branches in the correct order", async () => {
            const { graph, store } = createGraph({
                input: 1,
                left: 0,
                right: 0,
                result: 0
            });

            graph.insertFunc(
                "/functions/left",
                {
                    value: "/input"
                },
                "/left"
            );

            graph.insertFunc(
                "/functions/right",
                {
                    value: "/input"
                },
                "/right"
            );

            graph.insertFunc(
                "/functions/result",
                {
                    left: "/left",
                    right: "/right"
                },
                "/result"
            );

            await store.put("/templates/left","{{ value * 10 }}");

            await store.put("/templates/right","{{ value * 100 }}");

            await store.put("/templates/result","{{ left + right }}");

            await graph.registerChange("/input", 2);

            expect(await store.value("/left"))
                .toBe(20);

            expect(await store.value("/right"))
                .toBe(200);

            expect(await store.value("/result"))
                .toBe(220);
        });
    });


    describe("dirty propagation", () => {
        it("does not unnecessarily propagate when a function output is unchanged", async () => {
            const { graph, store } = createGraph({
                input: 5,
                intermediate: 10,
                output: 20
            });

            let finalEvaluations = 0;

            graph.insertFunc(
                "/functions/identity",
                {
                    value: "/input"
                },
                "/intermediate"
            );

            graph.insertFunc(
                "/functions/double",
                {
                    value: "/intermediate"
                },
                "/output"
            );

            await store.put("/templates/identity","{{ value * 2 }}");

            await store.put("/templates/double","{{ value * 2 }}");

            /*
             * This changes the input but the identity function still produces
             * the same value if we write the same input again.
             */
            await graph.registerChange("/input", 5);

            expect(await store.value("/intermediate"))
                .toBe(10);

            expect(await store.value("/output"))
                .toBe(20);
        });
    });


    describe("JSON values", () => {
        it("can produce objects rather than only strings", async () => {
            const { graph, store } = createGraph({
                first: "Joel",
                last: "Smith",
                person: {}
            });

            graph.insertFunc(
                "/functions/person",
                {
                    first: "/first",
                    last: "/last"
                },
                "/person"
            );

            await store.put("/templates/person",JSON.stringify({name: "{{ first }} {{ last }}"}));

            await graph.registerChange(
                "/first",
                "John"
            );

            expect(await store.value("/person"))
                .toEqual({
                    name: "John Smith"
                });
        });
    });


    describe("parameterized functions", () => {
        it("creates independent function instances", async () => {
            const { graph, store } = createGraph({
                products: {
                    apple: {
                        price: 2,
                        quantity: 3,
                        total: 0
                    },
                    orange: {
                        price: 4,
                        quantity: 5,
                        total: 0
                    }
                },
                templates: {
                    total: "{{ price * quantity }}"
                }
            });

            await graph.registerFunction(
                "total",
                [["id", "/products"]],
                {
                    price: "/products/{{id}}/price",
                    quantity: "/products/{{ id }}/quantity"
                },
                "/products/{{ id }}/total"
            );

            await graph.registerChange(
                "/products/apple/price",
                10
            );

            expect(await store.value(
                "/products/apple/total"
            )).toBe(30);

            // Should still be zero because no inputs have changed
            expect(await store.value(
                "/products/orange/total"
            )).toBe(0);
        });
    });


    describe("cycles", () => {
        it("rejects cyclic dependencies", () => {
            const { graph } = createGraph({
                a: 1,
                b: 2
            });

            graph.insertFunc(
                "/functions/aToB",
                {
                    value: "/a"
                },
                "/b",
                "{{ value }}"
            );

            expect(() => {
                graph.insertFunc(
                    "/functions/bToA",
                    {
                        value: "/b"
                    },
                    "/a"
                );
            }).toThrow();
        });
    });


    describe("JSON pointer behavior", () => {
        it("handles nested paths", async () => {
            const store = new JsonPointerStore({
                users: {
                    "123": {
                        name: "Alice"
                    }
                }
            });

            expect(await store.get(
                "/users/123/name"
            )).toBe("Alice");

            await store.put(
                "/users/123/name",
                "Bob"
            );

            expect(await store.get(
                "/users/123/name"
            )).toBe("Bob");
        });

        it("creates missing intermediate objects", async () => {
            const store = new JsonPointerStore();

            await store.put(
                "/users/123/name",
                "Alice"
            );

            expect(await store.get(
                "/users/123/name"
            )).toBe("Alice");
        });
    });
});