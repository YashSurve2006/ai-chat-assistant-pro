/* ═══════════════════════════════════════════════════════════════
   AI Chat Pro – script.js  v4.0 ULTRA
   Full production JS: auth, streaming, sidebar, conversations,
   theme, files, voice, shortcuts, toast, modals, markdown,
   socket.io, performance panel, all DOM wired up
═══════════════════════════════════════════════════════════════ */

"use strict";

/* ──────────────────────────────────────────────────────────────
   CONFIG
────────────────────────────────────────────────────────────── */

const API_BASE =
  window.location.port === "5000" || window.location.protocol === "file:"
    ? "http://localhost:5000/api"
    : `${window.location.origin}/api`;

const NETWORK_TIMEOUT = 45_000;
const RETRY_LIMIT = 2;
const MAX_CHARS = 8000;
const SYSTEM_PROMPT_MAX = 2000;
const STORAGE_KEY_PREFIX = "aichat_";

/* ──────────────────────────────────────────────────────────────
   AUTH GUARD
────────────────────────────────────────────────────────────── */

const token = localStorage.getItem(`${STORAGE_KEY_PREFIX}token`);

let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}user`) || "null");
} catch (_) { }

if (!token || !currentUser) {
  window.location.href = "auth.html";
}

/* ──────────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────────── */

let currentConvId = null;
let conversations = loadConversations();
let messages = [];          // messages for current conv
let isLoading = false;
let stopRequested = false;
let streamReader = null;
let pendingFiles = [];
let socket = null;
let currentTheme = localStorage.getItem(`${STORAGE_KEY_PREFIX}theme`) || "dark";
let temperature = parseFloat(localStorage.getItem(`${STORAGE_KEY_PREFIX}temp`) || "0.85");
let systemPrompt = localStorage.getItem(`${STORAGE_KEY_PREFIX}system_prompt`) || "";
let selectedModel = localStorage.getItem(`${STORAGE_KEY_PREFIX}model`) || "llama3";
let performanceMode = localStorage.getItem(`${STORAGE_KEY_PREFIX}perf_mode`) || "balanced";
let isMicActive = false;
let recognition = null;
let requestCount = 0;
let totalTokens = 0;
let latencyMs = 0;
let convToDelete = null;
let sidebarOpen = false;
let sortOrder = "newest";

/* ──────────────────────────────────────────────────────────────
   DOM REFS — gathered once on load
────────────────────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const $q = (sel, ctx = document) => ctx.querySelector(sel);
const $qa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let DOM = {};

function gatherDOM() {
  DOM = {
    // Chat
    chatContainer: $("chat-container"),
    welcomeScreen: $("welcome-screen"),
    typingIndicator: $("typing-indicator"),
    generationControls: $("generation-controls"),
    stopBtn: $("stop-btn"),
    regenerateBtn: $("regenerate-btn"),
    scrollBottomBtn: $("scroll-bottom-btn"),
    dropZone: $("drop-zone"),

    // Input
    messageInput: $("message-input"),
    sendBtn: $("send-btn"),
    charCounter: $("char-counter"),
    attachBtn: $("attach-btn"),
    fileInput: $("file-input"),
    cameraBtn: $("camera-btn"),
    micBtn: $("mic-btn"),
    filePreviewArea: $("file-preview-area"),
    filePreviews: $("file-previews"),
    clearFilesBtn: $("clear-files-btn"),
    uploadFilesBtn: $("upload-files-btn"),
    msgActionBar: $("msg-action-bar"),
    copyLastBtn: $("copy-last-btn"),
    retryLastBtn: $("retry-last-btn"),
    saveLastBtn: $("save-last-btn"),
    tokenCount: $("token-count"),
    responseTime: $("response-time"),
    inputBox: $("input-box"),

    // Header
    sidebarToggleBtn: $("sidebar-toggle-btn"),
    currentChatTitle: $("current-chat-title"),
    modelSelector: $("model-selector"),
    workspaceSelector: $("workspace-selector"),
    themeToggleBtn: $("theme-toggle-btn"),
    clearChatBtn: $("clear-chat-btn"),
    systemMenuBtn: $("system-menu-btn"),
    connectionIndicator: $("connection-indicator"),
    connectionText: $("connection-text"),
    latencyIndicator: $("latency-indicator"),
    latencyValue: $("latency-value"),

    // Sidebar
    sidebar: $("sidebar"),
    sidebarOverlay: $("sidebar-overlay"),
    sidebarCloseBtn: $("sidebar-close-btn"),
    newChatBtn: $("new-chat-btn"),
    convSearch: $("conv-search"),
    conversationsList: $("conversations-list"),
    sortBtn: $("sort-btn"),
    filterBtn: $("filter-btn"),
    archiveBtn: $("archive-btn"),
    clearAllBtn: $("clear-all-btn"),
    exportBtn: $("export-btn"),
    storageFill: $("storage-fill"),
    storageText: $("storage-text"),
    userAvatar: $("user-avatar"),
    userName: $("user-name"),
    userEmail: $("user-email"),
    welcomeName: $("welcome-name"),
    settingsBtn: $("settings-btn"),
    logoutBtn: $("logout-btn"),

    // Modals
    settingsModal: $("settings-modal"),
    deleteModal: $("delete-modal"),
    systemStatusModal: $("system-status-modal"),
    shortcutModal: $("shortcut-modal"),
    settingsModel: $("settings-model"),
    settingsTemp: $("settings-temp"),
    tempValue: $("temp-value"),
    settingsSystemPrompt: $("settings-system-prompt"),
    systemPromptChars: $("system-prompt-chars"),
    saveSettingsBtn: $("save-settings-btn"),
    deleteConfirmBtn: $("delete-confirm-btn"),
    performanceModeEl: $("performance-mode"),

    // Panels
    performancePanel: $("performance-panel"),
    cpuUsage: $("cpu-usage"),
    memoryUsage: $("memory-usage"),
    tokenUsage: $("token-usage"),
    requestCount: $("request-count"),

    // Loader
    appLoader: $("app-loader"),
    toastContainer: $("toast-container"),
  };
}

/* ──────────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  gatherDOM();
  applyTheme(currentTheme);
  populateUserInfo();
  populateSettings();
  renderConversationsList();
  bindAllEvents();
  initSocket();
  initSpeechRecognition();
  updateCharCounter();
  updateStorageIndicator();
  checkOnlineStatus();
  DOM.messageInput.focus();
});

window.addEventListener("load", () => {
  const loader = DOM.appLoader;
  if (!loader) return;
  loader.style.opacity = "0";
  loader.style.visibility = "hidden";
  setTimeout(() => loader.remove(), 350);
});

/* ──────────────────────────────────────────────────────────────
   USER INFO
────────────────────────────────────────────────────────────── */

function populateUserInfo() {
  if (!currentUser) return;

  const name = currentUser.name || currentUser.username || "User";
  const email = currentUser.email || "";
  const initials = name.slice(0, 2).toUpperCase();

  if (DOM.userAvatar) DOM.userAvatar.textContent = initials;
  if (DOM.userName) DOM.userName.textContent = name;
  if (DOM.userEmail) DOM.userEmail.textContent = email;
  if (DOM.welcomeName) DOM.welcomeName.textContent = name.split(" ")[0];
}

/* ──────────────────────────────────────────────────────────────
   BIND ALL EVENTS
────────────────────────────────────────────────────────────── */

function bindAllEvents() {
  // ── Send / Input ──────────────────────────────────────────
  DOM.sendBtn.addEventListener("click", handleSend);

  DOM.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  DOM.messageInput.addEventListener("input", () => {
    autoGrowTextarea();
    updateCharCounter();
    updateSendBtnState();
  });

  DOM.messageInput.addEventListener("paste", () => {
    setTimeout(autoGrowTextarea, 0);
  });

  // ── Stop / Regenerate ─────────────────────────────────────
  DOM.stopBtn?.addEventListener("click", stopStreaming);
  DOM.regenerateBtn?.addEventListener("click", regenerateLastMessage);

  // ── Scroll to bottom ─────────────────────────────────────
  DOM.scrollBottomBtn?.addEventListener("click", scrollToBottom);
  DOM.chatContainer?.addEventListener("scroll", handleChatScroll);

  // ── File attach ───────────────────────────────────────────
  DOM.attachBtn?.addEventListener("click", () => DOM.fileInput?.click());
  DOM.cameraBtn?.addEventListener("click", () => {
    if (DOM.fileInput) {
      DOM.fileInput.accept = "image/*";
      DOM.fileInput.click();
    }
  });
  DOM.fileInput?.addEventListener("change", handleFileSelect);
  DOM.clearFilesBtn?.addEventListener("click", clearPendingFiles);
  DOM.uploadFilesBtn?.addEventListener("click", () => showToast("Files queued for next message", "info"));

  // ── Mic ──────────────────────────────────────────────────
  DOM.micBtn?.addEventListener("click", toggleMic);

  // ── Header ────────────────────────────────────────────────
  DOM.sidebarToggleBtn?.addEventListener("click", toggleSidebar);
  DOM.themeToggleBtn?.addEventListener("click", cycleTheme);
  DOM.clearChatBtn?.addEventListener("click", clearCurrentChat);
  DOM.systemMenuBtn?.addEventListener("click", openSystemMenu);
  DOM.modelSelector?.addEventListener("change", (e) => {
    selectedModel = e.target.value;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}model`, selectedModel);
    showToast(`Model switched to ${selectedModel}`, "info");
  });
  DOM.workspaceSelector?.addEventListener("change", (e) => {
    showToast(`Workspace: ${e.target.options[e.target.selectedIndex].text}`, "info");
  });

  // ── Sidebar ───────────────────────────────────────────────
  DOM.sidebarCloseBtn?.addEventListener("click", closeSidebar);
  DOM.sidebarOverlay?.addEventListener("click", closeSidebar);
  DOM.newChatBtn?.addEventListener("click", startNewConversation);
  DOM.convSearch?.addEventListener("input", (e) => renderConversationsList(e.target.value));
  DOM.sortBtn?.addEventListener("click", cycleSortOrder);
  DOM.filterBtn?.addEventListener("click", () => showToast("Filter coming soon", "info"));
  DOM.archiveBtn?.addEventListener("click", archiveCurrentConversation);
  DOM.clearAllBtn?.addEventListener("click", clearAllConversations);
  DOM.exportBtn?.addEventListener("click", exportConversations);

  // ── Logout ────────────────────────────────────────────────
  DOM.logoutBtn?.addEventListener("click", logout);

  // ── Settings ──────────────────────────────────────────────
  DOM.settingsBtn?.addEventListener("click", openSettingsModal);
  DOM.saveSettingsBtn?.addEventListener("click", saveSettings);

  DOM.settingsTemp?.addEventListener("input", (e) => {
    temperature = parseFloat(e.target.value);
    if (DOM.tempValue) DOM.tempValue.textContent = temperature.toFixed(2);
  });

  DOM.settingsSystemPrompt?.addEventListener("input", () => {
    const len = DOM.settingsSystemPrompt.value.length;
    if (DOM.systemPromptChars) DOM.systemPromptChars.textContent = `${len} / ${SYSTEM_PROMPT_MAX}`;
  });

  // Theme buttons in settings
  $qa(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $qa(".theme-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyTheme(btn.dataset.theme === "system" ? getSystemTheme() : btn.dataset.theme);
    });
  });

  // ── Modal close buttons ───────────────────────────────────
  $qa("[data-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.modal));
  });

  // ── Delete confirm ────────────────────────────────────────
  DOM.deleteConfirmBtn?.addEventListener("click", confirmDeleteConversation);

  // ── Post-message action bar ───────────────────────────────
  DOM.copyLastBtn?.addEventListener("click", copyLastMessage);
  DOM.retryLastBtn?.addEventListener("click", regenerateLastMessage);
  DOM.saveLastBtn?.addEventListener("click", saveLastMessage);

  // ── Drag and drop files ───────────────────────────────────
  bindDragDrop();

  // ── Online/offline ────────────────────────────────────────
  window.addEventListener("online", () => { setConnectionStatus("online"); showToast("Connection restored", "success"); });
  window.addEventListener("offline", () => { setConnectionStatus("offline"); showToast("You are offline", "error"); });

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener("keydown", handleGlobalShortcuts);

  // ── Click outside modals ─────────────────────────────────
  $qa(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
}

