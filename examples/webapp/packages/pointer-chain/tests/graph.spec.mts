import { describe, expect, it } from "vitest";
import { Graph } from "@twig/pointer-chain";
import { client, Store } from "@twig/store";

//
// Helper for creating a graph and db together.
//
function createGraph(initial: any) {
    const db = new client.MemClient(initial);
    const store = new Store(db, "")
    const graph = new Graph(store);

    return { graph, store };
}

describe("Test store", () => {
    it("can match multi-paths", async () => {
        const { graph, store } = createGraph({
            users: {
                "123": {
                    hobbies: {
                        "a": {
                            name: "Alice"
                        },
                        "b": {
                            name: "Alice"
                        }
                    }
                }
            }
        });

        expect(await store.match(
            "/users/*/hobbies/*"
        )).toStrictEqual([["123", "a"],["123", "b"]]);
    });
});

describe("Graph", () => {
    describe("basic function evaluation", () => {
        it("evaluates a function when its input changes", async () => {
            const { graph, store } = createGraph({
                input: 10,
                output: 0
            });

            graph.insertFunc(
                "/functions/double",
                {
                    value: "/input"
                },
                "/output",
                "{{ value * 2 }}"
            );

            await graph.registerChange("/input", 20);

            expect(await store.get("/output"))
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
                "/total",
                "{{ price * quantity }}"
            );

            await graph.registerChange("/price", 15);

            expect(await store.get("/total"))
                .toBe(30);

            await graph.registerChange("/quantity", 4);

            expect(await store.get("/total"))
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
                "/intermediate",
                "{{ value * 2 }}"
            );

            graph.insertFunc(
                "/functions/addOne",
                {
                    value: "/intermediate"
                },
                "/output",
                "{{ value + 1 }}"
            );

            await graph.registerChange("/input", 10);

            /*
             * If the functions were evaluated concurrently, addOne could
             * observe the old value of intermediate.
             */
            expect(await store.get("/intermediate"))
                .toBe(20);

            expect(await store.get("/output"))
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
                "/left",
                "{{ value * 10 }}"
            );

            graph.insertFunc(
                "/functions/right",
                {
                    value: "/input"
                },
                "/right",
                "{{ value * 100 }}"
            );

            graph.insertFunc(
                "/functions/result",
                {
                    left: "/left",
                    right: "/right"
                },
                "/result",
                "{{ left + right }}"
            );

            await graph.registerChange("/input", 2);

            expect(await store.get("/left"))
                .toBe(20);

            expect(await store.get("/right"))
                .toBe(200);

            expect(await store.get("/result"))
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


            graph.insertFunc(
                "/functions/identity",
                {
                    value: "/input"
                },
                "/intermediate",
                "{{ value * 2 }}"
            );

            graph.insertFunc(
                "/functions/double",
                {
                    value: "/intermediate"
                },
                "/output",
                "{{ value * 2 }}"
            );

            /*
             * This changes the input but the identity function still produces
             * the same value if we write the same input again.
             */
            await graph.registerChange("/input", 5);

            expect(await store.get("/intermediate"))
                .toBe(10);

            expect(await store.get("/output"))
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
                "/person",
                "{\"name\":\"{{ first }} {{ last }}\"}"
            );


            await graph.registerChange(
                "/first",
                "John"
            );

            expect(await store.get("/person"))
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
                }
            });

            await graph.registerFunction(
                "total",
                [["id", "/products/*"]],
                {
                    price: "/products/{{id}}/price",
                    quantity: "/products/{{ id }}/quantity"
                },
                "/products/{{ id }}/total",
                "{{ price * quantity }}"
            );

            await graph.registerChange(
                "/products/apple/price",
                10
            );

            expect(await store.get(
                "/products/apple/total"
            )).toBe(30);

            // Should still be zero because no inputs have changed
            expect(await store.get(
                "/products/orange/total"
            )).toBe(0);
        });

        it("can handle multi-paths", async () => {
            const { graph, store } = createGraph({
                users: {
                    "123": {
                        hobbies: {
                            "a": {
                                name: "Painting"
                            },
                            "b": {
                                name: "Movies"
                            }
                        }
                    }
                }
            });

            await graph.registerFunction(
                "total",
                [[["userKey", "hobbyKey"], "/users/*/hobbies/*"]],
                {
                    hobbyName: "/users/{{ userKey }}/hobbies/{{ hobbyKey }}/name"
                },
                "/users/{{ userKey }}/hobbies/{{ hobbyKey }}/name_copy",
                '"COPY {{ hobbyName }}"'
            );
            await graph.registerChange(
                "/users/123/hobbies/a/name",
                "Cars"
            );
            expect(await store.get(
                "/users/123/hobbies/a/name_copy"
            )).toBe("COPY Cars")
            expect(await store.get(
                "/users/123/hobbies/b/name_copy"
            )).toBe(undefined)

            await graph.registerChange(
                "/users/123/hobbies/b/name",
                "Games"
            );
            expect(await store.get(
                "/users/123/hobbies/b/name_copy"
            )).toBe("COPY Games")

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
            const {store} = createGraph({
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
            const {store} = createGraph({});

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