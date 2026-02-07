// 翻译浮层元素
let bubble = null;

// 语言配置，preferVoices 按优先级排列，优先选择更自然的语音
const LANGS = {
  zh: {
    code: "zh", label: "中文", voice: "zh-CN",
    preferVoices: ["Tingting", "Sinji", "Meijia", "Google 普通话"],
  },
  en: {
    code: "en", label: "English", voice: "en-US",
    preferVoices: ["Samantha", "Karen", "Daniel", "Google US English"],
  },
  fr: {
    code: "fr", label: "Français", voice: "fr-FR",
    preferVoices: ["Thomas", "Amélie", "Audrey", "Google français"],
  },
};

// 创建翻译浮层
function createBubble() {
  if (bubble) return bubble;
  bubble = document.createElement("div");
  bubble.id = "translate-bubble";
  bubble.innerHTML = `
    <div class="translate-bubble-header">
      <span class="translate-bubble-title">翻译</span>
      <span class="translate-bubble-close">&times;</span>
    </div>
    <div class="translate-bubble-body">
      <div class="translate-bubble-loading">翻译中...</div>
      <div class="translate-bubble-results"></div>
    </div>
  `;
  document.body.appendChild(bubble);

  bubble.querySelector(".translate-bubble-close").addEventListener("click", () => {
    clearSpeakingHighlight();
    hideBubble();
  });

  bubble.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  return bubble;
}

// 创建单条翻译结果行（含朗读按钮）
function createResultRow(langKey, text) {
  const lang = LANGS[langKey];
  const row = document.createElement("div");
  row.className = "translate-bubble-row";

  const label = document.createElement("span");
  label.className = "translate-bubble-lang";
  label.textContent = lang.label;

  const content = document.createElement("span");
  content.className = "translate-bubble-text";
  // 将文本拆分为独立的词语 span，用于逐词高亮
  buildWordSpans(content, text, langKey);

  // 按钮容器
  const btns = document.createElement("span");
  btns.className = "translate-bubble-btns";

  // 自然朗读按钮（整句流畅）
  const naturalBtn = document.createElement("button");
  naturalBtn.className = "translate-bubble-speak";
  naturalBtn.title = "自然朗读";
  naturalBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  naturalBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    speakNatural(text, langKey, row);
  });

  // 逐词朗读按钮（高亮同步）
  const wordBtn = document.createElement("button");
  wordBtn.className = "translate-bubble-speak translate-bubble-speak-word";
  wordBtn.title = "逐词朗读";
  wordBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h6"/><circle cx="19" cy="14" r="3"/><path d="M19 11v-1"/></svg>`;
  wordBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    speakWordByWord(langKey, row);
  });

  btns.appendChild(naturalBtn);
  btns.appendChild(wordBtn);

  row.appendChild(label);
  row.appendChild(content);
  row.appendChild(btns);
  return row;
}

// 将文本拆成词语 span：中文按字/词切分，英法按空格切分
function buildWordSpans(container, text, langKey) {
  container.innerHTML = "";
  let tokens;
  if (langKey === "zh") {
    // 中文：按每 1-2 个汉字为一组，标点单独一组
    tokens = text.match(/[\u4e00-\u9fff]{1,2}|[^\u4e00-\u9fff]+/g) || [text];
  } else {
    // 英法：保留空格作为分隔，按单词拆分
    tokens = text.match(/\S+|\s+/g) || [text];
  }
  tokens.forEach((token) => {
    const span = document.createElement("span");
    span.className = "translate-bubble-word";
    span.textContent = token;
    container.appendChild(span);
  });
}

// 缓存已加载的语音列表 & 用户偏好
let cachedVoices = [];
let voicePrefs = {}; // { zh: "Tingting", en: "Samantha", fr: "Thomas" }

function loadVoices() {
  cachedVoices = speechSynthesis.getVoices();
}

// 从 chrome.storage 加载用户选择的语音
function loadVoicePrefs() {
  chrome.storage.sync.get("voicePrefs", (result) => {
    if (result.voicePrefs) voicePrefs = result.voicePrefs;
  });
}

// 监听 storage 变化（popup 修改后实时生效）
chrome.storage.onChanged.addListener((changes) => {
  if (changes.voicePrefs) {
    voicePrefs = changes.voicePrefs.newValue || {};
  }
});

// 预加载
loadVoices();
loadVoicePrefs();
speechSynthesis.onvoiceschanged = loadVoices;

// 为指定语言找到最合适的语音
function findBestVoice(langKey) {
  const lang = LANGS[langKey];
  const voices = cachedVoices;

  // 0. 用户在 popup 中手动选择的语音（最高优先级）
  if (voicePrefs[langKey]) {
    const userPick = voices.find((v) => v.name === voicePrefs[langKey]);
    if (userPick) return userPick;
  }

  // 1. 按 preferVoices 优先级匹配（名称包含关键词）
  for (const name of lang.preferVoices) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }

  // 2. 优先选带 "Premium"、"Enhanced"、"Natural" 标记的语音
  const langPrefix = lang.voice.split("-")[0];
  const premium = voices.find(
    (v) => v.lang.startsWith(langPrefix) &&
      /premium|enhanced|natural/i.test(v.name)
  );
  if (premium) return premium;

  // 3. 兜底：匹配语言的任意语音
  return voices.find((v) => v.lang.startsWith(langPrefix)) || null;
}

// 朗读状态
let speakingRow = null;

