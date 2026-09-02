// client/types.ts

export interface ChangeMessage {
    action: "insert" | "update" | "delete" | "subscribed" | "unsubscribed" | "rejected";
    path: string;
    space: string;
    value?: any;
}

export interface WatchHandle {
    close(): void;
    subscribe(space:string, path:string): void;
    unsubscribe(space:string, path:string): void;
}

export interface IClient {
    readonly ready: Promise<boolean>;

    signup(data: any): Promise<Response>;

    authenticate(data: any): Promise<string>;

    put(path: string, space: string, value: any): Promise<Response>;

    get(path: string, space: string): Promise<any>;
    
    peek(path: string, space: string): Promise<string[]>;

    match(path: string, space: string): Promise<string[][]>;

    delete(path: string, space: string): Promise<Response>;

    create_space(name: string): Promise<Response>;

    createWatchSocket(
        onmessage: (message: ChangeMessage[]) => void
    ): Promise<WatchHandle>
}