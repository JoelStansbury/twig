const SERVER_URL = "http://localhost:8000"

export default class APIClient {
    private token: string | undefined
    constructor() {
        console.log("Initialize APIClient")
    }

    get headers() {
        return {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json",
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

    async put(path:string, space:string, value: any): Promise<Response> {
        const params = new URLSearchParams({path, space, value:JSON.stringify(value)});
        return await fetch(
            `${SERVER_URL}/?${params.toString()}`,
            {
                method:"PUT",
                headers: this.headers
            }
        )
    }

    async delete(path:string, space:string): Promise<Response> {
        const params = new URLSearchParams({path, space});
        return await fetch(
            `${SERVER_URL}/?${params.toString()}`,
            {
                method:"DELETE",
                headers: this.headers
            }
        )
    }
    
    async get(path:string, space:string): Promise<Response> {
        const params = new URLSearchParams({path, space});
        return await fetch(
            `${SERVER_URL}/?${params.toString()}`,
            {
                method:"GET",
                headers: this.headers
            }
        )
    }

    async create_space(space_data: any): Promise<Response> {
        const params = new URLSearchParams(space_data);
        console.log(params.toString())
        return await fetch(
            `${SERVER_URL}/create?${params.toString()}`,
            {
                method:"PUT",
                headers: this.headers
            }
        )
    }

}
