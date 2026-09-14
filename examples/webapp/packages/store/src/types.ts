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

export interface IStore {
    /**
     * Local representation of the store's data.
     */
    data: Record<string, any>;

    /**
     * Establish the connection to the backing store.
     */
    connect(): Promise<void>;

    /**
     * Subscribe to changes at a path.
     *
     * The callback is invoked when the value at the path, or a
     * descendant of the path, changes.
     */
    subscribe(
        path: string,
        callback: (value: any) => void
    ): Promise<void>;

    /**
     * Retrieve the value at an exact path.
     */
    get(path: string): Promise<any>;

    /**
     * Set the value at a path.
     */
    put(path: string, value: any): Promise<Response>;

    /**
     * Return the paths immediately available beneath a path.
     *
     * Unlike match(), peek() does not perform wildcard matching;
     * it is intended for navigating/inspecting the document.
     *
     * For example, peeking "/data/table" might return:
     *
     *     ["123",
     *      "456"]
     */
    peek(path: string): Promise<string[]>;

    /**
     * Find paths matching a wildcard path.
     *
     * Returns the individual path components for each match.
     * For example, matching "/data/table/*" might return:
     *
     *     [["123"],
     *      ["456"]]
     */
    match(wildpath: string): Promise<string[][]>;

    /**
     * Remove a previously registered subscription.
     */
    unsubscribe(
        path: string,
        callback: (msg: ChangeMessage) => void
    ): void;

    /**
     * Notify subscribers that a path has changed.
     *
     * This is useful when a change has occurred locally or outside
     * of the normal put() flow.
     */
    notify(path: string): void;

    /**
     * Dispatch one or more change messages to the appropriate
     * subscribers.
     */
    dispatch(
        messages: ChangeMessage[] | ChangeMessage
    ): void;
}