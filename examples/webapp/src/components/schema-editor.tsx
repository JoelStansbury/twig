import React from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useCallback, useEffect } from "react";




type Props = {
  value: string
  onChange: (value:string)=>void
}

export default function SchemaEditor(props: Props) {
  const {value, onChange} = props;
  const monaco = useMonaco();
  useEffect(() => {
    if (!monaco) return;

    monaco.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: true,
        schemas: [],
      });
    }, [monaco]);

  const callback = useCallback(
    (v?:string) => {onChange(v || "")},
    []
  )
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        border: "1px solid #333",
      }}
    >
      <Editor
        height="100%"
        defaultLanguage="json"
        value={value}
        onChange={callback}
        theme="vs-dark"
        options={{
          minimap: {
            enabled: false,
          },
          fontSize: 14,
          wordWrap: "on",
          automaticLayout: true,
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </div>
  );
}