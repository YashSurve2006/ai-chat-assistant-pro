/* ═══════════════════════════════════════════════════════════
   AI Chat Assistant Pro – auth.js
   Handles login, registration, tab switching, validation,
   password strength, and JWT token management
═══════════════════════════════════════════════════════════ */
"use strict";

// Use relative URL when served from the backend; fallback for Live Server
const API_BASE = window.location.port === "5000" || window.location.protocol === "file:"
  ? "http://localhost:5000/api"
  : `${window.location.origin}/api`;


/* ── Redirect if already logged in ─────────────────────── */
if (localStorage.getItem("aichat_token")) {
  window.location.href = "index.html";
}

/* ── DOM refs ───────────────────────────────────────────── */
const tabLogin         = document.getElementById("tab-login");
const tabRegister      = document.getElementById("tab-register");
const panelLogin       = document.getElementById("panel-login");
const panelRegister    = document.getElementById("panel-register");

const loginForm        = document.getElementById("login-form");
const loginEmailEl     = document.getElementById("login-email");
const loginPwEl        = document.getElementById("login-password");
const loginEmailErr    = document.getElementById("login-email-err");
const loginPwErr       = document.getElementById("login-pw-err");
const loginAlert       = document.getElementById("login-alert");
const loginSubmitBtn   = document.getElementById("login-submit-btn");

const registerForm     = document.getElementById("register-form");
const regNameEl        = document.getElementById("reg-name");
const regEmailEl       = document.getElementById("reg-email");
const regPwEl          = document.getElementById("reg-password");
const regNameErr       = document.getElementById("reg-name-err");
const regEmailErr      = document.getElementById("reg-email-err");
const regPwErr         = document.getElementById("reg-pw-err");
const registerAlert    = document.getElementById("register-alert");
const registerSubmitBtn= document.getElementById("register-submit-btn");
const pwStrengthEl     = document.getElementById("pw-strength");
const pwFill           = document.getElementById("pw-strength-fill");
const pwLabel          = document.getElementById("pw-strength-label");

/* ════════════════════════════════════════════════════════
   TAB SWITCHING
════════════════════════════════════════════════════════ */
function switchTab(tab) {
  const isLogin = tab === "login";

  tabLogin.classList.toggle("active", isLogin);
  tabRegister.classList.toggle("active", !isLogin);

  tabLogin.setAttribute("aria-selected", isLogin);
  tabRegister.setAttribute("aria-selected", !isLogin);

  panelLogin.classList.toggle("active", isLogin);
  panelRegister.classList.toggle("active", !isLogin);

  clearAlerts();
}

tabLogin.addEventListener("click", () => switchTab("login"));
tabRegister.addEventListener("click", () => switchTab("register"));

/* ════════════════════════════════════════════════════════
   VALIDATION HELPERS
════════════════════════════════════════════════════════ */
const isValidEmail = (v) => /^\S+@\S+\.\S+$/.test(v);

function setFieldState(input, errEl, msg) {
  if (msg) {
    input.classList.add("invalid");
    input.classList.remove("valid");
    errEl.textContent = msg;
  } else {
    input.classList.remove("invalid");
    input.classList.add("valid");
    errEl.textContent = "";
  }
  return !msg;
}

function clearFieldState(input, errEl) {
  input.classList.remove("valid", "invalid");
  errEl.textContent = "";
}

/* ── Password Strength ──────────────────────────────── */
function checkPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)   score++;
  if (pw.length >= 12)  score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { label: "Weak",   color: "#ff6b6b", width: "20%" },
    { label: "Weak",   color: "#ff9f43", width: "35%" },
    { label: "Fair",   color: "#ffd32a", width: "55%" },
    { label: "Good",   color: "#7bed9f", width: "75%" },
    { label: "Strong", color: "#4ade80", width: "100%" },
  ];

  const level = levels[Math.min(score, 4)];
  pwFill.style.width      = level.width;
  pwFill.style.background = level.color;
  pwLabel.style.color     = level.color;
  pwLabel.textContent     = level.label;
  pwStrengthEl.hidden = pw.length === 0;
}

regPwEl.addEventListener("input", () => checkPasswordStrength(regPwEl.value));

/* ── Toggle password visibility ─────────────────────── */
document.querySelectorAll(".toggle-pw-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const isText = target.type === "text";
    target.type = isText ? "password" : "text";
    btn.querySelector(".eye-icon").style.opacity = isText ? "1" : "0.45";
  });
});

/* ════════════════════════════════════════════════════════
   ALERT HELPERS
════════════════════════════════════════════════════════ */
function showAlert(el, msg, type = "error") {
  el.textContent = msg;
  el.className = `auth-alert ${type}`;
  el.hidden = false;
}

