import { ChangeMessage } from "../types"
import APIClient from "./client";
import { getAncestorPaths } from "./pointer_utils"
import JsonPointer from "jsonpointer";

export default class TwigStore {
    private client: APIClient
    private websocket?: WebSocket
    private listeners = new Map<string,Set<(msg:any)=>void>>()
    data = new Map<string, any>()

    constructor(client: APIClient) {
        this.client = client
    }

    async connect() {
        this.websocket = this.client.createWatchSocket(this.dispatch.bind(this))
        return new Promise(
            (resolve, reject) => {
                this.websocket!.onopen = () => {
                    resolve(this.websocket)
                }
            }
        )
    }


    async subscribe(path: string, space: string, callback: (msg:ChangeMessage)=>void) {
        if (!this.listeners.has(`${space}-${path}`)) {

            this.listeners.set(`${space}-${path}`, new Set([callback]))
            this.websocket?.send(
                JSON.stringify({
                    action: "subscribe",
                    path,
                    space
                })
            )
            await this.client.get(path, space).then(
                (value: any) => {
                    this.data.set(`${space}-${path}`, value)
                    callback(value)
                }
            )
        } else {
            this.listeners.get(`${space}-${path}`)!.add(callback)
            callback(this.data.get(`${space}-${path}`))
        }
    }

    unsubscribe(path: string, space: string, callback: (msg:ChangeMessage)=>void) {
        const listeners = this.listeners.get(`${space}-${path}`)

        if (!listeners) {
            return
        }

        listeners.delete(callback)

        if (listeners.size === 0) {

            this.listeners.delete(`${space}-${path}`)
            this.data.delete(`${space}-${path}`)

            this.websocket?.send(
                JSON.stringify({
                    action: "unsubscribe",
                    path,
                })
            )

        }

    }

    notify(space: string, path:string, value: any) {
        const ancestors = getAncestorPaths(path)
        for (const parent of ancestors) {
            const callbacks = this.listeners.get(`${space}-${parent}`)

            if (!callbacks) {
                continue
            }

            const parentValue = this.data.get(`${space}-${parent}`)

            const rel_path = path.replace(parent, "")
            if (rel_path) {
                JsonPointer.set(
                    parentValue, 
                    rel_path, 
                    value
                )
            } else {
                this.data.set(`${space}-${path}`, value)
            }

            for (const cb of callbacks) {
                cb(parentValue)
            }
        }
    }

    dispatch(msg: ChangeMessage) {
        const {path, space, value} = msg
        const currentValue = this.data.get(`${space}-${path}`)
        if (msg.action === "unsubscribed" ) {return}
        if (msg.action === "subscribed" ) {return}
        if (msg.action === "rejected" ) {return}
        // NOTE: This requires notifications to be received in the correct order, 
        // which probably can not be garunteed

        if (Array.isArray(value) && Array.isArray(currentValue)) {return}
        if (typeof value === "object" && typeof currentValue === "object" && currentValue !== null) {return}
        if (currentValue === value) {return}


        if (msg.action === "delete") {
            this.notify(space, path, undefined)
        } else {
            this.notify(space, path, value)
        }
    }
}