import { debounce } from "@twig/utils";
import React from "react";
import { JSX, ReactNode, useCallback, useRef, useState } from "react";
import "./style.css";

const REFRESH_RATE = 4;

type onDrag = (offsetX: number, offsetY: number) => void

const sum = (x:number[]): number => {
  let ret = 0
  for (const el of x) {
    ret = ret + el
  }
  return ret
}

const DragBar = ({ onChange }: {onChange: onDrag}) => {
  const isDragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    onChange(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="drag-bar-horizontal-display">
      <div
        className="drag-bar-horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        // Ensures touch devices and mice work seamlessly
        style={{ touchAction: 'none' }} 
      ></div>
    </div>
  );
};


export const HSplit = (props: {children: ReactNode, position?: number[], key: string}) => {
  const children = React.Children.toArray(props.children);
  if (children.length == 1) {return children[0]}
  const step = 100 / (children.length)
  const defaultPos = []
  for (let i=0; i<children.length; i+=1) {
    defaultPos.push(step)
  }
  const [pos, setPos] = useState(props.position || defaultPos,);
  const ref = useRef(null);

  const onchange = useCallback(
    debounce((index:number, offsetX: number, _: number) => {
      if (ref.current && offsetX !== 0) {
        const el = ref.current as HTMLDivElement;
        const bbox = el.getBoundingClientRect();
        const loc = 100 * (offsetX - bbox.x) / bbox.width;
        setPos(
          (oldValue) => {
            let lower: number
            let upper: number
            if (index === 0) {
              lower = 0
            } else {
              lower = sum(oldValue.slice(0,index))
            }
            if (index === oldValue.length - 2) {
              upper = 99.5
            } else {
              upper = lower + oldValue[index] + oldValue[index + 1]
            }
            const total = upper - lower
            const boundedPos = Math.max(lower, Math.min(upper, loc))
            const r = (boundedPos - lower) / total
            const newValue = structuredClone(oldValue)
            newValue[index] = total * r
            newValue[index+1] = total * (1-r)
            return newValue
          }
        )
      }
    }, REFRESH_RATE),
    [ref],
  );
  const innerContent = []
  let i = 0
  for (const child of children) {
    innerContent.push(
      <div
        key={`${props.key}-child-${i}`}
        className="grid-div-row-child-container"
        style={{width: `${pos[i]}%`}}>{child}</div>)
    if (i < children.length-1) {
      innerContent.push(<DragBar key={`${props.key}-bar-${i}`} onChange={onchange.bind(null, i)}></DragBar>)
      i = i + 1
    }
  }
  return (
    <div className={`grid-div-row`} ref={ref}>
      {innerContent}
    </div>
  );
};