// 清除所有朗读高亮
function clearSpeakingHighlight() {
  speechSynthesis.cancel();
  if (!bubble) return;
  bubble.querySelectorAll(".translate-bubble-row.speaking").forEach((r) => {
    r.classList.remove("speaking");
  });
  bubble.querySelectorAll(".translate-bubble-word.word-active").forEach((w) => {
    w.classList.remove("word-active");
  });
  speakingRow = null;
}

// ====== 模式 1：自然朗读（整句流畅，无逐词高亮）======
function speakNatural(text, langKey, row) {
  clearSpeakingHighlight();

  speakingRow = row;
  row.classList.add("speaking");

  const voice = findBestVoice(langKey);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANGS[langKey].voice;
  utterance.rate = 0.9;
  utterance.pitch = 1;
  if (voice) utterance.voice = voice;

  utterance.onend = () => {
    row.classList.remove("speaking");
    speakingRow = null;
  };
  utterance.onerror = utterance.onend;

  speechSynthesis.speak(utterance);
}

// ====== 模式 2：逐词朗读（每词一个 utterance，高亮精确同步）======
function speakWordByWord(langKey, row) {
  clearSpeakingHighlight();

  const allSpans = row.querySelectorAll(".translate-bubble-word");
  const words = Array.from(allSpans).filter((s) => s.textContent.trim().length > 0);
  if (words.length === 0) return;

  speakingRow = row;
  row.classList.add("speaking");

  const voice = findBestVoice(langKey);

  words.forEach((span, i) => {
    const utterance = new SpeechSynthesisUtterance(span.textContent.trim());
    utterance.lang = LANGS[langKey].voice;
    utterance.rate = 0.85;
    utterance.pitch = 1;
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      allSpans.forEach((s) => s.classList.remove("word-active"));
      span.classList.add("word-active");
    };

    if (i === words.length - 1) {
      utterance.onend = () => {
        allSpans.forEach((s) => s.classList.remove("word-active"));
        row.classList.remove("speaking");
        speakingRow = null;
      };
      utterance.onerror = utterance.onend;
    }

    speechSynthesis.speak(utterance);
  });
}

// 显示浮层
function showBubble(x, y, text) {
  const b = createBubble();
  const loading = b.querySelector(".translate-bubble-loading");
  const results = b.querySelector(".translate-bubble-results");

  loading.style.display = "block";
  results.style.display = "none";
  results.innerHTML = "";

  b.style.display = "block";
  positionBubble(b, x, y);

  const sourceLang = detectLanguage(text);
  // 翻译为其他两种语言
  const targetLangs = Object.keys(LANGS).filter((k) => k !== sourceLang);

  // 先显示原文行
  const sourceRow = createResultRow(sourceLang, text);
  sourceRow.classList.add("translate-bubble-row-source");

  Promise.all(targetLangs.map((t) => translate(text, sourceLang, t)))
    .then((translations) => {
      loading.style.display = "none";
      results.style.display = "block";

      results.appendChild(sourceRow);

      targetLangs.forEach((lang, i) => {
        results.appendChild(createResultRow(lang, translations[i]));
      });

      positionBubble(b, x, y);
    });
}

// 定位浮层，确保不超出视口
function positionBubble(b, x, y) {
  b.style.left = x + "px";
  b.style.top = (y + 10) + "px";

  const rect = b.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    b.style.left = (window.innerWidth - rect.width - 10) + "px";
  }
  if (rect.bottom > window.innerHeight) {
    b.style.top = (y - rect.height - 10) + "px";
  }
}

// 隐藏浮层
function hideBubble() {
  if (bubble) {
    bubble.style.display = "none";
  }
}

// 检测文本语言
function detectLanguage(text) {
  // 中文检测
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  if (chineseChars && chineseChars.length > text.length * 0.3) return "zh";

  // 法语特征字符检测
  const frenchChars = text.match(/[àâæçéèêëïîôœùûüÿÀÂÆÇÉÈÊËÏÎÔŒÙÛÜŸ]/g);
  const frenchWords = text.match(/\b(le|la|les|de|du|des|un|une|et|est|que|qui|dans|pour|avec|sur|pas|nous|vous|ils|elles|sont|ont|être|avoir|je|tu|il|elle|ce|cette|ces|mon|ton|son|mais|ou|donc|car|ni|très|aussi|plus|moins|chez|entre|depuis|pendant|avant|après|bonjour|merci|oui|non)\b/gi);
  if (frenchChars && frenchChars.length >= 2) return "fr";
  if (frenchWords && frenchWords.length >= 2) return "fr";

  // 默认英文
  return "en";
}

// 调用 MyMemory 免费翻译 API
async function translate(text, from, to) {
  const langPair = `${LANGS[from].code}|${LANGS[to].code}`;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    return "翻译失败，请重试";
  } catch (err) {
    console.error("翻译请求出错:", err);
    return "网络错误，请检查连接";
  }
}

// 监听鼠标抬起事件（划词完成）
document.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  if (bubble && bubble.contains(e.target)) return;

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length < 5000) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const x = rect.left + window.scrollX;
      const y = rect.bottom + window.scrollY;
      showBubble(x, y, text);
    } else {
      hideBubble();
    }
  }, 10);
});

// 点击页面其他地方关闭浮层
document.addEventListener("mousedown", (e) => {
  if (bubble && !bubble.contains(e.target)) {
    clearSpeakingHighlight();
    hideBubble();
  }
});
