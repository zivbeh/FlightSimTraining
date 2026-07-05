import { CodeRunner } from './CodeRunner.js';

export class CodeEditor {
    constructor(actor, defaultCode = "") {
        this.consoleDiv = document.getElementById('console');
        this.editor = document.getElementById('codeEditor');
        this.gutter = document.getElementById('line-numbers');
        this.runBtn = document.getElementById('runBtn');
        this.highlightLayer = document.getElementById('highlight-layer');

        let savedCode = null;
        try {
            const raw = localStorage.getItem('code_editor_user_code');
            if (raw) {
                const data = JSON.parse(raw);
                const isSameDay = new Date(data.timestamp).toDateString() === new Date().toDateString();
                if (isSameDay) {
                    savedCode = data.code;
                } else {
                    localStorage.removeItem('code_editor_user_code');
                }
            }
        } catch (e) {
            localStorage.removeItem('code_editor_user_code');
        }

        if (this.editor) this.editor.value = savedCode !== null ? savedCode : defaultCode;

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
        
        toolbar.appendChild(this.timerDisplay);
        toolbar.appendChild(this.runBtn); // Moves the button to the end

        this.infoDisplay = document.createElement('div');
        this.infoDisplay.id = 'info-display';
        toolbar.after(this.infoDisplay);

        this.editor.addEventListener('input', () => {
            this.updateLineNumbers();
            this.applyHighlighting();
            try {
                const data = { code: this.editor.value, timestamp: Date.now() };
                localStorage.setItem('code_editor_user_code', JSON.stringify(data));
            } catch (e) {}
        });

        this.editor.addEventListener('scroll', () => {
            this.highlightLayer.scrollTop = this.editor.scrollTop;
            this.highlightLayer.scrollLeft = this.editor.scrollLeft;
            this.gutter.scrollTop = this.editor.scrollTop;
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
        this.highlightLayer.innerHTML = parts.map(p => p.text).join('') + "\n";
    }

    updateInfoDisplay() {
        if (!this.infoDisplay) return;

        const isSimpleObj = (obj) => {
            const vals = Object.values(obj);
            return vals.length > 0 && vals.length <= 3 && 
                   vals.every(v => typeof v !== 'object' || v === null || v instanceof Set);
        };

        const renderTree = (data) => {
            const isSet = data instanceof Set;
            const isParentArray = Array.isArray(data) || isSet;
            const entries = isSet ? Array.from(data).map((v, i) => [i, v]) : Object.entries(data);

            return entries.map(([key, val]) => {
                const isCollapsible = (typeof val === 'object' && val !== null) || val instanceof Set;
                const keyLabel = isParentArray ? '' : `<span class="info-key">${key}</span>`;
                
                if (isCollapsible) {
                    const mode = isSimpleObj(val) ? 'vertical' : '';
                    return `
                        <div class="info-node">
                            ${keyLabel}
                            <div class="info-group ${mode}">${renderTree(val)}</div>
                        </div>
                    `;
                }
                const isStr = typeof val === 'string';
                return `
                    <div class="info-item">
                        ${keyLabel}
                        <span class="info-val ${isStr ? 'string' : ''}">${isStr ? `"${val}"` : val}</span>
                    </div>
                `;
            }).join('');
        };

        this.infoDisplay.className = isSimpleObj(this.actor.info) ? 'vertical' : '';
        this.infoDisplay.innerHTML = renderTree(this.actor.info);
    }

    handleKeyDown(e) {
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const value = this.editor.value;

        // --- Handle Tab (Insert 4 spaces) ---
        if (e.key === 'Tab') {
            e.preventDefault();
            
            // This method preserves the Undo (Ctrl+Z) stack
            document.execCommand('insertText', false, "    ");
            
            this.updateLineNumbers();
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
        const content = Array.isArray(text) ? text.join(' ') : String(text);
        
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
