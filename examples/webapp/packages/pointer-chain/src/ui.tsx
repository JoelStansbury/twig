import { pointerUtils } from "@twig/utils";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { types } from "@twig/store";



/* ============================================================================
 * Calculation definition
 * ========================================================================== */

export interface CalculationDefinition {
    name: string;
    generator: GeneratorDefinition;
    variables: VariableDefinition[];
    template: string;
    output: string;
}

export interface GeneratorDefinition {
    /**
     * Empty variable/path means "execute once".
     *
     * Otherwise this is effectively:
     *
     *     [variable, wildcardPath]
     */
    variable: string;
    path: string;
}

export interface VariableDefinition {
    name: string;
    path: string;
}

/* ============================================================================
 * Logging
 * ========================================================================== */

const log = {
    editor: (...args: any[]) =>
        console.debug("[CalculationEditor]", ...args),

    path: (...args: any[]) =>
        console.debug("[CalculationEditor:Path]", ...args),

    store: (...args: any[]) =>
        console.debug("[CalculationEditor:Store]", ...args),

    serialize: (...args: any[]) =>
        console.debug("[CalculationEditor:Serialize]", ...args),

    error: (...args: any[]) =>
        console.error("[CalculationEditor]", ...args),
};

/* ============================================================================
 * Path utilities
 *
 * IMPORTANT:
 *
 *     ""      = root
 *     "/data" = property "data" beneath root
 *
 * Therefore:
 *
 *     peek("")
 *
 * returns root nodes.
 *
 *     peek("/")
 *
 * refers to the children of the value stored at the path represented by "/".
 *
 * We don't use "/" as the root sentinel.
 * ========================================================================== */


function joinPath(parts: string[]): string {
    if (parts.length === 0) {
        return "";
    }

    return "/" + parts.join("/");
}

function appendPath(path: string, segment: string): string {
    return `${path}/${segment}`;
}

function pathContainsVariable(path: string): boolean {
    return "*" in pointerUtils.getParts(path);
}


function replacePathVariables(
    path: string,
    values: Record<string, any>
): string {
    return path.replace(
        /\{\{\s*([^}]+?)\s*\}\}/g,
        (_, name: string) => {
            const value = values[name.trim()];

            if (value === undefined || value === null) {
                return "";
            }

            return String(value);
        }
    );
}

/* ============================================================================
 * Default calculation
 * ========================================================================== */

export function createDefaultCalculation(): CalculationDefinition {
    return {
        name: "sum",

        generator: {
            variable: "id",
            path: "/data/table1/*",
        },

        variables: [
            {
                name: "a",
                path: "/data/table1/{{id}}/a",
            },
            {
                name: "b",
                path: "/data/table1/{{id}}/b",
            },
        ],

        template: "{{ a + b }}",

        output: "/data/table1/{{id}}/sum",
    };
}

/* ============================================================================
 * Generic UI primitives
 * ========================================================================== */

