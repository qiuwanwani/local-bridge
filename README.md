# MiMo Agent 本地桥接器

将小米 AI Studio (MiMo) 网页端与本地计算机连接的工具，允许 AI 在浏览器中调用本地系统命令和文件操作。

## 功能特性

- 🚀 **本地命令执行**：让 AI 直接在您的计算机上执行命令
- 📁 **文件操作**：读取、写入和管理本地文件
- 🌐 **HTTP 请求**：发送网络请求
- 📋 **剪贴板操作**：读写系统剪贴板
- 💻 **系统信息**：获取当前系统状态
- 🔒 **安全机制**：命令白名单 + 危险命令拦截

## 安装与使用

### 前置要求

- Node.js (v14 或更高版本)
- 浏览器（推荐 Chrome/Edge）
- Tampermonkey 浏览器扩展

### 快速开始

1. 克隆或下载项目
2. 安装依赖：
```bash
npm install
```

3. 启动服务（Windows 用户双击 `start.bat`）：
```bash
node server.js
```

4. 安装油猴脚本：
   - 在浏览器中打开 `script.js`
   - 复制全部内容
   - 在 Tampermonkey 中创建新脚本并粘贴
   - 保存脚本

5. 访问 [小米 AI Studio](https://aistudio.xiaomimimo.com/) 开始使用

## 可用工具

| 工具名 | 功能 |
|--------|------|
| `exec` | 执行 shell 命令 |
| `read_file` | 读取文件内容（限制 5MB） |
| `write_file` | 写入文件 |
| `list_dir` | 列出目录（支持递归） |
| `sys_info` | 获取系统信息 |
| `clipboard` | 剪贴板读写操作 |
| `http_request` | 发送 HTTP 请求 |

## 安全说明

⚠️ **重要提示**：此工具允许 AI 执行本地命令，请确保仅在可信赖的环境中使用。

### 安全措施

- **命令白名单**：仅允许特定命令执行
- **危险命令拦截**：阻止 `rm -rf` 等危险操作
- **Token 认证**：本地服务器需要认证令牌
- **文件大小限制**：读取文件限制为 5MB

## 项目结构

```
local-bridge/
├── package.json      # 项目配置
├── server.js         # 本地 WebSocket 服务器
├── script.js         # 油猴脚本
├── start.bat         # Windows 启动脚本
├── LICENSE           # MIT 协议
└── README.md         # 本文件
```

## 技术栈

- **后端**：Node.js + WebSocket
- **前端**：Tampermonkey (UserScript) + Vanilla JS
- **通信协议**：WebSocket

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件
