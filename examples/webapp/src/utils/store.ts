import { IDataClient, ChangeMessage, WatchHandle } from "./client/types";
import { getAncestorPaths, makeAncestors } from "./pointer_utils"
import JsonPointer from "jsonpointer";

export default class TwigStore {
    private client: IDataClient
    private space: string
    private websocket?: WatchHandle
    private listeners = new Map<string,Set<(msg:any)=>void>>()
    data: Record<string, any> = {}

    constructor(client: IDataClient, space: string) {
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
                    makeAncestors(this.data, path)
                    this.data[path] = value
                    callback(value)
                }
            )
        } else {
            this.listeners.get(path)!.add(callback)
            callback(this.data[path])
        }
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

            const parentValue = this.data[parent]

            for (const cb of callbacks) {
                console.log(this.data, this.listeners)
                console.log("NOTIFY", parent, parentValue)
                cb(parentValue)
            }
        }
    }

    dispatch(messeges: ChangeMessage[] | ChangeMessage) {
        if (!Array.isArray(messeges)) {
            return
        }
        const notifications: Set<string> = new Set()
        for (const msg of messeges) {
            this._dispatch(msg).forEach((path) => {notifications.add(path)})
        }
        for (const path of notifications) {
            this.notify(path)
        }
    }

    _delete(path:string) {
        console.log("DELETE", path)
        if (this.data[path] !== undefined) {
            delete this.data[path]
        }

        const ancestors = getAncestorPaths(path)
        const parts = path.split("/")
        const leaf = parts[parts.length-1]
        const parentPath = parts.slice(0,-1).join("/")
        for (const ancestor of ancestors) {
            const ancestorData = this.data[ancestor]
            if (ancestorData === undefined) {
                continue
            }
            const rel_parentPath = parentPath.replace(ancestor, "")
            console.log("Deleting", leaf, "from", ancestorData)
            delete JsonPointer.get(ancestorData, rel_parentPath)[leaf]
        }
    }
    _set(path:string, value:any) {
        if (this.data[path] !== undefined) {
            delete this.data[path]
        }

        const ancestors = getAncestorPaths(path)
        for (const ancestor of ancestors) {
            const ancestorData = this.data[ancestor]
            if (ancestorData === undefined) {
                continue
            }
            const rel_path = path.replace(ancestor, "")
            JsonPointer.set(ancestorData, rel_path, value)
        }
    }

    _dispatch(msg: ChangeMessage): Set<string> {
        const {path, value} = msg
        const currentValue = this.data[path]
        const notifications: Set<string> = new Set()
        if (msg.action === "unsubscribed" ) {return notifications}
        if (msg.action === "subscribed" ) {return notifications}
        if (msg.action === "rejected" ) {return notifications}
        if (msg.action === "delete") {
            this._delete(path)
            notifications.add(path)
        } else {
            if (Array.isArray(value) && Array.isArray(currentValue)) {return notifications}
            if (typeof value === "object" && typeof currentValue === "object" && currentValue !== null) {return notifications}
            if (currentValue === value) {return notifications}
        }
        this._set(path, msg.value)
        notifications.add(path)
        return notifications
    }
}