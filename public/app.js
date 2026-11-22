/* ==========================
   LANDING & SETUP NAVIGATION
========================== */

console.log("In-Form Online");

const chars = [...document.querySelectorAll("#logo span")];
let phase = 0;

function setCharacter(char, resolved){
    if(resolved){
        char.textContent = char.dataset.normal;
        char.classList.add("resolved");
    }else{
        char.textContent = char.dataset.glyph;
        char.classList.remove("resolved");
    }
}

function shuffleResolve(amount){
    const mutable = chars.filter(
        c => c.dataset.normal !== c.dataset.glyph
    );
    mutable.sort(() => Math.random() - 0.5);
    mutable.forEach(c => setCharacter(c,false));
    for(let i=0;i<amount;i++){
        if(mutable[i]){
            setCharacter(mutable[i],true);
        }
    }
}

function cycleFormation(){
    phase++;
    if(phase === 1){
        shuffleResolve(2);
    }
    else if(phase === 2){
        shuffleResolve(4);
    }
    else if(phase === 3){
        chars.forEach(c => setCharacter(c,true));
        setTimeout(() => {
            phase = 0;
            chars.forEach(c => {
                if(c.dataset.normal !== c.dataset.glyph){
                    if(Math.random() > .3){
                        setCharacter(c,false);
                    }
                }
            });
        }, 3000);
    }
}

setInterval(cycleFormation, 2500);

/* RAKE Accordion */
const cards = document.querySelectorAll('.card');

cards.forEach(card => {
    card.addEventListener('toggle', () => {
        if (!card.open) return;

        const checkIcon = card.querySelector('.status-icon');
        if (checkIcon) {
            checkIcon.classList.remove('visible');
        }

        cards.forEach(otherCard => {
            if (otherCard !== card) {
                otherCard.removeAttribute('open');
            }
        });
    });
});

/* Screen Elements */
const landingScreen = document.getElementById("landing-screen");
const setupScreen = document.getElementById("setup-screen");
const appScreen = document.getElementById("app-screen");

const openBtn = document.getElementById("open-btn");
const startBtn = document.getElementById("start-btn");

/* OPEN button: Landing -> Setup (or Sign in, when the server asks for it) */
if(openBtn){
    openBtn.addEventListener("click", async () => {
        landingScreen.style.opacity = "0";
        const [next] = await Promise.all([
            prepareAfterLanding(),
            new Promise(resolve => setTimeout(resolve, 500))
        ]);
        landingScreen.style.display = "none";
        showScreen(next);
    });
}

/* ==========================
   LANDING WORD ANIMATIONS
========================== */

const rotatingWord = document.getElementById("rotating-word");
const words = ["DAY", "SELF", "MIND"];
let wordIndex = 0;

function rotateWord(){
    if(!rotatingWord) return;

    const current = words[wordIndex];
    const next = words[(wordIndex + 1) % words.length];

    if(current === "DAY"){
        rotatingWord.classList.add("word-shrink");
        setTimeout(() => {
            rotatingWord.className = "";
            rotatingWord.textContent = next;
            rotatingWord.classList.add("word-fade");
        }, 900);
    }
    else if(current === "SELF"){
        rotatingWord.classList.add("word-expand");
        setTimeout(() => {
            rotatingWord.className = "";
            rotatingWord.textContent = next;
            rotatingWord.classList.add("word-fade");
        }, 900);
    }
    else{
        rotatingWord.classList.add("word-fall");
        setTimeout(() => {
            rotatingWord.className = "";
            rotatingWord.textContent = "DAY";
            rotatingWord.classList.add("word-slide-left");
        }, 900);
    }

    setTimeout(() => {
        rotatingWord.className = "";
    }, 1800);

    wordIndex = (wordIndex + 1) % words.length;
}

setInterval(rotateWord, 2000);

/* ==========================
   LIVE DYNAMIC BACKGROUND
========================== */

const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");

