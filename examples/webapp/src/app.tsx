import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import APIClient from './utils/client/APIClient';
import IndexedDBClient from './utils/client/IndexedDBClient'
import SchemaEditor from "./components/schema-editor";
import { flattenJson } from "./utils/flatten";
import PrimitiveList from "./components/primitive-list";
import TwigStore from "./utils/store";
import { DOMAIN } from "./constants";
import { IDataClient } from "./utils/client/types";

const DEFAULT = {
  "settings": {
    "darkMode": false,
    "font": "calibri"
  }
}
const domain = DOMAIN
const protocol = "http"
const ws_protocol = "ws"

const user = {
  "username": "TestUser",
  "password": "password"
};
const space = "TestSpace"
export default function App() {
  const [text, setText] = useState<string | null>(JSON.stringify(DEFAULT, undefined, 2))
  const [entries, setEntries] = useState<any>(flattenJson(DEFAULT))

  const clientRef = useRef<IDataClient>(null)

  const storeRef = useRef<TwigStore>(null)

  useEffect(() => {
        async function init() {
            const client = new APIClient({domain, protocol, ws_protocol})
            // const client = new IndexedDBClient()
            const ready = await client.ready
            if (!ready) {
              console.error("Not Ready")
            }
            clientRef.current = client

            await client.signup(user)
            await client.authenticate(user)
            await client.create_space(space).catch(() => {})

            const store = new TwigStore(client, space)
            storeRef.current = store
            await store.connect()
            store.subscribe(
              "",
              (value: any)=>{
                setText(JSON.stringify(value, undefined, 2))
                setEntries(flattenJson(value))
              }
            )
          
        }
        init()
    }, [])

  const onPrimitiveChange = useCallback(
    async (path:string, value:string) => {
      setEntries((old:any)=>{
        const newEntries = structuredClone(old);
        newEntries[path] = value;
        return newEntries;
      })
      try {
        await clientRef.current!.put(path, space, JSON.parse(value))
      } catch(error) {
      }
    },
    [clientRef]
  )

  const onTextChange = useCallback(
    (value:string) => {
      setText(value)
      try {
        const data = JSON.parse(value)
        clientRef.current!.put("", space, data).then(
          ()=>{setEntries(flattenJson(data))}
        )
      } catch (error) {
      }
    },
    [clientRef]
  )
  
  return <div className="app">
    <div
      style={{
        height:"100%",
        display: "flex",
        flexDirection: "row"
      }}
    >
      <SchemaEditor value={text || ""} onChange={onTextChange}/>
      <PrimitiveList entries={entries} onChange={onPrimitiveChange}/>
    </div>
    </div>
}