/* ──────────────────────────────────────────────────────────────
   GLOBAL SHORTCUTS
────────────────────────────────────────────────────────────── */

function handleGlobalShortcuts(e) {
  // Ctrl+N → new chat
  if (e.ctrlKey && e.key === "n") { e.preventDefault(); startNewConversation(); return; }
  // Ctrl+B → toggle sidebar
  if (e.ctrlKey && e.key === "b") { e.preventDefault(); toggleSidebar(); return; }
  // Ctrl+/ → shortcuts modal
  if (e.ctrlKey && e.key === "/") { e.preventDefault(); openModal("shortcut-modal"); return; }
  // Ctrl+, → settings
  if (e.ctrlKey && e.key === ",") { e.preventDefault(); openSettingsModal(); return; }
  // Escape → stop streaming or close modal
  if (e.key === "Escape") {
    if (isLoading) { stopStreaming(); return; }
    $qa(".modal-overlay:not([hidden])").forEach((m) => m.hidden = true);
    return;
  }
  // Ctrl+P → performance panel
  if (e.ctrlKey && e.key === "p") { e.preventDefault(); togglePerformancePanel(); return; }
}

/* ──────────────────────────────────────────────────────────────
   SEND MESSAGE
────────────────────────────────────────────────────────────── */

async function handleSend() {
  const text = DOM.messageInput.value.trim();
  if (!text || isLoading) return;

  // Hide welcome screen
  hideWelcomeScreen();

  // Append user bubble
  appendMessage("user", text);
  messages.push({ role: "user", content: text });

  // Reset input
  DOM.messageInput.value = "";
  autoGrowTextarea();
  updateCharCounter();
  updateSendBtnState();
  if (DOM.msgActionBar) DOM.msgActionBar.hidden = true;

  // Set conv title from first message
  if (!currentConvId) {
    createNewConversation(text);
  } else {
    if (!getConvById(currentConvId)?.title || getConvById(currentConvId)?.title === "New Conversation") {
      updateConvTitle(currentConvId, text);
    }
  }

  await streamAIResponse(text);
}
async function streamAIResponse(userText) {

  setLoading(true);

  stopRequested = false;

  const { row, contentEl } = createAIBubble();
  DOM.chatContainer.appendChild(row);

  let fullText = "";
  let buffer = "";
  let chunkCount = 0;

  const t0 = performance.now();

  try {

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const body = JSON.stringify({
      message: userText,
      conversationId: currentConvId,
      model: selectedModel,
      temperature,
      systemPrompt,
    });

    const response = await fetchWithRetry(
      `${API_BASE}/chat`,
      {
        method: "POST",
        headers,
        body,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    streamReader = reader;

    const decoder = new TextDecoder();

    outer: while (true) {

      if (stopRequested) {
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {

        if (stopRequested) break outer;

        const trimmed = line.trim();

        if (!trimmed) continue;

        if (trimmed.startsWith("event:"))
          continue;

        if (trimmed.startsWith("data:")) {

          const raw = trimmed.slice(5).trim();

          if (raw === "[DONE]")
            break outer;

          let payload;

          try {
            payload = JSON.parse(raw);
          } catch {
            continue;
          }

          const chunk =
            payload.text ||
            payload.content ||
            "";

          if (!chunk)
            continue;

          fullText += chunk;

          chunkCount++;

          contentEl.innerHTML =
            renderMarkdown(fullText) +
            '<span class="streaming-cursor"></span>';

          if (chunkCount % 5 === 0)
            scrollToBottom();
        }
      }
    }

    contentEl.innerHTML = renderMarkdown(fullText);

    highlightCode(row);

    addMessageActions(row, fullText, "ai");

    messages.push({
      role: "assistant",
      content: fullText,
    });

    saveConversationMessages();

    latencyMs =
      Math.round(performance.now() - t0);

    requestCount++;

    updateStats();

    updateConvLastMessage(
      currentConvId,
      fullText
    );

    renderConversationsList();

    if (DOM.msgActionBar)
      DOM.msgActionBar.hidden = false;

    clearPendingFiles();

  } catch (err) {

    appendErrorMessage(
      getErrorMessage(err)
    );

  } finally {

    setLoading(false);

    streamReader = null;

  }
}

/* ===============================
   FINALIZE AFTER STREAM ENDS
================================ */

contentEl.innerHTML = renderMarkdown(fullText);
highlightCode(row);
addMessageActions(row, fullText, "ai");
scrollToBottom();

// Save AI message
messages.push({
  role: "assistant",
  content: fullText,
});

saveConversationMessages();

// Timing + stats
latencyMs = Math.round(performance.now() - t0);
requestCount++;
updateStats();

updateConvLastMessage(currentConvId, fullText);
renderConversationsList();

// Show action bar
if (DOM.msgActionBar) {
  DOM.msgActionBar.hidden = false;
}

// Clear uploaded files
clearPendingFiles();
/* ──────────────────────────────────────────────────────────────
   FETCH WITH RETRY + TIMEOUT
────────────────────────────────────────────────────────────── */

async function fetchWithRetry(url, options, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT);

  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    if (attempt < RETRY_LIMIT && !stopRequested) {
      await sleep(800 * (attempt + 1));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

/* ──────────────────────────────────────────────────────────────
   LOADING STATE
────────────────────────────────────────────────────────────── */

function setLoading(state) {
  isLoading = state;
  DOM.messageInput.disabled = state;
  DOM.typingIndicator.hidden = !state;
  DOM.generationControls.hidden = !state;

  if (state) {
    DOM.sendBtn.disabled = true;
    DOM.sendBtn.innerHTML = `<div class="spinner"></div>`;
    DOM.sendBtn.setAttribute("aria-label", "Generating…");
  } else {
    updateSendBtnState();
    DOM.sendBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="white"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="10" x2="17" y2="10"/>
        <polyline points="12,5 17,10 12,15"/>
      </svg>`;
    DOM.sendBtn.setAttribute("aria-label", "Send message");
  }
}

/* ──────────────────────────────────────────────────────────────
   STOP STREAMING
────────────────────────────────────────────────────────────── */

function stopStreaming() {
  stopRequested = true;
  if (streamReader) {
    try { streamReader.cancel(); } catch (_) { }
    streamReader = null;
  }
  setLoading(false);
  showToast("Generation stopped", "info");
}

/* ──────────────────────────────────────────────────────────────
   REGENERATE LAST MESSAGE
────────────────────────────────────────────────────────────── */

async function regenerateLastMessage() {
  if (isLoading || messages.length < 1) return;

  // Remove last AI message from DOM and state
  const lastRow = $q(".message-row--ai:last-of-type", DOM.chatContainer);
  if (lastRow) lastRow.remove();
  if (messages.at(-1)?.role === "assistant") messages.pop();

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return;

  if (DOM.msgActionBar) DOM.msgActionBar.hidden = true;
  await streamAIResponse(lastUser.content);
}

/* ──────────────────────────────────────────────────────────────
   MESSAGE DOM BUILDERS
────────────────────────────────────────────────────────────── */

function appendMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message-row message-row--${role}`;
  row.innerHTML = buildMessageHTML(role, text);
  DOM.chatContainer.appendChild(row);
  addMessageActions(row, text, role);
  scrollToBottom();
  return row;
}

function appendErrorMessage(text) {
  const row = document.createElement("div");
  row.className = "message-row message-row--ai";
  row.innerHTML = `
    <div class="msg-avatar msg-avatar--ai">✦</div>
    <div class="msg-content">
      <div class="msg-bubble msg-bubble--ai msg-bubble--error">${escapeHtml(text)}</div>
      <div class="msg-meta">${formatTime(new Date())}</div>
    </div>`;
  DOM.chatContainer.appendChild(row);
  scrollToBottom();
}

function buildMessageHTML(role, text) {
  const isUser = role === "user";
  const avatarClass = isUser ? "msg-avatar--user" : "msg-avatar--ai";
  const avatarContent = isUser
    ? (currentUser?.name?.slice(0, 2) || "US").toUpperCase()
    : "✦";
  const bubbleClass = isUser ? "msg-bubble--user" : "msg-bubble--ai";
  const content = isUser
    ? `<div class="msg-bubble ${bubbleClass}">${escapeHtml(text)}</div>`
    : `<div class="msg-bubble ${bubbleClass}"><div class="md-content">${renderMarkdown(text)}</div></div>`;

  return `
    <div class="msg-avatar ${avatarClass}">${avatarContent}</div>
    <div class="msg-content">
      ${content}
      <div class="msg-meta">
        ${formatTime(new Date())}
        ${!isUser ? `<span class="model-badge">✦ ${selectedModel}</span>` : ""}
      </div>
      <div class="msg-actions"></div>
    </div>`;
}

function createAIBubble() {
  const row = document.createElement("div");
  row.className = "message-row message-row--ai";

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar msg-avatar--ai";
  avatar.textContent = "✦";

  const content = document.createElement("div");
  content.className = "msg-content";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-bubble--ai";

  const contentEl = document.createElement("div");
  contentEl.className = "md-content";

  bubble.appendChild(contentEl);
  content.appendChild(bubble);

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.innerHTML = `${formatTime(new Date())} <span class="model-badge">✦ ${selectedModel}</span>`;
  content.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "msg-actions";
  content.appendChild(actions);

  row.appendChild(avatar);
  row.appendChild(content);

  return { row, contentEl };
}

function addMessageActions(row, text, role) {
  const actionsEl = $q(".msg-actions", row);
  if (!actionsEl) return;

  const copyBtn = makeActionBtn("Copy", copyIcon(), () => {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Copied to clipboard", "success");
      copyBtn.classList.add("copied");
      setTimeout(() => copyBtn.classList.remove("copied"), 1500);
    });
  });

  actionsEl.appendChild(copyBtn);

  if (role === "ai") {
    const regenBtn = makeActionBtn("Retry", reloadIcon(), regenerateLastMessage);
    actionsEl.appendChild(regenBtn);
  }

  if (role === "user") {
    const editBtn = makeActionBtn("Edit", editIcon(), () => {
      DOM.messageInput.value = text;
      DOM.messageInput.focus();
      autoGrowTextarea();
      updateSendBtnState();
    });
    actionsEl.appendChild(editBtn);
  }
}

function makeActionBtn(label, iconSvg, handler) {
  const btn = document.createElement("button");
  btn.className = "msg-action-btn";
  btn.setAttribute("title", label);
  btn.innerHTML = iconSvg + `<span>${label}</span>`;
  btn.addEventListener("click", handler);
  return btn;
}

/* ──────────────────────────────────────────────────────────────
   INPUT HELPERS
────────────────────────────────────────────────────────────── */

function autoGrowTextarea() {
  const ta = DOM.messageInput;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
}

function updateCharCounter() {
  const len = DOM.messageInput.value.length;
  if (!DOM.charCounter) return;
  DOM.charCounter.textContent = `${len} / ${MAX_CHARS}`;
  DOM.charCounter.classList.toggle("warn", len > MAX_CHARS * 0.8);
  DOM.charCounter.classList.toggle("limit", len >= MAX_CHARS);
}

function updateSendBtnState() {
  const hasText = DOM.messageInput.value.trim().length > 0;
  DOM.sendBtn.disabled = !hasText || isLoading;
}

/* ──────────────────────────────────────────────────────────────
   SCROLL
────────────────────────────────────────────────────────────── */

function scrollToBottom(smooth = true) {
  DOM.chatContainer.scrollTo({
    top: DOM.chatContainer.scrollHeight,
    behavior: smooth ? "smooth" : "instant",
  });
}

function handleChatScroll() {
  const cc = DOM.chatContainer;
  const atBottom = cc.scrollHeight - cc.scrollTop - cc.clientHeight < 80;
  if (DOM.scrollBottomBtn) DOM.scrollBottomBtn.hidden = atBottom;
}

/* ──────────────────────────────────────────────────────────────
   WELCOME SCREEN
────────────────────────────────────────────────────────────── */

function hideWelcomeScreen() {
  if (DOM.welcomeScreen) {
    DOM.welcomeScreen.style.opacity = "0";
    DOM.welcomeScreen.style.transform = "translateY(-12px)";
    DOM.welcomeScreen.style.transition = "all 0.3s ease";
    setTimeout(() => {
      if (DOM.welcomeScreen) DOM.welcomeScreen.remove();
      DOM.welcomeScreen = null;
    }, 300);
  }
}

function showWelcomeScreen() {
  // Re-inject welcome screen when starting new chat
  const ws = document.createElement("div");
  ws.className = "welcome-screen";
  ws.id = "welcome-screen";
  const firstName = currentUser?.name?.split(" ")[0] || "there";
  ws.innerHTML = `
    <div class="welcome-orb"></div>
    <h2 class="welcome-title">Hello, <span class="welcome-user-name">${escapeHtml(firstName)}</span>!</h2>
    <p class="welcome-sub">Your local AI is ready. Ask anything — code, analysis, creative writing, or just a conversation.</p>
    <div class="suggestion-grid">
      ${buildSuggestions()}
    </div>`;
  DOM.chatContainer.appendChild(ws);
  DOM.welcomeScreen = ws;

  // Wire suggestion clicks
  $qa(".suggestion-card", ws).forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      DOM.messageInput.value = prompt;
      autoGrowTextarea();
      updateCharCounter();
      updateSendBtnState();
      DOM.messageInput.focus();
    });
  });
}

