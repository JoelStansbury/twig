import JSONPointer from "jsonpointer";
import { ChangeMessage, IClient, WatchHandle } from "../types";
import { getParts } from "../pointer_utils";

export class MemClient implements IClient {
    private data: any;
    protected _ready: Promise<boolean>;
    private token?: string;

    async initialize(onchange: (value: any) => void): Promise<void> {
        return void (0);
    }

    async peek(path: string): Promise<string[]> {
        return Object.keys(this.get(path, ""))
    }

    constructor(initial: any = {}) {
        this.data = structuredClone(initial);
        this._ready = new Promise<boolean>((resolve, reject) => {
            resolve(true)
        })
    }

    async create_space(
        name: string
    ): Promise<Response> {
        return new Promise((resolve, reject) => resolve(new Response()))
    }
    
    createWatchSocket(
        onmessage: (
            messages: ChangeMessage[]
        ) => void
    ): Promise<WatchHandle> {
        return new Promise(
            (resolve, reject) => {
                resolve({
                    close() {
                        // pass
                    },
                    subscribe(space:string, path:string) {
                        // pass
                    },
                    unsubscribe(space:string, path:string) {
                        // pass
                    }
                })
            }
        )
    }

    async signup(user:any): Promise<Response> {
        return new Response(null, {
            status: 501,
            statusText:
                "Not supported offline",
        });
    }

    async authenticate(user:any): Promise<string> {
        this.token = "offline";

        return this.token;
    }

    get ready() {
        return this._ready;
    }

    async get(path: string, space: string): Promise<any> {
        return this.getPointer(path);
    }

    async put(path: string, space: string, value: any): Promise<Response> {
        this.setPointer(path, value);
        return {} as Response
    }

    async match(wildpath: string, space: string): Promise<string[][]> {
        const parts = wildpath.split('/').slice(1);
        const results: string[][] = [];

        function traverse(current: any, index: number, currentCaptures: string[]) {

            // If we reached the end of the path
            if (index === parts.length) {
                // If the path had wildcards, return the captured keys
                if (currentCaptures.length > 0) {
                    results.push(currentCaptures);
                }
                return;
            }

            const part = parts[index];

            // If we are at a wildcard
            if (part === '*') {
                if (current && typeof current === 'object') {
                    const keys = Object.keys(current);
                    for (const key of keys) {
                        // We capture the key as the "group"
                        traverse(current[key], index + 1, [...currentCaptures, key]);
                    }
                }
            } else {
                // If we are at a static key
                if (current && typeof current === 'object' && part in current) {
                    traverse(
                        current[part], 
                        index + 1, 
                        currentCaptures
                    );
                }
            }
        }

        traverse(this.data, 0, []);
        return results;
    }

    async delete(
        path: string,
        space: string
    ): Promise<Response> {
        const data = this.data

        const parts = path.split("/")
        const parent = parts.splice(parts.length - 1).join("/")
        const suffix = parts[parts.length].replace("~1", "/").replace("~0", "~")

        const ptr =  JSONPointer.get(data, parent);
        delete ptr[suffix]
        return new Response();
    }

    private getPointer(pointer: string): any {
        const parts = getParts(pointer);

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
        const parts = getParts(pointer);

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