let particles = [];
const particleCount = 45;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        const corners = [
            { x: 0, y: 0 },
            { x: canvas.width, y: 0 },
            { x: 0, y: canvas.height },
            { x: canvas.width, y: canvas.height }
        ];
        const startCorner = corners[Math.floor(Math.random() * corners.length)];

        this.startX = startCorner.x;
        this.startY = startCorner.y;
        this.targetX = Math.random() * canvas.width;
        this.targetY = Math.random() * canvas.height;

        this.x = this.startX;
        this.y = this.startY;

        this.progress = 0;
        this.speed = Math.random() * 0.003 + 0.0015; 
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.size = Math.random() * 2 + 1;
    }

    update() {
        if (this.progress < 1) {
            this.progress += this.speed; 
            if (this.progress > 1) this.progress = 1;

            const ease = 1 - Math.pow(1 - this.progress, 3);
            this.x = this.startX + (this.targetX - this.startX) * ease;
            this.y = this.startY + (this.targetY - this.startY) * ease;
        } else {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0) this.x = canvas.width;
            if (this.x > canvas.width) this.x = 0;
            if (this.y < 0) this.y = canvas.height;
            if (this.y > canvas.height) this.y = 0;
        }
    }

    draw() {
        const alpha = Math.min(this.progress * 0.8, 0.6);
        ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#00ff88";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function initParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

initParticles();

function animateBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
        p.update();
        p.draw();
    });

    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 120) {
                const baseOpacity = (1 - (distance / 120)) * 0.2;
                const progressFactor = Math.min(particles[i].progress, particles[j].progress);
                const opacity = baseOpacity * progressFactor;

                ctx.strokeStyle = `rgba(0, 255, 136, ${opacity})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }

    requestAnimationFrame(animateBackground);
}

animateBackground();

/* ==========================
   APP SUB-HEADER WORD ROTATION
========================== */

const appRotatingWord = document.getElementById("app-rotating-word");
const appWords = ["DAY", "SELF", "MIND"];
let appWordIndex = 0;

function rotateAppWord() {
    if (!appRotatingWord) return;

    appRotatingWord.classList.add("fade-out");

    setTimeout(() => {
        appWordIndex = (appWordIndex + 1) % appWords.length;
        appRotatingWord.textContent = appWords[appWordIndex];
        appRotatingWord.classList.remove("fade-out");
    }, 600);
}

setInterval(rotateAppWord, 3500);

/* ==========================
   SOURCE MANAGEMENT
========================== */

/* Escape untrusted text before inserting it into HTML. */
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* Only allow http(s) links; anything else becomes "#". */
function safeUrl(value) {
    try {
        const u = new URL(String(value), window.location.href);
        return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "#";
    } catch {
        return "#";
    }
}

let userSources = [];

const sourceInput = document.getElementById("source-input");
const addSourceBtn = document.getElementById("add-source-btn");
const sourcesList = document.getElementById("sources-list");

const TOPIC_PREFIX = "topic:";
const FALLBACK_TOPICS = [
    ["technology", "Technology"], ["science", "Science"], ["news", "News"], ["sport", "Sport"],
    ["education", "Education"], ["religion", "Religion"], ["relationships-wellbeing", "Relationships and wellbeing"]
].map(([id, label]) => ({ id, label, source: TOPIC_PREFIX + id }));

let topics = FALLBACK_TOPICS;
const topicChips = document.getElementById("topic-chips");
const customSources = document.getElementById("custom-sources");

function topicLabel(input) {
    const t = topics.find(x => x.source === String(input).toLowerCase());
    return t ? t.label : input;
}

async function loadTopics() {
    try {
        const res = await apiFetch("/api/topics");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.topics) && data.topics.length) topics = data.topics;
        if (Array.isArray(data.regions) && data.regions.length) regions = data.regions;
    } catch {
        /* keep the built-in list */
    }
    renderSources();
    renderRegion();
}

const SCOPES = [["local", "Local"], ["global", "Global"], ["both", "Both"]];
const FALLBACK_REGIONS = [
    ["europe", "Europe", true], ["africa", "Africa", true], ["asia", "Asia", true],
    ["oceania", "Oceania", true], ["north-america", "North America", true], ["south-america", "South America", false]
].map(([id, label, hasEditions]) => ({ id, label, hasEditions }));

let regions = FALLBACK_REGIONS;
let userRegion = { scope: "both", area: null };

// A starting guess from the browser's time zone. It is only a suggestion: the
// person can change it, and nothing is saved until they press START.
function guessArea() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* unknown */ }
    const [zone, city = ""] = tz.split("/");
    if (zone === "Europe") return "europe";
    if (zone === "Africa") return "africa";
    if (zone === "Asia") return "asia";
    if (zone === "Australia" || zone === "Pacific") return "oceania";
    if (zone === "America") {
        const south = /^(Argentina|Sao_Paulo|Bogota|Lima|Santiago|Caracas|La_Paz|Montevideo|Asuncion|Guayaquil|Cayenne|Paramaribo|Guyana|Manaus|Bahia|Fortaleza|Recife|Belem|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista)/;
        return south.test(city) ? "south-america" : "north-america";
    }
    return null;
}

function normalizeRegion(value) {
    const ok = value && ["local", "global", "both"].includes(value.scope);
    if (!ok) return { scope: "both", area: guessArea() };
    return { scope: value.scope, area: value.area ?? null };
}

function renderRegion() {
    const scopeBox = document.getElementById("region-scope");
    const areaSel = document.getElementById("region-area");
    const note = document.getElementById("region-note");
    if (!scopeBox || !areaSel) return;

    scopeBox.innerHTML = "";
    SCOPES.forEach(([id, label]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "topic-chip";
        btn.dataset.scope = id;
        btn.textContent = label;
        const on = userRegion.scope === id;
        btn.classList.toggle("selected", on);
        btn.setAttribute("aria-pressed", String(on));
        btn.addEventListener("click", () => {
            userRegion = { ...userRegion, scope: id };
            setSetupDirty(true);
            renderRegion();
        });
        scopeBox.appendChild(btn);
    });

    areaSel.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose a region";
    areaSel.appendChild(blank);
    regions.forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = r.label;
        areaSel.appendChild(opt);
    });
    areaSel.value = userRegion.area || "";
    areaSel.hidden = userRegion.scope === "global";
    areaSel.onchange = () => {
        userRegion = { ...userRegion, area: areaSel.value || null };
        setSetupDirty(true);
        renderRegion();
    };

    const area = regions.find(r => r.id === userRegion.area);
    let text = "Applies to News, Sport and Education. Other topics are the same everywhere.";
    if (userRegion.scope !== "global" && !userRegion.area) {
        text = "Choose a region to see local sources. Until then you get the global ones.";
    } else if (userRegion.scope !== "global" && area && !area.hasEditions) {
        text = `No English-language local sources for ${area.label} yet. ` +
            (userRegion.scope === "local" ? "Local topics will show nothing until you pick Both or Global." : "You will get the global ones.");
    }
    if (note) note.textContent = text;
}

function renderSources() {
    renderTopicChips();
    if (!sourcesList) return;
    sourcesList.innerHTML = "";

    // Topic chips are shown as chips; only the user's own entries are listed here.
    userSources.forEach((source, index) => {
        if (source.toLowerCase().startsWith(TOPIC_PREFIX)) return;
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${escapeHtml(source)}</span>
            <button data-index="${index}">×</button>
        `;
        sourcesList.appendChild(li);
    });
    if (customSources && sourcesList.children.length) customSources.open = true;

    sourcesList.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            userSources.splice(index, 1);
            setSetupDirty(true);
            renderSources();
        });
    });
}

function renderTopicChips() {
    if (!topicChips) return;
    topicChips.innerHTML = "";
    const chosen = new Set(userSources.map(s => s.toLowerCase()));
    topics.forEach(topic => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "topic-chip";
        btn.dataset.topic = topic.id;
        btn.textContent = topic.label;
        const on = chosen.has(topic.source);
        btn.classList.toggle("selected", on);
        btn.setAttribute("aria-pressed", String(on));
        btn.addEventListener("click", () => {
            const i = userSources.findIndex(s => s.toLowerCase() === topic.source);
            if (i >= 0) userSources.splice(i, 1);
            else userSources.push(topic.source);
            setSetupDirty(true);
            renderSources();
        });
        topicChips.appendChild(btn);
    });
}

