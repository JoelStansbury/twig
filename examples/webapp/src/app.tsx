import React, { IframeHTMLAttributes, useCallback, useRef, useState } from "react";
import APIClient from './utils/client';


export default function App() {
  const client = new APIClient()
  const [username, setUsername] = useState<string|null>(null)
  const signup = useCallback(
    () => {
      const form = formRef.current as HTMLFormElement | null
      if (form) {
        const formData = new FormData(form)
        const data = {username:formData.get("username"),password:formData.get("password")}
        console.log(JSON.stringify(data))
        client.signup(data)
      }
    },
    []
  )
  const signin = useCallback(
    () => {
      const form = formRef.current as HTMLFormElement | null
      if (form) {
        const formData = new FormData(form)
        const data = {username:formData.get("username"),password:formData.get("password")}
        client.authenticate(data).then(()=>{setUsername(data.username as string)})
      }
    },
    []
  )
  const test = useCallback(
    async () => {
      await client.create_space({name:"mySpace"}).catch(console.log)
      await client.put("", "mySpace", {"this":{"is":{"the":["end",1,2,3,4,5]}}})
      client.get("/this/is/the", "mySpace").then(
        (response) => {
          response.json().then(console.log)
        }
      )
    },
    []
  )
  const formRef = useRef(null)
  return <div className="app">
    <form ref={formRef}>
      <label>Username: </label>
      <input type="text" name="username"></input>
      <br/>
      <label>Password: </label>
      <input type="password" name="password"></input>
      <br/>
    </form>
    <button onClick={signup}>Signup</button>
    <button onClick={signin}>Signin</button><br/>
    {username ? `logged in as ${username}` : "Not logged in" }<br/>
    <button onClick={test}>Test</button>
    </div>
}

