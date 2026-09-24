// Jev 助手（nuke 版）v1.2 — ES Module
// 私聊收到消息 → 本地秒判意图/情绪/危险 → 可选 MiMo 生成候选 → 手动确认才发送
import { onMessage, sendText } from "nuke:messaging";
import { toast, alert, confirm } from "nuke:ui";
import { info, warn } from "nuke:log";
import { fetch } from "nuke:http";

// ============ ★ 在这里改设置 ★ ============
// 支持任意 OpenAI 兼容 API：小米 MiMo / DeepSeek / 通义 / 智谱 / OpenAI 等
const CONFIG = {
    apiKey: "你的API密钥填这里",            // sk- 开头，任意厂商
    llmEnabled: false,                    // false=只本地秒判，不调AI（开AI在部分nuke版本会崩微信，先关）
    contextRounds: 6,                     // 发给AI的最近消息条数
    relationship: "",                     // 和对方的关系，如：对方是我暧昧对象
    baseUrl: "https://api.xiaomimimo.com/v1",  // 默认 MiMo；DeepSeek 改 https://api.deepseek.com/v1
    model: "mimo-v2.6-flash",             // 也可填 deepseek-chat / qwen-plus / glm-4-flash
};
// =========================================

let unsubscribe = null;
const histories = new Map();

function pushHistory(convId, from, text) {
    if (!text || !text.trim()) return;
    let arr = histories.get(convId);
    if (!arr) { arr = []; histories.set(convId, arr); }
    arr.push({ from, text: text.trim() });
    const max = Math.max(2, CONFIG.contextRounds) * 2;
    while (arr.length > max) arr.shift();
}

function scoreText(t) {
    let happy = 0, sad = 0, angry = 0;
    const has = (ws) => ws.some(w => t.includes(w));
    // 开心
    if (has(["哈哈", "嘿嘿", "嘻嘻", "呵呵", "笑死", "太好了", "好开心", "真高兴", "好棒", "好赞",
             "好喜欢", "太可爱", "很开心", "真开心", "爱你", "喜欢你", "开心", "高兴", "耶", "✨", "😊", "🤗", "😆"])) happy += 60;
    if (has(["嗯呐", "好呀", "可以呀", "晚安", "么么哒", "想你"])) happy += 20;
    // 难过（含叹气、否定情绪、疲惫低落、身体不适）
    if (has(["呜呜", "哭了", "流泪", "难过", "伤心", "难受", "好累", "心累", "好累啊",
             "郁闷", "好想哭", "想哭", "emo", "不开心", "不好受", "委屈", "失望", "沮丧",
             "痛苦", "悲哀", "消沉", "闷闷不乐", "唉", "哎", "555", "抑郁",
             "疼", "疼死", "肚子疼", "姨妈", "不舒服", "生病", "发烧", "头疼", "难受死", "😢", "🥺", "😭"])) sad += 70;
    // 生气（脏话、攻击、连续标点）
    if (has(["滚蛋", "烦死了", "气死了", "气死", "生气", "好气", "气得", "气愤", "气啊", "气死人",
             "操你", "cnm", "他妈", "TM", "tm", "他妈的",
             "够了", "闭嘴", "垃圾", "废物", "气人", "可恶", "混蛋", "王八蛋", "讨厌", "别烦",
             "打死", "去死", "愤怒", "？？", "！！", "！！！", "无语", "😤", "😠"])) angry += 85;
    return { happy, sad, angry };
}

function pickEmotion(happy, sad, angry) {
    const sum = happy + sad + angry;
    if (sum <= 0) return { emotion: "平静", pct: 0 };
    if (angry >= 85 && angry >= happy && angry >= sad) return { emotion: "生气", pct: Math.min(99, Math.round(angry / sum * 100)) };
    if (sad >= 70 && sad >= happy && sad >= angry) return { emotion: "难过", pct: Math.min(99, Math.round(sad / sum * 100)) };
    if (happy >= sad && happy >= angry) return { emotion: "开心", pct: Math.round(happy / sum * 100) };
    if (sad >= angry) return { emotion: "难过", pct: Math.round(sad / sum * 100) };
    return { emotion: "生气", pct: Math.round(angry / sum * 100) };
}

