// client/APIClient.ts

import { ChangeMessage, IClient, WatchHandle } from "../types";

interface APIClientParams {
    domain: string
    protocol: "http" | "https";
    ws_protocol: "ws" | "wss";
    token?: string
}

export class APIClient implements IClient {
    private token?: string;
    protected url: string;
    protected ws: string;

    constructor({domain, protocol="https", ws_protocol="wss", token}: APIClientParams) {
        this.token = token;
        this.url = `${protocol}://${domain}`
        this.ws = `${ws_protocol}://${domain}`
    }

    get ready() {
        return new Promise<boolean>(
            (resolve, reject) => resolve(typeof this.token === "string")
            );
    }

    private get headers() {
        return {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
        };
    }

    async signup(data: any): Promise<Response> {
        const params = new URLSearchParams(data);

        return fetch(`${this.url}/signup`, {
            method: "POST",
            body: params,
        });
    }

    async authenticate(data: any): Promise<string> {
        const params = new URLSearchParams(data);

        const response = await fetch(`${this.url}/token`, {
            method: "POST",
            body: params,
        });

        const value = await response.json();

        this.token = value.access_token;

        return value.access_token;
    }

    private async _api(
        action: "PUT" | "GET" | "DELETE" | "PEEK" | "MATCH",
        path: string,
        space: string,
        value?: any
    ): Promise<Response> {
        return fetch(`${this.url}/api`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
                action,
                path,
                value,
                space,
            }),
        });
    }

    put(
        path: string,
        space: string,
        value: any
    ): Promise<Response> {
        return this._api("PUT", path, space, value);
    }

    delete(
        path: string,
        space: string
    ): Promise<Response> {
        return this._api("DELETE", path, space);
    }

    async get(
        path: string,
        space: string
    ): Promise<any> {
        const response = await this._api(
            "GET",
            path,
            space
        );
        if (response.status == 200) {
            return response.json();
        } else if (response.status == 404) {
            console.error(response.json())
        }
    }

    async peek(
        path: string,
        space: string
    ): Promise<string[]> {
        const response = await this._api(
            "PEEK",
            path,
            space
        );
        if (response.status == 200) {
            return response.json();
        } else {
            console.error(response.json())
            return []
        }
    }

    async match(
        path: string,
        space: string
    ): Promise<string[][]> {
        const response = await this._api(
            "MATCH",
            path,
            space
        );
        if (response.status == 200) {
            return response.json();
        } else {
            console.error(response.json())
            return []
        }
    }

    create_space(name: string): Promise<Response> {
        return fetch(`${this.url}/create`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ name }),
        });
    }

    async createWatchSocket(
        onmessage: (message: ChangeMessage[]) => void
    ): Promise<WatchHandle> {

        const ws = new WebSocket(
            `${this.ws}/watch?token=${this.token}`
        );

        ws.onmessage = (event) => {
            onmessage(JSON.parse(event.data));
        };


        return new Promise(
            (resolve) => {
                ws!.onopen = () => {
                    resolve({
                        close() {
                            ws.close();
                        },
                        subscribe(space:string, path:string) {
                            ws.send(
                                JSON.stringify(
                                    {
                                        action: "subscribe",
                                        path,
                                        space
                                    }
                                )
                            )
                        },
                        unsubscribe(space:string, path:string) {
                            ws.send(
                                JSON.stringify(
                                    {
                                        action: "unsubscribe",
                                        path,
                                        space
                                    }
                                )
                            )
                        }
                    })
                }
            }
        )
        
    }
}