if (addSourceBtn) {
    addSourceBtn.addEventListener("click", () => {
        const value = sourceInput.value.trim();
        if (value && !userSources.includes(value)) {
            userSources.push(value);
            sourceInput.value = "";
            setSetupDirty(true);
            renderSources();
        }
    });

    sourceInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            addSourceBtn.click();
        }
    });
}

/* ==========================
   ACCOUNT: SIGN-IN AND STORED CONFIGURATION

   Detected from GET /api/auth/me, the app runs in one of three modes:
     local    no server answered (e.g. static hosting). Setup lives in this
              browser only, exactly as before.
     login    the server requires a password and we are not signed in.
     account  signed in (or the server has sign-in switched off for local
              development). Setup is also saved to the account, so it follows
              you to other devices.
========================== */

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginPassword = document.getElementById("login-password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const setupError = document.getElementById("setup-error");
const logoutBtn = document.getElementById("logout-btn");

let authState = { available: false, authRequired: false, authenticated: false };

class AccountError extends Error {
    constructor(kind, message) {
        super(message);
        this.kind = kind;
    }
}

/* ==========================
   PHONE VERSION (hosted server, no accounts)

   When the server says it is hosted (GET /api/health), nothing about you is kept
   there: setup is saved in this browser as before, and what you have seen, opened,
   marked Useful or dismissed is kept by device-store.js. Each press sends the part
   the server needs to POST /api/v1/generate. Only the built-in topics work there.
========================== */

let deviceMode = false;
let deviceStore = null;
let deviceDroppedSources = 0;

const isTopicSource = (input) => /^topic:/i.test(String(input));
const topicIds = (sources) => [...new Set(sources.filter(isTopicSource).map(input => String(input).slice(6).toLowerCase()))];

function browserStorage() {
    try { return window.localStorage; } catch { return null; }
}

const HOSTED_FLAG = "inform_hosted_origin";
let appVersion = "";

// The feedback form opens with the version already filled in, when the server told us.
function updateFeedbackLink() {
    const link = document.getElementById("feedback-link");
    if (!link) return;
    const base = "https://github.com/GlyphTek/in-form/issues/new?template=feedback.yml";
    link.href = appVersion ? `${base}&version=${encodeURIComponent(appVersion)}` : base;
}

function knownHosted() {
    try { return localStorage.getItem(HOSTED_FLAG) === "1"; } catch { return false; }
}

async function enterDeviceMode() {
    const { createDeviceStore } = await import("./device-store.js");
    deviceStore = createDeviceStore({ storage: browserStorage() });
    deviceMode = true;
    try { localStorage.setItem(HOSTED_FLAG, "1"); } catch { /* optional */ }
}

async function detectDeviceMode() {
    if (deviceMode) return true;
    try {
        const response = await apiFetch("/api/health", { headers: { accept: "application/json" } });
        if (!response.ok) return false;
        const data = await response.json();
        if (data && typeof data.version === "string" && /^[\w.+-]{1,20}$/.test(data.version)) appVersion = data.version;
        if (data && data.mode === "hosted") await enterDeviceMode();
    } catch {
        /* not the hosted server: the normal app */
    }
    return deviceMode;
}

// Custom sites and feeds are not available in the phone version, so a saved setup
// from elsewhere keeps its topics and says how many it had to leave out.
function topicsOnlyForDevice(sources) {
    if (!deviceMode) return sources;
    const topics = sources.filter(isTopicSource);
    deviceDroppedSources += sources.length - topics.length;
    return topics;
}

function renderDeviceNote() {
    const note = document.getElementById("device-note");
    if (!note) return;
    note.hidden = !deviceMode;
    if (!deviceMode) return;
    const parts = ["Your setup and history stay on this phone. When you press, IN-FORM's server looks up the news for your topics, and keeps nothing."];
    if (deviceDroppedSources) {
        parts.push(`Custom sites and feeds are not in the phone version yet, so ${deviceDroppedSources} of your sources ${deviceDroppedSources === 1 ? "was" : "were"} left out.`);
    }
    if (deviceStore && deviceStore.problem) parts.push(deviceStore.problem);
    note.textContent = parts.join(" ");
    if (customSources) customSources.style.display = "none";
}

async function apiFetch(path, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(path, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function jsonRequest(method, body) {
    return {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    };
}

async function refreshAuth() {
    // This address has been the hosted version before. A free host may be asleep, and
    // waiting on it here would only delay the page, so go straight to the phone setup.
    if (!deviceMode && knownHosted()) {
        try {
            await enterDeviceMode();
            authState = { available: false, authRequired: false, authenticated: false };
            return authState;
        } catch { /* fall through to the normal check */ }
    }
    try {
        const response = await apiFetch("/api/auth/me", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (typeof data.authenticated !== "boolean") throw new Error("not the IN-FORM API");
        authState = {
            available: true,
            authRequired: Boolean(data.authRequired),
            authenticated: data.authenticated
        };
    } catch {
        authState = { available: false, authRequired: false, authenticated: false };
        await detectDeviceMode();
    }
    return authState;
}

function accountMode() {
    if (!authState.available) return "local";
    return authState.authenticated ? "account" : "login";
}

function saveLocalConfig(config) {
    try {
        localStorage.setItem("inform_config", JSON.stringify(config));
    } catch (err) {
        console.warn("Could not save setup on this device", err);
    }
}

// Set once this browser has talked to the account, so an old copy left in
// localStorage is never imported over (and resurrected into) a later setup.
function accountSynced() {
    try { return localStorage.getItem("inform_account_synced") === "1"; } catch { return false; }
}

function markAccountSynced() {
    try { localStorage.setItem("inform_account_synced", "1"); } catch { /* optional */ }
}

async function fetchAccountConfig() {
    const response = await apiFetch("/api/config");
    if (response.status === 401) throw new AccountError("unauthorized", "Your session expired. Sign in again.");
    if (!response.ok) throw new AccountError("http", `The server responded with ${response.status}.`);
    return response.json();
}

async function saveAccountConfig(config) {
    const response = await apiFetch("/api/config", jsonRequest("PUT", config));
    if (response.status === 401) throw new AccountError("unauthorized", "Your session expired. Sign in again.");
    if (response.status === 400) {
        const data = await response.json().catch(() => ({}));
        throw new AccountError("invalid", data.message || "Some of those sources can't be used.");
    }
    if (response.status === 429) throw new AccountError("rate_limited", "Too many requests. Wait a moment and try again.");
    if (!response.ok) throw new AccountError("http", `The server responded with ${response.status}.`);
    return response.json();
}

function showScreen(name) {
    const screens = { landing: landingScreen, setup: setupScreen, login: loginScreen, app: appScreen };
    const display = { landing: "flex", setup: "flex", login: "flex", app: "block" };
    Object.entries(screens).forEach(([key, el]) => {
        if (!el) return;
        if (key === name) {
            el.style.display = display[key];
            el.style.opacity = "1";
        } else {
            el.style.display = "none";
        }
    });
    if (name === "login" && loginPassword) loginPassword.focus();
}

function showLoginAgain(message) {
    authState.authenticated = false;
    if (loginError) loginError.textContent = message || "";
    showScreen("login");
}

/**
 * Work out what setup should start with and fill it in. In account mode the
 * account is the source of truth; the first time a browser signs in to an empty
 * account, the setup already saved in that browser is carried over.
 * Returns the screen to show next: "setup" or "login".
 */
// Edits to the setup lists only take effect when START is pressed, so say so
// while there are unsaved changes and warn before leaving the page with them.
const unsavedNote = document.getElementById("setup-unsaved");
let setupDirty = false;

function setSetupDirty(dirty) {
    setupDirty = dirty;
    if (unsavedNote) unsavedNote.hidden = !dirty;
}

window.addEventListener("beforeunload", (e) => {
    if (!setupDirty) return;
    e.preventDefault();
    e.returnValue = "";
});

async function preloadSetup() {
    let config = loadConfig();

    if (accountMode() === "account") {
        try {
            const remote = await fetchAccountConfig();
            const remoteHasData = remote.sources.length > 0;
            const localHasData = config.sources.length > 0;

            if (!remoteHasData && localHasData && !accountSynced()) {
                try {
                    await saveAccountConfig(config);
                } catch (err) {
                    if (err.kind === "unauthorized") throw err;
                    console.warn("Could not carry this device's setup to your account", err);
                }
            } else {
                config = { sources: remote.sources, region: remote.region };
            }
            markAccountSynced();
        } catch (err) {
            if (err.kind === "unauthorized") {
                showLoginAgain(err.message);
                return "login";
            }
            console.warn("Could not load setup from your account; using this device's copy", err);
        }
    }

    deviceDroppedSources = 0;
    userSources = [...topicsOnlyForDevice(config.sources)];
    userRegion = normalizeRegion(config.region);
    renderSources();
    renderRegion();
    loadTopics();
    renderDeviceNote();
    setSetupDirty(false);
    if (setupError) setupError.textContent = "";
    return "setup";
}


/* ==========================
   EXPORT / IMPORT OF THE SETUP

   A small JSON file: { app, version, exportedAt, sources, region }. Loading a
   file only fills in the setup screen; nothing is saved until START.
========================== */

const SETUP_FILE_APP = "in-form";
const SETUP_FILE_VERSION = 1;
const SETUP_MAX_SOURCES = 20;
const SETUP_MAX_FILE_BYTES = 100 * 1024;

function buildSetupFile() {
    return {
        app: SETUP_FILE_APP,
        version: SETUP_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        sources: [...userSources],
        region: { ...userRegion }
    };
}

// Returns { sources, region } or throws an Error whose message says what is wrong.
function parseSetupFile(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("That file is not a saved IN-FORM setup (it is not valid JSON).");
    }
    if (!data || typeof data !== "object" || data.app !== SETUP_FILE_APP) {
        throw new Error("That file is not a saved IN-FORM setup.");
    }
    if (data.version !== SETUP_FILE_VERSION) {
        throw new Error("That setup file was made by a different version of IN-FORM and can't be loaded.");
    }
    if (!Array.isArray(data.sources) || data.sources.some(s => typeof s !== "string")) {
        throw new Error("That setup file has no valid list of topics and sites.");
    }
    const seen = new Set();
    const sources = [];
    for (const raw of data.sources) {
        const value = raw.trim().replace(/\s+/g, " ");
        if (!value || value.length > 2048 || seen.has(value.toLowerCase())) continue;
        seen.add(value.toLowerCase());
        sources.push(value);
    }
    if (sources.length > SETUP_MAX_SOURCES) {
        throw new Error(`That setup has ${sources.length} entries; the limit is ${SETUP_MAX_SOURCES}.`);
    }
    const areas = regions.map(r => r.id);
    const r = data.region;
    const region = r && ["local", "global", "both"].includes(r.scope) && (r.area == null || areas.includes(r.area))
        ? { scope: r.scope, area: r.area ?? null }
        : null;
    return { sources, region };
}

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");

if (exportBtn) {
    exportBtn.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(buildSetupFile(), null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "in-form-setup.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (setupError) setupError.textContent = "";
    });
}

if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
        const file = importFile.files && importFile.files[0];
        importFile.value = "";
        if (!file) return;
        if (setupError) setupError.textContent = "";
        try {
            if (file.size > SETUP_MAX_FILE_BYTES) throw new Error("That file is too large to be a saved setup.");
            const loaded = parseSetupFile(await file.text());
            deviceDroppedSources = 0;
            userSources = topicsOnlyForDevice(loaded.sources);
            if (loaded.region) userRegion = loaded.region;
            renderDeviceNote();
            setSetupDirty(true);
            renderSources();
            renderRegion();
            if (setupError) setupError.textContent = "";
        } catch (err) {
            if (setupError) setupError.textContent = err.message;
        }
    });
}

