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
            <span>${source}</span>
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
            <span>${platform}</span>
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
                taglineEl.textContent = "Powered by RAKE • Local Resonance Active";
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

function getBarString(fillCount) {
    const filled = "█".repeat(fillCount);
    const empty = "░".repeat(10 - fillCount);
    return filled + empty;
}

/**
 * Local Resonance Engine
 * Sites = primary material
 * Platforms = light surface influence
 */
/**
 * Local Resonance Engine
 * Sites = primary material
 * Platforms = light surface influence
 */
async function generateTIFASignals(config) {
    const { sources = [], platforms = [] } = config;

    // Simulate local signal processing delay
    await new Promise(resolve => setTimeout(resolve, 1400));

    // 1. Extract themes from user sources
    function getThemesFromSources(srcs) {
        const themes = new Set();
        srcs.forEach(site => {
            const lower = site.toLowerCase();
            if (lower.includes("physics") || lower.includes("quantum") || lower.includes("arxiv")) {
                themes.add("physics");
            }
            if (lower.includes("met") || lower.includes("weather") || lower.includes("climate")) {
                themes.add("weather");
            }
            if (lower.includes("tech") || lower.includes("ai") || lower.includes("github") || lower.includes("arxiv")) {
                themes.add("tech");
            }
            if (lower.includes("news") || lower.includes("herald") || lower.includes("bbc") || lower.includes("reuters")) {
                themes.add("news");
            }
        });
        if (themes.size === 0) themes.add("general");
        return Array.from(themes);
    }

    const activeThemes = getThemesFromSources(sources);

    // 2. Candidate signal pool
    const candidates = [
        { title: "Quantum research edge", linkText: "Technical overview", category: "knowing", themes: ["physics"], score: 0 },
        { title: "New physics signal detected", linkText: "Research brief", category: "relevant", themes: ["physics"], score: 0 },
        { title: "Weather conditions shifting", linkText: "Current forecast", category: "attention", themes: ["weather"], score: 0 },
        { title: "Environmental alert forming", linkText: "View details", category: "attention", themes: ["weather"], score: 0 },
        { title: "Open source infrastructure movement", linkText: "Explore discussion", category: "relevant", themes: ["tech"], score: 0 },
        { title: "AI systems pattern emerging", linkText: "Technical note", category: "knowing", themes: ["tech"], score: 0 },
        { title: "Live technical session", linkText: "Join or follow", category: "experience", themes: ["tech", "general"], score: 0 },
        { title: "Orientation signal forming", linkText: "Open context", category: "relevant", themes: ["general"], score: 0 },
        { title: "Attention required on current field", linkText: "View signal", category: "attention", themes: ["general"], score: 0 },
        { title: "Knowledge edge available", linkText: "Expand understanding", category: "knowing", themes: ["general"], score: 0 },
        { title: "Experience window opening", linkText: "Explore possibility", category: "experience", themes: ["general"], score: 0 }
    ];

    // 3. Score candidates based on themes and platforms
    candidates.forEach(c => {
        const themeMatch = c.themes.some(t => activeThemes.includes(t));
        if (themeMatch) c.score += 8;

        platforms.forEach(p => {
            const pLower = p.toLowerCase();
            if (pLower.includes("x") || pLower.includes("twitter")) {
                if (c.category === "relevant") c.score += 2;
            }
            if (pLower.includes("youtube") || pLower.includes("video")) {
                if (c.category === "experience") c.score += 3;
            }
            if (pLower.includes("linkedin") || pLower.includes("professional")) {
                if (c.category === "knowing") c.score += 2;
            }
        });

        if (sources.length > 0 && themeMatch) {
            c.score += 3;
        }
    });

    // 4. Pick the best signals
    function pickBest(category) {
        const pool = candidates
            .filter(c => c.category === category)
            .sort((a, b) => b.score - a.score);

        return pool[0] || {
            title: "Signal forming",
            linkText: "Open",
            category
        };
    }

    const relevant = pickBest("relevant");
    const attention = pickBest("attention");
    const knowing = pickBest("knowing");
    const experience = pickBest("experience");

    // 5. Personalize with actual user source names if available
    if (sources[0]) {
        relevant.title = `Signal from ${sources[0]}`;
        relevant.linkText = `Inspect ${sources[0]} stream`;
    }
    if (sources[1]) {
        knowing.title = `Insight from ${sources[1]}`;
        knowing.linkText = "Read research context";
    }

    // 6. Return finalized object
    return {
        relevant: { title: relevant.title, linkText: relevant.linkText, link: "#" },
        attention: { title: attention.title, linkText: attention.linkText, link: "#" },
        knowing: { title: knowing.title, linkText: knowing.linkText, link: "#" },
        experience: { title: experience.title, linkText: experience.linkText, link: "#" }
    };
}