function clearAlerts() {
  [loginAlert, registerAlert].forEach((a) => (a.hidden = true));
  [loginEmailEl, loginPwEl, regNameEl, regEmailEl, regPwEl].forEach((f) => f.classList.remove("valid", "invalid"));
  [loginEmailErr, loginPwErr, regNameErr, regEmailErr, regPwErr].forEach((e) => (e.textContent = ""));
}

/* ════════════════════════════════════════════════════════
   API CALLS
════════════════════════════════════════════════════════ */
async function apiCall(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function setLoading(btn, loading) {
  const text    = btn.querySelector(".btn-text");
  const spinner = btn.querySelector(".btn-spinner");
  btn.disabled  = loading;
  text.hidden   = loading;
  spinner.hidden = !loading;
}

function saveAuth(token, user) {
  localStorage.setItem("aichat_token", token);
  localStorage.setItem("aichat_user",  JSON.stringify(user));
}

/* ════════════════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════════════════ */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email    = loginEmailEl.value.trim();
  const password = loginPwEl.value;
  let valid = true;

  if (!email || !isValidEmail(email)) {
    setFieldState(loginEmailEl, loginEmailErr, "Please enter a valid email.");
    valid = false;
  } else {
    setFieldState(loginEmailEl, loginEmailErr, "");
  }

  if (!password) {
    setFieldState(loginPwEl, loginPwErr, "Password is required.");
    valid = false;
  } else {
    setFieldState(loginPwEl, loginPwErr, "");
  }

  if (!valid) return;

  setLoading(loginSubmitBtn, true);
  loginAlert.hidden = true;

  try {
    const { ok, data } = await apiCall("/login", { email, password });

    if (ok && data.token) {
      saveAuth(data.token, data.user);
      showAlert(loginAlert, `✅ ${data.message || "Welcome back!"}`, "success");
      setTimeout(() => (window.location.href = "index.html"), 700);
    } else {
      showAlert(loginAlert, data.message || "Login failed. Please try again.", "error");
    }
  } catch (err) {
    showAlert(loginAlert, "⚡ Cannot connect to server. Make sure the backend is running.", "error");
  } finally {
    setLoading(loginSubmitBtn, false);
  }
});

/* ════════════════════════════════════════════════════════
   REGISTER
════════════════════════════════════════════════════════ */
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name     = regNameEl.value.trim();
  const email    = regEmailEl.value.trim();
  const password = regPwEl.value;
  let valid = true;

  if (!name || name.length < 2) {
    setFieldState(regNameEl, regNameErr, "Name must be at least 2 characters."); valid = false;
  } else {
    setFieldState(regNameEl, regNameErr, "");
  }

  if (!email || !isValidEmail(email)) {
    setFieldState(regEmailEl, regEmailErr, "Please enter a valid email."); valid = false;
  } else {
    setFieldState(regEmailEl, regEmailErr, "");
  }

  if (!password || password.length < 8) {
    setFieldState(regPwEl, regPwErr, "Password must be at least 8 characters."); valid = false;
  } else if (!/[A-Z]/.test(password)) {
    setFieldState(regPwEl, regPwErr, "Password must contain at least one uppercase letter."); valid = false;
  } else if (!/[0-9]/.test(password)) {
    setFieldState(regPwEl, regPwErr, "Password must contain at least one number."); valid = false;
  } else {
    setFieldState(regPwEl, regPwErr, "");
  }

  if (!valid) return;

  setLoading(registerSubmitBtn, true);
  registerAlert.hidden = true;

  try {
    const { ok, data } = await apiCall("/register", { name, email, password });

    if (ok && data.token) {
      saveAuth(data.token, data.user);
      showAlert(registerAlert, `🎉 ${data.message || "Account created!"}`, "success");
      setTimeout(() => (window.location.href = "index.html"), 800);
    } else {
      showAlert(registerAlert, data.message || "Registration failed.", "error");
    }
  } catch (err) {
    showAlert(registerAlert, "⚡ Cannot connect to server. Make sure the backend is running.", "error");
  } finally {
    setLoading(registerSubmitBtn, false);
  }
});

/* ── Real-time validation on blur ───────────────────── */
loginEmailEl.addEventListener("blur",  () => {
  if (loginEmailEl.value) setFieldState(loginEmailEl, loginEmailErr, isValidEmail(loginEmailEl.value) ? "" : "Invalid email.");
});
regEmailEl.addEventListener("blur",    () => {
  if (regEmailEl.value) setFieldState(regEmailEl, regEmailErr, isValidEmail(regEmailEl.value) ? "" : "Invalid email.");
});
regNameEl.addEventListener("blur",     () => {
  if (regNameEl.value) setFieldState(regNameEl, regNameErr, regNameEl.value.trim().length >= 2 ? "" : "Name too short.");
});