async function prepareAfterLanding() {
    await refreshAuth();
    renderInstallHint();
    if (accountMode() === "login") return "login";
    return preloadSetup();
}

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const password = loginPassword.value;
        if (!password) return;

        loginError.textContent = "";
        loginBtn.disabled = true;
        try {
            const response = await apiFetch("/api/auth/login", jsonRequest("POST", { password }));
            if (response.status === 401) {
                loginError.textContent = "Incorrect password.";
                return;
            }
            if (response.status === 429) {
                loginError.textContent = "Too many attempts. Wait a minute and try again.";
                return;
            }
            if (!response.ok) {
                loginError.textContent = "Could not sign in. Try again.";
                return;
            }
            loginPassword.value = "";
            await refreshAuth();
            showScreen(await preloadSetup());
        } catch {
            loginError.textContent = "Could not reach the IN-FORM server.";
        } finally {
            loginBtn.disabled = false;
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const response = await apiFetch("/api/auth/logout", { method: "POST" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            window.location.reload();
        } catch {
            logoutBtn.textContent = "Sign out failed. Try again";
        }
    });
}

/* ==========================
   START BUTTON – SAVE FULL CONFIG
========================== */

if (startBtn) {
    startBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (startBtn.disabled) return;

        if (setupError) setupError.textContent = "";
        const userConfig = {
            sources: [...userSources],
            region: { ...userRegion }
        };

        let syncNote = "";
        if (accountMode() === "account") {
            startBtn.disabled = true;
            try {
                await saveAccountConfig(userConfig);
                markAccountSynced();
            } catch (err) {
                if (err.kind === "unauthorized") {
                    showLoginAgain(err.message);
                    return;
                }
                if (err.kind === "invalid" || err.kind === "rate_limited") {
                    // Stay on setup so the user can fix it; nothing has changed.
                    setupError.textContent = err.message;
                    return;
                }
                syncNote = " • not saved to your account";
            } finally {
                startBtn.disabled = false;
            }
        }

        const previousSources = deviceMode ? loadConfig().sources : [];
        saveLocalConfig(userConfig);
        if (deviceMode) {
            // A topic taken out here and added back later starts fresh, as on the desktop.
            const kept = new Set(userConfig.sources.map(input => String(input).toLowerCase()));
            deviceStore.forgetSources(previousSources.filter(input => !kept.has(String(input).toLowerCase())));
        }
        // Only a confirmed account save counts as saved; otherwise keep warning.
        if (!syncNote) setSetupDirty(false);

        setupScreen.style.opacity = "0";
        setTimeout(() => {
            showScreen("app");

            const taglineEl = document.querySelector(".tagline");
            if (taglineEl) {
                taglineEl.textContent = `Powered by RAKE${syncNote}`;
            }
        }, 500);
    });
}

