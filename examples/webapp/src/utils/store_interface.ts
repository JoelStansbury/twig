import { DOMAIN } from "../constants";
import { flattenJson } from "./flatten";
import APIClient from "./store/client/APIClient";
import { IDataClient } from "./store/client/types";
import TwigStore from "./store/store";

const DEFAULT = {
  "settings": {
    "darkMode": false,
    "font": "calibri"
  }
}
const domain = DOMAIN
const protocol = "http"
const ws_protocol = "ws"

const user = {
  "username": "TestUser",
  "password": "password"
};
const space = "TestSpace"

export class StoreInterface {
    // This is an example interface which watches the entire space


    private client: IDataClient
    private store: TwigStore

    constructor () {
        this.client = new APIClient({domain, protocol, ws_protocol})
        // this.client = new IndexedDBClient()
        this.store = new TwigStore(this.client, space)
    }

    async initialize (onchange:(value:any)=>void) {
        await this.client.ready
        await this.client.signup(user)
        await this.client.authenticate(user)
        await this.client.create_space(space).catch(() => {})
        await this.store.connect()
        this.store.subscribe("", onchange)
    }

    async put(path:string, value:any) {
        return this.client.put(path, space, value)
    }

    async get(path:string) {
        return this.client.get(path, space)
    }

    async peek(path:string) {
        return this.client.peek(path, space)
    }

    async match(path:string) {
        return this.client.match(path, space)
    }

}