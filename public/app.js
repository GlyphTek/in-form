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

/* OPEN button: Landing -> Setup */
if(openBtn){
    openBtn.addEventListener("click", () => {
        landingScreen.style.opacity = "0";
        setTimeout(() => {
            landingScreen.style.display = "none";
            setupScreen.style.display = "flex";
            setupScreen.style.opacity = "1";
        }, 500);
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
   SOURCE & PLATFORM MANAGEMENT
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
let userPlatforms = [];

const sourceInput = document.getElementById("source-input");
const addSourceBtn = document.getElementById("add-source-btn");
const sourcesList = document.getElementById("sources-list");

const platformInput = document.getElementById("platform-input");
const addPlatformBtn = document.getElementById("add-platform-btn");
const platformsList = document.getElementById("platforms-list");

function renderSources() {
    if (!sourcesList) return;
    sourcesList.innerHTML = "";

    userSources.forEach((source, index) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${escapeHtml(source)}</span>
            <button data-index="${index}">×</button>
        `;
        sourcesList.appendChild(li);
    });

    sourcesList.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            userSources.splice(index, 1);
            renderSources();
        });
    });
}

function renderPlatforms() {
    if (!platformsList) return;
    platformsList.innerHTML = "";

    userPlatforms.forEach((platform, index) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${escapeHtml(platform)}</span>
            <button data-index="${index}">×</button>
        `;
        platformsList.appendChild(li);
    });

    platformsList.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            userPlatforms.splice(index, 1);
            renderPlatforms();
        });
    });
}

if (addSourceBtn) {
    addSourceBtn.addEventListener("click", () => {
        const value = sourceInput.value.trim();
        if (value && !userSources.includes(value)) {
            userSources.push(value);
            sourceInput.value = "";
            renderSources();
        }
    });

    sourceInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            addSourceBtn.click();
        }
    });
}

if (addPlatformBtn) {
    addPlatformBtn.addEventListener("click", () => {
        const value = platformInput.value.trim();
        if (value && !userPlatforms.includes(value)) {
            userPlatforms.push(value);
            platformInput.value = "";
            renderPlatforms();
        }
    });

    platformInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            addPlatformBtn.click();
        }
    });
}

/* ==========================
   START BUTTON – SAVE FULL CONFIG
========================== */

if (startBtn) {
    startBtn.addEventListener("click", (e) => {
        e.preventDefault();

        const userConfig = {
            sources: [...userSources],
            platforms: [...userPlatforms]
        };

        localStorage.setItem("inform_config", JSON.stringify(userConfig));

        setupScreen.style.opacity = "0";
        setTimeout(() => {
            setupScreen.style.display = "none";
            appScreen.style.display = "block";
            appScreen.style.opacity = "1";

            const taglineEl = document.querySelector(".tagline");
            if (taglineEl) {
                taglineEl.textContent = "Powered by RAKE";
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
const activePlatformsList = document.getElementById("active-platforms-list");
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

function renderSignalHtml(signal) {
    return `<p><strong>${escapeHtml(signal.title)}</strong><br>` +
        `<a href="${escapeHtml(safeUrl(signal.link))}" target="_blank" rel="noopener noreferrer" ` +
        `style="color: var(--secondary);">${escapeHtml(signal.linkText)}</a></p>`;
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
                platforms: Array.isArray(saved.platforms) ? saved.platforms : []
            };
        }
    } catch (err) {
        console.warn("Could not read saved configuration", err);
    }
    return { sources: [], platforms: [] };
}

async function requestSignals(config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    try {
        const response = await fetch("/api/signals/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                sources: config.sources,
                platforms: config.platforms
            }),
            signal: controller.signal
        });

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
        return data;
    } catch (err) {
        if (err instanceof SignalsError) throw err;
        if (err && err.name === "AbortError") {
            throw new SignalsError("timeout", "The server took too long to respond.");
        }
        throw new SignalsError("unreachable", "Could not reach the IN-FORM server.");
    } finally {
        clearTimeout(timer);
    }
}

function subtitleFor(result) {
    const sources = result.sources || [];
    switch (result.status) {
        case "ok":
            return "RAKE Generation complete";
        case "partial": {
            const failed = sources.filter(s => s.status === "error").length;
            return failed
                ? `Generated, but ${failed} of ${sources.length} sources are unavailable`
                : "Generated, with some sources showing older data";
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

    // Platforms are link-outs only.
    const platforms = result ? result.platforms || [] : config.platforms.map(name => ({ name, url: null }));
    renderListItems(
        activePlatformsList,
        platforms.map(p => () => {
            const li = document.createElement("li");
            const url = p.url ? safeUrl(p.url) : "#";
            if (url !== "#") {
                const a = document.createElement("a");
                a.href = url;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.style.color = "var(--secondary)";
                a.textContent = p.name;
                li.appendChild(a);
            } else {
                li.textContent = p.name;
            }
            return li;
        }),
        "None selected"
    );

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
            li.textContent = `${s.input}: ${note}`;
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
    const targets = {};
    CHANNELS.forEach(channel => {
        const signal = result.channels[channel];
        targets[channel] = signal ? Math.max(0, Math.min(10, Number(signal.score) || 0)) : 0;
    });

    let currentStep = 0;
    const maxSteps = 10;

    const fillInterval = setInterval(() => {
        currentStep++;
        setChannelBars(targets, currentStep);

        if (currentStep < maxSteps) return;
        clearInterval(fillInterval);

        CHANNELS.forEach(channel => {
            const signal = result.channels[channel];
            contentElements[channel].innerHTML = signal
                ? renderSignalHtml(signal)
                : `<p>${escapeHtml(EMPTY_CHANNEL_TEXT)}</p>`;
            if (signal) checkElements[channel].classList.add("visible");
        });

        tifaSubtitle.textContent = subtitleFor(result);
        renderActiveSources(config, result);
        isGenerating = false;
    }, 90);
}

async function runTifa() {
    if (isGenerating) return;
    isGenerating = true;

    const config = loadConfig();

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
        showUnavailable(config, err.message || "Something went wrong.");
        return;
    }

    showSignals(config, result);
}

if (activeSourcesPanel) {
    // The panel sits inside the clickable TIFA card; keep its clicks (including
    // platform links) from re-triggering generation.
    activeSourcesPanel.addEventListener("click", (e) => e.stopPropagation());
}

if (tifaRefreshBtn) {
    tifaRefreshBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        runTifa();
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

        // Hide app screen, show setup screen
        appScreen.style.opacity = "0";
        setTimeout(() => {
            appScreen.style.display = "none";
            setupScreen.style.display = "flex";
            setupScreen.style.opacity = "1";

            // Load existing config into arrays so user can edit them
            const savedConfig = JSON.parse(localStorage.getItem("inform_config"));
            if (savedConfig) {
                userSources = savedConfig.sources || [];
                userPlatforms = savedConfig.platforms || [];
                renderSources();
                renderPlatforms();
            }
        }, 500);
    });
}
