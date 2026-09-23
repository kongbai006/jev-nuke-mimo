# Jev 助手 · Nuke 版

基于 **nuke 脚本引擎**（ES Module / JS）的聊天辅助工具。对方私聊发消息后，**本地秒判**意图 / 危险等级 / 情绪（开心·难过·生气）；可选调用小米 MiMo 大模型生成候选回复，**手动确认才发送，绝不自动发消息**。一份脚本在 nuke 下同时适配微信和 QQ 私聊。

> 本仓库是 **Nuke（JS 脚本）版本**，需要 nuke 运行时加载。
> QStory（Java 插件）版本请见另一个仓库：`kongbai006/jev-qstory-mimo`。

## 功能

- 收到私聊文本 → 立刻弹窗显示：意图 / 危险等级(1-9) / 情绪百分比；
- 结合最近 8 条对方消息做本地关键词判断，当前消息权重最高；
- 可选第二轮：调用 MiMo 返回候选回复，逐条确认才发；
- 群聊一律忽略，只处理单人私聊。

## 环境要求

- 已安装 **nuke** 脚本引擎（支持 `nuke:messaging` / `nuke:ui` / `nuke:http` 模块）；
- 需要 MiMo API 密钥（只用本地判断则不需要联网）。

## 安装

1. 下载本仓库 Release 里的 `jev-nuke-vX.X.X.nsz`（.nsz 即脚本安装包，本质是 zip）；
2. 在 nuke 里用「导入」选择该 `.nsz`；
3. 点脚本右侧齿轮 → **「开启的聊天」**，勾选要监控的微信 / QQ 私聊会话（**不选收不到消息**）；
4. 打开右上角总开关。

## 可修改选项（在 `main.js` 顶部）

nuke 这版的设置界面不渲染，所有配置写在 `main.js` 第 8 行起的 `CONFIG` 块里：

```js
const CONFIG = {
    apiKey: "你的MiMo密钥填这里",   // sk- 开头，必填
    llmEnabled: false,              // true=开启第二轮AI（部分nuke版本会导致宿主网络崩溃，默认关）
    contextRounds: 6,              // 发给AI的最近消息条数
    relationship: "",               // 你和对方的关系
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.6-flash",
};
```

修改方式：解压 `.nsz` → 编辑 `main.js` → 重新压缩为 zip → 改后缀为 `.nsz` → 重新导入。

> 注意：在部分 nuke 版本上，`llmEnabled: true` 发起 HTTP 请求时会导致微信闪退，因此默认关闭。本地秒判不受影响。

## 文件说明

- `main.js` — 主逻辑与 CONFIG 配置；
- `manifest.json` — 权限声明（仅 network）；
- `config.schema.json` — 配置占位（用于点亮 nuke 的齿轮入口）。

## 说明

- 情绪只分 **开心 / 难过 / 生气** 三类，无匹配时显示「平静」；
- 脚本只记录它运行期间收到的消息；
- 判断结果仅供娱乐参考；
- 本工具不绕过任何平台安全机制。
