export type ChangeMessage = {
    action: "insert" | "update" | "delete" | "subscribed" | "unsubscribed" | "rejected"
    path: string
    value?: any
    space: string
}
