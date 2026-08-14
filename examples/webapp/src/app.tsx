import React, { useCallback, useEffect, useRef, useState } from "react";
import SchemaEditor from "./components/schema-editor";
import { flattenJson } from "./utils/flatten";
import PrimitiveList from "./components/primitive-list";
import { StoreInterface } from "./utils/store_interface";
import { findDependents, formatString, run } from "./utils/calc";

export default function App() {
  const [text, setText] = useState<string>("{}")
  const [entries, setEntries] = useState<any>({})
  const storeRef = useRef<StoreInterface>(null)

  useEffect(() => {
      storeRef.current = new StoreInterface()
      const handleChange = (value: any)=>{
          setText(JSON.stringify(value, undefined, 2))
          setEntries(flattenJson(value))
      }
      storeRef.current.initialize(handleChange)
    }, [])

  const onPrimitiveChange = useCallback(
    async (path:string, value:string) => {
      setEntries((old:any)=>{
        const newEntries = structuredClone(old);
        newEntries[path] = value;
        return newEntries;
      })
      storeRef.current!.put(path, JSON.parse(value))
      const chain = await storeRef.current!.get("/calc")
      for (const {key, args} of findDependents({path, chain})) {
        const {path, func} = await storeRef.current!.get(`/functions/${key}`)
        const target = formatString(path, args)
        const value2 = await run(func, args, storeRef.current!)
        onPrimitiveChange(target, value2)
      }
    },
    [storeRef]
  )

  const onTextChange = useCallback(
    (value:string) => {
      setText(value)
      try {
        const data = JSON.parse(value)
        storeRef.current!.put("", data).then(
          ()=>{setEntries(flattenJson(data))}
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

