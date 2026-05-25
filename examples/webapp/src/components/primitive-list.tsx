import React from "react"

type Props = {
  entries: Record<string, string>

  onChange?: (
    path:string,
    value:string
  ) => void
}

export default function PrimitiveList({
  entries,
  onChange,
}: Props) {

  return (
    <div
      style={{
        overflow: "auto",
        height: "100%",
        width: "100%",
        background: "#181818",
        color: "white",
        padding: 12,
        boxSizing: "border-box",
        fontFamily: "sans-serif",
      }}
    >

      {
        Object.entries(entries).map(
          ([path, value]) => {

            return (
              <div
                key={path}
                style={{
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom:
                    "1px solid #333",
                }}
              >

                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: "#999",
                    marginBottom: 6,
                    wordBreak: "break-all",
                  }}
                >
                  {path}
                </div>

                <input
                  value={value}
                  onChange={(e) => {

                    onChange?.(
                      path,
                      e.target.value
                    )

                  }}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    padding: 8,
                    background: "#111",
                    color: "white",
                    border:
                      "1px solid #444",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    boxSizing: "border-box",
                  }}
                />

              </div>
            )
          }
        )
      }

    </div>
  )
}