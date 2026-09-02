import React, { useCallback, useEffect, useRef, useState } from "react";
import SchemaEditor from "./components/schema-editor";
import { flattenJson } from "./utils/flatten";
import { pointerUtils } from "@twig/store";
import PrimitiveList from "./components/primitive-list";
import { StoreInterface } from "./utils/store_interface";
import { Graph } from "@twig/pointer-chain";
// import { findDependents, formatString, run } from "./utils/calc";

export default function App() {
  const [text, setText] = useState<string>("{}")
  const [entries, setEntries] = useState<any>({})
  const storeRef = useRef<StoreInterface>(null)
  const graphRef = useRef<Graph>(null)

  useEffect(() => {
      storeRef.current = new StoreInterface()
      graphRef.current = new Graph(storeRef.current.store)

      const handleChange = (value: any)=>{
          setText(JSON.stringify(value, undefined, 2))
          setEntries(pointerUtils.getPrimitives(value.data, "/data"))
      }
      storeRef.current.initialize(handleChange).then(
        () => {graphRef.current!.initialize()}
      )
    }, [])


  const onPrimitiveChange = useCallback(
    async (path:string, value:string) => {
      setEntries((old:any)=>{
        const newEntries = structuredClone(old);
        newEntries[path] = value;
        return newEntries;
      })
      graphRef.current?.registerChange(path, JSON.parse(value))
    },
    [storeRef]
  )
  

  const onTextChange = useCallback(
    (value:string) => {
      setText(value)
      try {
        const data = JSON.parse(value)
        storeRef.current!.store.put("", data).then(
          ()=>{setEntries(pointerUtils.getPrimitives(data.data, "/data"))}
        )
      } catch (error) {}
    },
    [storeRef]
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