function buildSuggestions() {
  const suggestions = [
    { icon: "🧠", text: "Explain how neural networks learn from data", prompt: "Explain how neural networks learn from data in simple terms" },
    { icon: "💻", text: "Write a Python function to sort a list of dicts by a key", prompt: "Write a Python function to sort a list of dictionaries by a specific key" },
    { icon: "📊", text: "Summarize differences between REST and GraphQL", prompt: "Summarize the key differences between REST and GraphQL APIs" },
    { icon: "✨", text: "Write a short sci-fi story set on a space station", prompt: "Write a short sci-fi story set on a space station" },
  ];
  return suggestions.map((s) => `
    <button class="suggestion-card" data-prompt="${escapeHtml(s.prompt)}">
      <span class="suggestion-icon">${s.icon}</span>
      ${escapeHtml(s.text)}
    </button>`).join("");
}

/* ──────────────────────────────────────────────────────────────
   CONVERSATIONS — PERSISTENCE
────────────────────────────────────────────────────────────── */

function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}conversations`) || "[]");
  } catch (_) { return []; }
}

function saveConversations() {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}conversations`, JSON.stringify(conversations));
    updateStorageIndicator();
  } catch (_) { showToast("Storage full — consider exporting", "error"); }
}

function saveConversationMessages() {
  if (!currentConvId) return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}msgs_${currentConvId}`, JSON.stringify(messages));
  } catch (_) { }
}

function loadConversationMessages(convId) {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}msgs_${convId}`) || "[]");
  } catch (_) { return []; }
}

