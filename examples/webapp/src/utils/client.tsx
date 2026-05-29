const SERVER_URL = "http://localhost:8000"

export default class APIClient {
    private token: string | undefined
    constructor(token?:string) {
        this.token = token
    }
    get ready() {
        return typeof this.token === "string"
    }

    get headers() {
        return {
            "Authorization": `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        }
    }

    async signup(data:any) {
        const params = new URLSearchParams(data);
        return await fetch(
            `${SERVER_URL}/signup`,
            {
                method:"POST",
                body:params
            }
        )
    }

    async authenticate(data:any): Promise<string> {
        const params = new URLSearchParams(data);
        return await fetch(
            `${SERVER_URL}/token`,
            {
                method:"POST",
                body:params
            }
        ).then(
            async (obj:Response)=>{
                return await obj.json().then((value)=>{
                    this.token = value.access_token
                    return value.access_token
                })
            }
        )
    }

    async _api(action: "PUT" | "GET" | "DELETE", path:string, space:string, value: any = undefined): Promise<Response> {
        const body = JSON.stringify({action, path, value:value});
        console.log(action, `"${path}"`, value)
        return await fetch(
            `${SERVER_URL}/api?space=${space}`,
            {
                method:"POST",
                headers: this.headers,
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
    
    async get(path:string, space:string): Promise<any> {
        return await this._api("GET", path, space).then((response) => {
            return response.json()
        });
    }

    async create_space(name: string): Promise<Response> {
        return await fetch(
            `${SERVER_URL}/create`,
            {
                method:"POST",
                headers: this.headers,
                body: JSON.stringify({name})
            }
        )
    }

}
