export class CodeEditor {
    constructor(info = {}, api = {}, defaultCode = "") {
        // 1. Elements
        this.consoleDiv = document.getElementById('console');
        this.editor = document.getElementById('codeEditor');
        this.gutter = document.getElementById('line-numbers');
        this.runBtn = document.getElementById('runBtn');
        this.highlightLayer = document.getElementById('highlight-layer');

        if (this.editor) this.editor.value = defaultCode;

        // 2. State
        this.info = info;
        this.api = api;
        
        this.isFocused = false;
        this.activeWorker = null;
        this.syncInterval = null;
        this.infoDisplay = null;
        this.timerDisplay = null;
        this.runTime = 0;
        this.startTime = 0;
        this.currentWorkerURL = null;
        this.watchdogInterval = null;


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

    setInfo(info) {
        this.info = info;
        this.updateInfoDisplay();
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

        this.infoDisplay.className = isSimpleObj(this.info) ? 'vertical' : '';
        this.infoDisplay.innerHTML = renderTree(this.info);
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
        if (this.activeWorker) {
            this.stop();
        } else {
            this.run();
        }
    }

    run() {
        const userCode = this.editor.value;

        this.log("System: Initializing...");
        this.updateUI(true);
        this.runTime = 0;
        this.startTime = Date.now();

        const workerBlobCode = this.generateWorkerCode(userCode);
        const blob = new Blob([workerBlobCode], { type: 'application/javascript' });
        this.currentWorkerURL = URL.createObjectURL(blob);
        this.activeWorker = new Worker(this.currentWorkerURL);

        const firstLineNo = 80
        this.activeWorker.onerror = (error) => {
            if (error.message.includes("Content Security Policy")) {
                this.log("❌ SECURITY VIOLATION: Remote execution and 'eval' are strictly prohibited.");
            } else if (error.lineno !== undefined) {
                this.log("❌ SYNTAX ERROR: " + error.message + " (Line: " + (error.lineno - firstLineNo + 1) + ")");
            }
            this.stop();
            error.preventDefault();
        };

        // Listen for messages FROM worker
        this.activeWorker.onmessage = (e) => this.handleWorkerMessage(e.data);
        
        // Start live variable syncing TO worker
        this.syncInterval = setInterval(() => {
            if (this.activeWorker) {
                this.runTime = (Date.now() - this.startTime) / 1000;
                this.timerDisplay.textContent = this.runTime.toFixed(2) + 's';
                this.activeWorker.postMessage({
                    cmd: 'SYNC_INFO',
                    value: this.info,
                    runTime: this.runTime
                });
            }
        }, 10);


        this.lastResponseTime = Date.now();
    
        // Watchdog: Check every 2 seconds if the worker is still "alive"
        this.watchdogInterval = setInterval(() => {
            if (Date.now() - this.lastResponseTime > 3000) {
                this.log("❌ System: Script hung (Infinite Loop detected). Terminating.");
                this.stop();
            }
        }, 2000);

        this.activeWorker.onmessage = (e) => {
            this.lastResponseTime = Date.now(); // Reset the watchdog on every message
            this.handleWorkerMessage(e.data);
        };
    }

    stop() {
        if (this.activeWorker) {
            this.activeWorker.terminate();
            this.activeWorker = null;
            clearInterval(this.syncInterval);
            clearInterval(this.watchdogInterval);

            if (this.currentWorkerURL) {
                URL.revokeObjectURL(this.currentWorkerURL);
                this.currentWorkerURL = null;
            }
            this.timerDisplay.textContent = '';
            this.updateUI(false);
            this.log("--- Process Stopped ---");
        }
    }

    updateUI(isRunning) {
        this.runBtn.textContent = isRunning ? "\u25A0" : "\u25B6";
        this.runBtn.classList.toggle('stop', isRunning);
    }

    generateWorkerCode(userCode) {
        let apiHelpers = "";
        for (const funcName in this.api) {
            apiHelpers += `const ${funcName} = (...args) => postMessage({ cmd: '${funcName}', args: args });\n`;
        }

        const libraries = [
            'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'
        ];
        const libString = libraries.map(url => `'${url}'`).join(', ');

        const workerBlobCode = `
        (function() {
            "use strict";

            // 1. Load Libraries
            try {
                if (${libraries.length > 0}) {
                    importScripts(${libString});
                }
            } catch (e) {
                postMessage({ cmd: 'LOG', args: ["❌ LIB ERROR: Failed to load external libraries."] });
            }

            // 1. Define global helpers (Only once!)
            const log = (...args) => postMessage({ cmd: 'LOG', args: args });
            const sleep = (ms) => new Promise(res => setTimeout(res, ms));
            const finish = () => postMessage({ cmd: 'FINISH' });

                
            // Inject the custom API functions (like setName, printName)
            ${apiHelpers}
            

            // 2. State & Syncing
            let time = 0;
            // Use a replacer to handle Set serialization for the initial state
            let info = ${JSON.stringify(this.info, (key, value) => {
                if (value instanceof Set) return Array.from(value);
                return value;
            })};
            let gameInterval = null;

            const startLoop = (callback, ms) => {
                if (gameInterval) clearInterval(gameInterval);
                gameInterval = setInterval(callback, Math.max(10, ms));
            };

            const stopLoop = () => {
                if (gameInterval) clearInterval(gameInterval);
                postMessage({ cmd: 'FINISH' });
            };

            // --- THE ERROR CATCHER ---
            // This catches regular errors (like calling a function that doesn't exist)
            self.onerror = function(message, source, lineno, colno, error) {
                log("❌ RUNTIME ERROR: " + message + " (Line: " + lineno + ")");
                postMessage({ cmd: 'FINISH' }); // Stop the worker so it doesn't spam errors
                return true; // Prevents the error from showing in the browser console
            };

            // This catches errors inside 'async' functions (Promises)
            self.onunhandledrejection = function(event) {
                log("❌ ASYNC ERROR: " + (event.reason?.message || event.reason));
                postMessage({ cmd: 'FINISH' });
                event.preventDefault(); // Prevents the "Uncaught (in promise)" browser console log
            };

            // Handle incoming messages from main thread
            self.onmessage = function(e) {
                if (e.data.cmd === 'SYNC_INFO') {
                    info = e.data.value;
                    time = e.data.runTime;
                    postMessage({ cmd: 'HEARTBEAT' });
                }
            };

            // 3. Execution Wrapper
            (async function(log, finish, sleep, startLoop, stopLoop) {
                const self = undefined;
                const globalThis = undefined;
                const importScripts = undefined;
                const fetch = undefined;
                const XMLHttpRequest = undefined;
                const WebSocket = undefined;
                const Function = undefined;
                const onmessage = undefined;
                const onerror = undefined;
                const onunhandledrejection = undefined;

                try {
                    ${userCode}
                } catch (err) {
                    log("❌ STARTUP ERROR: " + err.message);
                    postMessage({ cmd: 'FINISH' });
                }

            })(log, finish, sleep, startLoop, stopLoop);
        })();
        `;
        return workerBlobCode;
    }

    handleWorkerMessage(data) {
        const { cmd, args } = data;

        if (cmd === 'HEARTBEAT') {
            this.lastResponseTime = Date.now();
            return; // Don't log this to the console!
        }

        if (this.api && typeof this.api[cmd] === 'function') {
            this.api[cmd](this, ...(args || []));
            return;
        }

        switch(cmd) {
            case 'LOG': 
                this.log(args); 
                break;
            case 'FINISH': 
                this.stop(); 
                break;
        }
    }
}

// export const info = {
//     missile: {
//         air_speed: {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         pos: {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         angle: 0,
//         altitude: 0,
//         fuel: 100
//     },
//     time: 0,
//     keys: ['a', 's', 'd', 'w'],
//     keys2: new Set(),
//     missile2: {
//         velocity: {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         pos: {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         orientation: {
//             pitch: 0,
//             yaw: 0,
//             roll: 0,
//         },
//         angle: 0,
//         altitude: 0,
//         fuel: 100,
//         name: "Missile 2"
//     },
//     radar: [
//         {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         {
//             x: 0,
//             y: 0,
//             z: 0
//         },
//         {
//             x: 0,
//             y: 0,
//             z: 0
//         },

//     ]
// };

// let externalState = {
//     firstName: "Interceptor",
//     lastName: ""
// };

// const updateExternalVisuals = () => {
//     const display = document.getElementById('visual-state');
//     if (display) {
//         display.textContent = `${externalState.firstName} ${externalState.lastName}`.trim();
//         display.style.color = "#007acc";
//         display.style.fontSize = "24px";
//     }
// };

// const apiFunctions = {
//     setName: (instance, f, l) => {
//         externalState.firstName = f;
//         externalState.lastName = l;
//         updateExternalVisuals();
//         instance.log(`System: Data updated to [${f}] [${l}]`);
//     },
//     printName: (instance) => {
//         instance.log("Display: " + `${externalState.firstName} ${externalState.lastName}`.trim());
//     }
// };

// const initialCode = `let speed = 0;

// startLoop(async () => {
//     speed += 10;
    
//     log("Current speed is:", speed, "km/h");
    
//     if (speed >= 70 || info.keys2.has(" ")) {
//         setName("Fast", "Car");
//         printName();
//         log("Destination reached. Stopping loop.");
//         stopLoop();
//     }
    
//     await sleep(400);
//     log("pos.x is:", info.missile.pos.x);
//     log("Current time is:", time);
// }, 500);`;
// // const initialCode = ''

// // Instantiate the app once the script loads
// const codeEditor = new CodeEditor(info, apiFunctions, initialCode);
// updateExternalVisuals();


// setInterval(() => {
//     info.missile.pos.x += 1;
//     info.missile.pos.x = parseFloat(info.missile.pos.x.toFixed(2));
//     codeEditor.setInfo(info);
// }, 1000);

// window.addEventListener('keydown', (e) => {
//     if (!codeEditor.isFocused && !info.keys2.has(e.key)) {
//         info.keys2.add(e.key);
//         codeEditor.setInfo(info);
//     }
// });

// window.addEventListener('keyup', (e) => {
//     if (!codeEditor.isFocused && info.keys2.has(e.key)) {
//         info.keys2.delete(e.key);
//         codeEditor.setInfo(info);
//     }
// });
