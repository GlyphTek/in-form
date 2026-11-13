console.log("In-Form Online");

const chars = [...document.querySelectorAll("#logo span")];

let phase = 0;

/*
0 = symbols
1 = partial resolve
2 = stronger resolve
3 = full IN-FORM
*/

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

        cards.forEach(otherCard => {

            if (otherCard !== card) {
                otherCard.removeAttribute('open');
            }

        });

    });

});


const setupScreen =
    document.getElementById("setup-screen");

const appScreen =
    document.getElementById("app-screen");

const startBtn =
    document.getElementById("start-btn");

startBtn.addEventListener("click", () => {

    setupScreen.style.opacity = "0";

    setTimeout(() => {

        setupScreen.style.display = "none";

        appScreen.style.display = "block";

    }, 500);

});

/* ==========================
   LANDING SCREEN
========================== */

const landingScreen =
    document.getElementById("landing-screen");

const openBtn =
    document.getElementById("open-btn");

/* ==========================
   LANDING WORD ANIMATIONS
========================== */

const rotatingWord =
    document.getElementById("rotating-word");

const words = ["DAY", "SELF", "MIND"];

let wordIndex = 0;

function rotateWord(){

    if(!rotatingWord) return;

    const current =
        words[wordIndex];

    const next =
        words[(wordIndex + 1) % words.length];

    /* DAY -> SELF */

    if(current === "DAY"){

        rotatingWord.classList.add(
            "word-shrink"
        );

        setTimeout(() => {

            rotatingWord.className = "";

            rotatingWord.textContent = next;

            rotatingWord.classList.add(
                "word-fade"
            );

        }, 900);

    }

    /* SELF -> MIND */

    else if(current === "SELF"){

        rotatingWord.classList.add(
            "word-expand"
        );

        setTimeout(() => {

            rotatingWord.className = "";

            rotatingWord.textContent = next;

            rotatingWord.classList.add(
                "word-fade"
            );

        }, 900);

    }

    /* MIND -> DAY */

    else{
        rotatingWord.classList.add(
            "word-fall"
        );

        setTimeout(() => {

            rotatingWord.className = "";

            rotatingWord.textContent = "DAY";

            rotatingWord.classList.add(
                "word-slide-left"
            );

        }, 900);

    }

    setTimeout(() => {

        rotatingWord.className = "";

    }, 1800);

    wordIndex =
        (wordIndex + 1) % words.length;
}

/* run every 3 seconds */

setInterval(rotateWord, 2000);


/* OPEN button */

