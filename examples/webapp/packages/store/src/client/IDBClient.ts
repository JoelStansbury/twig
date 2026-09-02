import JSONPointer from "jsonpointer";
import {
    ChangeMessage,
    IClient,
    WatchHandle,
} from "../types";
import { getAncestorPaths, getPrimitives } from "../pointer_utils";


export class IDBClient
    implements IClient {

    private db!: IDBDatabase;
    // protected saveSpace;

    private channel =
        new BroadcastChannel("twig");

    private token?: string;
    protected _ready: Promise<boolean>;

    constructor(token?: string) {
        this.token = token;
        // this.saveSpace = debounce(this._saveSpace.bind(this), 250)
        this._ready = new Promise<boolean>((resolve, reject) => {
            this.init().then(()=>resolve(true))
        })
    }
    private onmessage?: (message: ChangeMessage[]) => void

    async init() {
        this.db = await new Promise(
            (resolve, reject) => {

                const request =
                    indexedDB.open("twig", 1);

                request.onupgradeneeded = () => {
                    request.result.createObjectStore(
                        "spaces"
                    );
                };

                request.onsuccess = () =>
                    resolve(request.result);

                request.onerror = () =>
                    reject(request.error);
            }
        );

        this.channel.onmessage = (event) => {
            if (this.onmessage) {
                this.onmessage(event.data);
            }
        };
    }

    get ready() {
        return this._ready;
    }

    protected postMessage(messages: ChangeMessage[]) {
        
        this.channel.postMessage(messages)
        if (this.onmessage) {
            this.onmessage(messages)
        }
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

    async create_space(
        name: string
    ): Promise<Response> {
        return new Promise((resolve, reject) => resolve(new Response()))
    }

    private async loadSpace(
        space: string
    ) {

        const tx = this.db.transaction(
            "spaces",
            "readonly"
        );

        return new Promise<any>(
            (resolve, reject) => {

                const request =
                    tx.objectStore("spaces")
                      .get(space);

                request.onsuccess = () => {
                    const result = request.result;
                    if (typeof result === "object" && result !== null) {
                        resolve(result)
                    }
                    resolve({});
                }

                request.onerror = () =>
                    reject(request.error);
            }
        );
    }

    private async _saveSpace(
        space: string,
        value: any
    ) {

        // const t0 = performance.now()
        // console.log("SAVE", t0)
        const tx = this.db.transaction(
            "spaces",
            "readwrite"
        );

        return new Promise<void>(
            (resolve, reject) => {

                const request =
                    tx.objectStore("spaces")
                      .put(value, space);
                request.onsuccess = () => {
                    tx.commit();
                    // const tf = performance.now()
                    // console.log("DONE: ", tf - t0)
                    resolve();
                }

                request.onerror = () => {
                    reject(request.error);
                }
            }
        );
    }

    async put(
        path: string,
        space: string,
        value: any
    ): Promise<Response> {
        const data = await this.loadSpace(space);
        const ancestors = getAncestorPaths(path, false, false)
        for (const ancestor_path of ancestors) {
            if (JSONPointer.get(data, ancestor_path) === undefined) {
                JSONPointer.set(data, ancestor_path, {})
            }
        }

        const oldValue = JSONPointer.get(data, path)
        const oldEntries = getPrimitives(oldValue, path)
        const newEntries = getPrimitives(value, path)
        
        const messages: ChangeMessage[] = []
        for (const [k, v] of Object.entries(oldEntries).toReversed()) {
            if (newEntries[k] === undefined) {
                messages.push({
                    action:"delete",
                    path: k,
                    space
                })
            }
        }
        for (const [k, v] of Object.entries(newEntries)) {
            if (Object.hasOwn(oldEntries, k)) {
                if (oldEntries[k] === newEntries[k]) {
                    // pass
                } else {
                    messages.push({
                        action:"update",
                        path: k,
                        space,
                        value:JSON.parse(v)
                    })
                }
            } else {
                messages.push({
                    action:"insert",
                    path: k,
                    space,
                    value:JSON.parse(v)
                })
            }
        }

        if (path === ""){
            await this._saveSpace(space, value)
        } else {
            JSONPointer.set(data, path, value);
            await this._saveSpace(space, data);
        }

        this.postMessage(messages);

        return new Response();
    }

    async get(
        path: string,
        space: string
    ): Promise<any> {
        const data = await this.loadSpace(space);
        if (path===""){return data}
        return JSONPointer.get(data, path);
    }

    async delete(
        path: string,
        space: string
    ): Promise<Response> {
        const data =
            await this.loadSpace(space);

        const parts = path.split("/")
        const parent = parts.splice(parts.length - 1).join("/")
        const suffix = parts[parts.length].replace("~1", "/").replace("~0", "~")

        const ptr =  JSONPointer.get(data, parent);
        const toDelete = getPrimitives(ptr[suffix], path)
        delete ptr[suffix]

        const messages: ChangeMessage[] = []
        for (const deleted_path of Object.keys(toDelete)) {
            messages.push({
                action:"delete",
                path: deleted_path,
                space
            })
        }

        await this._saveSpace(space, data);

        this.postMessage(messages);

        return new Response();
    }

    async peek(path: string, space: string): Promise<string[]> {
        return []
    }

    async match(wildpath: string, space: string): Promise<string[][]> {
        const data = await this.loadSpace(space);

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

        traverse(data, 0, []);
        return results;

    }

    createWatchSocket(
        onmessage: (
            messages: ChangeMessage[]
        ) => void
    ): Promise<WatchHandle> {

        this.onmessage = onmessage;

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
}