function getConvById(id) {
  return conversations.find((c) => c.id === id) || null;
}

function createNewConversation(firstMsg) {
  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const conv = {
    id,
    title: truncate(firstMsg, 45),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    preview: truncate(firstMsg, 60),
    model: selectedModel,
    pinned: false,
    archived: false,
  };
  conversations.unshift(conv);
  currentConvId = id;
  saveConversations();
  renderConversationsList();
  return conv;
}

function updateConvTitle(convId, text) {
  const conv = getConvById(convId);
  if (!conv) return;
  conv.title = truncate(text, 45);
  saveConversations();
}

function updateConvLastMessage(convId, text) {
  const conv = getConvById(convId);
  if (!conv) return;
  conv.preview = truncate(text, 60);
  conv.updatedAt = Date.now();
  if (currentConvId === convId) {
    conversations = [conv, ...conversations.filter((c) => c.id !== convId)];
  }
  saveConversations();
}

/* ──────────────────────────────────────────────────────────────
   CONVERSATIONS — SIDEBAR RENDER
────────────────────────────────────────────────────────────── */

function renderConversationsList(query = "") {
  const list = DOM.conversationsList;
  if (!list) return;

  let filtered = conversations.filter((c) => !c.archived);

  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter((c) =>
      c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sortOrder === "oldest") return a.createdAt - b.createdAt;
    return b.updatedAt - a.updatedAt;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">${query ? "🔍" : "💬"}</div>
        <div class="sidebar-empty-text">${query ? "No conversations match your search." : "No conversations yet.<br>Start a new chat to begin."}</div>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((conv) => `
    <div class="conv-item ${conv.id === currentConvId ? "active" : ""} ${conv.pinned ? "pinned" : ""}"
         data-id="${conv.id}" role="button" tabindex="0" aria-label="${escapeHtml(conv.title)}">
      <div class="conv-item-dot">
        ${conv.model === "mistral" ? "⚡" : conv.model === "phi" ? "💡" : conv.model === "mixtral" ? "🚀" : "🧠"}
      </div>
      <div class="conv-item-body">
        <div class="conv-item-title">${escapeHtml(conv.title)}</div>
        <div class="conv-item-meta">
          ${relativeTime(conv.updatedAt)}
          ${conv.pinned ? " · 📌" : ""}
        </div>
      </div>
      <div class="conv-item-actions">
        <button class="conv-action-btn pin" title="${conv.pinned ? "Unpin" : "Pin"}" data-action="pin" data-id="${conv.id}">
          ${conv.pinned ? pinActiveIcon() : pinIcon()}
        </button>
        <button class="conv-action-btn delete" title="Delete" data-action="delete" data-id="${conv.id}">
          ${trashIcon()}
        </button>
      </div>
    </div>`).join("");

  // Bind clicks
  $qa(".conv-item", list).forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".conv-action-btn")) return;
      loadConversation(item.dataset.id);
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!e.target.closest(".conv-action-btn")) loadConversation(item.dataset.id);
      }
    });
  });

  $qa("[data-action='pin']", list).forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); togglePinConversation(btn.dataset.id); });
  });

  $qa("[data-action='delete']", list).forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); promptDeleteConversation(btn.dataset.id); });
  });
}

