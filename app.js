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
   TIFA SIGNAL GENERATION
========================== */

const tifaBtn = document.getElementById("tifa-btn");
const tifaSubtitle = document.getElementById("tifa-subtitle");

/* ==========================
   AI PARTNER & RAKE FUSION
========================== */

const taglineEl = document.querySelector(".tagline");

// Load and display saved AI partner on load with FUSION branding
const savedConfig = JSON.parse(localStorage.getItem("inform_config"));
const activeAiPartner = (savedConfig && savedConfig.aiPartner) ? savedConfig.aiPartner : "AI";

if (taglineEl) {
    taglineEl.textContent = `RAKE & ${activeAiPartner} - FUSION`;
}

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

if(tifaBtn) {
    tifaBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if(isGenerating) return;
        isGenerating = true;

        // Retrieve current config dynamically on tap
        const currentConfig = JSON.parse(localStorage.getItem("inform_config")) || { aiPartner: "AI" };
        const activePartner = currentConfig.aiPartner;

        tifaSubtitle.textContent = `RAKE & ${activePartner} FUSION Complete`;
        Object.values(checkElements).forEach(el => el.classList.remove("visible"));

        Object.values(signalElements).forEach(el => {
            el.textContent = "░░░░░░░░░░";
        });

        setTimeout(() => {
            const targets = {
                relevant: 7,
                attention: 5,
                knowing: 8,
                experience: 6
            };

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

                    contentElements.relevant.innerHTML = `
                        <p><strong>${activePartner} Analysis: AI Infrastructure</strong><br><a href="#" target="_blank" style="color: var(--secondary);">Open Source Link</a></p>
                    `;
                    contentElements.attention.innerHTML = `
                        <p><strong>Heavy Rain Forecast (MetService)</strong><br><a href="#" target="_blank" style="color: var(--secondary);">View Alert</a></p>
                    `;
                    contentElements.knowing.innerHTML = `
                        <p><strong>Quantum Computing Breakthrough</strong><br><a href="#" target="_blank" style="color: var(--secondary);">PhysicsWorld Link</a></p>
                    `;
                    contentElements.experience.innerHTML = `
                        <p><strong>Technology Meetup & Live Session</strong><br><a href="#" target="_blank" style="color: var(--secondary);">Explore Event</a></p>
                    `;

                    Object.values(checkElements).forEach(el => el.classList.add("visible"));
                    tifaSubtitle.textContent = `RAKE Signals Formed by ${activePartner}`;

                    isGenerating = false;
                }
            }, 100);

        }, 1500);
    });
}}