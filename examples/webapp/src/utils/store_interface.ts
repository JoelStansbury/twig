import { DOMAIN } from "../constants";
import { Store, types, client } from "@twig/store";

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


    private client: types.IClient
    public store: Store

    constructor () {
        this.client = new client.APIClient({domain, protocol, ws_protocol})
        // this.client = new client.IDBClient()
        this.store = new Store(this.client, space)
    }

    async initialize (onchange:(value:any)=>void) {
        await this.client.ready
        await this.client.signup(user)
        await this.client.authenticate(user)
        await this.client.create_space(space).catch(() => {})
        await this.store.connect()
        this.store.subscribe("", onchange)
    }

}