if (tifaRefreshBtn) {
    tifaRefreshBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Programmatically re-trigger the main TIFA click event to regenerate
        tifaBtn.click();
    });
}

if (tifaBtn) {
    tifaBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (isGenerating) return;
        isGenerating = true;

        const config = JSON.parse(localStorage.getItem("inform_config")) || {
            sources: [],
            platforms: []
        };

        tifaSubtitle.textContent = "RAKE Signals generating...";

        if (activeSourcesWrapper) {
            activeSourcesWrapper.style.display = "none";
        }

        Object.values(checkElements).forEach(el => el.classList.remove("visible"));
        Object.values(signalElements).forEach(el => {
            el.textContent = "░░░░░░░░░░";
        });

        try {
            const signals = await generateTIFASignals(config);

            const targets = { relevant: 8, attention: 6, knowing: 9, experience: 7 };
            let currentStep = 0;
            const maxSteps = 10;

            const fillInterval = setInterval(() => {
                currentStep++;

                signalElements.relevant.textContent = getBarString(Math.min(currentStep, targets.relevant));
                signalElements.attention.textContent = getBarString(Math.min(currentStep, targets.attention));
                signalElements.knowing.textContent = getBarString(Math.min(currentStep, targets.knowing));
                signalElements.experience.textContent = getBarString(Math.min(currentStep, targets.experience));

                if (currentStep >= maxSteps) {
                    clearInterval(fillInterval);

                    contentElements.relevant.innerHTML = `<p><strong>${signals.relevant.title}</strong><br><a href="${signals.relevant.link}" target="_blank" style="color: var(--secondary);">${signals.relevant.linkText}</a></p>`;
                    contentElements.attention.innerHTML = `<p><strong>${signals.attention.title}</strong><br><a href="${signals.attention.link}" target="_blank" style="color: var(--secondary);">${signals.attention.linkText}</a></p>`;
                    contentElements.knowing.innerHTML = `<p><strong>${signals.knowing.title}</strong><br><a href="${signals.knowing.link}" target="_blank" style="color: var(--secondary);">${signals.knowing.linkText}</a></p>`;
                    contentElements.experience.innerHTML = `<p><strong>${signals.experience.title}</strong><br><a href="${signals.experience.link}" target="_blank" style="color: var(--secondary);">${signals.experience.linkText}</a></p>`;

                    Object.values(checkElements).forEach(el => el.classList.add("visible"));

                    tifaSubtitle.textContent = "RAKE Generation complete";

                    if (activeSourcesWrapper) {
                        activeSourcesWrapper.style.display = "block";
                        sourcesPanelOpen = false;
                        activeSourcesPanel.style.display = "none";
                        activeSourcesToggle.textContent = "Active Sources ▾";

                        activePlatformsList.innerHTML = "";
                        if (config.platforms && config.platforms.length > 0) {
                            config.platforms.forEach(p => {
                                const li = document.createElement("li");
                                li.textContent = p;
                                activePlatformsList.appendChild(li);
                            });
                        } else {
                            activePlatformsList.innerHTML = "<li>None selected</li>";
                        }

                        activeSitesList.innerHTML = "";
                        if (config.sources && config.sources.length > 0) {
                            config.sources.forEach(s => {
                                const li = document.createElement("li");
                                li.textContent = s;
                                activeSitesList.appendChild(li);
                            });
                        } else {
                            activeSitesList.innerHTML = "<li>None added</li>";
                        }
                    }

                    isGenerating = false;
                }
            }, 90);

        } catch (err) {
            console.error(err);
            tifaSubtitle.textContent = "Generation failed";
            isGenerating = false;
        }
    });
}