function quickAnalyze(convId, curText) {
    const recent = (histories.get(convId) || []).filter(m => m.from === "other").slice(-8);
    let happy = 0, sad = 0, angry = 0;
    let intent = "闲聊", danger = 3;
    const texts = recent.map(m => m.text);
    const all = texts.join(" ") + " " + (curText || "");
    // 当前消息权重最高（3倍），历史消息按新旧线性加权
    const cur = scoreText(curText || "");
    happy += cur.happy * 3; sad += cur.sad * 3; angry += cur.angry * 3;
    texts.forEach((t, i) => {
        const s = scoreText(t);
        const w = 0.5 + (i / texts.length);
        happy += s.happy * w;
        sad += s.sad * w;
        angry += s.angry * w;
    });
    const e = pickEmotion(happy, sad, angry);
    // 意图优先看当前消息，再看历史
    const curHas = (ws) => ws.some(w => (curText || "").includes(w));
    const allHas = (ws) => texts.some(t => ws.some(w => t.includes(w)));
    if (curHas(["好气", "气死", "生气", "气得", "可笑", "可笑", "什么人", "无语", "讨厌"])) intent = "吐槽/发泄情绪";
    else if (curHas(["难过", "想哭", "难受", "委屈", "心累", "不开心", "emo", "抑郁", "不好受", "累", "饿坏", "饭都没吃", "疼", "姨妈", "肚子疼", "不舒服", "生病", "发烧"])) intent = "情绪倾诉/求安慰/求关心";
    else if (curHas(["在吗", "在干嘛", "睡了吗", "还不睡", "忙吗", "想你", "在干嘛呢", "喜欢你吗"])) intent = "日常问候/想找你";
    else if (curHas(["为什么", "怎么回事", "什么意思", "怎么办", "为什么不理"])) intent = "询问/求关注";
    else if (curHas(["好吗", "可以吗", "行不行", "要不"])) intent = "征求意见/约你";
    else if (curHas(["又", "怎么还", "每次都", "总是"])) intent = "抱怨";
    else if (allHas(["难过", "想哭", "难受", "委屈", "不开心"])) intent = "情绪倾诉/求安慰";
    else if (allHas(["想你", "喜欢你", "爱你"])) intent = "日常问候/想找你";
    if (intent.includes("情绪") || intent === "吐槽/发泄情绪") danger = 6;
    if (intent === "抱怨") danger = Math.max(danger, 5);
    if (e.emotion === "生气" && e.pct > 40) danger = Math.max(danger, 7);
    if (e.emotion === "难过" && e.pct > 50) danger = Math.max(danger, 5);
    if ((all || "").length <= 6) danger = Math.min(danger, 4);
    // 情绪强度：百分比高或连续多条同情绪 = 强烈
    const strength = (e.pct >= 60 || texts.length >= 3) ? "强烈" : "一般";
    // 主动度：对方连发多条 / 用"你"开头 / 带问号 = 在主动找你
    const t = curText || "";
    const initiative = (texts.length >= 2 || /^你/.test(t) || t.includes("？") || t.includes("?") || t.includes("吗")) ? "主动找你" : "正常";
    return { intent, danger, emotion: e.emotion, pct: e.pct, strength, initiative };
}

function formatQuick(q, text) {
    return "对方刚说：「" + text + "」\n\n【快速判断】\n意图：" + q.intent +
        "\n危险等级：" + q.danger + "/9\n情绪：" + q.emotion + " " + q.pct + "%（" + q.strength + "）" +
        "\n互动：" + q.initiative + "\n\n" +
        (CONFIG.llmEnabled ? "正在调用 AI…" : "（AI 已关闭）");
}

