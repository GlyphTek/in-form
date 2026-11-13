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

        // Find the checkmark inside this specific card and hide it
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

/* START button: Setup -> App */
if(startBtn) {
    startBtn.addEventListener("click", (e) => {
        e.preventDefault();

        const aiSelect = document.getElementById("ai-select");
        const platformCheckboxes = document.querySelectorAll(".platforms input[type='checkbox']");

        let userConfig = {
            aiPartner: aiSelect ? aiSelect.value : "Gemini",
            platforms: Array.from(platformCheckboxes)
                .filter(box => box.checked)
                .map(box => box.parentElement.textContent.trim())
        };

        localStorage.setItem("inform_config", JSON.stringify(userConfig));

        setupScreen.style.opacity = "0";
        setTimeout(() => {
            setupScreen.style.display = "none";
            appScreen.style.display = "block";
            appScreen.style.opacity = "1";
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
   SOURCE MANAGEMENT
========================== */

let userSources = [];

const sourceInput = document.getElementById("source-input");
const addSourceBtn = document.getElementById("add-source-btn");
const sourcesList = document.getElementById("sources-list");

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

    // Attach remove listeners
    sourcesList.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = parseInt(btn.dataset.index);
            userSources.splice(index, 1);
            renderSources();
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

    // Also allow Enter key
    sourceInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            addSourceBtn.click();
        }
    });
}

/* ==========================
   START BUTTON – SAVE FULL CONFIG
========================== */

if (startBtn) {
    startBtn.addEventListener("click", (e) => {
        e.preventDefault();

        const aiSelect = document.getElementById("ai-select");
        const platformCheckboxes = document.querySelectorAll(".platforms input[type='checkbox']");

        const userConfig = {
            aiPartner: aiSelect ? aiSelect.value || "Grok" : "Grok",
            sources: [...userSources],
            platforms: Array.from(platformCheckboxes)
                .filter(box => box.checked)
                .map(box => box.parentElement.textContent.trim())
        };

        localStorage.setItem("inform_config", JSON.stringify(userConfig));

        // Transition
        setupScreen.style.opacity = "0";
        setTimeout(() => {
            setupScreen.style.display = "none";
            appScreen.style.display = "block";
            appScreen.style.opacity = "1";

            // Update tagline
            const taglineEl = document.querySelector(".tagline");
            if (taglineEl) {
                taglineEl.textContent = `Formed with ${userConfig.aiPartner} • Powered by RAKE`;
            }
        }, 500);
    });
}

/* ==========================
   TIFA SIGNAL GENERATION (AI LAYER)
========================== */

const tifaBtn = document.getElementById("tifa-btn");
const tifaSubtitle = document.getElementById("tifa-subtitle");

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

let isGenerating = false;

function getBarString(fillCount) {
    const filled = "█".repeat(fillCount);
    const empty = "░".repeat(10 - fillCount);
    return filled + empty;
}

/**
 * TIFA Engine + AI Layer
 * This is the core. Later you can replace the mock with real API calls.
 */
async function generateTIFASignals(config) {
    const { aiPartner, sources, platforms } = config;

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1800));

    // --- MOCK AI LAYER (varies by selected AI) ---
    // This is where real AI logic will eventually live

    const baseSignals = {
        relevant: {
            title: "AI Infrastructure Movements",
            linkText: "Open Source Discussion",
            link: "#"
        },
        attention: {
            title: "Weather Alert – Heavy Rain",
            linkText: "View MetService Alert",
            link: "#"
        },
        knowing: {
            title: "Quantum Computing Progress",
            linkText: "PhysicsWorld Article",
            link: "#"
        },
        experience: {
            title: "Live Tech Session Tonight",
            linkText: "Explore Event",
            link: "#"
        }
    };

    // Slight personality shift based on AI
    if (aiPartner === "Grok") {
        baseSignals.relevant.title = "xAI / Open Source Signal";
        baseSignals.knowing.title = "Truth-seeking Edge Cases";
    } else if (aiPartner === "Claude") {
        baseSignals.relevant.title = "Careful Systems Thinking";
        baseSignals.knowing.title = "Nuanced Technical Insight";
    } else if (aiPartner === "Gemini") {
        baseSignals.relevant.title = "Multimodal Pattern Detected";
        baseSignals.knowing.title = "Cross-domain Connection";
    } else if (aiPartner === "ChatGPT") {
        baseSignals.relevant.title = "Structured Opportunity Map";
        baseSignals.knowing.title = "Clear Technical Breakdown";
    }

    // If user added real sources, surface them
    if (sources && sources.length > 0) {
        baseSignals.relevant.title = `Signal from ${sources[0]}`;
        if (sources[1]) {
            baseSignals.knowing.title = `Insight from ${sources[1]}`;
        }
    }

    return baseSignals;
}

if (tifaBtn) {
    tifaBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (isGenerating) return;
        isGenerating = true;

        const config = JSON.parse(localStorage.getItem("inform_config")) || {
            aiPartner: "Grok",
            sources: [],
            platforms: []
        };

        // State: Generating
        tifaSubtitle.textContent = "RAKE Signals generating...";

        // Reset UI
        Object.values(checkElements).forEach(el => el.classList.remove("visible"));
        Object.values(signalElements).forEach(el => {
            el.textContent = "░░░░░░░░░░";
        });

        try {
            const signals = await generateTIFASignals(config);

            // Animate bars
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

                    // Populate cards
                    contentElements.relevant.innerHTML = `
                        <p><strong>${signals.relevant.title}</strong><br>
                        <a href="${signals.relevant.link}" target="_blank" style="color: var(--secondary);">${signals.relevant.linkText}</a></p>
                    `;
                    contentElements.attention.innerHTML = `
                        <p><strong>${signals.attention.title}</strong><br>
                        <a href="${signals.attention.link}" target="_blank" style="color: var(--secondary);">${signals.attention.linkText}</a></p>
                    `;
                    contentElements.knowing.innerHTML = `
                        <p><strong>${signals.knowing.title}</strong><br>
                        <a href="${signals.knowing.link}" target="_blank" style="color: var(--secondary);">${signals.knowing.linkText}</a></p>
                    `;
                    contentElements.experience.innerHTML = `
                        <p><strong>${signals.experience.title}</strong><br>
                        <a href="${signals.experience.link}" target="_blank" style="color: var(--secondary);">${signals.experience.linkText}</a></p>
                    `;

                    Object.values(checkElements).forEach(el => el.classList.add("visible"));

                    // State: Complete
                    tifaSubtitle.textContent = "RAKE Generation complete";
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