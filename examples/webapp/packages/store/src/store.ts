import JSONPointer from "jsonpointer";
import { IClient, ChangeMessage, WatchHandle } from "./types";
import { fromParts, getAncestorPaths, getParts, makeAncestors } from "./pointer_utils"
import JsonPointer from "jsonpointer";

export class Store {
    private client: IClient
    private space: string
    private websocket?: WatchHandle
    private listeners = new Map<string,Set<(msg:any)=>void>>()
    data: Record<string, any> = {}

    constructor(client: IClient, space: string) {
        this.client = client
        this.space = space
    }

    async connect() {
        this.websocket = await this.client.createWatchSocket(this.dispatch.bind(this))
    }

    async subscribe(path: string, callback: (value:any)=>void) {
        
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set([callback]))
            this.websocket?.subscribe(this.space, path)
            await this.client.get(path, this.space).then(
                (value: any) => {
                    if (path) {
                        makeAncestors(this.data, path)
                        JSONPointer.set(this.data, path, value)
                    } else {
                        this.data = value
                    }
                    callback(value)
                }
            )
        } else {
            this.listeners.get(path)!.add(callback)
            callback(JsonPointer.get(this.data, path))
        }
    }

    async get(path: string) {
        return await this.client.get(path, this.space)
    }

    async put(path:string, value:any) {
        return this.client.put(path, this.space, value)
    }

    async peek(path:string) {
        return this.client.peek(path, this.space)
    }

    async match(wildpath:string) {
        return this.client.match(wildpath, this.space)
    }

    unsubscribe(path: string, callback: (msg:ChangeMessage)=>void) {
        const listeners = this.listeners.get(path)

        if (!listeners) {
            return
        }

        listeners.delete(callback)

        if (listeners.size === 0) {

            this.listeners.delete(path)
            this.data.delete(path)

            this.websocket?.unsubscribe(this.space, path)

        }

    }

    notify(path:string) {
        const ancestors = getAncestorPaths(path)
        for (const parent of ancestors) {
            const callbacks = this.listeners.get(parent)

            if (!callbacks) {
                continue
            }

            const parentValue = JsonPointer.get(this.data, parent)

            for (const cb of callbacks) {
                // console.log(this.data, this.listeners)
                // console.log("NOTIFY", parent, parentValue)
                cb(parentValue)
            }
        }
    }

    dispatch(messeges: ChangeMessage[] | ChangeMessage) {
        if (!Array.isArray(messeges)) {
            return
        }
        const notifications: Set<string | undefined> = new Set()
        for (const msg of messeges) {
            notifications.add(this._dispatch(msg))
            
        }
        for (const path of notifications) {
            if (path !== undefined) {this.notify(path)}
        }
    }

    _delete(path:string) {
        const parts = getParts(path)
        let stem = parts[parts.length-1]
        const parentPath = fromParts(parts.slice(0,-1))
        if (parentPath === "") {
            delete this.data[stem]
        } else {
            const parent = JsonPointer.get(this.data, parentPath)
            delete parent[stem]
            if (Object.keys(parent).length === 0) {
                this._delete(parentPath)
            }
        }
    }

    _set(path:string, value:any) {
        const currentValue = JsonPointer.get(this.data, path)
        if (currentValue === value) {return}
        if (currentValue === undefined) {
            const toBuild: string[] = []
            for (const ancestor of getAncestorPaths(path, false, false).reverse()) {
                if (JsonPointer.get(this.data, ancestor) !== undefined) {break}
                toBuild.push(ancestor)
            }
            toBuild.reverse().map((p)=>{
                // console.log("  CREATE", p, "->", "{}")
                JsonPointer.set(this.data, p, {})
            })

        }
        // console.log("  FINALLY", path, "->", value)
        JsonPointer.set(this.data, path, value)
    }

    _dispatch(msg: ChangeMessage): string | undefined {
        const {path, value} = msg
        if (msg.action === "unsubscribed" ) {return}
        if (msg.action === "subscribed" ) {return}
        if (msg.action === "rejected" ) {return}
        // console.log(msg)
        // console.log("  BEFORE", this.data)
        if (msg.action === "delete") {
            this._delete(path)
            return path
        }
        this._set(path, value)
        // console.log("  AFTER", this.data)
        return path
    }
}