// 语言与对应的语音前缀、试听文本
const LANG_CONFIG = {
  zh: { prefix: "zh", sample: "你好，欢迎使用翻译助手" },
  en: { prefix: "en", sample: "Hello, welcome to the translator" },
  fr: { prefix: "fr", sample: "Bonjour, bienvenue au traducteur" },
};

const selects = {
  zh: document.getElementById("voice-zh"),
  en: document.getElementById("voice-en"),
  fr: document.getElementById("voice-fr"),
};

const savedMsg = document.getElementById("saved-msg");
const statusEl = document.getElementById("inject-status");
let savedTimer = null;

// 注入内容脚本到当前标签页
async function injectContentScript() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    // 跳过 chrome:// 等特殊页面
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      statusEl.textContent = "此页面不支持翻译";
      statusEl.className = "inject-status error";
      return;
    }

    // 注入 CSS 和 JS
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });

    statusEl.textContent = "已激活 — 选中文字即可翻译";
    statusEl.className = "inject-status active";
  } catch (e) {
    // 已注入过或页面不支持
    if (e.message && e.message.includes("Cannot access")) {
      statusEl.textContent = "此页面不支持翻译";
      statusEl.className = "inject-status error";
    } else {
      statusEl.textContent = "已激活 — 选中文字即可翻译";
      statusEl.className = "inject-status active";
    }
  }
}

// 填充下拉框中该语言可用的语音
function populateVoices() {
  const voices = speechSynthesis.getVoices();

  for (const [langKey, config] of Object.entries(LANG_CONFIG)) {
    const select = selects[langKey];
    const currentValue = select.value;
    select.innerHTML = "";

    // 筛选该语言的语音
    const langVoices = voices.filter((v) =>
      v.lang.startsWith(config.prefix)
    );

    if (langVoices.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "（无可用语音）";
      opt.disabled = true;
      select.appendChild(opt);
      continue;
    }

    langVoices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      // 缩短显示名称：去掉 "Microsoft"/"Google" 前缀和括号中的语言说明
      let displayName = v.name
        .replace(/^(Microsoft|Google)\s*/i, "")
        .replace(/\s*\(.*\)$/, "");
      if (!v.localService) displayName += " *";
      opt.textContent = displayName;
      select.appendChild(opt);
    });

    // 恢复之前的选择
    if (currentValue) {
      select.value = currentValue;
    }
  }
}

// 从 storage 加载已保存的偏好
function loadSavedVoices() {
  chrome.storage.sync.get("voicePrefs", (result) => {
    const prefs = result.voicePrefs || {};
    for (const [langKey, voiceName] of Object.entries(prefs)) {
      if (selects[langKey]) {
        selects[langKey].value = voiceName;
      }
    }
  });
}

// 保存当前选择到 storage
function saveVoices() {
  const prefs = {};
  for (const [langKey, select] of Object.entries(selects)) {
    if (select.value) {
      prefs[langKey] = select.value;
    }
  }
  chrome.storage.sync.set({ voicePrefs: prefs }, () => {
    // 显示"已保存"提示
    savedMsg.classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => savedMsg.classList.remove("show"), 1500);
  });
}

// 试听按钮
function previewVoice(langKey) {
  speechSynthesis.cancel();
  const config = LANG_CONFIG[langKey];
  const select = selects[langKey];
  const utterance = new SpeechSynthesisUtterance(config.sample);
  utterance.lang = config.prefix;
  utterance.rate = 0.9;

  const voices = speechSynthesis.getVoices();
  const match = voices.find((v) => v.name === select.value);
  if (match) utterance.voice = match;

  speechSynthesis.speak(utterance);
}

// 初始化
function init() {
  // 打开弹窗时自动注入内容脚本
  injectContentScript();

  populateVoices();
  loadSavedVoices();

  // 语音列表可能异步加载
  speechSynthesis.onvoiceschanged = () => {
    populateVoices();
    loadSavedVoices();
  };

  // 下拉框变化时自动保存
  for (const select of Object.values(selects)) {
    select.addEventListener("change", saveVoices);
  }

  // 试听按钮
  document.querySelectorAll(".voice-preview").forEach((btn) => {
    btn.addEventListener("click", () => {
      previewVoice(btn.dataset.lang);
    });
  });
}

init();