/* ──────────────────────────────────────────────────────────────
   CONVERSATIONS — ACTIONS
────────────────────────────────────────────────────────────── */

function loadConversation(id) {
  if (currentConvId === id) { closeSidebar(); return; }

  currentConvId = id;
  const conv = getConvById(id);
  if (!conv) return;

  // Update header subtitle
  if (DOM.currentChatTitle) DOM.currentChatTitle.textContent = conv.title;

  // Load messages into DOM
  DOM.chatContainer.innerHTML = "";
  DOM.welcomeScreen = null;
  messages = loadConversationMessages(id);

  if (messages.length === 0) {
    showWelcomeScreen();
  } else {
    messages.forEach((msg) => {
      if (msg.role === "user") {
        appendMessageSilent("user", msg.content);
      } else {
        appendMessageSilent("ai", msg.content);
      }
    });
    scrollToBottom(false);
    if (DOM.msgActionBar && messages.length > 0) DOM.msgActionBar.hidden = false;
  }

  renderConversationsList();
  closeSidebar();
}

// Append without pushing to messages array (for replay)
function appendMessageSilent(role, text) {
  const row = document.createElement("div");
  row.className = `message-row message-row--${role}`;
  if (role === "user") {
    const isUser = true;
    row.innerHTML = buildMessageHTML("user", text);
    addMessageActions(row, text, "user");
  } else {
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar msg-avatar--ai";
    avatar.textContent = "✦";

    const content = document.createElement("div");
    content.className = "msg-content";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble msg-bubble--ai";
    bubble.innerHTML = `<div class="md-content">${renderMarkdown(text)}</div>`;

    content.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(content);
    highlightCode(row);
    addMessageActions(row, text, "ai");
  }
  DOM.chatContainer.appendChild(row);
}