/* OPEN button */
if(openBtn){
    openBtn.addEventListener("click", () => {
        landingScreen.style.opacity = "0";

        setTimeout(() => {
            landingScreen.style.display = "none";
            setupScreen.style.display = "flex"; // Ensures flex layout activates
            setupScreen.style.opacity = "1";
        }, 500);
    });
}

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
        // Pick one of the 4 corners as the spawn origin
        const corners = [
            { x: 0, y: 0 },                       // Top-Left
            { x: canvas.width, y: 0 },              // Top-Right
            { x: 0, y: canvas.height },             // Bottom-Left
            { x: canvas.width, y: canvas.height }   // Bottom-Right
        ];
        const startCorner = corners[Math.floor(Math.random() * corners.length)];

        // Start exactly at a corner
        this.startX = startCorner.x;
        this.startY = startCorner.y;

        // Target final random position across the screen
        this.targetX = Math.random() * canvas.width;
        this.targetY = Math.random() * canvas.height;

        this.x = this.startX;
        this.y = this.startY;

        this.progress = 0;
        
        // Decreased speed range to make the glide much slower and smoother
        this.speed = Math.random() * 0.003 + 0.0015; 

        // Normal drifting velocities once settled
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.size = Math.random() * 2 + 1;
    }

    update() {
        if (this.progress < 1) {
            this.progress += this.speed; 
            if (this.progress > 1) this.progress = 1;

            // Ease-out interpolation from corner to target position
            const ease = 1 - Math.pow(1 - this.progress, 3);
            this.x = this.startX + (this.targetX - this.startX) * ease;
            this.y = this.startY + (this.targetY - this.startY) * ease;
        } else {
            // Normal ambient drift once in position
            this.x += this.vx;
            this.y += this.vy;

            // Screen edge wrapping
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

// Initialize particles
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

    // Draw connecting web lines
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 120) {
                const baseOpacity = (1 - (distance / 120)) * 0.2;
                // Scale line opacity down while they are still streaming in from corners
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

    // Fade out current word
    appRotatingWord.classList.add("fade-out");

    setTimeout(() => {
        // Switch word index
        appWordIndex = (appWordIndex + 1) % appWords.length;
        appRotatingWord.textContent = appWords[appWordIndex];

        // Fade back in
        appRotatingWord.classList.remove("fade-out");
    }, 600); // Matches CSS transition duration
}

// Run rotation every 3.5 seconds while in the app screen
setInterval(rotateAppWord, 3500);


/* ==========================
   TIFA SIGNAL GENERATION
========================== */

const tifaBtn = document.getElementById("tifa-btn");
const tifaTitle = document.getElementById("tifa-title");
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

if(tifaBtn) {
    tifaBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if(isGenerating) return;
        isGenerating = true;

        // Step 1: Transition text & hide previous checkmarks if re-generating
        tifaSubtitle.textContent = "Generating Signals...";
        Object.values(checkElements).forEach(el => el.classList.remove("visible"));

        // Step 2: Drain resonance signals
        Object.values(signalElements).forEach(el => {
            el.textContent = "░░░░░░░░░░";
        });

        // Step 3: Initial delay before build starts
        setTimeout(() => {
            const targets = {
                relevant: 7,
                attention: 5,
                knowing: 8,
                experience: 6
            };

            let currentStep = 0;
            const maxSteps = 10;

            // Step 4: Incrementally build bars
            const fillInterval = setInterval(() => {
                currentStep++;

                signalElements.relevant.textContent = getBarString(Math.min(currentStep, targets.relevant));
                signalElements.attention.textContent = getBarString(Math.min(currentStep, targets.attention));
                signalElements.knowing.textContent = getBarString(Math.min(currentStep, targets.knowing));
                signalElements.experience.textContent = getBarString(Math.min(currentStep, targets.experience));

                if (currentStep >= maxSteps) {
                    clearInterval(fillInterval);

                    // Step 5: Populate card content items (cards remain closed)
                    contentElements.relevant.innerHTML = `
                        <p><strong>AI Infrastructure Discussion</strong><br><a href="file:///C:/Users/jonv/Documents/Projects/In-Form/project/index.html#" target="_blank" style="color: var(--secondary);">Open Source Link</a></p>
                    `;
                    contentElements.attention.innerHTML = `
                        <p><strong>Heavy Rain Forecast (MetService)</strong><br><a href="url?id=0" target="_blank" style="color: var(--secondary);">View Alert</a></p>
                    `;
                    contentElements.knowing.innerHTML = `
                        <p><strong>Quantum Computing Breakthrough</strong><br><a href="url?id=0" target="_blank" style="color: var(--secondary);">PhysicsWorld Link</a></p>
                    `;
                    contentElements.experience.innerHTML = `
                        <p><strong>Technology Meetup & Live Session</strong><br><a href="file:///C:/Users/jonv/Documents/Projects/In-Form/project/index.html#" target="_blank" style="color: var(--secondary);">Explore Event</a></p>
                    `;

                    // Step 6: Reveal checkmarks, update subtitle, complete state
                    Object.values(checkElements).forEach(el => el.classList.add("visible"));
                    tifaSubtitle.textContent = "RAKE Signals Generated";

                    isGenerating = false;
                }
            }, 100);

        }, 1500);
    });
}

/* ==========================
   CLEAR CHECKMARK ON CARD OPEN
========================== */

cards.forEach(card => {
    card.addEventListener('toggle', () => {
        if (!card.open) return;

        // Find the checkmark inside this specific card and hide it
        const checkIcon = card.querySelector('.status-icon');
        if (checkIcon) {
            checkIcon.classList.remove('visible');
        }

        // Existing logic to keep only one accordion card open at a time
        cards.forEach(otherCard => {
            if (otherCard !== card) {
                otherCard.removeAttribute('open');
            }
        });
    });
});


/* ==========================
   SETUP STATE & TRANSITION
========================== */

const setupScreen = document.getElementById("setup-screen");
const appScreen = document.getElementById("app-screen");
const startBtn = document.getElementById("start-btn");

const aiSelect = document.querySelector("select"); 
const platformCheckboxes = document.querySelectorAll("input[type='checkbox']");

if(startBtn) {
    startBtn.addEventListener("click", (e) => {
        e.preventDefault();

        // 1. Capture selected AI partner
        let userConfig = {
            aiPartner: aiSelect ? aiSelect.value : "Gemini",
            platforms: Array.from(platformCheckboxes)
                .filter(box => box.checked)
                .map(box => box.nextSibling?.textContent?.trim() || "Platform")
        };

        // Save config to localStorage for persistence
        localStorage.setItem("inform_config", JSON.stringify(userConfig));

        // 2. Execute screen transition
        setupScreen.style.opacity = "0";

        setTimeout(() => {
            setupScreen.style.display = "none";
            appScreen.style.display = "block";
        }, 500);
    });
}