/* ==========================
   LOCAL RESONANCE ENGINE (TIFA)
========================== */

const tifaBtn = document.getElementById("tifa-btn");
const tifaSubtitle = document.getElementById("tifa-subtitle");
const tifaRefreshBtn = document.getElementById("tifa-refresh-btn");

const signalElements = {
    relevant: document.getElementById("signal-relevant"),
    attention: document.getElementById("signal-attention"),
    knowing: document.getElementById("signal-knowing"),
    experience: document.getElementById("signal-experience")
};

const contentElements = {
    relevant: document.getElementById("content-relevant"),
    attention: document.getElementById("content-attention"),
    knowing: document.getElementById("content-knowing"),
    experience: document.getElementById("content-experience")
};

const checkElements = {
    relevant: document.getElementById("check-relevant"),
    attention: document.getElementById("check-attention"),
    knowing: document.getElementById("check-knowing"),
    experience: document.getElementById("check-experience")
};

const activeSourcesWrapper = document.getElementById("active-sources-wrapper");
const activeSourcesToggle = document.getElementById("active-sources-toggle");
const activeSourcesPanel = document.getElementById("active-sources-panel");
const activeSitesList = document.getElementById("active-sites-list");

let sourcesPanelOpen = false;

if (activeSourcesToggle) {
    activeSourcesToggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sourcesPanelOpen = !sourcesPanelOpen;
        activeSourcesPanel.style.display = sourcesPanelOpen ? "block" : "none";
        activeSourcesToggle.textContent = sourcesPanelOpen 
            ? "Active Sources ▴" 
            : "Active Sources ▾";
    });
}

let isGenerating = false;
// True once a run found the person fully caught up: PRESS becomes DONE.
let caughtUpMode = false;
const PRESS_LABEL = "PRESS";
const DONE_LABEL = "DONE";
const CAUGHT_UP_TEXT = "You're caught up. Nothing more right now.";
const IDLE_SUBTITLE = "Current Signals → Tap to generate";

// Signals currently on screen, by server id, so Dismiss can be undone and
// "Useful" can toggle without asking the server what it looked like.
const signalsOnScreen = new Map();

// Google News links all point at news.google.com, which tells you nothing, but its
// headlines end with " - Publisher". Show the publisher as the source and keep the
// headline clean. Only the display changes; the stored title is untouched.
function splitHeadline(signal) {
    const title = String(signal.title || "");
    const host = String(signal.linkText || "");
    if (/(^|\.)google\.com$/i.test(host)) {
        const i = title.lastIndexOf(" - ");
        const headline = i > 0 ? title.slice(0, i).trim() : "";
        const publisher = i > 0 ? title.slice(i + 3).trim() : "";
        if (headline && publisher && publisher.length <= 60) return { headline, source: publisher };
        return { headline: title, source: "Google News" };
    }
    return { headline: title, source: host || "Open link" };
}

function renderSignalHtml(signal) {
    signalsOnScreen.set(signal.id, signal);
    const { headline, source } = splitHeadline(signal);
    return `<div class="signal-item" data-signal-id="${Number(signal.id)}">` +
        `<p class="signal-title">${escapeHtml(headline)}</p>` +
        `<p class="signal-source"><a href="${escapeHtml(safeUrl(signal.link))}" target="_blank" rel="noopener noreferrer" ` +
        `data-signal-link aria-label="Open the article from ${escapeHtml(source)}">${escapeHtml(source)} ↗</a></p>` +
        (signal.reason ? `<p class="signal-why">Why: ${escapeHtml(signal.reason)}</p>` : "") +
        `<div class="signal-actions">` +
        `<button type="button" class="signal-btn" data-action="useful" aria-pressed="${signal.useful ? "true" : "false"}">` +
        `${signal.useful ? "Useful ✓" : "Useful"}</button>` +
        `<button type="button" class="signal-btn" data-action="dismiss">Dismiss</button>` +
        `</div></div>`;
}