function startNewConversation() {
  currentConvId = null;
  messages = [];

  DOM.chatContainer.innerHTML = "";
  DOM.welcomeScreen = null;

  showWelcomeScreen();

  if (DOM.currentChatTitle) DOM.currentChatTitle.textContent = "New Conversation";
  if (DOM.msgActionBar) DOM.msgActionBar.hidden = true;

  DOM.messageInput.value = "";
  autoGrowTextarea();
  updateSendBtnState();
  DOM.messageInput.focus();

  renderConversationsList();
  closeSidebar();
}

function clearCurrentChat() {
  if (!confirm("Clear this conversation?")) return;
  if (currentConvId) {
    const conv = getConvById(currentConvId);
    if (conv) { conv.preview = ""; conv.updatedAt = Date.now(); }
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}msgs_${currentConvId}`);
    saveConversations();
  }
  messages = [];
  DOM.chatContainer.innerHTML = "";
  showWelcomeScreen();
  if (DOM.msgActionBar) DOM.msgActionBar.hidden = true;
  showToast("Conversation cleared", "info");
}

function promptDeleteConversation(id) {
  convToDelete = id;
  openModal("delete-modal");
}

function confirmDeleteConversation() {
  if (!convToDelete) return;
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}msgs_${convToDelete}`);
  conversations = conversations.filter((c) => c.id !== convToDelete);
  if (currentConvId === convToDelete) {
    startNewConversation();
  }
  convToDelete = null;
  saveConversations();
  renderConversationsList();
  closeModal("delete-modal");
  showToast("Conversation deleted", "success");
}

function togglePinConversation(id) {
  const conv = getConvById(id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  saveConversations();
  renderConversationsList();
  showToast(conv.pinned ? "Conversation pinned 📌" : "Unpinned", "info");
}

function archiveCurrentConversation() {
  if (!currentConvId) { showToast("No active conversation", "info"); return; }
  const conv = getConvById(currentConvId);
  if (!conv) return;
  conv.archived = true;
  saveConversations();
  startNewConversation();
  showToast("Conversation archived", "success");
}

function clearAllConversations() {
  if (!confirm("Delete ALL conversations? This cannot be undone.")) return;
  conversations.forEach((c) => localStorage.removeItem(`${STORAGE_KEY_PREFIX}msgs_${c.id}`));
  conversations = [];
  saveConversations();
  startNewConversation();
  showToast("All conversations deleted", "success");
}

function exportConversations() {
  const data = {
    exportedAt: new Date().toISOString(),
    user: currentUser?.name || "unknown",
    conversations: conversations.map((conv) => ({
      ...conv,
      messages: loadConversationMessages(conv.id),
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aichat-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Conversations exported", "success");
}

function cycleSortOrder() {
  sortOrder = sortOrder === "newest" ? "oldest" : "newest";
  if (DOM.sortBtn) DOM.sortBtn.textContent = sortOrder === "newest" ? "↓ Sort" : "↑ Sort";
  renderConversationsList(DOM.convSearch?.value || "");
  showToast(`Sorted: ${sortOrder}`, "info");
}

/* ──────────────────────────────────────────────────────────────
   SIDEBAR OPEN/CLOSE
────────────────────────────────────────────────────────────── */

function toggleSidebar() {
  sidebarOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  sidebarOpen = true;
  DOM.sidebar.classList.add("open");
  DOM.sidebarOverlay.classList.add("active");
  DOM.sidebar.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  sidebarOpen = false;
  DOM.sidebar.classList.remove("open");
  DOM.sidebarOverlay.classList.remove("active");
  DOM.sidebar.setAttribute("aria-expanded", "false");
}

/* ──────────────────────────────────────────────────────────────
   SYSTEM MENU
────────────────────────────────────────────────────────────── */

function openSystemMenu() {
  // Toggle between system status, performance panel, shortcuts
  if (!DOM.performancePanel.hidden) {
    DOM.performancePanel.hidden = true;
    return;
  }
  openModal("system-status-modal");
}

function togglePerformancePanel() {
  DOM.performancePanel.hidden = !DOM.performancePanel.hidden;
}

/* ──────────────────────────────────────────────────────────────
   MODALS
────────────────────────────────────────────────────────────── */

function openModal(id) {
  const el = $(id);
  if (el) { el.hidden = false; el.querySelector("button, input, textarea, select")?.focus(); }
}

function closeModal(id) {
  const el = $(id);
  if (el) el.hidden = true;
}

function openSettingsModal() {
  // Populate from state
  if (DOM.settingsModel) DOM.settingsModel.value = selectedModel;
  if (DOM.settingsTemp) DOM.settingsTemp.value = temperature;
  if (DOM.tempValue) DOM.tempValue.textContent = temperature.toFixed(2);
  if (DOM.settingsSystemPrompt) DOM.settingsSystemPrompt.value = systemPrompt;
  if (DOM.systemPromptChars) DOM.systemPromptChars.textContent = `${systemPrompt.length} / ${SYSTEM_PROMPT_MAX}`;
  if (DOM.performanceModeEl) DOM.performanceModeEl.value = performanceMode;

  // Mark active theme button
  $qa(".theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === currentTheme || (btn.dataset.theme === "system" && currentTheme === getSystemTheme()));
  });

  openModal("settings-modal");
}

function saveSettings() {
  if (DOM.settingsModel) {
    selectedModel = DOM.settingsModel.value;
    if (DOM.modelSelector) DOM.modelSelector.value = selectedModel;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}model`, selectedModel);
  }
  if (DOM.settingsTemp) {
    temperature = parseFloat(DOM.settingsTemp.value);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}temp`, temperature);
  }
  if (DOM.settingsSystemPrompt) {
    systemPrompt = DOM.settingsSystemPrompt.value.slice(0, SYSTEM_PROMPT_MAX);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}system_prompt`, systemPrompt);
  }
  if (DOM.performanceModeEl) {
    performanceMode = DOM.performanceModeEl.value;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}perf_mode`, performanceMode);
  }
  closeModal("settings-modal");
  showToast("Settings saved ✓", "success");
}

