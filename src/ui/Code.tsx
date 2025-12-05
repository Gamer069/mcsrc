import Editor, { useMonaco } from '@monaco-editor/react';
import { useObservable } from '../utils/UseObservable';
import { currentResult, isDecompiling } from '../logic/Decompiler';
import { useEffect, useRef } from 'react';
import { editor, languages, Range, Uri, type CancellationToken, type IPosition, type IRange } from "monaco-editor";
import { isThin } from '../logic/Browser';
import { classesList } from '../logic/JarFile';
import { openTab } from '../logic/Tabs';
import { Spin, message } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { state, setSelectedFile } from '../logic/State';
import type { Token } from '../logic/Tokens';

const IS_DEFINITION_CONTEXT_KEY_NAME = "is_definition";

function findTokenAtPosition(
    editor: editor.ICodeEditor,
    decompileResult: { tokens: Token[]; } | undefined,
    classList: string[] | undefined
): Token | null {
    const model = editor.getModel();
    if (!model || !decompileResult || !classList) {
        return null;
    }

    const position = editor.getPosition();
    if (!position) {
        return null;
    }

    const { lineNumber, column } = position;
    const lines = model.getLinesContent();
    let charCount = 0;
    let targetOffset = 0;

    for (let i = 0; i < lineNumber - 1; i++) {
        charCount += lines[i].length + 1; // +1 for \n
    }
    targetOffset = charCount + (column - 1);

    for (const token of decompileResult.tokens) {
        if (targetOffset >= token.start && targetOffset <= token.start + token.length) {
            const className = token.className + ".class";
            if (classList.includes(className)) {
                return token;
            }
        }

        if (token.start > targetOffset) {
            break;
        }
    }

    return null;
}

async function setClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
}

