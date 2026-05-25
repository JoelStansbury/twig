import React, { useCallback, useMemo, useRef, useState } from "react";
import APIClient from './utils/client';
import SchemaEditor from "./components/schema-editor";
import { flattenJson } from "./utils/flatten";
import PrimitiveList from "./components/primitive-list";

const DEFAULT = {
  "properties": {
    "user": {
      "properties": {
        "profile": {
          "properties": {
            "age": {
              "type": "number"
            },
            "name": {
              "type": "string"
            }
          },
          "type": "object"
        }
      },
      "type": "object"
    }
  },
  "type": "object"
}

// const client = new APIClient();
const user = {
  "username": "TestUser",
  "password": "password"
};
const space = "TestSpace"
export default function App() {
  const [token, setToken] = useState<string | undefined>(undefined)
  const [text, setText] = useState<string | null>(null)
  const [entries, setEntries] = useState<any>({})

  const client = new APIClient(token)
  if (!token) {
    client.signup(user).then(()=>{
      client.authenticate(user).then((v) => {
        setToken(v)
        client.create_space(space).then(()=>{
          client.delete("", space).then(()=>{
            client.put("", space, DEFAULT).then(()=>{
              setEntries(flattenJson(DEFAULT))
              setText(JSON.stringify(DEFAULT, undefined, 2))
            })
          })
        });
      })
    });
  }

  const onPrimitiveChange = useCallback(
    (path:string, value:string) => {
      setEntries((old:any)=>{
        const newEntries = structuredClone(old);
        newEntries[path] = value;
        return newEntries;
      })
      try {
        client.put(path, space, JSON.parse(value)).then(()=>{
          client.get("", space).then(
            (resp)=>{
              setText(JSON.stringify(resp, undefined, 2))
            }
          )
        })
      } catch(error) {
        // console.log(error)
      }
    },
    [client]
  )

  const onTextChange = useCallback(
    (value:string) => {
      setText(value)
      try {
        const data = JSON.parse(value)
        client.delete("", space).then(
          () => {
            client.put("", space, data)
          }
        )
        setEntries(flattenJson(data))
      } catch (error) {
        // console.log(error)
      }
    },
    [client]
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

