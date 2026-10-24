const isGroup = value => typeof value === 'object' && value !== null;
const isSimple = value => {
    const values = Object.values(value);
    return values.length > 0 && values.length <= 3
        && values.every(item => !isGroup(item) || item instanceof Set);
};
const setClass = (element, value) => {
    if (element.className !== value) element.className = value;
};

// Retain nodes between refreshes; only changed values touch the DOM.
class InfoDisplay {
    constructor(element) {
        this.root = { element, children: new Map(), order: [] };
        this.lastUpdate = -Infinity;
    }

    update(info, now = performance.now()) {
        if (now - this.lastUpdate < 50) return;
        this.lastUpdate = now;
        setClass(this.root.element, isSimple(info) ? 'vertical' : '');
        this.updateGroup(this.root, info);
    }

    updateGroup(group, data) {
        const indexed = Array.isArray(data) || data instanceof Set;
        const entries = data instanceof Set
            ? Array.from(data, (value, index) => [String(index), value]) : Object.entries(data);
        const next = new Map();
        for (const [key, value] of entries) {
            const nested = isGroup(value);
            let node = group.children.get(key);
            if (!node || node.nested !== nested || node.indexed !== indexed) {
                const element = document.createElement('div');
                element.className = nested ? 'info-node' : 'info-item';
                if (!indexed) {
                    const label = document.createElement('span');
                    label.className = 'info-key';
                    label.textContent = key;
                    element.appendChild(label);
                }
                const content = document.createElement(nested ? 'div' : 'span');
                element.appendChild(content);
                node = { element, content, nested, indexed, text: null,
                    group: nested ? { element: content, children: new Map(), order: [] } : null };
            }
            if (nested) {
                setClass(node.content, `info-group${isSimple(value) ? ' vertical' : ''}`);
                this.updateGroup(node.group, value);
            } else {
                const text = typeof value === 'string' ? `"${value}"` : String(value);
                setClass(node.content, `info-val${typeof value === 'string' ? ' string' : ''}`);
                if (node.text !== text) {
                    node.content.textContent = text;
                    node.text = text;
                }
            }
            next.set(key, node);
        }
        const order = Array.from(next.values(), node => node.element);
        if (order.length !== group.order.length || order.some((element, index) => element !== group.order[index])) {
            group.element.replaceChildren(...order);
            group.order = order;
        }
        group.children = next;
    }
}

// Helpers every script gets from CodeRunner, regardless of aircraft
const COMMON_API_DOCS = [
    { name: 'log', args: '...values', example: 'log(info.position)',
      description: 'Prints values to the console.' },
    { name: 'sleep', args: 'ms', example: 'await sleep(1000)',
      description: 'Waits the given milliseconds. Always use it with await.' },
    { name: 'startLoop', args: 'callback, ms', example: 'startLoop(() => {\n    \n}, 50)',
      description: 'Runs the callback again every ms milliseconds (minimum 10).' },
    { name: 'stopLoop', args: '', example: 'stopLoop()',
      description: 'Stops the loop and ends the program.' },
    { name: 'finish', args: '', example: 'finish()',
      description: 'Ends the program.' },
    { name: 'info', args: null, example: 'info',
      description: 'Live flight data: position, rotation, air_speed, fuel, world and more. See the panel above the editor.' },
    { name: 'time', args: null, example: 'time',
      description: 'Seconds since the program started.' },
];

// Toolbar icons (line style, drawn in the button's text color)
const svgIcon = (paths) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
    upload: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
    copy: svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    download: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
    check: svgIcon('<path d="M20 6L9 17l-5-5"/>'),
    cross: svgIcon('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
};