function renderDismissedHtml(id) {
    return `<div class="signal-item signal-dismissed" data-signal-id="${Number(id)}">` +
        `<p>Dismissed. It won't appear in future runs. ` +
        `<button type="button" class="signal-btn" data-action="undo">Undo</button></p></div>`;
}

function renderChannelHtml(signals) {
    return signals.map(renderSignalHtml).join("");
}

function getBarString(fillCount) {
    const filled = "█".repeat(fillCount);
    const empty = "░".repeat(10 - fillCount);
    return filled + empty;
}

/* ==========================
   LIVE SIGNALS

   The server fetches, parses and ranks (POST /api/signals/generate).
   If it cannot be reached we say so plainly. We never show placeholder
   signals, because content that looks live but isn't undermines trust.
========================== */

const CHANNELS = ["relevant", "attention", "knowing", "experience"];
const EMPTY_BAR = "░░░░░░░░░░";
const EMPTY_CHANNEL_TEXT = "Nothing in this channel right now.";
const EMPTY_NEW_TEXT = "Nothing new in this channel. You've already seen what your sources have right now.";
const UNAVAILABLE_TEXT =
    "Live signals are unavailable right now. Nothing is shown rather than placeholder content.";

class SignalsError extends Error {
    constructor(kind, message) {
        super(message);
        this.kind = kind;
    }
}

function loadConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem("inform_config"));
        if (saved && typeof saved === "object") {
            return {
                sources: Array.isArray(saved.sources) ? saved.sources : [],
                region: saved.region && typeof saved.region === "object" ? saved.region : null
            };
        }
    } catch (err) {
        console.warn("Could not read saved configuration", err);
    }
    return { sources: [], region: null };
}

// A free host goes to sleep when nobody uses it and takes up to about a minute to wake.
// In the phone version the first press can therefore be slow, so it waits, says why,
// and tries again if the host answers "not ready" while it starts.
const WAKE_NOTICE = "Waking the server up. The first press after a quiet spell can take about a minute.";
const WAKE_STATUSES = [502, 503, 504];

async function requestSignals(config) {
    const patient = deviceMode;
    const budgetMs = patient ? 100000 : 45000;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const noticeTimer = patient ? setTimeout(() => { tifaSubtitle.textContent = WAKE_NOTICE; }, 6000) : null;

    try {
        let url = "/api/signals/generate";
        let payload = config.region ? { sources: config.sources, region: config.region } : { sources: config.sources };
        if (deviceMode) {
            // Everything the server needs to rank comes from this phone, per request.
            url = "/api/v1/generate";
            payload = { topics: topicIds(config.sources), ...deviceStore.snapshot() };
            if (config.region) payload.region = config.region;
        }
        const send = () => fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        let response;
        for (let attempt = 0; ; attempt++) {
            let failure = null;
            try {
                response = await send();
                if (!(patient && WAKE_STATUSES.includes(response.status))) break;
            } catch (err) {
                if (!patient || (err && err.name === "AbortError")) throw err;
                failure = err;
            }
            if (attempt >= 8 || Date.now() - started > budgetMs - 12000) {
                if (failure) throw failure;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 8000));
        }

        if (response.status === 401) {
            throw new SignalsError("unauthorized", "Your session expired. Sign in again.");
        }
        if (response.status === 429) {
            throw new SignalsError("rate_limited", "Too many requests. Wait a moment and try again.");
        }
        if (!response.ok) {
            throw new SignalsError("http", `The server responded with ${response.status}.`);
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new SignalsError("bad_response", "The server sent an unexpected response.");
        }
        if (!data || typeof data !== "object" || !data.channels || !data.status) {
            throw new SignalsError("bad_response", "The server sent an unexpected response.");
        }
        // The phone keeps its own record of what it has just been shown.
        if (deviceMode) data.channels = deviceStore.recordShown(data.channels);
        return data;
    } catch (err) {
        if (err instanceof SignalsError) throw err;
        if (err && err.name === "AbortError") {
            throw new SignalsError("timeout", "The server took too long to respond.");
        }
        throw new SignalsError("unreachable", "Could not reach the IN-FORM server.");
    } finally {
        clearTimeout(timer);
        if (noticeTimer) clearTimeout(noticeTimer);
    }
}

function hiddenCount(result) {
    const h = result.hidden || {};
    return (Number(h.seen) || 0) + (Number(h.dismissed) || 0);
}

function withHidden(text, result, { canReplace = true } = {}) {
    const h = result.hidden || {};
    const seen = Number(h.seen) || 0;
    const dismissed = Number(h.dismissed) || 0;
    const nothingShown = CHANNELS.every(channel => !(result.channels[channel] || []).length);
    if (canReplace && nothingShown && seen + dismissed > 0) {
        return "Nothing new right now. To see a source's items again, remove it in setup and add it back.";
    }
    const parts = [];
    if (seen) parts.push(`${seen} already seen`);
    if (dismissed) parts.push(`${dismissed} dismissed`);
    return parts.length ? `${text} · ${parts.join(", ")} hidden` : text;
}

function subtitleFor(result) {
    const sources = result.sources || [];
    switch (result.status) {
        case "ok":
            return withHidden("RAKE Generation complete", result);
        case "partial": {
            const failed = sources.filter(s => s.status === "error").length;
            return withHidden(failed
                ? `Generated, but ${failed} of ${sources.length} sources are unavailable`
                : "Generated, with some sources showing older data", result, { canReplace: false });
        }
        case "unavailable":
            return "No live signals: your sources could not be reached";
        case "no_sources":
            return "Add a site, feed or topic in setup to generate signals";
        default:
            return "RAKE Generation complete";
    }
}

function renderListItems(listEl, items, emptyText) {
    listEl.innerHTML = "";
    if (!items.length) {
        const li = document.createElement("li");
        li.textContent = emptyText;
        listEl.appendChild(li);
        return;
    }
    items.forEach(build => listEl.appendChild(build()));
}