function buildHistoryMessages(convId) {
    return (histories.get(convId) || []).map(m => ({
        role: m.from === "me" ? "assistant" : "user", content: m.text
    }));
}

async function callMimo(convId) {
    const rel = CONFIG.relationship ? "；关系：" + CONFIG.relationship : "";
    const sys = "高情商聊天助手。只返回JSON：" +
        '{"intent":"","danger":1-9,"emotion":"开心/难过/生气","pct":0-100,"action":"一句话建议","replies":["候选1","候选2","候选3"]}。' +
        "回复口语自然。" + rel;
    // 只发最近 contextRounds*2 条，减少 token 加快响应
    const hist = (histories.get(convId) || []).slice(-Math.max(2, CONFIG.contextRounds) * 2);
    const messages = [{ role: "system", content: sys }].concat(
        hist.map(m => ({ role: m.from === "me" ? "assistant" : "user", content: m.text }))
    );
    const url = CONFIG.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    info("jev: 开始请求 MiMo", { url: url, msgs: messages.length });
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + CONFIG.apiKey },
        body: JSON.stringify({ model: CONFIG.model, messages: messages, temperature: 0.6, max_tokens: 400 }),
        timeoutMs: 8000
    });
    info("jev: 收到响应", { status: res.status });
    const text = await res.text();
    info("jev: 响应长度", { len: (text || "").length });
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error("返回不是JSON: " + String(text).slice(0, 100)); }
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    let s = content.trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    const obj = JSON.parse(s);
    if (!Array.isArray(obj.replies) || !obj.replies.length) obj.replies = ["（无建议）"];
    obj.danger = Number(obj.danger) || 5;
    obj.pct = Number(obj.pct) || 50;
    return obj;
}

function formatAI(ai) {
    let m = "【AI 建议】\n意图：" + ai.intent + "\n危险：" + ai.danger + "/9\n情绪：" +
        ai.emotion + " " + ai.pct + "%\n建议：" + ai.action + "\n\n候选：\n";
    ai.replies.forEach((r, i) => { m += (i + 1) + ". " + r + "\n"; });
    return m;
}

async function handleMessage(event) {
    try {
        if (!event || !event.message || event.message.direction !== "incoming") return;
        const convType = event.conversation && event.conversation.type;
        if (convType && convType !== "private" && convType !== "single" && convType !== "friend") return;
        const text = event.message.text || "";
        if (!text.trim()) return;
        const conv = event.conversation;
        const convId = (conv.platform || "?") + ":" + (conv.accountId || "") + ":" + conv.id;
        pushHistory(convId, "other", text);
        await alert({ title: "Jev 快速判断", message: formatQuick(quickAnalyze(convId, text), text) });
        if (!CONFIG.llmEnabled || CONFIG.apiKey.startsWith("你的")) return;
        const ai = await callMimo(convId);
        await alert({ title: "Jev 完整建议", message: formatAI(ai) });
        for (let i = 0; i < ai.replies.length; i++) {
            const yes = await confirm({ title: "发送第 " + (i + 1) + " 条？", message: ai.replies[i] });
            if (yes) {
                await sendText(conv, ai.replies[i]);
                pushHistory(convId, "me", ai.replies[i]);
                toast("已发送第 " + (i + 1) + " 条");
                return;
            }
        }
        toast("未发送");
    } catch (e) {
        warn("jev", { msg: String(e && e.message) });
        try { toast("Jev 出错：" + (e && e.message)); } catch (_) {}
    }
}

export function activate() {
    unsubscribe = onMessage(handleMessage);
    info("Jev 助手 v1.3.1 已启动", {});
    if (CONFIG.apiKey.startsWith("你的")) toast("Jev：请在 main.js 顶部填 MiMo 密钥");
}

export function deactivate() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}
