// ==UserScript==
// @name         MiMo Agent 桥接器 (终极优化版 v18.7)
// @namespace    http://tampermonkey.net/
// @version      18.7
// @description  修复 content 中包含 </tool_calls> 字符串的问题
// @author       You
// @match        https://aistudio.xiaomimimo.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=xiaomimimo.com
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const WS_URL = 'ws://localhost:9527';
    const AUTH_TOKEN = 'mimo-agent-2026';

    let ws = null;
    let isConnected = false;
    let autoMode = true;
    let instructionMode = true;
    let isProcessing = false;
    let hookedButtons = new WeakSet();
    let processedSignatures = new Set();

    // ========== 样式 ==========
    GM_addStyle(`
        #mimo-agent-bar {
            position: fixed;
            bottom: 12px;
            right: 12px;
            height: 36px;
            padding: 0 20px;
            background: rgba(255,255,255,0.92);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(0,0,0,0.08);
            border-radius: 18px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 11px;
            color: #888;
            z-index: 99999;
            box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }
        .ma-dot { width: 8px; height: 8px; border-radius: 50%; background: #ccc; flex-shrink: 0; transition: all 0.3s; }
        .ma-dot.on { background: #34c759; box-shadow: 0 0 6px #34c75944; }
        .ma-dot.off { background: #ff3b30; }
        .ma-dot.busy { background: #ff9500; animation: ma-pulse 0.8s infinite; }
        @keyframes ma-pulse { 50% { opacity: 0.4; } }
        .ma-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; }
        .ma-text.success { color: #34c759; }
        .ma-text.error { color: #ff3b30; }
        .ma-text.working { color: #ff9500; }
        .ma-btn { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 4px 12px; color: #666; cursor: pointer; font-size: 10px; font-family: inherit; transition: all 0.15s; }
        .ma-btn:hover { background: #eee; border-color: #ccc; color: #333; }
        .ma-btn.active { background: #007aff; color: #fff; border-color: #007aff; }
        .ma-badge { background: #007aff; color: #fff; font-size: 10px; font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px; display: none; align-items: center; justify-content: center; padding: 0 5px; }
        .ma-badge.show { display: flex; }
        .ma-tool-card {
            background: #f7f8fa;
            border: 1px solid #e8eaed;
            border-radius: 10px;
            padding: 14px 16px;
            margin: 12px auto;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 12px;
            position: relative;
            width: 50rem;
            max-width: 90%;
            box-sizing: border-box;
            clear: both;
        }
        .ma-tool-card .tc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .ma-tool-card .tc-icon { width: 26px; height: 26px; border-radius: 7px; background: linear-gradient(135deg, #007aff, #0055d4); display: flex; align-items: center; justify-content: center; font-size: 13px; color: #fff; flex-shrink: 0; }
        .ma-tool-card .tc-title { color: #1a1a1a; font-weight: 600; font-size: 13px; }
        .ma-tool-card .tc-sub { color: #999; font-size: 10px; }
        .ma-tool-card .tc-item { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
        .ma-tool-card .tc-item:last-of-type { margin-bottom: 0; }
        .ma-tool-card .tc-name { color: #007aff; font-weight: 600; font-size: 12px; margin-bottom: 4px; }
        .ma-tool-card .tc-args { color: #888; font-family: "SF Mono", "Menlo", monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
        .ma-tool-card .tc-result { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0; color: #555; font-family: "SF Mono", "Menlo", monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; line-height: 1.5; }
        .ma-tool-card .tc-result::-webkit-scrollbar { width: 3px; }
        .ma-tool-card .tc-result::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }
        .ma-tool-card .tc-result.pending { color: #bbb; font-style: italic; font-family: inherit; }
        .ma-tool-card .tc-result.running { color: #ff9500; font-style: italic; font-family: inherit; }
        .ma-tool-card .tc-result.ok { color: #333; }
        .ma-tool-card .tc-result.err { color: #ff3b30; }
        .ma-exec-btn { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #007aff, #0055d4); color: #fff; border: none; border-radius: 8px; padding: 8px 20px; font-weight: 600; font-size: 13px; font-family: inherit; cursor: pointer; margin-top: 10px; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,122,255,0.2); }
        .ma-exec-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,122,255,0.3); }
        .ma-exec-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .ma-exec-btn.done { background: linear-gradient(135deg, #34c759, #28a745); box-shadow: 0 2px 8px rgba(52,199,89,0.2); }
        .ma-inject-status { margin-top: 8px; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-family: inherit; }
        .ma-inject-status.ok { background: rgba(52,199,89,0.08); border: 1px solid rgba(52,199,89,0.15); color: #34c759; }
        .ma-inject-status.err { background: rgba(255,59,48,0.05); border: 1px solid rgba(255,59,48,0.15); color: #ff3b30; }
        .ma-truncated-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; font-size: 11px; }
    `);

    const INSTRUCTION = `【系统指令：你拥有以下工具可调用。当需要使用工具时，必须使用代码块包裹，格式如下：

\`\`\`xml
<tool_calls>
[{"name":"工具名","args":{"参数名":"参数值"}}]
</tool_calls>
\`\`\`

可用工具：
1. exec - 执行 shell 命令。参数：cmd (string), cwd (string, 可选), timeout (number, 可选, 默认30000ms)
2. read_file - 读取文件内容。参数：path (string)
3. write_file - 写入文件。参数：path (string), content (string)
4. list_dir - 列出目录文件（支持递归）。参数：path (string), maxDepth (number, 可选, 默认1)
5. sys_info - 获取系统信息。无参数
6. clipboard - 剪贴板操作。参数：action ("get"|"set"), text (string, set时需要)
7. http_request - HTTP 请求。参数：url (string), method (string, 可选), headers (object, 可选), body (string, 可选)

示例：
\`\`\`xml
<tool_calls>
[{"name":"exec","args":{"cmd":"ls -la"}}]
</tool_calls>
\`\`\`

执行结果会以 <tool_results> 返回给你。收到结果后请继续完成任务。】`;

    function createStatusBar() {
        const bar = document.createElement('div');
        bar.id = 'mimo-agent-bar';
        bar.innerHTML =
            '<div class="ma-dot off" id="ma-status-dot"></div>' +
            '<div class="ma-text" id="ma-status-text">未连接</div>' +
            '<div class="ma-badge" id="ma-badge">0</div>' +
            '<button class="ma-btn" id="ma-auto-btn">自动: 开</button>' +
            '<button class="ma-btn active" id="ma-instr-btn">注入: 开</button>' +
            '<button class="ma-btn" id="ma-scan-btn">扫描</button>' +
            '<button class="ma-btn" id="ma-reconnect-btn">重连</button>';
        document.body.appendChild(bar);
    }

    function setStatus(text, type) {
        type = type || '';
        const el = document.getElementById('ma-status-text');
        if (el) {
            el.textContent = text;
            el.className = 'ma-text ' + type;
        }
    }

    function setDot(state) {
        const dot = document.getElementById('ma-status-dot');
        if (dot) dot.className = 'ma-dot ' + state;
    }

    function showBadge(count) {
        const badge = document.getElementById('ma-badge');
        if (badge) {
            badge.textContent = count;
            badge.classList.add('show');
            setTimeout(() => badge.classList.remove('show'), 5000);
        }
    }

    function connect() {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        setStatus('正在连接...', '');
        ws = new WebSocket(WS_URL);
        ws.onopen = () => {
            isConnected = true;
            setDot('on');
            setStatus('已连接', 'success');
        };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'connected') {
                setStatus(data.system.user + '@' + data.system.hostname, 'success');
                console.log('[MiMo Agent] 系统:', data.system);
            }
            if (data.type === 'error') {
                setStatus('错误: ' + data.message, 'error');
            }
        };
        ws.onclose = () => {
            isConnected = false;
            setDot('off');
            setStatus('已断开', 'error');
        };
        ws.onerror = () => {
            setDot('off');
            setStatus('连接失败', 'error');
        };
    }

    function sendToolCall(tool, args, id) {
        if (!isConnected) {
            setStatus('未连接', 'error');
            return false;
        }
        ws.send(JSON.stringify({ token: AUTH_TOKEN, tool, args, id }));
        return true;
    }

    // ========== 【关键修复】提取代码内容 ==========
    function extractCodeContent(preElement) {
        const innerPre = preElement.querySelector('pre[class*="shiki"]') || preElement;

        // 获取所有行
        const lines = innerPre.querySelectorAll('span.line, span[data-line]');
        if (lines.length > 0) {
            const lineTexts = Array.from(lines).map(span => {
                let text = span.textContent || '';
                text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
                return text;
            });
            const text = lineTexts.join('\n');
            console.log('[MiMo Agent] 从', lines.length, '行拼接，长度:', text.length);
            return text;
        }

        const codeEl = innerPre.querySelector('code');
        if (codeEl) {
            const text = codeEl.textContent || '';
            console.log('[MiMo Agent] 从 code 获取，长度:', text.length);
            return text;
        }

        const text = innerPre.textContent || '';
        console.log('[MiMo Agent] 从 pre 获取，长度:', text.length);
        return text;
    }

    // ========== 【核心修复】使用正则表达式提取最外层的 tool_calls 标签 ==========
    function extractToolCalls(codeText) {
        if (!codeText || codeText.length < 20) return null;

        console.log('[MiMo Agent] 原始文本前300字符:', codeText.substring(0, 300));

        // 使用正则表达式匹配最外层的 <tool_calls>...</tool_calls>
        // 关键：使用非贪婪匹配 + 确保匹配到最后一个闭合标签
        // 策略：找到所有 <tool_calls> 和 </tool_calls> 的位置，取最外层的配对

        const openTag = '<tool_calls>';
        const closeTag = '</tool_calls>';

        let openPositions = [];
        let closePositions = [];
        let pos = 0;

        // 收集所有标签位置
        while (true) {
            const openIdx = codeText.indexOf(openTag, pos);
            if (openIdx === -1) break;
            openPositions.push(openIdx);
            pos = openIdx + 1;
        }

        pos = 0;
        while (true) {
            const closeIdx = codeText.indexOf(closeTag, pos);
            if (closeIdx === -1) break;
            closePositions.push(closeIdx);
            pos = closeIdx + 1;
        }

        if (openPositions.length === 0 || closePositions.length === 0) {
            console.log('[MiMo Agent] 未找到完整的标签');
            return null;
        }

        // 找到最外层的配对（第一个 open 和最后一个 close，且 close > open）
        let bestStart = -1;
        let bestEnd = -1;

        for (let i = 0; i < openPositions.length; i++) {
            const openIdx = openPositions[i];
            // 找到第一个大于 openIdx 的 close
            for (let j = 0; j < closePositions.length; j++) {
                const closeIdx = closePositions[j];
                if (closeIdx > openIdx) {
                    // 检查这个区间内是否有其他 open（如果有，说明不是最外层）
                    let hasInnerOpen = false;
                    for (let k = i + 1; k < openPositions.length; k++) {
                        if (openPositions[k] > openIdx && openPositions[k] < closeIdx) {
                            hasInnerOpen = true;
                            break;
                        }
                    }

                    if (!hasInnerOpen) {
                        // 这是最外层的闭合
                        if (bestStart === -1 || openIdx < bestStart) {
                            bestStart = openIdx;
                            bestEnd = closeIdx + closeTag.length;
                        }
                        break;
                    }
                }
            }
        }

        if (bestStart === -1) {
            console.log('[MiMo Agent] 未找到最外层标签');
            return null;
        }

        // 提取内容
        let jsonStr = codeText.substring(bestStart + openTag.length, bestEnd - closeTag.length).trim();
        console.log('[MiMo Agent] 提取的 JSON 长度:', jsonStr.length, '前200字符:', jsonStr.substring(0, 200));

        // 尝试解析
        try {
            const calls = JSON.parse(jsonStr);
            if (!Array.isArray(calls)) {
                console.log('[MiMo Agent] 解析结果不是数组');
                return null;
            }

            const validCalls = calls.filter(c => {
                if (!c || typeof c !== 'object') return false;
                if (!c.name || typeof c.name !== 'string') return false;
                if (!c.args || typeof c.args !== 'object') return false;
                return true;
            });

            if (validCalls.length === 0) {
                console.log('[MiMo Agent] 没有有效的工具调用');
                return null;
            }

            console.log('[MiMo Agent] ✅ 成功解析，调用:', validCalls.map(c => c.name).join(', '));

            return {
                calls: validCalls,
                jsonStr: jsonStr,
                isTruncated: false
            };

        } catch (e) {
            console.log('[MiMo Agent] JSON 解析失败:', e.message);

            // 尝试修复 JSON
            return tryFixJson(jsonStr);
        }
    }

    // 修复 JSON（处理未转义的引号、换行符等）
    function tryFixJson(jsonStr) {
        console.log('[MiMo Agent] 尝试修复 JSON');

        // 策略1: 使用 JSON5 风格修复（处理字符串中的未转义字符）
        // 尝试提取完整的 JSON 数组
        let fixed = jsonStr;

        // 查找完整的 JSON 数组结束位置
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;
        let arrayStart = -1;
        let arrayEnd = -1;

        for (let i = 0; i < fixed.length; i++) {
            const ch = fixed[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (ch === '\\') {
                escapeNext = true;
                continue;
            }

            if (ch === '"' && !escapeNext) {
                inString = !inString;
                if (arrayStart === -1 && !inString && ch === '[') {
                    // 找到数组开始
                }
                continue;
            }

            if (!inString) {
                if (ch === '[' && arrayStart === -1) {
                    arrayStart = i;
                    bracketCount = 1;
                } else if (ch === '[' && arrayStart !== -1) {
                    bracketCount++;
                } else if (ch === ']' && arrayStart !== -1) {
                    bracketCount--;
                    if (bracketCount === 0) {
                        arrayEnd = i;
                        break;
                    }
                }
            }
        }

        if (arrayStart !== -1 && arrayEnd !== -1) {
            const candidate = fixed.substring(arrayStart, arrayEnd + 1);
            try {
                const parsed = JSON.parse(candidate);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const valid = parsed.filter(c => c && c.name && c.args);
                    if (valid.length > 0) {
                        console.log('[MiMo Agent] ✅ 修复成功（提取完整数组）');
                        return {
                            calls: valid,
                            jsonStr: candidate,
                            isTruncated: true
                        };
                    }
                }
            } catch (e) {
                console.log('[MiMo Agent] 提取数组后解析失败:', e.message);
            }
        }

        // 策略2: 修复 content 字段中的未转义字符
        try {
            // 使用更智能的方式：找到 "content" 字段，然后手动修复
            const contentMatch = fixed.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"(?=\s*[,\}]))/s);
            if (contentMatch) {
                let content = contentMatch[1];
                // 修复 content 中的未转义双引号
                content = content.replace(/(?<!\\)"/g, '\\"');
                // 修复换行
                content = content.replace(/\n/g, '\\n');
                content = content.replace(/\r/g, '\\r');
                content = content.replace(/\t/g, '\\t');

                const fixedContent = fixed.substring(0, contentMatch.index) +
                                     '"content":"' + content + '"' +
                                     fixed.substring(contentMatch.index + contentMatch[0].length);

                try {
                    const parsed = JSON.parse(fixedContent);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const valid = parsed.filter(c => c && c.name && c.args);
                        if (valid.length > 0) {
                            console.log('[MiMo Agent] ✅ 修复成功（修复 content 字段）');
                            return {
                                calls: valid,
                                jsonStr: fixedContent,
                                isTruncated: true
                            };
                        }
                    }
                } catch (e) {
                    console.log('[MiMo Agent] 修复 content 后仍失败:', e.message);
                }
            }
        } catch (e) {
            console.log('[MiMo Agent] content 修复失败:', e.message);
        }

        console.log('[MiMo Agent] 无法修复 JSON');
        return null;
    }

    // ========== 扫描工具调用 ==========
    function scanForToolCalls() {
        if (isProcessing) return [];

        const outerPres = document.querySelectorAll('pre[data-testid="shiki-container"]');
        console.log('[MiMo Agent] 扫描', outerPres.length, '个代码块');

        const found = [];

        for (let i = outerPres.length - 1; i >= 0; i--) {
            const outerPre = outerPres[i];
            if (outerPre.dataset.mimoAgentProcessed === 'true') continue;

            const codeText = extractCodeContent(outerPre);

            const hasToolCalls = codeText.includes('<tool_calls>');
            if (!hasToolCalls) continue;

            console.log('[MiMo Agent] 发现 tool_calls，长度:', codeText.length);

            const extraction = extractToolCalls(codeText);

            if (!extraction) {
                console.log('[MiMo Agent] 无法提取有效工具调用');
                continue;
            }

            const { calls, isTruncated } = extraction;

            const signature = calls.map(c => c.name + '-' + JSON.stringify(c.args).slice(0, 100)).join('|');
            if (processedSignatures.has(signature)) {
                console.log('[MiMo Agent] 已处理过');
                outerPre.dataset.mimoAgentProcessed = 'true';
                continue;
            }
            processedSignatures.add(signature);

            console.log('[MiMo Agent] ✅ 有效工具调用:', calls.map(c => c.name).join(', '));

            outerPre.dataset.mimoAgentProcessed = 'true';

            const container = outerPre.closest('[class*="bg-mimo-bg-message"], [class*="message"], .message, .group') ||
                             outerPre.parentElement;

            found.push({
                calls: calls,
                container: container,
                codeBlock: outerPre,
                isTruncated: isTruncated
            });

            break;
        }

        return found;
    }

    function injectExecuteUI(calls, container, isTruncated) {
        if (!container) return;
        if (container.querySelector('.ma-tool-card')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'ma-tool-card';

        let itemsHTML = '';
        const uniqueId = Date.now();

        calls.forEach((call, i) => {
            let argsStr = JSON.stringify(call.args, null, 2);
            if (argsStr.length > 500) {
                argsStr = argsStr.substring(0, 500) + '... (已截断显示)';
            }

            itemsHTML +=
                '<div class="tc-item">' +
                '<div class="tc-name">' + (i + 1) + '. ' + esc(call.name) + '</div>' +
                '<div class="tc-args">' + esc(argsStr) + '</div>' +
                '<div class="tc-result pending" id="ma-result-' + uniqueId + '-' + i + '">等待执行...</div>' +
                '</div>';
        });

        const warningHtml = isTruncated ?
            '<div class="ma-truncated-warning">⚠️ JSON 曾被截断，已尝试修复</div>' : '';

        wrapper.innerHTML =
            '<div class="tc-header">' +
            '<div class="tc-icon">⚡</div>' +
            '<div>' +
            '<div class="tc-title">工具调用 x ' + calls.length + '</div>' +
            '<div class="tc-sub">点击执行，结果自动回填</div>' +
            '</div>' +
            '</div>' +
            warningHtml +
            itemsHTML +
            '<button class="ma-exec-btn" id="ma-exec-' + uniqueId + '">⚡ 执行全部</button>' +
            '<div id="ma-inject-status-' + uniqueId + '"></div>';

        const outerContainer = container.closest('[class*="relative"], [class*="my-2"]') || container;
        if (outerContainer && outerContainer.parentNode) {
            if (outerContainer.nextSibling) {
                outerContainer.parentNode.insertBefore(wrapper, outerContainer.nextSibling);
            } else {
                outerContainer.parentNode.appendChild(wrapper);
            }
        } else {
            container.appendChild(wrapper);
        }

        document.getElementById('ma-exec-' + uniqueId).addEventListener('click', () => {
            executeAll(calls, document.getElementById('ma-exec-' + uniqueId), uniqueId);
        });
    }

    async function executeAll(calls, btn, uniqueId) {
        if (!isConnected) {
            setStatus('未连接到本地服务器', 'error');
            alert('未连接本地服务器');
            return;
        }

        isProcessing = true;
        btn.disabled = true;
        btn.textContent = '⏳ 执行中...';
        setDot('busy');
        setStatus('正在执行...', 'working');

        const results = [];

        for (let i = 0; i < calls.length; i++) {
            const call = calls[i];
            const el = document.getElementById('ma-result-' + uniqueId + '-' + i);
            if (el) {
                el.textContent = '执行中...';
                el.className = 'tc-result running';
            }

            setStatus('执行: ' + call.name, 'working');

            const id = 'tool_' + Date.now() + '_' + i;

            const result = await new Promise((resolve) => {
                const handler = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'tool_result' && data.id === id) {
                            ws.removeEventListener('message', handler);
                            resolve(data.result);
                        }
                    } catch (e) {}
                };
                ws.addEventListener('message', handler);
                sendToolCall(call.name, call.args, id);

                setTimeout(() => {
                    ws.removeEventListener('message', handler);
                    resolve({ error: '超时 (30s)' });
                }, 30000);
            });

            results.push({ name: call.name, result });

            if (el) {
                const text = result.error
                    ? '✗ ' + result.error
                    : (result.stdout || result.content || JSON.stringify(result, null, 2) || '完成');
                el.textContent = text.slice(0, 5000);
                el.className = 'tc-result ' + (result.error ? 'err' : 'ok');
            }
        }

        btn.textContent = '✅ 执行完毕';
        btn.className = 'ma-exec-btn done';
        setDot('on');

        const resultBlock = '<tool_results>\n' + JSON.stringify(results, null, 2) + '\n</tool_results>';
        const injected = fillInput(resultBlock);

        const statusEl = document.getElementById('ma-inject-status-' + uniqueId);
        if (injected) {
            if (statusEl) statusEl.innerHTML = '<div class="ma-inject-status ok">✅ 已填入，即将发送...</div>';
            setStatus('已填入，即将发送', 'success');
            setTimeout(() => {
                clickSend();
                isProcessing = false;
            }, 1000);
        } else {
            if (statusEl) statusEl.innerHTML = '<div class="ma-inject-status err">⚠ 未找到输入框，已复制</div>';
            setStatus('已复制到剪贴板', 'error');
            try { navigator.clipboard.writeText(resultBlock); } catch (e) {}
            isProcessing = false;
        }
    }

    function fillInput(text) {
        const textareas = document.querySelectorAll('textarea');
        for (let ta of textareas) {
            if (ta.offsetHeight < 30) continue;
            ta.focus();
            try {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                setter.call(ta, text);
            } catch (e) {
                ta.value = text;
            }
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }

    function clickSend() {
        const btns = document.querySelectorAll('button');
        for (let btn of btns) {
            if (btn.disabled || btn.offsetHeight === 0) continue;
            if (btn.closest('#mimo-agent-bar') || btn.closest('.ma-tool-card')) continue;
            const rect = btn.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 250 && btn.querySelector('svg')) {
                btn.click();
                return true;
            }
        }
        return false;
    }

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function shouldSkipInstruction(text) {
        if (!text || !text.trim()) return true;
        if (text.includes('【系统指令：你拥有以下工具')) return true;
        if (text.includes('<tool_results>')) return true;
        return false;
    }

    function getInputTextarea() {
        const selectors = [
            'textarea[placeholder*="提问"]',
            'textarea[placeholder*="输入"]',
            'textarea',
            '[contenteditable="true"]'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.offsetHeight > 30) return el;
        }
        return null;
    }

    function injectInstruction() {
        if (!instructionMode) return false;
        const ta = getInputTextarea();
        if (!ta) return false;
        const original = ta.value || ta.innerText || '';
        if (shouldSkipInstruction(original)) return false;
        const newContent = INSTRUCTION + '\n\n' + original;
        ta.focus();
        try {
            const prototype = ta.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
            setter.call(ta, newContent);
        } catch (e) {
            ta.value = newContent;
        }
        ['input', 'change', 'keyup'].forEach(evt => {
            ta.dispatchEvent(new Event(evt, { bubbles: true }));
        });
        setStatus('指令已注入', 'success');
        return true;
    }

    function hookSendButtons() {
        const possibleButtons = document.querySelectorAll(`
            button[class*="send"],
            button:has(svg),
            [role="button"]
        `);
        possibleButtons.forEach(btn => {
            if (hookedButtons.has(btn)) return;
            if (btn.closest('#mimo-agent-bar')) return;
            const rect = btn.getBoundingClientRect();
            const isInInputArea = rect.bottom > window.innerHeight - 200;
            if (!isInInputArea && !btn.querySelector('svg')) return;
            hookedButtons.add(btn);
            btn.addEventListener('click', () => {
                if (!instructionMode || isProcessing) return;
                injectInstruction();
            }, true);
        });
    }

    function hookKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                const ta = getInputTextarea();
                if (ta && (e.target === ta || ta.contains(e.target))) {
                    injectInstruction();
                }
            }
        }, true);
    }

    function startSendObserver() {
        hookSendButtons();
        hookKeyboard();
        const obs = new MutationObserver(() => {
            hookSendButtons();
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setInterval(hookSendButtons, 2000);
    }

    function scanAndInject() {
        if (isProcessing || !autoMode) return;

        const found = scanForToolCalls();
        if (found.length > 0) {
            found.forEach(item => {
                injectExecuteUI(item.calls, item.container, item.isTruncated);
                showBadge(item.calls.length);
                setStatus(`检测到 ${item.calls.length} 个工具调用${item.isTruncated ? ' (已修复)' : ''}`, 'working');
            });
        }
    }

    function startObserver() {
        let timeout;
        const observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(scanAndInject, 600);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(scanAndInject, 1500);
    }

    function init() {
        createStatusBar();
        connect();
        startObserver();
        startSendObserver();

        document.getElementById('ma-reconnect-btn').addEventListener('click', () => {
            if (ws) ws.close();
            setTimeout(connect, 300);
        });

        document.getElementById('ma-scan-btn').addEventListener('click', () => {
            const found = scanForToolCalls();
            if (found.length > 0) {
                found.forEach(item => {
                    injectExecuteUI(item.calls, item.container, item.isTruncated);
                });
                setStatus('扫描到 ' + found.length + ' 组工具调用', 'working');
            } else {
                setStatus('未检测到工具调用', '');
            }
        });

        const autoBtn = document.getElementById('ma-auto-btn');
        autoBtn.addEventListener('click', () => {
            autoMode = !autoMode;
            autoBtn.textContent = '自动: ' + (autoMode ? '开' : '关');
            autoBtn.classList.toggle('active', autoMode);
        });

        const instrBtn = document.getElementById('ma-instr-btn');
        instrBtn.addEventListener('click', () => {
            instructionMode = !instructionMode;
            instrBtn.textContent = '注入: ' + (instructionMode ? '开' : '关');
            instrBtn.classList.toggle('active', instructionMode);
        });

        GM_registerMenuCommand('重连服务器', () => {
            if (ws) ws.close();
            setTimeout(connect, 300);
        });

        GM_registerMenuCommand('扫描工具调用', () => {
            document.getElementById('ma-scan-btn').click();
        });

        GM_registerMenuCommand('立即注入指令', () => {
            injectInstruction();
        });

        console.log('[MiMo Agent] v18.7 初始化完成 - 修复 content 中包含闭合标签的问题');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();