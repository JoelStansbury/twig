import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

export type DropPosition =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "center";

export type LayoutNode =
  | StackNode
  | SplitNode;

export type StackNode = {
  type: "stack";
  id: string;
  panels: string[];
  active?: string;
};

export type SplitNode = {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};

export type PanelDefinition = {
  id: string;
  title: string;
  content: ReactNode;
};


function stack(id: string, panel: string): StackNode {
  return {
    type: "stack",
    id,
    panels: [panel],
    active: panel,
  };
}


/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export class DockLayout {
  private root: LayoutNode | null = null;
  private listeners = new Set<() => void>();

  private splitCounter = 0;
  private stackCounter = 0;

  subscribe(listener: () => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getRoot() {
    return this.root;
  }

  /* ------------------------------------------------------------------------ */
  /* Panel lookup                                                             */
  /* ------------------------------------------------------------------------ */

  private findStack(
    node: LayoutNode | null,
    panel: string,
  ): StackNode | null {
    if (!node) return null;

    if (node.type === "stack") {
      return node.panels.includes(panel) ? node : null;
    }

    return (
      this.findStack(node.first, panel) ??
      this.findStack(node.second, panel)
    );
  }

  private findStackById(
    node: LayoutNode | null,
    id: string,
  ): StackNode | null {
    if (!node) return null;

    if (node.type === "stack") {
      return node.id === id ? node : null;
    }

    return (
      this.findStackById(node.first, id) ??
      this.findStackById(node.second, id)
    );
  }

  private containsPanel(panel: string) {
    return !!this.findStack(this.root, panel);
  }

  /* ------------------------------------------------------------------------ */
  /* Opening / closing                                                        */
  /* ------------------------------------------------------------------------ */

  open(panel: string) {
    if (this.containsPanel(panel)) {
      this.activate(panel);
      return;
    }

    if (!this.root) {
      this.root = stack(
        `stack-${this.stackCounter++}`,
        panel,
      );

      this.changed();
      return;
    }

    // By default, open as a tab in the first stack.
    const target = this.firstStack(this.root);

    target.panels.push(panel);
    target.active = panel;

    this.changed();
  }

  close(panel: string) {
    const result = this.removePanel(this.root, panel);

    if (!result) return;

    this.root = result.node;

    this.changed();
  }

  private removePanel(
    node: LayoutNode | null,
    panel: string,
  ): { node: LayoutNode | null } | null {
    if (!node) return null;

    if (node.type === "stack") {
      const index = node.panels.indexOf(panel);

      if (index < 0) return null;

      node.panels.splice(index, 1);

      if (node.active === panel) {
        node.active =
          node.panels[index] ??
          node.panels[index - 1] ??
          node.panels[0];
      }

      if (node.panels.length === 0) {
        return { node: null };
      }

      return { node };
    }

    const first = this.removePanel(node.first, panel);

    if (first) {

      if (!node.first) {
        return { node: node.second };
      } else {
        node.first = first.node!;
        return { node };
      }
    }

    const second = this.removePanel(node.second, panel);

    if (second) {
      if (!node.second) {
        return { node: node.first };
      } else {
        node.second = second.node!;
        return { node };

      }
    }

    return null;
  }

  /* ------------------------------------------------------------------------ */
  /* Tabs                                                                      */
  /* ------------------------------------------------------------------------ */

  tab(panel: string, target: string) {
    if (panel === target) return;

    const source = this.findStack(this.root, panel);
    const destination = this.findStack(this.root, target);

    if (!source || !destination) return;

    const index = source.panels.indexOf(panel);

    if (index >= 0) {
      source.panels.splice(index, 1);
    }

    destination.panels.push(panel);
    destination.active = panel;

    this.collapseEmptyStacks();

    this.changed();
  }

  activate(panel: string) {
    const dock = this.findStack(this.root, panel);

    if (!dock) return;

    dock.active = panel;

    this.changed();
  }

  /* ------------------------------------------------------------------------ */
  /* Moving                                                                    */
  /* ------------------------------------------------------------------------ */

  move(
    panel: string,
    options: {
      target: string;
      position: DropPosition;
      ratio?: number;
    },
  ) {
    if (options.position === "center") {
      this.tab(panel, options.target);
      return;
    }

    const source = this.findStack(this.root, panel);
    if (!source) return;

    const target = this.findStack(this.root, options.target);
    if (!target) return;

    // Remove the panel from its current stack.
    const index = source.panels.indexOf(panel);

    if (index < 0) return;

    source.panels.splice(index, 1);

    if (source.active === panel) {
      source.active =
        source.panels[index] ??
        source.panels[index - 1] ??
        source.panels[0];
    }

    const newStack = stack(
      `stack-${this.stackCounter++}`,
      panel,
    );

    const ratio = options.ratio ?? 0.5;

    this.root = this.replaceStack(
      this.root,
      target.id,
      newSplit(
        `split-${this.splitCounter++}`,
        options.position === "left" ||
          options.position === "right"
          ? "horizontal"
          : "vertical",
        ratio,
        options.position === "left" ||
          options.position === "top"
          ? newStack
          : target,
        options.position === "left" ||
          options.position === "top"
          ? target
          : newStack,
      ),
    );

    this.collapseEmptyStacks();

    this.changed();
  }

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                   */
  /* ------------------------------------------------------------------------ */

  private firstStack(node: LayoutNode): StackNode {
    if (node.type === "stack") return node;

    return this.firstStack(node.first);
  }

  private replaceStack(
    node: LayoutNode | null,
    stackId: string,
    replacement: LayoutNode,
  ): LayoutNode | null {
    if (!node) return null;

    if (node.type === "stack") {
      return node.id === stackId ? replacement : node;
    }

    node.first = this.replaceStack(
      node.first,
      stackId,
      replacement,
    )!;

    node.second = this.replaceStack(
      node.second,
      stackId,
      replacement,
    )!;

    return node;
  }

  private collapseEmptyStacks() {
    this.root = this.collapse(this.root);
  }

  private collapse(node: LayoutNode | null): LayoutNode | null {
    if (!node) return null;

    if (node.type === "stack") {
      return node.panels.length ? node : null;
    }

    node.first = this.collapse(node.first)!;
    node.second = this.collapse(node.second)!;

    if (!node.first) return node.second;
    if (!node.second) return node.first;

    return node;
  }
}


function newSplit(
  id: string,
  direction: "horizontal" | "vertical",
  ratio: number,
  first: LayoutNode,
  second: LayoutNode,
): SplitNode {
  return {
    type: "split",
    id,
    direction,
    ratio: Math.max(0.1, Math.min(0.9, ratio)),
    first,
    second,
  };
}


/* -------------------------------------------------------------------------- */
/* React component                                                             */
/* -------------------------------------------------------------------------- */

export function DockLayoutView(props: {
  layout: DockLayout;
  panels: Record<string, PanelDefinition>;
}) {
  const [, render] = useState(0);

  useEffect(() => {
    return props.layout.subscribe(() => {
      render(v => v + 1);
    });
  }, [props.layout]);

  const root = props.layout.getRoot();

  if (!root) {
    return null;
  }

  return (
    <div className="dock-layout">
      <LayoutNodeView
        node={root}
        layout={props.layout}
        panels={props.panels}
      />
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Layout rendering                                                            */
/* -------------------------------------------------------------------------- */

function LayoutNodeView(props: {
  node: LayoutNode;
  layout: DockLayout;
  panels: Record<string, PanelDefinition>;
}) {
  const { node } = props;

  if (node.type === "stack") {
    return (
      <DockStack
        node={node}
        layout={props.layout}
        panels={props.panels}
      />
    );
  }

  return (
    <SplitView
      node={node}
      layout={props.layout}
      panels={props.panels}
    />
  );
}


/* -------------------------------------------------------------------------- */
/* Split                                                                       */
/* -------------------------------------------------------------------------- */

function SplitView(props: {
  node: SplitNode;
  layout: DockLayout;
  panels: Record<string, PanelDefinition>;
}) {
  const { node } = props;

  const [ratio, setRatio] = useState(node.ratio);

  const containerRef = useRef<HTMLDivElement>(null);

  const dragging = useRef(false);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current) return;

      const element = containerRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();

      const value =
        node.direction === "horizontal"
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height;

      setRatio(
        Math.max(
          0.1,
          Math.min(0.9, value),
        ),
      );
    },
    [node.direction],
  );

  const stopDragging = useCallback(() => {
    dragging.current = false;

    window.removeEventListener(
      "pointermove",
      onPointerMove,
    );

    window.removeEventListener(
      "pointerup",
      stopDragging,
    );
  }, [onPointerMove]);

  const startDragging = useCallback(() => {
    dragging.current = true;

    window.addEventListener(
      "pointermove",
      onPointerMove,
    );

    window.addEventListener(
      "pointerup",
      stopDragging,
    );
  }, [onPointerMove, stopDragging]);

  useEffect(() => {
    return stopDragging;
  }, [stopDragging]);

  const horizontal =
    node.direction === "horizontal";

  return (
    <div
      ref={containerRef}
      className={
        horizontal
          ? "dock-split horizontal"
          : "dock-split vertical"
      }
    >
      <div
        className="dock-split-first"
        style={
          horizontal
            ? { width: `${ratio * 100}%` }
            : { height: `${ratio * 100}%` }
        }
      >
        <LayoutNodeView {...props} node={node.first} />
      </div>

      <div
        className={
          horizontal
            ? "dock-splitter horizontal"
            : "dock-splitter vertical"
        }
        onPointerDown={startDragging}
      />

      <div
        className="dock-split-second"
        style={
          horizontal
            ? { width: `${(1 - ratio) * 100}%` }
            : { height: `${(1 - ratio) * 100}%` }
        }
      >
        <LayoutNodeView {...props} node={node.second} />
      </div>
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Stack                                                                       */
/* -------------------------------------------------------------------------- */

function DockStack(props: {
  node: StackNode;
  layout: DockLayout;
  panels: Record<string, PanelDefinition>;
}) {
  const { node, layout, panels } = props;

  const active =
    node.active ?? node.panels[0];

  return (
    <div
      className="dock-stack"
      onDragOver={event => {
        if (
          event.dataTransfer.types.includes(
            "application/x-dock-panel",
          )
        ) {
          event.preventDefault();
        }
      }}
      onDrop={event => {
        event.preventDefault();

        const panel =
          event.dataTransfer.getData(
            "application/x-dock-panel",
          );

        if (!panel) return;

        layout.tab(
          panel,
          active,
        );
      }}
    >
      <div className="dock-tabs">
        {node.panels.map(panelId => {
          const panel = panels[panelId];

          if (!panel) return null;

          return (
            <div
              key={panelId}
              draggable
              className={
                panelId === active
                  ? "dock-tab active"
                  : "dock-tab"
              }
              onClick={() => {
                layout.activate(panelId);
              }}
              onDragStart={event => {
                event.dataTransfer.setData(
                  "application/x-dock-panel",
                  panelId,
                );
              }}
            >
              {panel.title}

              <button
                onClick={event => {
                  event.stopPropagation();
                  layout.close(panelId);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="dock-content">
        {active &&
          panels[active]?.content}
      </div>
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Example                                                                     */
/* -------------------------------------------------------------------------- */

export function Example() {
  const [layout] = useState(
    () => new DockLayout(),
  );

  const panels: Record<string, PanelDefinition> = {
    editor: {
      id: "editor",
      title: "Editor",
      content: (
        <div className="example-panel">
          Editor
        </div>
      ),
    },

    preview: {
      id: "preview",
      title: "Preview",
      content: (
        <div className="example-panel">
          Preview
        </div>
      ),
    },

    console: {
      id: "console",
      title: "Console",
      content: (
        <div className="example-panel">
          Console
        </div>
      ),
    },

    outline: {
      id: "outline",
      title: "Outline",
      content: (
        <div className="example-panel">
          Outline
        </div>
      ),
    },
  };

  useEffect(() => {
    layout.open("editor");

    layout.move("preview", {
      target: "editor",
      position: "center",
    });

    layout.move("console", {
      target: "editor",
      position: "bottom",
      ratio: 0.25,
    });

    layout.move("outline", {
      target: "editor",
      position: "right",
      ratio: 0.25,
    });
  }, [layout]);

  return (
    <DockLayoutView
      layout={layout}
      panels={panels}
    />
  );
}