const styles = `
.calculation-editor {
    font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

    color: #222;
    width: 100%;
    max-width: 1000px;
    box-sizing: border-box;
}

.calculation-editor *,
.calculation-editor *::before,
.calculation-editor *::after {
    box-sizing: border-box;
}

.ce-section {
    border: 1px solid #ddd;
    border-radius: 8px;
    margin-bottom: 16px;
    overflow: hidden;
    background: white;
}

.ce-section-header {
    padding: 12px 16px;
    background: #f7f7f7;
    border-bottom: 1px solid #ddd;
    font-weight: 600;
}

.ce-section-body {
    padding: 16px;
}

.ce-row {
    display: flex;
    gap: 10px;
    align-items: center;
}

.ce-column {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.ce-grow {
    flex: 1;
}

.ce-label {
    font-size: 12px;
    font-weight: 600;
    color: #555;
}

.ce-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background: white;
    font: inherit;
}

.ce-input:focus {
    outline: none;
    border-color: #777;
}

.ce-button {
    border: 1px solid #ccc;
    background: white;
    border-radius: 5px;
    padding: 7px 11px;
    cursor: pointer;
    font: inherit;
}

.ce-button:hover {
    background: #f4f4f4;
}

.ce-button.primary {
    background: #222;
    color: white;
    border-color: #222;
}

.ce-button.danger {
    color: #a22;
}

.ce-button.small {
    padding: 4px 8px;
    font-size: 12px;
}

.ce-radio-row {
    display: flex;
    gap: 20px;
    margin-bottom: 14px;
}

.ce-radio {
    display: flex;
    gap: 6px;
    align-items: center;
}

.ce-variable {
    border: 1px solid #ddd;
    border-radius: 7px;
    padding: 12px;
    margin-bottom: 10px;
}

.ce-variable-name {
    width: 140px;
}

.ce-path-picker {
    position: absolute;
    flex: 1;
}

.ce-path-input {
    display: flex;
    gap: 6px;
}

.ce-path-input input {
    flex: 1;
}

.ce-picker {
    position: absolute;
    z-index: 100;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    min-width: 360px;
    max-height: 350px;
    overflow: auto;
    border: 1px solid #ccc;
    border-radius: 7px;
    background: white;
    box-shadow: 0 8px 30px rgba(0,0,0,.15);
}

.ce-picker-path {
    padding: 8px 10px;
    border-bottom: 1px solid #eee;
    font-family: monospace;
    font-size: 12px;
    color: #666;
    background: #fafafa;
}

.ce-picker-item {
    padding: 8px 10px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 10px;
}

.ce-picker-item:hover {
    background: #f2f2f2;
}

.ce-picker-name {
    font-family: monospace;
}

.ce-picker-value {
    color: #888;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ce-picker-footer {
    padding: 8px;
    border-top: 1px solid #eee;
}

.ce-template {
    width: 100%;
    min-height: 130px;
    resize: vertical;
    font-family: monospace;
    font-size: 14px;
    line-height: 1.5;
}

.ce-variable-help {
    margin-top: 8px;
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
}

.ce-variable-chip {
    font-family: monospace;
    font-size: 12px;
    padding: 3px 7px;
    background: #eee;
    border-radius: 4px;
    cursor: pointer;
}

.ce-debug {
    background: #1e1e1e;
    color: #ddd;
    padding: 14px;
    border-radius: 7px;
    overflow: auto;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
}

.ce-muted {
    color: #777;
    font-size: 13px;
}

.ce-error {
    color: #a22;
    font-size: 13px;
}

.ce-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
`;

function StyleSheet() {
    return <style>{styles}</style>;
}

/* ============================================================================
 * PathPicker
 * ========================================================================== */

interface PathPickerProps {
    store: types.IStore;

    value: string;

    variables?: string[];

    allowWildcard?: boolean;

    onChange: (path: string) => void;
}