const escapeHtml = (text) => String(text)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export class CodeEditor {
    constructor(actor, defaultCode = "") {
        this.consoleDiv = document.getElementById('console');
        this.editor = document.getElementById('codeEditor');
        this.gutter = document.getElementById('line-numbers');
        this.runBtn = document.getElementById('runBtn');
        this.highlightLayer = document.getElementById('highlight-layer');

        // Code is saved per slot (one slot per level, see useCodeSlot)
        this.codeSlot = null;
        this.defaultCode = defaultCode;
        if (this.editor) this.editor.value = defaultCode;

        this.actor = actor;
        
        this.isFocused = false;
        this.infoDisplay = null;
        this.timerDisplay = null;
        this.runner = this.actor.codeRunner
        this.runner.callbacks = {
            onLog: (args) => this.log(args),
            onStatusChange: (isRunning) => this.updateUI(isRunning),
            onTimerUpdate: (time) => {
                if (this.timerDisplay) {
                    this.timerDisplay.textContent = time !== null ? time.toFixed(2) + 's' : '';
                }
            },
            onSetInfo: (info) => {
                this.updateInfoDisplay();
            }
        }

        this.init();
    }

    init() {
        // Create Info Display UI dynamically
        const editorSection = document.getElementById('editor-section');
        const toolbar = editorSection.querySelector('.toolbar');
        
        this.timerDisplay = document.createElement('span');
        this.timerDisplay.id = 'execution-timer';

        // Reorder elements to ensure DOM order is: [title] [timer] [runBtn]
        // With CSS flex-direction: row, this displays them left-to-right
        const title = toolbar.querySelector('.file-name');
        if (title) toolbar.prepend(title);
        
        const makeToolButton = (label, title, onClick, icon = null) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = icon ? 'editor-tool-btn icon' : 'editor-tool-btn';
            if (icon) button.innerHTML = icon;
            else button.textContent = label;
            button.title = title;
            button.setAttribute('aria-label', title);
            button.addEventListener('click', () => {
                button.blur();
                onClick(button);
            });
            toolbar.appendChild(button);
            return button;
        };

        // Hidden picker behind the "Load" button
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.js,.txt,text/javascript,text/plain';
        this.fileInput.hidden = true;
        this.fileInput.addEventListener('change', () => this.loadFile(this.fileInput.files[0]));
        toolbar.appendChild(this.fileInput);

        // Icon-only buttons; the tooltip explains each one
        makeToolButton(null, 'Copy the code to the clipboard', (button) => this.copyCode(button), ICONS.copy);
        makeToolButton(null, 'Load code from a file', () => this.fileInput.click(), ICONS.upload);
        makeToolButton(null, 'Download the code as main.js', () => this.downloadCode(), ICONS.download);

        this.apiBtn = makeToolButton('{ } API', 'Show the functions your code can use', () => this.toggleApiPanel());
        this.apiBtn.id = 'api-btn';
        this.apiBtn.setAttribute('aria-expanded', 'false');

        toolbar.appendChild(this.timerDisplay);
        toolbar.appendChild(this.runBtn); // Moves the button to the end

        this.apiPanel = document.createElement('div');
        this.apiPanel.id = 'api-panel';
        this.apiPanel.hidden = true;
        editorSection.querySelector('.editor-wrapper').appendChild(this.apiPanel);

        this.infoDisplay = document.createElement('div');
        this.infoDisplay.id = 'info-display';
        toolbar.after(this.infoDisplay);

        this.editor.addEventListener('input', () => {
            this.updateLineNumbers();
            this.applyHighlighting();
            this.saveCodeSlot();
        });

        this.editor.addEventListener('scroll', () => this.syncEditorLayers());
        this.resizeObserver = new ResizeObserver(() => this.syncEditorLayers());
        this.resizeObserver.observe(this.editor);
        this.editor.addEventListener('copy', (event) => {
            if (this.editor.selectionStart !== this.editor.selectionEnd || !event.clipboardData) return;
            const value = this.editor.value;
            const cursor = this.editor.selectionStart;
            const start = cursor === 0 ? 0 : value.lastIndexOf('\n', cursor - 1) + 1;
            const nextBreak = value.indexOf('\n', cursor);
            const end = nextBreak === -1 ? value.length : nextBreak;
            event.clipboardData.setData('text/plain', '\n' + value.slice(start, end));
            event.preventDefault();
        });
        this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));

        this.editor.addEventListener('focus', () => { this.isFocused = true; });
        this.editor.addEventListener('blur', () => { this.isFocused = false; });

        // Event Listener for Run Button
        this.runBtn.addEventListener('click', () => this.toggleExecution());

        // Initial setup
        this.applyHighlighting();
        this.updateLineNumbers();
        this.updateInfoDisplay();
        this.updateUI(false);
    }

    applyHighlighting() {
        // 1. Get the raw text from the textarea
        let code = this.editor.value;

        // 2. Escape HTML characters to prevent the browser from 
        // treating user typed "<" as a real tag.
        code = code.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

        // 3. Define the rules. 
        // IMPORTANT: Strings and Comments must come first so they don't 
        // get messed up by keyword highlighting later.
        const rules = [
            { reg: /\/\/.*/g, cl: 'hl-comment' }, 
            { reg: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, cl: 'hl-str' },
            { reg: /\b(await|async|class|const|let|var|if|else|return|function|new|try|catch|finally)\b/g, cl: 'hl-keyword' },
            { reg: /\b(\d+)\b/g, cl: 'hl-num' },
            { reg: /\b([a-zA-Z_]\w*)(?=\s*\()/g, cl: 'hl-func' }
        ];

        // 4. THE FIX: We use a temporary array to store highlighted parts 
        // so we don't run regex on our own <span> tags.
        let parts = [{ text: code, isHTML: false }];

        rules.forEach(rule => {
            let newParts = [];
            parts.forEach(part => {
                if (part.isHTML) {
                    newParts.push(part);
                } else {
                    let lastIndex = 0;
                    part.text.replace(rule.reg, (match, ...args) => {
                        const offset = args[args.length - 2];
                        // Push the plain text before the match
                        newParts.push({ text: part.text.substring(lastIndex, offset), isHTML: false });
                        // Push the highlighted match as HTML
                        newParts.push({ text: `<span class="${rule.cl}">${match}</span>`, isHTML: true });
                        lastIndex = offset + match.length;
                        return match;
                    });
                    // Push the remaining plain text
                    newParts.push({ text: part.text.substring(lastIndex), isHTML: false });
                }
            });
            parts = newParts;
        });

        // 5. Join all parts and update the layer
        this.highlightLayer.innerHTML = parts.map(p => p.text).join('') + '\u200b';
        this.syncEditorLayers();
    }

    syncEditorLayers() {
        // Match the textarea's viewport, excluding its scrollbars, so both
        // layers have the same maximum scroll offset at the bottom/right.
        this.highlightLayer.style.width = `${this.editor.clientWidth}px`;
        this.highlightLayer.style.height = `${this.editor.clientHeight}px`;
        this.highlightLayer.scrollTop = this.editor.scrollTop;
        this.highlightLayer.scrollLeft = this.editor.scrollLeft;
        this.gutter.style.paddingBottom = `${15 + this.editor.offsetHeight - this.editor.clientHeight}px`;
        this.gutter.scrollTop = this.editor.scrollTop;
    }

    updateInfoDisplay() {
        if (!this.infoDisplay) return;
        this.infoRenderer ??= new InfoDisplay(this.infoDisplay);
        this.infoRenderer.update(this.runner.info);
    }

    handleKeyDown(e) {
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;

        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '/' || e.code === 'Slash')) {
            e.preventDefault();
            const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
            const lastSelected = end > start && value[end - 1] === '\n' ? end - 1 : end;
            const nextBreak = value.indexOf('\n', lastSelected);
            const lineEnd = nextBreak === -1 ? value.length : nextBreak;
            const lines = value.slice(lineStart, lineEnd).split('\n');
            const uncomment = lines.filter(line => line.trim()).every(line => /^\s*\/\//.test(line))
                && lines.some(line => line.trim());
            const edits = [];
            let offset = lineStart;
            const replacement = lines.map(line => {
                const indent = line.match(/^[\t ]*/)[0].length;
                const removed = uncomment ? (line.slice(indent).match(/^\/\/ ?/)?.[0].length ?? 0) : 0;
                const inserted = uncomment ? '' : '// ';
                edits.push({ at: offset + indent, removed, inserted: inserted.length });
                offset += line.length + 1;
                return line.slice(0, indent) + inserted + line.slice(indent + removed);
            }).join('\n');
            const mapOffset = (cursor) => edits.reduce((result, edit) => cursor < edit.at ? result
                : result + edit.inserted - Math.min(edit.removed, cursor - edit.at), cursor);
            const scrollTop = this.editor.scrollTop;
            const scrollLeft = this.editor.scrollLeft;
            this.editor.setSelectionRange(lineStart, lineEnd);
            document.execCommand('insertText', false, replacement);
            this.editor.setSelectionRange(mapOffset(start), mapOffset(end));
            this.editor.scrollTop = scrollTop;
            this.editor.scrollLeft = scrollLeft;
            this.updateLineNumbers();
            this.applyHighlighting();
            return;
        }

        // --- Indent/outdent selected lines; keep plain Tab insertion at the caret. ---
        if (e.key === 'Tab') {
            e.preventDefault();
            if (start === end && !e.shiftKey) {
                document.execCommand('insertText', false, '    ');
            } else {
                const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
                const lastSelected = end > start && value[end - 1] === '\n' ? end - 1 : end;
                const nextBreak = value.indexOf('\n', lastSelected);
                const lineEnd = nextBreak === -1 ? value.length : nextBreak;
                const edits = [];
                let offset = lineStart;
                const replacement = value.slice(lineStart, lineEnd).split('\n').map(line => {
                    const removed = e.shiftKey ? (line.match(/^(?:\t| {1,4})/)?.[0].length ?? 0) : 0;
                    const inserted = e.shiftKey ? '' : '    ';
                    edits.push({ at: offset, removed, inserted: inserted.length });
                    offset += line.length + 1;
                    return inserted + line.slice(removed);
                }).join('\n');
                if (replacement !== value.slice(lineStart, lineEnd)) {
                    const mapOffset = cursor => edits.reduce((result, edit) => cursor < edit.at ? result
                        : result + edit.inserted - Math.min(edit.removed, cursor - edit.at), cursor);
                    const direction = this.editor.selectionDirection;
                    const scrollTop = this.editor.scrollTop;
                    const scrollLeft = this.editor.scrollLeft;
                    this.editor.setSelectionRange(lineStart, lineEnd);
                    document.execCommand('insertText', false, replacement);
                    this.editor.setSelectionRange(mapOffset(start), mapOffset(end), direction);
                    this.editor.scrollTop = scrollTop;
                    this.editor.scrollLeft = scrollLeft;
                }
            }
            this.updateLineNumbers();
            this.applyHighlighting();
            return;
        }

        // --- Handle Backspace (Delete 4 spaces) ---
        if (e.key === 'Backspace') {
            if (start === end) {
                const lastFour = value.substring(start - 4, start);
                
                if (lastFour === "    ") {
                    e.preventDefault();
                    
                    // To "Undoably" delete 4 spaces, we select them and then 
                    // execute a delete command.
                    this.editor.setSelectionRange(start - 4, start);
                    document.execCommand('delete', false);
                    
                    this.updateLineNumbers();
                }
            }
        }
        this.applyHighlighting();
    }

    // --- Visual & Terminal Methods ---
    updateLineNumbers() {
        const lines = this.editor.value.split('\n').length;
        let numberString = '';
        for (let i = 1; i <= lines; i++) {
            numberString += i + '<br>';
        }
        this.gutter.innerHTML = numberString;
    }

    log(text) {
        const entry = document.createElement('div');
        const format = (value) => value !== null && typeof value === 'object'
            ? JSON.stringify(value, (key, item) => item instanceof Set ? [...item] : item)
            : String(value);
        const content = Array.isArray(text) ? text.map(format).join(' ') : format(text);
        
        let type = 'user';
        if (content.includes('❌')) {
            type = 'error';
        } else if (content.startsWith('System:') || content.startsWith('---') || content.startsWith('Display:')) {
            type = 'system';
        }

        entry.className = `log-entry log-${type}`;
        entry.textContent = `> ${content}`;
        this.consoleDiv.appendChild(entry);
        this.consoleDiv.scrollTop = this.consoleDiv.scrollHeight;

        if (this.consoleDiv.childNodes.length > 50) {
            this.consoleDiv.removeChild(this.consoleDiv.firstChild);
        }
    }

    // --- Per-level code memory ---
    static slotStorageKey(slot) {
        return `code_editor_slot_${slot}`;
    }

    // Switches the editor to another slot (e.g. 'level-3'): the current code
    // is already saved on every edit, so just load the new slot's code
    useCodeSlot(slot) {
        if (slot === this.codeSlot) return;
        this.codeSlot = slot;
        let code = this.defaultCode;
        try {
            const saved = localStorage.getItem(CodeEditor.slotStorageKey(slot));
            if (saved !== null) code = saved;
        } catch (e) {}
        this.setCode(code);
    }

    saveCodeSlot() {
        if (this.codeSlot === null) return;
        try {
            localStorage.setItem(CodeEditor.slotStorageKey(this.codeSlot), this.editor.value);
        } catch (e) {}
    }

    // --- File Actions ---
    setCode(code) {
        this.editor.value = code;
        // Triggers highlighting, line numbers and the saved-code backup
        this.editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    loadFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            this.setCode(String(reader.result));
            this.log([`System: Loaded ${file.name}`]);
        };
        reader.onerror = () => this.log([`❌ Could not read ${file.name}`]);
        reader.readAsText(file);
        this.fileInput.value = ''; // allow loading the same file again
    }

    async copyCode(button) {
        try {
            await navigator.clipboard.writeText(this.editor.value);
            this.flashButton(button, ICONS.check);
        } catch (e) {
            this.flashButton(button, ICONS.cross);
        }
    }

    downloadCode() {
        const blob = new Blob([this.editor.value], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'main.js';
        link.click();
        URL.revokeObjectURL(url);
    }

    // Briefly swaps the button's icon (e.g. to a check mark) as feedback
    flashButton(button, html) {
        const original = button.dataset.icon ?? button.innerHTML;
        button.dataset.icon = original;
        button.innerHTML = html;
        clearTimeout(button.flashTimer);
        button.flashTimer = setTimeout(() => { button.innerHTML = original; }, 1200);
    }

    // --- API Reference Panel ---
    toggleApiPanel(open = this.apiPanel.hidden) {
        if (open) this.renderApiPanel();
        this.apiPanel.hidden = !open;
        this.apiBtn.classList.toggle('active', open);
        this.apiBtn.setAttribute('aria-expanded', String(open));
    }

    // Built from the current actor so it always matches the aircraft in use
    renderApiPanel() {
        const documented = this.actor.getApiDocs?.() ?? [];
        const names = new Set(documented.map((doc) => doc.name));
        // Any API function without docs still shows up, just without a description
        const undocumented = Object.keys(this.actor.api ?? {})
            .filter((name) => !names.has(name))
            .map((name) => ({ name, args: 'value', example: `${name}()`, description: '' }));

        const section = (title, docs) => `
            <div class="api-section-title">${title}</div>
            ${docs.map((doc, index) => `
                <button type="button" class="api-entry" data-example="${escapeHtml(doc.example)}" title="Click to insert">
                    <span class="api-signature"><span class="api-name">${doc.name}</span>${doc.args === null ? '' : `(${escapeHtml(doc.args)})`}</span>
                    ${doc.description ? `<span class="api-desc">${escapeHtml(doc.description)}</span>` : ''}
                </button>`).join('')}`;

        this.apiPanel.innerHTML = `
            <div class="api-header">
                <span>API Reference</span>
                <button type="button" class="api-close" aria-label="Close API reference">✕</button>
            </div>
            <div class="api-hint">Click a function to insert it at the cursor.</div>
            <div class="api-list">
                ${section('Aircraft controls', [...documented, ...undocumented])}
                ${section('Program helpers', COMMON_API_DOCS)}
            </div>`;

        this.apiPanel.querySelector('.api-close').addEventListener('click', () => this.toggleApiPanel(false));
        this.apiPanel.querySelectorAll('.api-entry').forEach((entry) => {
            entry.addEventListener('click', () => this.insertAtCursor(entry.dataset.example));
        });
    }

    insertAtCursor(text) {
        const { selectionStart, selectionEnd, value } = this.editor;
        this.editor.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
        this.editor.focus();
        this.editor.selectionStart = this.editor.selectionEnd = selectionStart + text.length;
        this.editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // --- Sandbox Management ---
    toggleExecution() {
        this.runBtn.blur();
        if (this.runner.running) {
            this.runner.stop();
        } else {
            this.runner.run(this.editor.value);
        }
    }

    updateUI(isRunning) {
        this.runBtn.textContent = isRunning ? "\u25A0" : "\u25B6";
        this.runBtn.classList.toggle('stop', isRunning);
    }
}
