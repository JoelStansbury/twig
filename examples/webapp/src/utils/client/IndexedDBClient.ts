import JSONPointer from "jsonpointer";
import {
    ChangeMessage,
    IDataClient,
    WatchHandle,
} from "./types";
import { getAncestorPaths, getPrimitives } from "../pointer_utils";




export default class IndexedDBClient
    implements IDataClient {

    private db!: IDBDatabase;

    private channel =
        new BroadcastChannel("twig");

    private token?: string;
    protected _ready: Promise<boolean>;

    constructor(token?: string) {
        this.token = token;
        this._ready = new Promise<boolean>((resolve, reject) => {
            this.init().then(()=>resolve(true))
        })
    }
    private onmessage?: (message: ChangeMessage) => void

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

    protected postMessage(message: ChangeMessage) {
        this.channel.postMessage(message)
        if (this.onmessage) {
            this.onmessage(message)
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

        const tx = this.db.transaction(
            "spaces",
            "readwrite"
        );

        tx.objectStore("spaces")
            .put({}, name);

        return new Promise((resolve, reject) => {
            tx.oncomplete = (ev) => {resolve(new Response())};
        })
    }

    private async loadSpace(
        space: string
    ) {

        const tx = this.db.transaction(
            "spaces"
        );

        return new Promise<any>(
            (resolve, reject) => {

                const request =
                    tx.objectStore("spaces")
                      .get(space);

                request.onsuccess = () =>
                    resolve(
                        request.result ?? {}
                    );

                request.onerror = () =>
                    reject(request.error);
            }
        );
    }

    private async saveSpace(
        space: string,
        value: any
    ) {

        const tx = this.db.transaction(
            "spaces",
            "readwrite"
        );

        return new Promise<void>(
            (resolve, reject) => {

                const request =
                    tx.objectStore("spaces")
                      .put(value, space);

                request.onsuccess = () =>
                    resolve();

                request.onerror = () =>
                    reject(request.error);
            }
        );
    }

    async put(
        path: string,
        space: string,
        value: any
    ): Promise<Response> {
        console.log("PUT", path, value)
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
            // console.log("CHECKING", k)
            if (newEntries[k] === undefined) {
                // console.log("  DELETE")
                messages.push({
                    action:"delete",
                    path: k,
                    space
                })
            } else {
                // console.log("  ", newEntries[k])
            }
        }
        for (const [k, v] of Object.entries(newEntries)) {
            if (Object.hasOwn(oldEntries, k)) {
                if (Array.isArray(newEntries[k]) && Array.isArray(oldEntries[k])) {
                    // pass
                } else if (typeof newEntries[k] === "object" && typeof oldEntries[k] === "object" && oldEntries[k] !== null) {
                    // pass    
                } else if (oldEntries[k] === newEntries[k]) {
                    // pass
                } else {
                    messages.push({
                        action:"update",
                        path: k,
                        space,
                        value:v
                    })
                }
            } else {
                messages.push({
                    action:"insert",
                    path: k,
                    space,
                    value:v
                })
            }
        }

        if (path === ""){
            await this.saveSpace(space, value)
        } else {
            JSONPointer.set(data, path, value);
            await this.saveSpace(space, data);
        }

        for (const message of messages) {
            this.postMessage(message);
        }

        return new Response();
    }

    async get(
        path: string,
        space: string
    ): Promise<any> {

        const data = await this.loadSpace(space);

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
            console.log("DELETE", deleted_path)
            messages.push({
                action:"delete",
                path: deleted_path,
                space
            })
        }

        await this.saveSpace(space, data);

        for (const message of messages) {
            this.postMessage(message);
        }

        return new Response();
    }

    createWatchSocket(
        onmessage: (
            message: ChangeMessage
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