const Code = () => {
    const monaco = useMonaco();

    const decompileResult = useObservable(currentResult);
    const classList = useObservable(classesList);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const hideMinimap = useObservable(isThin);
    const decompiling = useObservable(isDecompiling);
    const currentState = useObservable(state);

    const decorationsCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const lineHighlightRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const decompileResultRef = useRef(decompileResult);
    const classListRef = useRef(classList);

    const [messageApi, contextHolder] = message.useMessage();

    // Keep refs updated
    useEffect(() => {
        decompileResultRef.current = decompileResult;
        classListRef.current = classList;
    }, [decompileResult, classList]);

    useEffect(() => {
        if (!monaco) return;
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const definitionProvider = monaco.languages.registerDefinitionProvider("java", {
            provideDefinition(model, position, token) {
                const { lineNumber, column } = position;

                if (!decompileResult) {
                    console.error("No decompile result available for definition provider.");
                    return null;
                }

                const lines = model.getLinesContent();
                let charCount = 0;
                let targetOffset = 0;

                for (let i = 0; i < lineNumber - 1; i++) {
                    charCount += lines[i].length + 1; // +1 for \n
                }
                targetOffset = charCount + (column - 1);

                for (const token of decompileResult.tokens) {
                    if (token.declaration) {
                        continue;
                    }

                    if (targetOffset >= token.start && targetOffset <= token.start + token.length) {
                        const className = token.className + ".class";
                        console.log(`Found token for definition: ${className} at offset ${token.start}`);

                        if (classList && classList.includes(className)) {
                            const range = new Range(lineNumber, column, lineNumber, column + token.length);

                            return {
                                uri: Uri.parse(`goto://class/${className}`),
                                range
                            };
                        }

                        // Library or java classes.
                        return null;
                    }

                    // Tokens are sorted, we know we can stop searching
                    if (token.start > targetOffset) {
                        break;
                    }
                }

                return null;
            },
        });

        const editorOpener = monaco.editor.registerEditorOpener({
            openCodeEditor: function (source: editor.ICodeEditor, resource: Uri, selectionOrPosition?: IRange | IPosition): boolean | Promise<boolean> {
                if (!resource.scheme.startsWith("goto")) {
                    return false;
                }

                const className = resource.path.substring(1);
                console.log(className);
                openTab(className);
                return true;
            }
        });

        const foldingRange = monaco.languages.registerFoldingRangeProvider("java", {
            provideFoldingRanges: function (model: editor.ITextModel, context: languages.FoldingContext, token: CancellationToken): languages.ProviderResult<languages.FoldingRange[]> {
                const lines = model.getLinesContent();
                let packageLine: number | null = null;
                let firstImportLine: number | null = null;
                let lastImportLine: number | null = null;

                for (let i = 0; i < lines.length; i++) {
                    const trimmedLine = lines[i].trim();
                    if (trimmedLine.startsWith('package ')) {
                        packageLine = i + 1;
                    } else if (trimmedLine.startsWith('import ')) {
                        if (firstImportLine === null) {
                            firstImportLine = i + 1;
                        }
                        lastImportLine = i + 1;
                    }
                }

                // Check if there's any non-empty line after the last import
                // If not its likely a package-info and doesnt need folding.
                if (lastImportLine !== null) {
                    let hasContentAfterImports = false;
                    for (let i = lastImportLine; i < lines.length; i++) {
                        if (lines[i].trim().length > 0) {
                            hasContentAfterImports = true;
                            break;
                        }
                    }

                    if (!hasContentAfterImports) {
                        return [];
                    }
                }

                // Include the package line before imports to completely hide them when folded
                if (packageLine !== null && firstImportLine !== null && lastImportLine !== null) {
                    return [{
                        start: packageLine,
                        end: lastImportLine,
                        kind: monaco.languages.FoldingRangeKind.Imports
                    }];
                } else if (firstImportLine !== null && lastImportLine !== null && firstImportLine < lastImportLine) {
                    // Fallback if no package line exists
                    return [{
                        start: firstImportLine,
                        end: lastImportLine,
                        kind: monaco.languages.FoldingRangeKind.Imports
                    }];
                }

                return [];
            }
        });

        const copyAw = monaco.editor.addEditorAction({
            id: 'copy_aw',
            label: 'Copy Class Tweaker / Access Widener',
            contextMenuGroupId: '9_cutcopypaste',
            precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
            run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
                const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
                if (!token) {
                    messageApi.error("Failed to find token for Class Tweaker entry.");
                    return;
                }

                switch (token.type) {
                    case "class":
                        await setClipboard(`accessible class ${token.className}`);
                        break;
                    case "field":
                        await setClipboard(`accessible field ${token.className} ${token.name} ${token.descriptor}`);
                        break;
                    case "method":
                        await setClipboard(`accessible method ${token.className} ${token.name} ${token.descriptor}`);
                        break;
                    default:
                        messageApi.error("Token is not a class, field, or method.");
                        return;
                }

                messageApi.success("Copied Class Tweaker entry to clipboard.");
            }
        });

        const copyMixin = monaco.editor.addEditorAction({
            id: 'copy_mixin',
            label: 'Copy Mixin Target',
            contextMenuGroupId: '9_cutcopypaste',
            precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
            run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
                const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
                if (!token) {
                    messageApi.error("Failed to find token for Mixin target.");
                    return;
                }

                switch (token.type) {
                    case "class":
                        await setClipboard(`${token.className}`);
                        break;
                    case "field":
                        await setClipboard(`L${token.className};${token.name}:${token.descriptor}`);
                        break;
                    case "method":
                        await setClipboard(`L${token.className};${token.name}${token.descriptor}`);
                        break;
                    default:
                        messageApi.error("Token is not a class, field, or method.");
                        return;
                }

                messageApi.success("Copied Mixin target to clipboard.");
            }
        });

        return () => {
            // Dispose in the oppsite order
            copyMixin.dispose();
            copyAw.dispose();
            foldingRange.dispose();
            editorOpener.dispose();
            definitionProvider.dispose();
        };
    }, [monaco, decompileResult, classList]);

    useEffect(() => {
        if (!editorRef.current || !decompileResult) return;

        const editor = editorRef.current;
        const model = editor.getModel();
        if (!model) return;

        const decorations = decompileResult.tokens.map(token => {
            const startPos = model.getPositionAt(token.start);
            const endPos = model.getPositionAt(token.start + token.length);
            const canGoTo = !token.declaration && classList && classList.includes(token.className + ".class");

            return {
                range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                options: {
                    //hoverMessage: { value: `Class: ${token.className}` },
                    inlineClassName: token.type + '-token-decoration' + (canGoTo ? "-pointer" : "")
                }
            };
        }, [classList]);

        // Clean up previous collection
        decorationsCollectionRef.current?.clear();
        decorationsCollectionRef.current = editor.createDecorationsCollection(decorations);
    }, [decompileResult]);

    // Scroll to top when source changes, or to specific line if specified
    useEffect(() => {
        if (editorRef.current) {
            const currentLine = currentState?.line;
            editorRef.current.setPosition({ lineNumber: currentLine ?? 1, column: 1 });
            lineHighlightRef.current?.clear();

            // Fold imports when content changes `foldingImportsByDefault` has a bug where it only folds once.
            editorRef.current.getAction('editor.foldAll')?.run();

            if (currentLine) {
                const lineEnd = currentState?.lineEnd ?? currentLine;

                // Scroll to the specified lines
                editorRef.current.revealLinesInCenterIfOutsideViewport(currentLine, lineEnd);

                // Highlight the line range
                lineHighlightRef.current = editorRef.current.createDecorationsCollection([{
                    range: new Range(currentLine, 1, lineEnd, 1),
                    options: {
                        isWholeLine: true,
                        className: 'highlighted-line',
                        glyphMarginClassName: 'highlighted-line-glyph'
                    }
                }]);
            } else {
                // Default: scroll to top
                editorRef.current.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
            }
        }
    }, [decompileResult, currentState?.line, currentState?.lineEnd]);

    return (
        <Spin
            indicator={<LoadingOutlined spin />}
            size={"large"}
            spinning={!!decompiling}
            tip="Decompiling..."
            style={{
                height: '100%',
                color: 'white'
            }}
        >
            {contextHolder}
            <Editor
                height="100vh"
                defaultLanguage="java"
                theme="vs-dark"
                value={decompileResult?.source}
                options={{
                    readOnly: true,
                    domReadOnly: true,
                    tabSize: 3,
                    minimap: { enabled: !hideMinimap },
                    glyphMargin: true,
                    foldingImportsByDefault: true,
                }}
                onMount={(codeEditor) => {
                    editorRef.current = codeEditor;

                    // Fold imports by default
                    codeEditor.getAction('editor.foldAll')?.run();

                    // Update context key when cursor position changes
                    // We use this to know when to show the options to copy AW/Mixin strings 
                    const isDefinitionContextKey = codeEditor.createContextKey<boolean>(IS_DEFINITION_CONTEXT_KEY_NAME, false);
                    codeEditor.onDidChangeCursorPosition((e) => {
                        const token = findTokenAtPosition(codeEditor, decompileResultRef.current, classListRef.current);
                        const validToken = token != null && (token.type == "class" || token.type == "method" || token.type == "field");
                        isDefinitionContextKey.set(validToken);
                    });

                    // Handle gutter clicks for line linking
                    codeEditor.onMouseDown((e) => {
                        if (e.target.type === editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
                            e.target.type === editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                            const lineNumber = e.target.position?.lineNumber;

                            const currentState = state.value;
                            if (lineNumber && currentState) {
                                // Shift-click to select a range
                                if (e.event.shiftKey && currentState.line) {
                                    setSelectedFile(currentState.file, currentState.line, lineNumber);
                                } else {
                                    setSelectedFile(currentState.file, lineNumber);
                                }
                            }
                        }
                    });
                }} />
        </Spin>
    );
};

export default Code;