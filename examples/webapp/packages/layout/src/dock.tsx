import React, {ReactElement, ReactNode} from "react"
import "./style.css";
export function Dock(props: {children?: ReactNode}) {
    return <div className="dock">{props.children}</div>
}