function renderActiveSources(config, result) {
    if (!activeSourcesWrapper) return;
    activeSourcesWrapper.style.display = "block";
    sourcesPanelOpen = false;
    activeSourcesPanel.style.display = "none";
    activeSourcesToggle.textContent = "Active Sources ▾";

    // Only offer "Sign out" when there is actually a sign-in to end.
    if (logoutBtn) {
        logoutBtn.style.display = authState.authRequired && authState.authenticated ? "block" : "none";
    }

    // Sites show what actually happened to each source.
    const sites = result
        ? result.sources || []
        : config.sources.map(input => ({ input, status: "unchecked" }));
    renderListItems(
        activeSitesList,
        sites.map(s => () => {
            const li = document.createElement("li");
            let note = "";
            if (s.status === "ok") note = `✓ ${s.itemCount} items`;
            else if (s.status === "stale") note = "⚠ showing older data";
            else if (s.status === "error") note = `✗ ${s.error ? s.error.message : "unavailable"}`;
            else note = "not checked";
            li.textContent = `${s.label || topicLabel(s.input)}: ${note}${s.note ? ` (${s.note})` : ""}`;
            return li;
        }),
        "None added"
    );
}

function setChannelBars(targets, step) {
    CHANNELS.forEach(channel => {
        signalElements[channel].textContent = getBarString(Math.min(step, targets[channel]));
    });
}

function showUnavailable(config, message) {
    CHANNELS.forEach(channel => {
        signalElements[channel].textContent = EMPTY_BAR;
        contentElements[channel].innerHTML = `<p>${escapeHtml(UNAVAILABLE_TEXT)}</p>`;
    });
    tifaSubtitle.textContent = `Live signals unavailable. ${message} Tap to retry.`;
    renderActiveSources(config, null);
    isGenerating = false;
}

function showSignals(config, result) {
    signalsOnScreen.clear();
    const targets = {};
    CHANNELS.forEach(channel => {
        // The bar shows the strength of the channel's best item.
        const top = (result.channels[channel] || [])[0];
        targets[channel] = top ? Math.max(0, Math.min(10, Number(top.score) || 0)) : 0;
    });

    let currentStep = 0;
    const maxSteps = 10;

    const fillInterval = setInterval(() => {
        currentStep++;
        setChannelBars(targets, currentStep);

        if (currentStep < maxSteps) return;
        clearInterval(fillInterval);

        CHANNELS.forEach(channel => {
            const signals = result.channels[channel] || [];
            contentElements[channel].innerHTML = signals.length
                ? renderChannelHtml(signals)
                : `<p>${escapeHtml(hiddenCount(result) ? EMPTY_NEW_TEXT : EMPTY_CHANNEL_TEXT)}</p>`;
            if (signals.length) checkElements[channel].classList.add("visible");
        });

        // Caught up only when the server says every source answered and nothing is
        // left; a failed or stale source keeps its own message instead.
        setCaughtUp(result.caughtUp === true);
        tifaSubtitle.textContent = caughtUpMode ? CAUGHT_UP_TEXT : subtitleFor(result);
        renderActiveSources(config, result);
        isGenerating = false;
    }, 90);
}

/* ==========================
   SIGNAL ACTIONS
   Open, Useful and Dismiss are saved to the account so later runs can learn
   from them. A failed save is shown, never silently dropped.
========================== */

async function saveSignalState(id, patch) {
    if (deviceMode) {
        const state = deviceStore.updateState(id, patch);
        if (!state) throw new SignalsError("http", "This device no longer remembers that item.");
        return state;
    }
    const response = await apiFetch(`/api/signals/${id}/state`, jsonRequest("PUT", patch));
    if (response.status === 401) throw new SignalsError("unauthorized", "Your session expired. Sign in again.");
    if (!response.ok) throw new SignalsError("http", `The server responded with ${response.status}.`);
    return response.json();
}

function recordOpen(id) {
    if (deviceMode) {
        deviceStore.recordOpen(id);
        return;
    }
    // Fire and forget: opening the link must never wait on, or fail because of, this.
    apiFetch(`/api/signals/${id}/open`, { method: "POST", keepalive: true }).catch(() => {});
}

function showActionError(itemEl, message) {
    let note = itemEl.querySelector(".signal-error");
    if (!note) {
        note = document.createElement("p");
        note.className = "signal-error";
        note.setAttribute("role", "status");
        itemEl.appendChild(note);
    }
    note.textContent = message;
}

async function handleSignalAction(button) {
    const itemEl = button.closest(".signal-item");
    const id = Number(itemEl?.dataset.signalId);
    const signal = signalsOnScreen.get(id);
    if (!signal) return;
    const action = button.dataset.action;
    button.disabled = true;

    try {
        // Re-rendering replaces the buttons, so put keyboard focus on the
        // control that now stands in for the one just used.
        let focusAction = action;
        if (action === "useful") {
            const state = await saveSignalState(id, { useful: !signal.useful });
            signal.useful = state.useful;
            itemEl.outerHTML = renderSignalHtml(signal);
        } else if (action === "dismiss") {
            await saveSignalState(id, { dismissed: true });
            itemEl.outerHTML = renderDismissedHtml(id);
            focusAction = "undo";
        } else if (action === "undo") {
            await saveSignalState(id, { dismissed: false });
            itemEl.outerHTML = renderSignalHtml(signal);
            focusAction = "dismiss";
        }
        document.querySelector(`.signal-item[data-signal-id="${id}"] [data-action="${focusAction}"]`)?.focus();
    } catch (err) {
        button.disabled = false;
        if (err.kind === "unauthorized") {
            showLoginAgain(err.message);
            return;
        }
        showActionError(itemEl, "Couldn't save that. Check your connection and try again.");
    }
}

CHANNELS.forEach(channel => {
    const container = contentElements[channel];
    container.addEventListener("click", (e) => {
        const button = e.target.closest("button[data-action]");
        if (button && container.contains(button)) {
            handleSignalAction(button);
            return;
        }
        const link = e.target.closest("a[data-signal-link]");
        if (link) recordOpen(Number(link.closest(".signal-item")?.dataset.signalId));
    });
    // Middle-click opens in a new tab without a normal click event.
    container.addEventListener("auxclick", (e) => {
        const link = e.target.closest("a[data-signal-link]");
        if (link && e.button === 1) recordOpen(Number(link.closest(".signal-item")?.dataset.signalId));
    });
});