/* ──────────────────────────────────────────────────────────────
   THEME
────────────────────────────────────────────────────────────── */

function applyTheme(theme) {
  currentTheme = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", currentTheme);
  localStorage.setItem(`${STORAGE_KEY_PREFIX}theme`, currentTheme);
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function cycleTheme() {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

// Auto-follow system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (localStorage.getItem(`${STORAGE_KEY_PREFIX}theme`) === "system") applyTheme("system");
});

/* ──────────────────────────────────────────────────────────────
   FILE HANDLING
────────────────────────────────────────────────────────────── */

function handleFileSelect(e) {
  const files = [...e.target.files];
  if (!files.length) return;
  addPendingFiles(files);
  e.target.value = ""; // reset input
}

function addPendingFiles(files) {
  pendingFiles.push(...files);
  renderFilePreviews();
  if (DOM.filePreviewArea) DOM.filePreviewArea.hidden = false;
  showToast(`${files.length} file(s) attached`, "info");
}

function renderFilePreviews() {
  if (!DOM.filePreviews) return;
  DOM.filePreviews.innerHTML = pendingFiles.map((f, i) => {
    const isImage = f.type.startsWith("image/");
    const iconOrImg = isImage
      ? `<img src="${URL.createObjectURL(f)}" alt="${escapeHtml(f.name)}" />`
      : `<span style="font-size:1.1rem;">📄</span>`;
    return `
      <div class="file-preview-chip" data-index="${i}">
        ${iconOrImg}
        <span class="file-chip-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <button class="file-remove-btn" data-index="${i}" title="Remove">✕</button>
      </div>`;
  }).join("");

  $qa(".file-remove-btn", DOM.filePreviews).forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingFiles.splice(parseInt(btn.dataset.index), 1);
      renderFilePreviews();
      if (pendingFiles.length === 0 && DOM.filePreviewArea) DOM.filePreviewArea.hidden = true;
    });
  });
}

function clearPendingFiles() {
  pendingFiles = [];
  if (DOM.filePreviews) DOM.filePreviews.innerHTML = "";
  if (DOM.filePreviewArea) DOM.filePreviewArea.hidden = true;
}

function bindDragDrop() {
  const shell = document.querySelector(".chat-wrapper");
  if (!shell) return;

  shell.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (DOM.dropZone) DOM.dropZone.hidden = false;
  });

  shell.addEventListener("dragleave", (e) => {
    if (!shell.contains(e.relatedTarget)) {
      if (DOM.dropZone) DOM.dropZone.hidden = true;
    }
  });

  shell.addEventListener("drop", (e) => {
    e.preventDefault();
    if (DOM.dropZone) DOM.dropZone.hidden = true;
    const files = [...e.dataTransfer.files];
    if (files.length) addPendingFiles(files);
  });
}

/* ──────────────────────────────────────────────────────────────
   VOICE INPUT
────────────────────────────────────────────────────────────── */

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (e) => {
    const transcript = [...e.results]
      .map((r) => r[0].transcript)
      .join("");
    DOM.messageInput.value = transcript;
    autoGrowTextarea();
    updateCharCounter();
    updateSendBtnState();
  };

  recognition.onend = () => {
    isMicActive = false;
    if (DOM.micBtn) DOM.micBtn.classList.remove("active");
  };

  recognition.onerror = (e) => {
    showToast(`Mic error: ${e.error}`, "error");
    isMicActive = false;
    if (DOM.micBtn) DOM.micBtn.classList.remove("active");
  };
}

function toggleMic() {
  if (!recognition) { showToast("Voice input not supported in this browser", "error"); return; }
  if (isMicActive) {
    recognition.stop();
    isMicActive = false;
    DOM.micBtn.classList.remove("active");
    showToast("Mic off", "info");
  } else {
    recognition.start();
    isMicActive = true;
    DOM.micBtn.classList.add("active");
    showToast("Listening… speak now", "info");
  }
}

/* ──────────────────────────────────────────────────────────────
   POST-MESSAGE ACTIONS
────────────────────────────────────────────────────────────── */

function copyLastMessage() {
  const last = messages.filter((m) => m.role === "assistant").at(-1);
  if (!last) return;
  navigator.clipboard.writeText(last.content).then(() => showToast("Copied ✓", "success"));
}

