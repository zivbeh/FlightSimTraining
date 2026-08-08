export class CodeRunner {
    constructor(api = {}, callbacks = {}) {
        this.api = api;
        this.callbacks = {
            onSetInfo: callbacks.onSetInfo || (() => {}),
            onLog: callbacks.onLog || (() => {}),
            onStatusChange: callbacks.onStatusChange || (() => {}),
            onTimerUpdate: callbacks.onTimerUpdate || (() => {}),
        };
        this.activeWorker = null;
        this.syncInterval = null;
        this.watchdogInterval = null;
        this.currentWorkerURL = null;
        this.startTime = 0;
        this.runTime = 0;
        this.lastResponseTime = 0;
        this.info = {};
        this.running = false;
    }

    setInfo(info) {
        this.info = info;
        this.callbacks.onSetInfo(info);
    }

    log(...args) {
        this.callbacks.onLog(args);
    }

    run(userCode) {
        this.log("System: Initializing...");
        this.callbacks.onStatusChange(true);
        this.runTime = 0;
        this.startTime = Date.now();
        this.running = true;

        const workerBlobCode = this.generateWorkerCode(userCode);
        const blob = new Blob([workerBlobCode], { type: 'application/javascript' });
        this.currentWorkerURL = URL.createObjectURL(blob);
        this.activeWorker = new Worker(this.currentWorkerURL);

        const firstLineNo = 80;
        this.activeWorker.onerror = (error) => {
            if (error.message.includes("Content Security Policy")) {
                this.log("❌ SECURITY VIOLATION: Remote execution and 'eval' are strictly prohibited.");
            } else if (error.lineno !== undefined) {
                this.log("❌ SYNTAX ERROR: " + error.message + " (Line: " + (error.lineno - firstLineNo + 1) + ")");
            }
            this.stop();
            error.preventDefault();
        };

        // Listen for messages FROM worker and reset watchdog
        this.activeWorker.onmessage = (e) => {
            this.lastResponseTime = Date.now();
            this.handleWorkerMessage(e.data);
        };
        
        // Start live variable syncing TO worker
        this.syncInterval = setInterval(() => {
            if (this.activeWorker) {
                this.runTime = (Date.now() - this.startTime) / 1000;
                this.callbacks.onTimerUpdate(this.runTime);
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
    }

    stop() {
        if (!this.activeWorker) return
        this.activeWorker.terminate();
        this.activeWorker = null;
        this.running = false;
        clearInterval(this.syncInterval);
        clearInterval(this.watchdogInterval);

        if (this.currentWorkerURL) {
            URL.revokeObjectURL(this.currentWorkerURL);
            this.currentWorkerURL = null;
        }
        this.callbacks.onTimerUpdate(null);
        this.callbacks.onStatusChange(false);
        this.log("--- Process Stopped ---");
    }

    generateWorkerCode(userCode) {
        let apiHelpers = "";
        for (const funcName in this.api) {
            apiHelpers += `const ${funcName} = (...args) => postMessage({ cmd: '${funcName}', args: args });\n`;
        }

        const libraries = ['https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'];
        const libString = libraries.map(url => `'${url}'`).join(', ');

        const workerCode = `
        (function() {
            "use strict";
            try {
                if (${libraries.length > 0}) { importScripts(${libString}); }
            } catch (e) {
                postMessage({ cmd: 'LOG', args: ["❌ LIB ERROR: Failed to load external libraries."] });
            }
            const log = (...args) => postMessage({ cmd: 'LOG', args: args });
            const sleep = (ms) => new Promise(res => setTimeout(res, ms));
            const finish = () => postMessage({ cmd: 'FINISH' });
            ${apiHelpers}
            let time = 0;
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
            self.onerror = function(message, source, lineno, colno, error) {
                log("❌ RUNTIME ERROR: " + message + " (Line: " + lineno + ")");
                postMessage({ cmd: 'FINISH' });
                return true;
            };
            self.onunhandledrejection = function(event) {
                log("❌ ASYNC ERROR: " + (event.reason?.message || event.reason));
                postMessage({ cmd: 'FINISH' });
                event.preventDefault();
            };
            self.onmessage = function(e) {
                if (e.data.cmd === 'SYNC_INFO') {
                    info = e.data.value;
                    time = e.data.runTime;
                    postMessage({ cmd: 'HEARTBEAT' });
                }
            };
            (async function(log, finish, sleep, startLoop, stopLoop) {
                const self = undefined, globalThis = undefined, importScripts = undefined, fetch = undefined, XMLHttpRequest = undefined, WebSocket = undefined, Function = undefined, onmessage = undefined, onerror = undefined, onunhandledrejection = undefined;
                try {
                ${userCode}
                } catch (err) {
                    log("❌ STARTUP ERROR: " + err.message);
                    postMessage({ cmd: 'FINISH' });
                }
            })(log, finish, sleep, startLoop, stopLoop);
        })();`;
        return workerCode;
    }

    handleWorkerMessage(data) {
        const { cmd, args } = data;
        if (cmd === 'HEARTBEAT') {
            this.lastResponseTime = Date.now();
            return;
        }
        if (this.api && typeof this.api[cmd] === 'function') {
            this.api[cmd](this, ...(args || []));
            return;
        }
        switch(cmd) {
            case 'LOG': this.log(...args); break;
            case 'FINISH': this.stop(); break;
        }
    }
}