function setCaughtUp(on) {
    caughtUpMode = Boolean(on);
    if (!tifaRefreshBtn) return;
    tifaRefreshBtn.textContent = caughtUpMode ? DONE_LABEL : PRESS_LABEL;
    tifaRefreshBtn.classList.toggle("is-done", caughtUpMode);
}

// What each card said before any run, kept so DONE can put the screen back.
const INITIAL_CARD_TEXT = {};
CHANNELS.forEach(channel => { INITIAL_CARD_TEXT[channel] = contentElements[channel].innerHTML; });

// DONE: back to the landing screen. This only resets what is on screen. What
// the person has already seen stays recorded, so nothing is handed to them again.
function finishRitual() {
    setCaughtUp(false);
    isGenerating = false;
    signalsOnScreen.clear();
    CHANNELS.forEach(channel => {
        contentElements[channel].innerHTML = INITIAL_CARD_TEXT[channel];
        signalElements[channel].textContent = EMPTY_BAR;
        checkElements[channel].classList.remove("visible");
    });
    tifaSubtitle.textContent = IDLE_SUBTITLE;
    if (activeSourcesWrapper) activeSourcesWrapper.style.display = "none";
    showScreen("landing");
}

async function runTifa() {
    if (isGenerating) return;
    // Once caught up the card no longer starts another run; DONE ends the ritual.
    if (caughtUpMode) return;
    isGenerating = true;

    const config = loadConfig();

    // Remembered so a refused press can put the screen back as it was.
    const barsBefore = CHANNELS.map(channel => signalElements[channel].textContent);
    const checksBefore = CHANNELS.map(channel => checkElements[channel].classList.contains("visible"));

    tifaSubtitle.textContent = "RAKE Signals generating...";
    if (activeSourcesWrapper) activeSourcesWrapper.style.display = "none";
    Object.values(checkElements).forEach(el => el.classList.remove("visible"));
    Object.values(signalElements).forEach(el => {
        el.textContent = EMPTY_BAR;
    });

    let result;
    try {
        result = await requestSignals(config);
    } catch (err) {
        console.warn("Signal generation failed", err);
        if (err.kind === "unauthorized") {
            isGenerating = false;
            showLoginAgain(err.message);
            return;
        }
        if (err.kind === "rate_limited") {
            // Pressed faster than the server allows. Nothing is broken and nothing
            // was lost, so leave the last batch on screen and say what to do.
            CHANNELS.forEach((channel, i) => {
                signalElements[channel].textContent = barsBefore[i];
                checkElements[channel].classList.toggle("visible", checksBefore[i]);
            });
            if (activeSourcesWrapper) activeSourcesWrapper.style.display = "block";
            tifaSubtitle.textContent = "That was a little fast. Wait a few seconds, then press again.";
            isGenerating = false;
            return;
        }
        showUnavailable(config, err.message || "Something went wrong.");
        return;
    }

    showSignals(config, result);
}

if (activeSourcesPanel) {
    // The panel sits inside the clickable TIFA card; keep its clicks from
    // re-triggering generation.
    activeSourcesPanel.addEventListener("click", (e) => e.stopPropagation());
}

if (tifaRefreshBtn) {
    tifaRefreshBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (caughtUpMode) finishRitual();
        else runTifa();
    });
}

if (tifaBtn) {
    tifaBtn.addEventListener("click", (e) => {
        e.preventDefault();
        runTifa();
    });
}

const returnToSetupBtn = document.getElementById("return-to-setup-btn");

if (returnToSetupBtn) {
    returnToSetupBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Hide app screen, show setup screen with the current setup loaded
        // (from the account when signed in, otherwise from this browser).
        setCaughtUp(false);
        appScreen.style.opacity = "0";
        Promise.all([
            preloadSetup(),
            new Promise(resolve => setTimeout(resolve, 500))
        ]).then(([next]) => showScreen(next));
    });
}

/* ===========================
   OFFER TO INSTALL (phone version only)
   Android Chrome lets a page ask for the install prompt; iPhone does not, so there
   the page can only say how. Hidden once installed, and after "Not now".
=========================== */
let installPrompt = null;
const INSTALL_DISMISSED = "inform_install_dismissed";

function isInstalled() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function isIphone() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function installDismissed() {
    try { return localStorage.getItem(INSTALL_DISMISSED) === "1"; } catch { return false; }
}

function renderInstallHint() {
    const box = document.getElementById("install-hint");
    const button = document.getElementById("install-btn");
    const text = document.getElementById("install-text");
    if (!box || !button || !text) return;
    const canPrompt = Boolean(installPrompt);
    const iphoneSteps = isIphone();
    const show = deviceMode && !isInstalled() && !installDismissed() && (canPrompt || iphoneSteps);
    box.hidden = !show;
    if (!show) return;
    button.hidden = !canPrompt;
    text.textContent = canPrompt
        ? "Put IN-FORM on your home screen to open it like an app."
        : "To put IN-FORM on your home screen: tap the Share button, then Add to Home Screen.";
}

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstallHint();
});
window.addEventListener("appinstalled", () => {
    installPrompt = null;
    renderInstallHint();
});

const installButton = document.getElementById("install-btn");
if (installButton) {
    installButton.addEventListener("click", async () => {
        if (!installPrompt) return;
        const offer = installPrompt;
        installPrompt = null;
        try {
            await offer.prompt();
            await offer.userChoice;
        } catch { /* the browser said no: nothing to do */ }
        renderInstallHint();
    });
}
const installDismissButton = document.getElementById("install-dismiss");
if (installDismissButton) {
    installDismissButton.addEventListener("click", () => {
        try { localStorage.setItem(INSTALL_DISMISSED, "1"); } catch { /* optional */ }
        renderInstallHint();
    });
}

// Learn early whether this is the phone version, so the offer shows on the first screen.
// A copy that has used the hosted server before knows at once, even if it is asleep.
(knownHosted() ? enterDeviceMode() : detectDeviceMode()).then(() => { renderInstallHint(); updateFeedbackLink(); }, () => {});

/* ===========================
   HOME-SCREEN INSTALL / OFFLINE START
   The service worker only keeps the app's own files so it can open with no
   signal. It never keeps news or results (see sw.js). Failing to register is
   harmless: the app works the same without it.
=========================== */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => { /* optional */ });
    });
}