function saveLastMessage() {
  const last = messages.at(-1);
  if (!last) return;
  const blob = new Blob([last.content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-response-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Saved as text file", "success");
}

/* ──────────────────────────────────────────────────────────────
   STATS & STORAGE
────────────────────────────────────────────────────────────── */

function updateStats() {
  if (DOM.tokenCount) DOM.tokenCount.textContent = `Tokens: ${totalTokens}`;
  if (DOM.responseTime) DOM.responseTime.textContent = `Latency: ${latencyMs} ms`;
  if (DOM.latencyValue) DOM.latencyValue.textContent = `${latencyMs} ms`;
  if (DOM.tokenUsage) DOM.tokenUsage.textContent = totalTokens;
  if (DOM.requestCount) DOM.requestCount.textContent = requestCount;
}

function updateStorageIndicator() {
  try {
    let total = 0;
    for (let k in localStorage) {
      if (k.startsWith(STORAGE_KEY_PREFIX)) total += (localStorage[k] || "").length;
    }
    const kb = Math.round(total / 1024);
    const mb = (kb / 1024).toFixed(2);
    const pct = Math.min((kb / 5120) * 100, 100); // 5MB quota estimate
    if (DOM.storageFill) DOM.storageFill.style.width = `${pct}%`;
    if (DOM.storageText) DOM.storageText.textContent = kb > 1024 ? `${mb} MB used` : `${kb} KB used`;
  } catch (_) { }
}

/* ──────────────────────────────────────────────────────────────
   CONNECTION STATUS
────────────────────────────────────────────────────────────── */

function checkOnlineStatus() {
  setConnectionStatus(navigator.onLine ? "online" : "offline");
}

function setConnectionStatus(status) {
  const el = DOM.connectionIndicator;
  const text = DOM.connectionText;
  if (!el) return;

  el.classList.toggle("online", status === "online");
  el.classList.toggle("offline", status === "offline");
  if (text) text.textContent = status === "online" ? "Connected" : "Offline";
}

/* ──────────────────────────────────────────────────────────────
   SOCKET.IO
────────────────────────────────────────────────────────────── */

function initSocket() {
  if (typeof io === "undefined") return;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ["websocket"],
    reconnectionAttempts: 5,
    timeout: 10_000,
  });

  socket.on("connect", () => {
    setConnectionStatus("online");
    if (currentConvId) socket.emit("conversation:join", { conversationId: currentConvId });
  });

  socket.on("disconnect", () => setConnectionStatus("offline"));

  socket.on("connect_error", (err) => {
    console.warn("Socket error:", err.message);
    // Graceful — app still works via HTTP
  });

  socket.on("latency", (ms) => {
    latencyMs = ms;
    updateStats();
  });

  socket.on("system:status", (data) => {
    if ($("server-status")) $("server-status").textContent = data.server || "Online";
    if ($("db-status")) $("db-status").textContent = data.db || "Connected";
    if ($("redis-status")) $("redis-status").textContent = data.redis || "Connected";
    if ($("model-status")) $("model-status").textContent = data.model || "Ready";
  });

  socket.on("performance", (data) => {
    if (DOM.cpuUsage) DOM.cpuUsage.textContent = `${data.cpu || 0}%`;
    if (DOM.memoryUsage) DOM.memoryUsage.textContent = `${data.memory || 0} MB`;
  });
}

/* ──────────────────────────────────────────────────────────────
   MARKDOWN + CODE HIGHLIGHT
────────────────────────────────────────────────────────────── */

function renderMarkdown(text) {
  if (typeof marked === "undefined") return escapeHtml(text);

  // Configure marked
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const raw = DOMPurify
    ? DOMPurify.sanitize(marked.parse(text), { ADD_ATTR: ["class"], FORCE_BODY: true })
    : marked.parse(text);

  // Wrap code blocks with header + copy button
  const wrapped = raw.replace(
    /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      const langLabel = lang || "text";
      return `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-lang-label">${escapeHtml(langLabel)}</span>
            <button class="copy-code-btn" onclick="copyCode(this)" title="Copy code">
              ${copyIcon()} Copy
            </button>
          </div>
          <pre><code class="language-${escapeHtml(langLabel)}">${code}</code></pre>
        </div>`;
    }
  );

  return wrapped;
}

function highlightCode(container) {
  if (typeof hljs === "undefined") return;
  $qa("pre code", container).forEach((block) => {
    try { hljs.highlightElement(block); } catch (_) { }
  });
}

// Global copy-code handler called from inline onclick
window.copyCode = function (btn) {
  const pre = btn.closest(".code-block-wrapper")?.querySelector("pre");
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.classList.add("copied");
    btn.innerHTML = `${checkIcon()} Copied!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `${copyIcon()} Copy`;
    }, 2000);
  });
};

/* ──────────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────────── */

function showToast(message, type = "info", duration = 3000) {
  if (!DOM.toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.setAttribute("role", "alert");
  DOM.toastContainer.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ──────────────────────────────────────────────────────────────
   LOGOUT
────────────────────────────────────────────────────────────── */

function logout() {
  if (!confirm("Sign out?")) return;
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}token`);
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}user`);
  window.location.href = "auth.html";
}

/* ──────────────────────────────────────────────────────────────
   SETTINGS — POPULATE
────────────────────────────────────────────────────────────── */

function populateSettings() {
  if (DOM.modelSelector) DOM.modelSelector.value = selectedModel;
}

/* ──────────────────────────────────────────────────────────────
   UTILITIES
────────────────────────────────────────────────────────────── */

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(str, n) {
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function getErrorMessage(err) {
  if (!navigator.onLine) return "No internet connection. Check your network.";
  if (err?.name === "AbortError") return "Request timed out. Try again.";
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("quota")) return "API quota exceeded. Try again later.";
  if (msg.includes("401")) return "Authentication failed. Please sign in again.";
  if (msg.includes("429")) return "Too many requests. Slow down a bit.";
  if (msg.includes("500")) return "Server error. The model may be unavailable.";
  return err?.message || "Something went wrong. Please try again.";
}

/* ──────────────────────────────────────────────────────────────
   SVG ICONS (inline — no external deps)
────────────────────────────────────────────────────────────── */

function copyIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5"/>
    <path d="M3 11H2.5A1.5 1.5 0 011 9.5v-7A1.5 1.5 0 012.5 1h7A1.5 1.5 0 0111 2.5V3"/>
  </svg>`;
}

function checkIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <polyline points="2,8 6,12 14,4"/>
  </svg>`;
}

function reloadIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M2 8a6 6 0 0112 0"/><polyline points="14,4 14,8 10,8"/>
  </svg>`;
}

function editIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
  </svg>`;
}

function trashIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <polyline points="3,6 4,14 12,14 13,6"/>
    <line x1="1" y1="6" x2="15" y2="6"/>
    <path d="M6 6V4a1 1 0 011-1h2a1 1 0 011 1v2"/>
  </svg>`;
}

function pinIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M10 2l4 4-2 2-4-4 2-2zM6 10l-4 4M8 8L4 12M10 6l-4 4"/>
  </svg>`;
}

function pinActiveIcon() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M9.5 1.5l5 5-2.5 2.5-5-5 2.5-2.5zM5.5 9.5l-4 4.5M9 7L5 11"/>
  </svg>`;
}