export function PathPicker({
    store,
    value,
    variables = [],
    allowWildcard = false,
    onChange,
}: PathPickerProps) {
    const [open, setOpen] = useState(false);
    const [navigationPath, setNavigationPath] = useState("");
    const [children, setChildren] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();

    const containerRef = useRef<HTMLDivElement>(null);

    const load = useCallback(
        async (path: string) => {
            setLoading(true);
            setError(undefined);

            try {
                log.path("peek", path);

                /*
                 * The important root behavior:
                 *
                 * peek("") -> root nodes
                 */
                const result = await store.peek(path);

                setChildren(result || []);
                setNavigationPath(path);
            } catch (err) {
                log.error("Path peek failed", path, err);
                setError(String(err));
                setChildren([]);
            } finally {
                setLoading(false);
            }
        },
        [store]
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        void load(navigationPath);
    }, [open]); // intentionally don't reload for every navigationPath change

    useEffect(() => {
        const listener = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(
                    event.target as Node
                )
            ) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", listener);

        return () => {
            document.removeEventListener("mousedown", listener);
        };
    }, []);

    const selectChild = async (child: string) => {
        if (child === "*") {
            if (!allowWildcard) {
                return;
            }

            const wildcardPath = appendPath(
                navigationPath,
                "*"
            );

            onChange(wildcardPath);
            setOpen(false);
            return;
        }

        const nextPath = appendPath(
            navigationPath,
            child
        );

        /*
         * Selecting a node sets the actual path.
         * The user can then continue navigating into it.
         */
        onChange(nextPath);

        await load(nextPath);
    };

    const navigateParent = async () => {
        const parts = pointerUtils.getParts(navigationPath);

        parts.pop();

        const parent = joinPath(parts);

        await load(parent);
    };

    const selectVariable = (variable: string) => {
        const token = `{{${variable}}}`;

        onChange(
            value.length > 0
                ? `${value}${token}`
                : token
        );
    };

    const showValue = async (path: string) => {
        try {
            return await store.get(path);
        } catch {
            return undefined;
        }
    };

    return (
        <div
            ref={containerRef}
            className="ce-path-picker"
        >
            <div className="ce-path-input">
                <input
                    className="ce-input"
                    value={value}
                    onChange={(e) =>
                        onChange(e.target.value)
                    }
                    onFocus={() => {
                        setOpen(true);

                        /*
                         * Start browsing from the current
                         * concrete path if possible.
                         *
                         * For a path containing variables,
                         * fall back to root.
                         */
                        const variablesInPath =
                            pathContainsVariable(value);

                        const start =
                            variablesInPath
                                ? ""
                                : value;

                        void load(start);
                    }}
                    placeholder="/data/..."
                />

                <button
                    type="button"
                    className="ce-button"
                    onClick={() => {
                        setOpen((current) => {
                            const next = !current;

                            if (next) {
                                void load(
                                    pathContainsVariable(value)
                                        ? ""
                                        : value
                                );
                            }

                            return next;
                        });
                    }}
                >
                    Browse
                </button>
            </div>

            {open && (
                <div className="ce-picker">
                    <div className="ce-picker-path">
                        {navigationPath || "<root>"}
                    </div>

                    {navigationPath && (
                        <div
                            className="ce-picker-item"
                            onClick={() => {
                                void navigateParent();
                            }}
                        >
                            <span className="ce-picker-name">
                                ..
                            </span>
                        </div>
                    )}

                    {loading && (
                        <div className="ce-picker-item">
                            Loading...
                        </div>
                    )}

                    {error && (
                        <div className="ce-picker-item ce-error">
                            {error}
                        </div>
                    )}

                    {!loading &&
                        !error &&
                        children.map((child) => (
                            <PathItem
                                key={child}
                                name={child}
                                parentPath={
                                    navigationPath
                                }
                                onSelect={() =>
                                    void selectChild(
                                        child
                                    )
                                }
                                getValue={showValue}
                            />
                        ))}

                    {!loading &&
                        !error &&
                        children.length === 0 && (
                            <div className="ce-picker-item ce-muted">
                                No children
                            </div>
                        )}

                    {allowWildcard && (
                        <div
                            className="ce-picker-item"
                            onClick={() =>
                                void selectChild("*")
                            }
                        >
                            <span className="ce-picker-name">
                                *
                            </span>

                            <span className="ce-picker-value">
                                wildcard
                            </span>
                        </div>
                    )}

                    {variables.length > 0 && (
                        <div className="ce-picker-footer">
                            <div className="ce-label">
                                Insert variable
                            </div>

                            <div className="ce-variable-help">
                                {variables.map(
                                    (variable) => (
                                        <span
                                            key={variable}
                                            className="ce-variable-chip"
                                            onClick={() =>
                                                selectVariable(
                                                    variable
                                                )
                                            }
                                        >
                                            {"{{"}
                                            {variable}
                                            {"}}"}
                                        </span>
                                    )
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface PathItemProps {
    name: string;
    parentPath: string;
    onSelect: () => void;
    getValue: (
        path: string
    ) => Promise<any>;
}

function PathItem({
    name,
    parentPath,
    onSelect,
    getValue,
}: PathItemProps) {
    const [value, setValue] = useState<any>();

    useEffect(() => {
        let active = true;

        void getValue(
            appendPath(parentPath, name)
        ).then((result) => {
            if (active) {
                setValue(result);
            }
        });

        return () => {
            active = false;
        };
    }, [name, parentPath]);

    let displayValue = "";

    if (
        value !== undefined &&
        value !== null &&
        typeof value !== "object"
    ) {
        displayValue = String(value);
    }

    return (
        <div
            className="ce-picker-item"
            onClick={onSelect}
        >
            <span className="ce-picker-name">
                {name}
            </span>

            {displayValue && (
                <span className="ce-picker-value">
                    {displayValue}
                </span>
            )}
        </div>
    );
}

/* ============================================================================
 * GeneratorEditor
 * ========================================================================== */

interface GeneratorEditorProps {
    store: types.IStore;
    value: GeneratorDefinition;
    variables: string[];
    onChange: (
        generator: GeneratorDefinition
    ) => void;
}

export function GeneratorEditor({
    store,
    value,
    variables,
    onChange,
}: GeneratorEditorProps) {
    const once =
        value.variable === "" &&
        value.path === "";

    return (
        <Section title="Generator">
            <div className="ce-radio-row">
                <label className="ce-radio">
                    <input
                        type="radio"
                        checked={once}
                        onChange={() =>
                            onChange({
                                variable: "",
                                path: "",
                            })
                        }
                    />
                    Once
                </label>

                <label className="ce-radio">
                    <input
                        type="radio"
                        checked={!once}
                        onChange={() =>
                            onChange({
                                variable:
                                    value.variable ||
                                    "id",
                                path:
                                    value.path ||
                                    "",
                            })
                        }
                    />
                    For each
                </label>
            </div>

            {!once && (
                <div className="ce-row">
                    <div className="ce-column">
                        <label className="ce-label">
                            Variable
                        </label>

                        <input
                            className="ce-input"
                            value={value.variable}
                            onChange={(e) =>
                                onChange({
                                    ...value,
                                    variable:
                                        e.target.value,
                                })
                            }
                            placeholder="id"
                        />
                    </div>

                    <div className="ce-column ce-grow">
                        <label className="ce-label">
                            Wildcard path
                        </label>

                        <PathPicker
                            store={store}
                            value={value.path}
                            allowWildcard
                            variables={variables}
                            onChange={(path) =>
                                onChange({
                                    ...value,
                                    path,
                                })
                            }
                        />
                    </div>
                </div>
            )}

            {once && (
                <div className="ce-muted">
                    The calculation runs once against the
                    document root.
                </div>
            )}
        </Section>
    );
}

/* ============================================================================
 * VariableEditor
 * ========================================================================== */

interface VariablesEditorProps {
    store: types.IStore;
    variables: VariableDefinition[];
    generator: GeneratorDefinition;
    onChange: (
        variables: VariableDefinition[]
    ) => void;
}

export function VariablesEditor({
    store,
    variables,
    generator,
    onChange,
}: VariablesEditorProps) {
    const variableNames = useMemo(
        () =>
            variables
                .map((v) => v.name)
                .filter(Boolean),
        [variables]
    );

    const update = (
        index: number,
        variable: VariableDefinition
    ) => {
        const next = [...variables];
        next[index] = variable;
        onChange(next);
    };

    const remove = (index: number) => {
        onChange(
            variables.filter(
                (_, i) => i !== index
            )
        );
    };

    const add = () => {
        let name = "value";
        let n = 2;

        while (
            variables.some(
                (variable) =>
                    variable.name === name
            )
        ) {
            name = `value${n++}`;
        }

        onChange([
            ...variables,
            {
                name,
                path: "",
            },
        ]);
    };

    const pathVariables = [
        generator.variable,
        ...variableNames,
    ].filter(Boolean);

    return (
        <Section title="Variables">
            {variables.map(
                (variable, index) => (
                    <div
                        className="ce-variable"
                        key={index}
                    >
                        <div className="ce-row">
                            <div className="ce-column variable-name">
                                <label className="ce-label">
                                    Name
                                </label>

                                <input
                                    className="ce-input ce-variable-name"
                                    value={
                                        variable.name
                                    }
                                    onChange={(e) =>
                                        update(
                                            index,
                                            {
                                                ...variable,
                                                name:
                                                    e
                                                        .target
                                                        .value,
                                            }
                                        )
                                    }
                                />
                            </div>

                            <div className="ce-column ce-grow">
                                <label className="ce-label">
                                    Path
                                </label>

                                <PathPicker
                                    store={store}
                                    value={
                                        variable.path
                                    }
                                    variables={
                                        pathVariables.filter(
                                            (name) =>
                                                name !==
                                                variable.name
                                        )
                                    }
                                    onChange={(path) =>
                                        update(
                                            index,
                                            {
                                                ...variable,
                                                path,
                                            }
                                        )
                                    }
                                />
                            </div>

                            <button
                                type="button"
                                className="ce-button danger"
                                onClick={() =>
                                    remove(index)
                                }
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )
            )}

            <button
                type="button"
                className="ce-button"
                onClick={add}
            >
                + Add variable
            </button>
        </Section>
    );
}

/* ============================================================================
 * TemplateEditor
 * ========================================================================== */

interface TemplateEditorProps {
    value: string;
    variables: VariableDefinition[];
    onChange: (value: string) => void;
}

export function TemplateEditor({
    value,
    variables,
    onChange,
}: TemplateEditorProps) {
    const textareaRef =
        useRef<HTMLTextAreaElement>(null);

    const insertVariable = (
        variable: string
    ) => {
        const textarea =
            textareaRef.current;

        if (!textarea) {
            onChange(
                `${value}{{${variable}}}`
            );
            return;
        }

        const start =
            textarea.selectionStart;

        const end =
            textarea.selectionEnd;

        const token =
            `{{${variable}}}`;

        const next =
            value.slice(0, start) +
            token +
            value.slice(end);

        onChange(next);

        requestAnimationFrame(() => {
            textarea.focus();

            const position =
                start + token.length;

            textarea.setSelectionRange(
                position,
                position
            );
        });
    };

    return (
        <Section title="Template">
            <textarea
                ref={textareaRef}
                className="ce-input ce-template"
                value={value}
                onChange={(e) =>
                    onChange(e.target.value)
                }
                placeholder="{{ a + b }}"
            />

            {variables.length > 0 && (
                <div className="ce-variable-help">
                    {variables.map(
                        (variable) => (
                            <span
                                key={variable.name}
                                className="ce-variable-chip"
                                onClick={() =>
                                    insertVariable(
                                        variable.name
                                    )
                                }
                            >
                                {variable.name}
                            </span>
                        )
                    )}
                </div>
            )}
        </Section>
    );
}

/* ============================================================================
 * OutputEditor
 * ========================================================================== */

interface OutputEditorProps {
    store: types.IStore;
    value: string;
    variables: string[];
    onChange: (value: string) => void;
}

export function OutputEditor({
    store,
    value,
    variables,
    onChange,
}: OutputEditorProps) {
    return (
        <Section title="Output">
            <PathPicker
                store={store}
                value={value}
                variables={variables}
                onChange={onChange}
            />
        </Section>
    );
}

/* ============================================================================
 * Debug / serialization
 * ========================================================================== */

function serializeCalculation(
    calculation: CalculationDefinition
) {
    /*
     * This is deliberately isolated from the editor state.
     *
     * If your actual calculation-chain serialization differs,
     * this is the only part that needs to change.
     */

    const generator =
        calculation.generator.variable === "" &&
        calculation.generator.path === ""
            ? [["", ""]]
            : [
                  [
                      calculation.generator.variable,
                      calculation.generator.path,
                  ],
              ];

    const variables: Record<
        string,
        string
    > = {};

    for (const variable of calculation.variables) {
        variables[variable.name] =
            variable.path;
    }

    const serialized = {
        functions: {
            [calculation.name]: {
                domain_mapper:
                    variables,

                generator,

                range_mapper:
                    calculation.output,

                template:
                    calculation.template,
            },
        },
    };

    log.serialize(serialized);

    return serialized;
}

function CalculationDebug({
    calculation,
}: {
    calculation: CalculationDefinition;
}) {
    const serialized = useMemo(
        () =>
            serializeCalculation(
                calculation
            ),
        [calculation]
    );

    return (
        <Section title="Generated Definition">
            <pre className="ce-debug">
                {JSON.stringify(
                    serialized,
                    null,
                    2
                )}
            </pre>
        </Section>
    );
}

/* ============================================================================
 * CalculationEditor
 * ========================================================================== */

export interface CalculationEditorProps {
    store: types.IStore;

    value?: CalculationDefinition;

    onChange?: (
        calculation: CalculationDefinition
    ) => void;
}

export function CalculationEditor({
    store,
    value,
    onChange,
}: CalculationEditorProps) {
    const [calculation, setCalculation] =
        useState<CalculationDefinition>(
            value ||
                createDefaultCalculation()
        );

    useEffect(() => {
        if (value) {
            setCalculation(value);
        }
    }, [value]);

    const update = useCallback(
        (
            next: CalculationDefinition
        ) => {
            log.editor(
                "calculation changed",
                next
            );

            setCalculation(next);
            onChange?.(next);
        },
        [onChange]
    );

    const variableNames = calculation.variables
        .map((v) => v.name)
        .filter(Boolean);

    return (
        <div className="calculation-editor">
            <StyleSheet />

            <Section title="Calculation">
                <div className="ce-column">
                    <label className="ce-label">
                        Name
                    </label>

                    <input
                        className="ce-input"
                        value={calculation.name}
                        onChange={(e) =>
                            update({
                                ...calculation,
                                name:
                                    e.target.value,
                            })
                        }
                    />
                </div>
            </Section>

            <GeneratorEditor
                store={store}
                value={
                    calculation.generator
                }
                variables={variableNames}
                onChange={(generator) =>
                    update({
                        ...calculation,
                        generator,
                    })
                }
            />

            <VariablesEditor
                store={store}
                variables={
                    calculation.variables
                }
                generator={
                    calculation.generator
                }
                onChange={(variables) =>
                    update({
                        ...calculation,
                        variables,
                    })
                }
            />

            <TemplateEditor
                value={calculation.template}
                variables={
                    calculation.variables
                }
                onChange={(template) =>
                    update({
                        ...calculation,
                        template,
                    })
                }
            />

            <OutputEditor
                store={store}
                value={calculation.output}
                variables={[
                    calculation.generator
                        .variable,
                    ...variableNames,
                ].filter(Boolean)}
                onChange={(output) =>
                    update({
                        ...calculation,
                        output,
                    })
                }
            />

            <CalculationDebug
                calculation={calculation}
            />
        </div>
    );
}

/* ============================================================================
 * Section
 * ========================================================================== */

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="ce-section">
            <header className="ce-section-header">
                {title}
            </header>

            <div className="ce-section-body">
                {children}
            </div>
        </section>
    );
}

/* ============================================================================
 * Example usage
 * ========================================================================== */

/*
 * const calculation = createDefaultCalculation();
 *
 * <CalculationEditor
 *     store={store}
 *     value={calculation}
 *     onChange={(next) => {
 *         console.log(next);
 *     }}
 * />
 */

/* ============================================================================
 * Optional runtime helpers
 *
 * These aren't required by the editor, but demonstrate how the same
 * definition can be executed using types.IStore.
 * ========================================================================== */

export async function generateExecutions(
    store: types.IStore,
    generator: GeneratorDefinition
): Promise<Record<string, string>[]> {
    /*
     * Empty generator means one execution against root.
     */
    if (
        generator.variable === "" &&
        generator.path === ""
    ) {
        return [{}];
    }

    const matches = await store.match(
        generator.path
    );

    log.store(
        "generator matches",
        generator.path,
        matches
    );

    return matches.map((match) => {
        /*
         * types.IStore.match() returns the matched path
         * components, e.g.
         *
         *     [["123"], ["456"]]
         *
         * for "/data/table/*".
         *
         * The generator variable represents the
         * matched component.
         *
         * For more complex wildcard paths, this is
         * where the mapping can be expanded.
         */
        const value =
            match.length === 1
                ? match[0]
                : joinPath(match);

        return {
            [generator.variable]:
                value,
        };
    });
}

export async function resolveVariables(
    store: types.IStore,
    variables: VariableDefinition[],
    bindings: Record<string, any>
): Promise<Record<string, any>> {
    const values = {
        ...bindings,
    };

    for (const variable of variables) {
        const path =
            replacePathVariables(
                variable.path,
                values
            );

        log.store(
            "resolve variable",
            variable.name,
            path
        );

        values[variable.name] =
            await store.get(path);
    }

    return values;
}