// server.js — MiMo Agent 本地执行器
const WebSocket = require('ws');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9527;
const AUTH_TOKEN = 'mimo-agent-2026';

// ===== 安全层 =====
const ALLOWED_CMDS = new Set([
    'ls', 'dir', 'pwd', 'whoami', 'date', 'echo', 'cat', 'head', 'tail',
    'wc', 'grep', 'find', 'sort', 'uniq', 'awk', 'sed', 'tr', 'cut',
    'tree', 'du', 'df', 'free', 'uptime', 'uname', 'hostname', 'env',
    'node', 'python', 'python3', 'pip', 'npm', 'npx', 'yarn', 'pnpm',
    'git', 'curl', 'wget', 'zip', 'unzip', 'tar',
    'mkdir', 'cp', 'mv', 'touch', 'chmod', 'chown',
    'open', 'code', 'xdg-open',
    'ps', 'top', 'kill', 'lsof', 'netstat', 'ss', 'ip', 'ifconfig',
    'ping', 'traceroute', 'nslookup', 'dig',
    'jq', 'yq', 'xmllint',
    'ffmpeg', 'convert', 'identify',
    'sqlite3', 'mysql', 'psql',
    'docker', 'kubectl',
    'systemctl', 'service',
]);

const BLOCKED = [
    'rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=', '> /dev/',
    'shutdown', 'reboot', 'halt', 'poweroff',
    'passwd', 'userdel', 'useradd',
    'iptables -F', 'iptables --flush',
    ':(){:|:&};:', 'chmod 777 /',
    '/etc/shadow', '/etc/passwd',
    'history -c', 'unset HISTFILE',
];

function validate(cmd) {
    const t = cmd.trim();
    for (const b of BLOCKED) {
        if (t.includes(b)) return { ok: false, reason: `危险操作已拦截: 包含 "${b}"` };
    }
    const first = t.split(/\s+/)[0].split('/').pop();
    if (!ALLOWED_CMDS.has(first)) {
        return { ok: false, reason: `命令 "${first}" 不在白名单中。如需添加请编辑 server.js 中的 ALLOWED_CMDS` };
    }
    return { ok: true };
}

