const SERVER_URL = "http://localhost:8000"

export default class APIClient {
    private token: string | undefined
    constructor() {
        console.log("Initialize APIClient")
    }

    get headers() {
        return {
            "Authorization": `Bearer ${this.token}`
        }
    }

    async signup(data:any) {
        const params = new URLSearchParams(data);
        await fetch(
            `${SERVER_URL}/signup`,
            {
                method:"POST",
                body:params
            }
        )
    }

    async authenticate(data:any) {
        const params = new URLSearchParams(data);
        await fetch(
            `${SERVER_URL}/token`,
            {
                method:"POST",
                body:params
            }
        ).then(
            (response) => {
                response.json().then((obj)=>{
                    this.token = obj.access_token
                })
            }
        )
    }

    async _api(action: "PUT" | "GET" | "DELETE", path:string, space:string, value: any = undefined): Promise<Response> {
        const body = JSON.stringify({action, path, value:JSON.stringify(value)});
        return await fetch(
            `${SERVER_URL}/api?space=${space}`,
            {
                method:"POST",
                headers: {
                    ...this.headers,
                    'Content-Type': 'application/json',
                },
                body
            }
        )
    }

    async put(path:string, space:string, value: any): Promise<Response> {
        return await this._api("PUT", path, space, value)
    }

    async delete(path:string, space:string): Promise<Response> {
        return await this._api("DELETE", path, space)
    }
    
    async get(path:string, space:string): Promise<Response> {
        return await this._api("GET", path, space)
    }

    async create_space(name: string): Promise<Response> {
        return await fetch(
            `${SERVER_URL}/create`,
            {
                method:"POST",
                headers: {
                    ...this.headers,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({name})
            }
        )
    }

}
