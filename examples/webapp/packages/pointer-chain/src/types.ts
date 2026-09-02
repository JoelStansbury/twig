
export type Node = {
    feeders: string[];
    consumers: string[];
    type: "data" | "func";
};

export type Edge = {
    keyword: string;
};

export type ChangeMessage = {
    old: any;
    new: any;
    source: string;
    dest: string;
};