// ===== 工具定义 =====
const tools = {
    exec({ cmd, cwd, timeout = 30000 }) {
        return new Promise((resolve) => {
            const v = validate(cmd);
            if (!v.ok) return resolve({ error: v.reason });
            exec(cmd, { timeout, maxBuffer: 2 * 1024 * 1024, cwd: cwd || os.homedir() },
                (err, stdout, stderr) => {
                    resolve({
                        stdout: (stdout || '').trim(),
                        stderr: (stderr || '').trim(),
                        exitCode: err ? err.code : 0,
                        error: err ? err.message : null,
                    });
                });
        });
    },

    read_file({ path: p }) {
        return new Promise((resolve) => {
            const fp = path.resolve(p);
            fs.stat(fp, (err, stat) => {
                if (err) return resolve({ error: err.message });
                if (stat.size > 5 * 1024 * 1024) {
                    return resolve({ error: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)} MB)，超过 5MB 限制` });
                }
                fs.readFile(fp, 'utf8', (err, data) => {
                    if (err) return resolve({ error: err.message });
                    resolve({ content: data, path: fp, size: stat.size });
                });
            });
        });
    },

    write_file({ path: p, content }) {
        return new Promise((resolve) => {
            const fp = path.resolve(p);
            const dir = path.dirname(fp);
            fs.mkdir(dir, { recursive: true }, (err) => {
                if (err) return resolve({ error: err.message });
                fs.writeFile(fp, content, 'utf8', (err) => {
                    if (err) return resolve({ error: err.message });
                    resolve({ success: true, path: fp, bytes: Buffer.byteLength(content, 'utf8') });
                });
            });
        });
    },

    list_dir({ path: p, maxDepth = 1 }) {
        return new Promise((resolve) => {
            const dp = path.resolve(p || os.homedir());
            function walk(dir, depth) {
                return new Promise((res) => {
                    fs.readdir(dir, { withFileTypes: true }, (err, entries) => {
                        if (err) return res([]);
                        const items = entries.map(e => {
                            const full = path.join(dir, e.name);
                            const item = {
                                name: e.name,
                                path: full,
                                type: e.isDirectory() ? 'directory' : 'file',
                            };
                            if (e.isDirectory() && depth < maxDepth) {
                                return walk(full, depth + 1).then(children => {
                                    item.children = children;
                                    return item;
                                });
                            }
                            return Promise.resolve(item);
                        });
                        Promise.all(items).then(res);
                    });
                });
            }
            walk(dp, 0).then(items => resolve({ path: dp, items, count: items.length }));
        });
    },

    sys_info() {
        return Promise.resolve({
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            user: os.userInfo().username,
            home: os.homedir(),
            cpus: os.cpus().length + ' × ' + os.cpus()[0]?.model,
            totalMem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
            freeMem: (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
            uptime: (os.uptime() / 3600).toFixed(1) + ' 小时',
            nodeVersion: process.version,
        });
    },

    clipboard({ action = 'get', text }) {
        return new Promise((resolve) => {
            if (action === 'get') {
                const cmd = process.platform === 'darwin' ? 'pbpaste'
                    : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard -o';
                exec(cmd, (err, stdout) => {
                    resolve({ content: stdout?.trim() || '', error: err?.message });
                });
            } else if (action === 'set') {
                const cmd = process.platform === 'darwin' ? `echo ${JSON.stringify(text)} | pbcopy`
                    : process.platform === 'win32' ? `echo ${text} | clip`
                    : `echo ${JSON.stringify(text)} | xclip -selection clipboard`;
                exec(cmd, (err) => {
                    resolve({ success: !err, error: err?.message });
                });
            }
        });
    },

    http_request({ url, method = 'GET', headers = {}, body }) {
        return new Promise((resolve) => {
            // 使用内置 https/http
            const mod = url.startsWith('https') ? require('https') : require('http');
            const opts = { method, headers };
            const req = mod.request(url, opts, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data.slice(0, 50000), // 限制返回大小
                }));
            });
            req.on('error', (err) => resolve({ error: err.message }));
            if (body) req.write(body);
            req.end();
        });
    },
};

// ===== WebSocket 服务器 =====
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`\n🟢 连接: ${ip}  ${new Date().toLocaleString()}`);

    ws.send(JSON.stringify({
        type: 'connected',
        tools: Object.keys(tools),
        system: {
            hostname: os.hostname(),
            platform: os.platform(),
            user: os.userInfo().username,
        },
    }));

    ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch {
            return ws.send(JSON.stringify({ type: 'error', message: '无效 JSON' }));
        }

        if (msg.token !== AUTH_TOKEN) {
            return ws.send(JSON.stringify({ type: 'error', message: '认证失败' }));
        }

        console.log(`📩 [${msg.tool}]`, JSON.stringify(msg.args || {}).slice(0, 100));

        if (!tools[msg.tool]) {
            return ws.send(JSON.stringify({
                type: 'tool_result',
                id: msg.id,
                tool: msg.tool,
                result: { error: `未知工具: ${msg.tool}` },
            }));
        }

        try {
            const result = await tools[msg.tool](msg.args || {});
            ws.send(JSON.stringify({
                type: 'tool_result',
                id: msg.id,
                tool: msg.tool,
                result,
            }));
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'tool_result',
                id: msg.id,
                tool: msg.tool,
                result: { error: err.message },
            }));
        }
    });

    ws.on('close', () => console.log(`🔴 断开: ${ip}`));
});

console.log(`
┌─────────────────────────────────────────┐
│  🤖 MiMo Agent 本地执行器               │
│  端口: ${PORT}                            │
│  工具: ${Object.keys(tools).join(', ')}  │
│  等待油猴脚本连接...                     │
└─────────────────────────────────────────┘
`);
