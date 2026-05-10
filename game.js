// --- Game Config & Constants ---
const CONFIG = {
    BASE_SPEED: 250, 
    NODE_DIST: 8,    
    CANDY_BASE: 8,   
    AES_KEY: 'vibe_coding_secure_key_2026', 
    ZOOM_SHRINK: 0.99 
};

const STATE = { OBS_BLACK: 0, OBS_YELLOW: 1, OBS_RED: 2, OBS_CHASING: 3 };
const MAP_SIZE = 3000; 

// --- Utils & Cryptography ---
const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

const encryptData = (data) => typeof CryptoJS !== 'undefined' 
    ? CryptoJS.AES.encrypt(JSON.stringify(data), CONFIG.AES_KEY).toString() 
    : btoa(JSON.stringify(data));

// --- Core Engine Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let cw, ch;
const resize = () => { cw = canvas.width = window.innerWidth; ch = canvas.height = window.innerHeight; };
window.addEventListener('resize', resize);
resize();

// --- Input Handling ---
let dragStartX = 0, dragStartY = 0, dragCurrentX = 0, dragCurrentY = 0;
let isDragging = false, inputQueue = [];

const handleDragStart = (x, y) => {
    dragStartX = dragCurrentX = x;
    dragStartY = dragCurrentY = y;
    isDragging = true;
};

const handleDragMove = (x, y) => {
    if (!isDragging) return;
    dragCurrentX = x; dragCurrentY = y;
    const dx = x - dragStartX, dy = y - dragStartY;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 5) {
        player && (player.dir = { x: dx / dist, y: dy / dist });
        dist > 60 && (dragStartX = x - (dx / dist) * 60, dragStartY = y - (dy / dist) * 60);
    }
};

const handleDragEnd = () => isDragging = false;

window.addEventListener('mousedown', e => handleDragStart(e.clientX, e.clientY));
window.addEventListener('mousemove', e => handleDragMove(e.clientX, e.clientY));
window.addEventListener('mouseup', handleDragEnd);

window.addEventListener('touchstart', e => { 
    e.target.tagName !== 'BUTTON' && handleDragStart(e.touches[0].clientX, e.touches[0].clientY); 
}, {passive: false});

window.addEventListener('touchmove', e => {
    isDragging && (e.preventDefault(), handleDragMove(e.touches[0].clientX, e.touches[0].clientY));
}, {passive: false});

window.addEventListener('touchend', handleDragEnd);

window.addEventListener('keydown', e => {
    const keys = { ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1}, ArrowLeft: {x:-1,y:0}, ArrowRight: {x:1,y:0} };
    keys[e.key] ? inputQueue.push(keys[e.key]) : null;
});

// --- Items (Lightning) ---
class PowerItem {
    constructor(type) {
        this.type = type; 
        this.radius = 20;
        let valid = false;
        while(!valid) {
            this.x = Math.random() * (MAP_SIZE - 400) + 200;
            this.y = Math.random() * (MAP_SIZE - 400) + 200;
            valid = true;
        }
        this.time = 0;
    }
    draw(ctx, dt) {
        this.time += dt * 5;
        let floatY = Math.sin(this.time) * 5;
        
        ctx.fillStyle = this.type === 'yellow' ? '#f1c40f' : '#2d3436';
        ctx.strokeStyle = this.type === 'yellow' ? '#fff' : '#e74c3c';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y + floatY, this.radius, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = this.type === 'yellow' ? '#fff' : '#f1c40f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px Arial';
        ctx.fillText("⚡", this.x, this.y + floatY + 2);
    }
}

// --- Environment Static Obstacles ---
class EnvironmentObstacle {
    constructor(type) {
        this.type = type; 
        let valid = false;
        while(!valid) {
            this.x = Math.random() * (MAP_SIZE - 400) + 200;
            this.y = Math.random() * (MAP_SIZE - 400) + 200;
            if(Math.hypot(this.x - MAP_SIZE/2, this.y - MAP_SIZE/2) > 400) valid = true;
        }
        this.radius = this.type === 'tree' ? 45 : 30; 
    }
    
    draw(ctx) {
        if(this.type === 'tree') {
            ctx.fillStyle = '#8B4513';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.rect(this.x - 12, this.y - 10, 24, 40); ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.arc(this.x, this.y - 30, 35, 0, Math.PI*2);
            ctx.arc(this.x - 20, this.y - 10, 25, 0, Math.PI*2);
            ctx.arc(this.x + 20, this.y - 10, 25, 0, Math.PI*2);
            ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath(); ctx.arc(this.x - 5, this.y - 35, 15, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle = '#95a5a6';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(this.x - 25, this.y + 15);
            ctx.lineTo(this.x - 20, this.y - 15);
            ctx.lineTo(this.x + 10, this.y - 25);
            ctx.lineTo(this.x + 30, this.y - 5);
            ctx.lineTo(this.x + 20, this.y + 20);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = '#7f8c8d';
            ctx.beginPath(); ctx.arc(this.x + 5, this.y - 5, 8, 0, Math.PI*2); ctx.fill();
        }
    }
}

// --- Entities ---
class PlayerSnake {
    constructor() {
        this.nodes = Array.from({length: 15}, (_, i) => ({x: MAP_SIZE/2, y: MAP_SIZE/2 + i*CONFIG.NODE_DIST}));
        this.dir = {x: 0, y: -1}; 
        this.speed = CONFIG.BASE_SPEED; 
        this.nodesToAdd = 0;
    }
    
    update(dt) {
        if (inputQueue.length > 0) {
            const nextDir = inputQueue.shift();
            this.dir = nextDir;
        }
        
        const head = this.nodes[0];
        head.x += this.dir.x * this.speed * dt;
        head.y += this.dir.y * this.speed * dt;

        for(let i = 1; i < this.nodes.length; i++) {
            let curr = this.nodes[i], prev = this.nodes[i-1];
            let dx = prev.x - curr.x, dy = prev.y - curr.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if(dist > CONFIG.NODE_DIST) {
                curr.x += (dx/dist) * (dist - CONFIG.NODE_DIST);
                curr.y += (dy/dist) * (dist - CONFIG.NODE_DIST);
            }
        }

        if(this.nodesToAdd > 0) {
            const last = this.nodes[this.nodes.length-1];
            this.nodes.push({x: last.x, y: last.y});
            this.nodesToAdd--;
        }
    }
    
    draw(ctx) {
        let baseThickness = 28;
        let tailThickness = 10;
        
        ctx.strokeStyle = '#2c3e50';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 1; i < this.nodes.length; i++) {
            let prev = this.nodes[i - 1];
            let curr = this.nodes[i];
            let currentThickness = baseThickness - (i / this.nodes.length) * (baseThickness - tailThickness);
            ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(curr.x, curr.y);
            ctx.lineWidth = currentThickness + 8; 
            ctx.stroke();
        }

        for (let i = 1; i < this.nodes.length; i++) {
            let prev = this.nodes[i - 1];
            let curr = this.nodes[i];
            let currentThickness = baseThickness - (i / this.nodes.length) * (baseThickness - tailThickness);
            ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(curr.x, curr.y);
            ctx.strokeStyle = `hsl(${(i * 5) % 360}, 100%, 60%)`;
            ctx.lineWidth = currentThickness;
            ctx.stroke();
        }

        let head = this.nodes[0];
        let angle = Math.atan2(this.dir.y, this.dir.x);
        let eyeOffset = 8;
        
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(head.x + Math.cos(angle - 1.2) * eyeOffset, head.y + Math.sin(angle - 1.2) * eyeOffset, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(head.x + Math.cos(angle + 1.2) * eyeOffset, head.y + Math.sin(angle + 1.2) * eyeOffset, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(head.x + Math.cos(angle - 1.2) * eyeOffset + Math.cos(angle)*2, head.y + Math.sin(angle - 1.2) * eyeOffset + Math.sin(angle)*2, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(head.x + Math.cos(angle + 1.2) * eyeOffset + Math.cos(angle)*2, head.y + Math.sin(angle + 1.2) * eyeOffset + Math.sin(angle)*2, 2.5, 0, Math.PI*2); ctx.fill();
        
        if(Math.random() > 0.90) {
            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            ctx.moveTo(head.x + Math.cos(angle)*15, head.y + Math.sin(angle)*15);
            ctx.lineTo(head.x + Math.cos(angle - 0.2)*28, head.y + Math.sin(angle - 0.2)*28);
            ctx.lineTo(head.x + Math.cos(angle + 0.2)*28, head.y + Math.sin(angle + 0.2)*28);
            ctx.fill(); ctx.stroke();
        }
    }
}

class ObstacleSnake {
    constructor(cx, cy) {
        let pHead = player && player.nodes ? player.nodes[0] : {x: MAP_SIZE/2, y: MAP_SIZE/2};
        if(cx !== undefined && cy !== undefined) {
            this.cx = cx;
            this.cy = cy;
        } else {
            let valid = false;
            while(!valid) {
                this.cx = Math.random() * (MAP_SIZE - 400) + 200;
                this.cy = Math.random() * (MAP_SIZE - 400) + 200;
                if(Math.hypot(this.cx - pHead.x, this.cy - pHead.y) > 800) valid = true;
            }
        }
        
        this.nodes = Array.from({length: 25}, (_, i) => ({
            x: this.cx,
            y: this.cy + i * 2 
        }));
        
        this.state = STATE.OBS_CHASING; 
        this.hitCount = 3;
        this.hitCooldown = 0;
        this.sleepTimer = 0; 
        
        this.id = Math.random() * Math.PI * 2; 
        this.baseHue = Math.floor(Math.random() * 360);
        this.patternType = Math.floor(Math.random() * 4); 
    }
    
    recoil() {
        let maxNodes = 25;
        this.nodes = Array.from({length: maxNodes}, (_, i) => {
            let j = maxNodes - 1 - i; 
            let theta = j * 0.8;
            let r = j * 3.5;
            return {
                x: this.cx + Math.cos(theta) * r,
                y: this.cy + Math.sin(theta) * r
            };
        });
    }
    
    hit() {
        if(this.hitCooldown > 0) return; 
        
        this.hitCount++;
        this.hitCooldown = 0.5; 
        
        if(this.hitCount === 1) this.state = STATE.OBS_YELLOW; 
        else if(this.hitCount === 2) this.state = STATE.OBS_RED; 
        else if(this.hitCount >= 3) {
            this.state = STATE.OBS_CHASING; 
            this.sleepTimer = 0;
        }
    }
    
    update(dt, player, currentEnemySpeed) {
        if(this.hitCooldown > 0) this.hitCooldown -= dt;
        
        if(this.state !== STATE.OBS_CHASING && this.sleepTimer > 0) {
            this.sleepTimer -= dt;
            
            if(this.sleepTimer <= 2.0 && this.state < STATE.OBS_RED) {
                this.state = STATE.OBS_RED; 
            } else if(this.sleepTimer <= 5.0 && this.state < STATE.OBS_YELLOW) {
                this.state = STATE.OBS_YELLOW; 
            }
            
            if(this.sleepTimer <= 0) {
                this.state = STATE.OBS_CHASING;
                this.hitCount = 3;
                floatingTexts.spawn(this.nodes[0].x, this.nodes[0].y - 40, "💢기상!", "#ff4757");
            }
        }
        
        if(this.state === STATE.OBS_CHASING) {
            let head = this.nodes[0], pHead = player.nodes[0];
            
            let targetX = pHead.x + Math.cos(this.id + gameTime) * 60;
            let targetY = pHead.y + Math.sin(this.id + gameTime) * 60;
            
            let dx = targetX - head.x, dy = targetY - head.y;
            let dist = Math.hypot(dx, dy);
            
            if(dist > 0) {
                head.x += (dx/dist) * currentEnemySpeed * dt;
                head.y += (dy/dist) * currentEnemySpeed * dt;
            }
            
            for(let i = 1; i < this.nodes.length; i++) {
                let curr = this.nodes[i], prev = this.nodes[i-1];
                let px = prev.x - curr.x, py = prev.y - curr.y;
                let d = Math.hypot(px, py);
                if(d > CONFIG.NODE_DIST) {
                    curr.x += (px/d) * (d - CONFIG.NODE_DIST);
                    curr.y += (py/d) * (d - CONFIG.NODE_DIST);
                }
            }
        }
    }
    
    draw(ctx) {
        let baseThickness = 24;
        let tailThickness = 8;
        
        ctx.strokeStyle = '#2c3e50';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 1; i < this.nodes.length; i++) {
            let prev = this.nodes[i - 1];
            let curr = this.nodes[i];
            let currentThickness = baseThickness - (i / this.nodes.length) * (baseThickness - tailThickness);
            ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(curr.x, curr.y);
            ctx.lineWidth = currentThickness + 8;
            ctx.stroke();
        }
        
        for (let i = 1; i < this.nodes.length; i++) {
            let prev = this.nodes[i - 1];
            let curr = this.nodes[i];
            let currentThickness = baseThickness - (i / this.nodes.length) * (baseThickness - tailThickness);
            ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(curr.x, curr.y);
            
            if (this.state === STATE.OBS_CHASING) {
                if (this.patternType === 0) {
                    ctx.strokeStyle = `hsl(${this.baseHue}, 90%, 55%)`; 
                } else if (this.patternType === 1) {
                    ctx.strokeStyle = (i % 2 === 0) ? `hsl(${this.baseHue}, 90%, 55%)` : '#2c3e50'; 
                } else if (this.patternType === 2) {
                    ctx.strokeStyle = `hsl(${this.baseHue + i * 12}, 90%, 55%)`; 
                } else if (this.patternType === 3) {
                    ctx.strokeStyle = `hsl(${this.baseHue}, 90%, 55%)`; 
                }
            } else {
                const fillColors = ['#95a5a6', '#e67e22', '#ff4757'];
                ctx.strokeStyle = fillColors[this.state];
            }
            
            ctx.lineWidth = currentThickness;
            ctx.stroke();
        }
        
        if (this.state === STATE.OBS_CHASING && this.patternType === 3) {
            ctx.fillStyle = '#ffffff';
            for (let i = 2; i < this.nodes.length - 2; i += 2) {
                let curr = this.nodes[i];
                let currentThickness = baseThickness - (i / this.nodes.length) * (baseThickness - tailThickness);
                ctx.beginPath();
                ctx.arc(curr.x, curr.y, currentThickness * 0.35, 0, Math.PI*2);
                ctx.fill();
            }
        }

        let head = this.nodes[0];
        let angle = this.nodes.length > 1 ? Math.atan2(head.y - this.nodes[1].y, head.x - this.nodes[1].x) : 0;
        let eyeOffset = 8;
        
        if (this.state < STATE.OBS_CHASING) {
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(head.x + Math.cos(angle - 1.2) * eyeOffset, head.y + Math.sin(angle - 1.2) * eyeOffset, 4, 0, Math.PI, false); ctx.stroke();
            ctx.beginPath(); ctx.arc(head.x + Math.cos(angle + 1.2) * eyeOffset, head.y + Math.sin(angle + 1.2) * eyeOffset, 4, 0, Math.PI, false); ctx.stroke();
            
            let zTxt = "";
            if (this.state === STATE.OBS_RED) {
                zTxt = "!?";
                ctx.fillStyle = '#ff4757';
            } else {
                let zTime = Date.now() / 600;
                let zIdx = Math.floor(zTime) % 3;
                zTxt = zIdx === 0 ? "Z" : zIdx === 1 ? "Zz" : "Zzz";
                ctx.fillStyle = '#fff';
            }
            
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 4;
            ctx.font = '900 28px Nunito';
            ctx.strokeText(zTxt, head.x + 10, head.y - 25);
            ctx.fillText(zTxt, head.x + 10, head.y - 25);
        } else {
            ctx.fillStyle = 'white';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 3;
            
            ctx.save();
            ctx.translate(head.x, head.y);
            ctx.rotate(angle);
            
            ctx.beginPath(); ctx.moveTo(2, -eyeOffset); ctx.lineTo(12, -eyeOffset-6); ctx.lineTo(12, -eyeOffset+6); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(2, eyeOffset); ctx.lineTo(12, eyeOffset-6); ctx.lineTo(12, eyeOffset+6); ctx.closePath(); ctx.fill(); ctx.stroke();
            
            ctx.fillStyle = '#2c3e50';
            ctx.beginPath(); ctx.arc(6, -eyeOffset, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(6, eyeOffset, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }
}

class Candy {
    constructor() {
        this.type = Math.floor(Math.random() * 10) + 1; 
        this.radius = CONFIG.CANDY_BASE + (this.type * 1.5);
        this.spawn();
    }
    
    spawn() {
        let valid = false;
        while(!valid) {
            this.x = Math.random() * (MAP_SIZE - 200) + 100; 
            this.y = Math.random() * (MAP_SIZE - 200) + 100;
            valid = true;
        }
    }
    
    draw(ctx) {
        let color = `hsl(${this.type * 36}, 100%, 65%)`; 
        ctx.fillStyle = color;
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        
        let wrapperSize = this.radius * 0.9;
        
        ctx.beginPath(); ctx.moveTo(this.x - this.radius * 0.4, this.y); ctx.lineTo(this.x - this.radius - wrapperSize, this.y - wrapperSize); ctx.lineTo(this.x - this.radius - wrapperSize, this.y + wrapperSize); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(this.x + this.radius * 0.4, this.y); ctx.lineTo(this.x + this.radius + wrapperSize, this.y - wrapperSize); ctx.lineTo(this.x + this.radius + wrapperSize, this.y + wrapperSize); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath(); ctx.arc(this.x - this.radius*0.3, this.y - this.radius*0.3, this.radius*0.3, 0, Math.PI*2); ctx.fill();
    }
}

class RainbowCandy {
    constructor() {
        this.radius = 24;
        this.x = Math.random() * (MAP_SIZE - 200) + 100;
        this.y = Math.random() * (MAP_SIZE - 200) + 100;
        this.hue = 0;
    }
    
    draw(ctx, dt) {
        this.hue += 300 * dt; 
        
        ctx.fillStyle = `hsl(${this.hue % 360}, 100%, 65%)`;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 30;
        ctx.shadowColor = ctx.fillStyle;
        
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '26px Fredoka';
        ctx.fillText("🌈", this.x, this.y + 2);
    }
}

// --- Snowman Item (Kill Magic) ---
class SnowmanItem {
    constructor() {
        this.radius = 24;
        let valid = false;
        while(!valid) {
            this.x = Math.random() * (MAP_SIZE - 400) + 200;
            this.y = Math.random() * (MAP_SIZE - 400) + 200;
            valid = true;
        }
        this.floatY = 0;
        this.time = 0;
    }
    
    draw(ctx, dt) {
        this.time += dt * 3;
        this.floatY = Math.sin(this.time) * 5;
        
        ctx.save();
        ctx.translate(this.x, this.y + this.floatY);
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ffff';
        
        // Body (bottom)
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 8, 14, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        // Head (top)
        ctx.beginPath(); ctx.arc(0, -10, 11, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        ctx.shadowBlur = 0;
        
        // Eyes
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(-4, -12, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -12, 2, 0, Math.PI*2); ctx.fill();
        
        // Nose (Carrot)
        ctx.fillStyle = '#e67e22';
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(10, -6); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
        
        // Scarf
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(9, -1); ctx.stroke();
        
        ctx.restore();
    }
}

class ObjectPool {
    constructor() { this.pool = []; }
    spawn(x, y, text, color = '#fff') { this.pool.push({x, y, text, color, life: 1.5}); }
    updateAndDraw(ctx, dt) {
        for(let i = this.pool.length - 1; i >= 0; i--) {
            let p = this.pool[i];
            p.y -= 50 * dt; 
            p.life -= dt;
            if(p.life <= 0) {
                this.pool.splice(i, 1);
            } else {
                ctx.globalAlpha = Math.max(0, p.life / 1.5);
                ctx.font = '900 36px Nunito, sans-serif';
                ctx.fillStyle = p.color;
                ctx.strokeStyle = '#2c3e50';
                ctx.lineWidth = 5;
                ctx.lineJoin = 'round';
                
                ctx.strokeText(p.text, p.x, p.y);
                ctx.fillText(p.text, p.x, p.y);
                ctx.globalAlpha = 1.0;
            }
        }
    }
}

// --- Game Manager ---
let player, obstacleSnakes = [], envObstacles = [], candies = [], rainbowCandies = [], snowmen = [], powerItems = [], floatingTexts;
let score = 0, cameraScale = 1, gameTime = 0, timeAccumulator = 0;
let sessionUUID, lastTime = 0, isGameOver = false;
let candiesEaten = 0, nextSnakeSpawnTime = 20, nextPowerItemTime = 10, nextRainbowCandyTime = 40, nextSnowmanTime = 55;
let enemySpeedBonus = 0;

function spawnRainbowCandy() {
    rainbowCandies.push(new RainbowCandy());
    floatingTexts.spawn(player.nodes[0].x, player.nodes[0].y - 120, "🌈 무지개 사탕 스폰!", "#0ff");
}

function spawnSnowman() {
    snowmen.push(new SnowmanItem());
    floatingTexts.spawn(player.nodes[0].x, player.nodes[0].y - 120, "⛄ 눈사람 아이템 스폰!", "#00ffff");
}

function init() {
    player = new PlayerSnake();
    
    envObstacles = [];
    for(let i=0; i<35; i++) envObstacles.push(new EnvironmentObstacle(Math.random() > 0.5 ? 'tree' : 'rock'));

    obstacleSnakes = [];
    obstacleSnakes.push(new ObstacleSnake());
    obstacleSnakes.push(new ObstacleSnake());
    obstacleSnakes.push(new ObstacleSnake());
    
    candies = [];
    rainbowCandies = [];
    snowmen = [];
    powerItems = [];
    for(let i=0; i<10; i++) candies.push(new Candy());
    
    floatingTexts = new ObjectPool();
    
    score = 0; 
    let isMobile = window.innerWidth <= 768;
    cameraScale = isMobile ? 0.7 : 1.0; 
    gameTime = 0; timeAccumulator = 0;
    candiesEaten = 0; 
    nextSnakeSpawnTime = 20; 
    nextPowerItemTime = 15;
    nextRainbowCandyTime = 40; 
    nextSnowmanTime = 55; // 눈사람은 게임 시작 55초 후 최초 스폰
    enemySpeedBonus = 0;
    
    sessionUUID = uuidv4();
    isGameOver = false;
    
    document.getElementById('score').innerText = score;
    document.getElementById('game-over-screen').classList.add('hidden');
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function processRankingSync() {
    const payload = { uuid: sessionUUID, data: encryptData({ score, timestamp: Date.now() }) };
    if(!navigator.onLine) {
        document.getElementById('offline-badge').style.display = 'block';
        let offlineQ = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
        offlineQ.push(payload);
        localStorage.setItem('offlineQueue', JSON.stringify(offlineQ));
    } else {
        document.getElementById('offline-badge').style.display = 'none';
    }
    
    let ranks = JSON.parse(localStorage.getItem('mockRanking') || '[200, 150, 100, 50, 20]');
    ranks.push(score);
    ranks.sort((a,b) => b-a);
    ranks = ranks.slice(0, 5);
    localStorage.setItem('mockRanking', JSON.stringify(ranks));
    
    const rankList = document.getElementById('ranking-list');
    rankList.innerHTML = '';
    ranks.forEach((r, i) => {
        let li = document.createElement('li');
        li.innerText = `#${i+1} 🏆 ${r} pts ${r === score ? '✨(YOU)✨' : ''}`;
        rankList.appendChild(li);
    });
}

function checkGameOverCondition() {
    let pHead = player.nodes[0];
    if(pHead.x < 0 || pHead.x > MAP_SIZE || pHead.y < 0 || pHead.y > MAP_SIZE) return true;
    
    for(let obs of obstacleSnakes) {
        let oHead = obs.nodes[0];
        if(obs.state === STATE.OBS_CHASING && Math.hypot(pHead.x - oHead.x, pHead.y - oHead.y) < 25) return true;
    }
    return false;
}

function handleCollisions() {
    let pHead = player.nodes[0];
    
    // 0. 파워 아이템 (번개)
    for(let i = powerItems.length - 1; i >= 0; i--) {
        let item = powerItems[i];
        if(Math.hypot(pHead.x - item.x, pHead.y - item.y) < 18 + item.radius) {
            if(item.type === 'yellow') {
                player.speed += 5;
                floatingTexts.spawn(item.x, item.y, "⚡내 속도 +5", "#f1c40f");
            } else {
                enemySpeedBonus += 3;
                floatingTexts.spawn(item.x, item.y, "☠️적 속도 +3", "#ff4757");
            }
            powerItems.splice(i, 1);
        }
    }

    // 1. 일반 사탕
    for(let i = candies.length - 1; i >= 0; i--) {
        let c = candies[i];
        if(Math.hypot(pHead.x - c.x, pHead.y - c.y) < 18 + c.radius) {
            const pts = 5 + (c.type - 1) * 3;
            score += pts;
            document.getElementById('score').innerText = score;
            
            floatingTexts.spawn(c.x, c.y, `+${pts}`, '#f1c40f');
            player.nodesToAdd += c.type * 2;
            cameraScale = Math.max(0.4, cameraScale * CONFIG.ZOOM_SHRINK);
            
            candies.splice(i, 1);
            candies.push(new Candy());
            
            candiesEaten++;
            if(candiesEaten % 3 === 0) {
                obstacleSnakes.push(new ObstacleSnake());
                obstacleSnakes.push(new ObstacleSnake());
                obstacleSnakes.push(new ObstacleSnake());
                floatingTexts.spawn(pHead.x, pHead.y - 60, "🐍 3마리 출현!", "#ff4757");
            }
        }
    }
    
    // 2. 무지개 사탕 (수면 마법)
    for(let i = rainbowCandies.length - 1; i >= 0; i--) {
        let rc = rainbowCandies[i];
        if(Math.hypot(pHead.x - rc.x, pHead.y - rc.y) < 18 + rc.radius) {
            score += 50;
            document.getElementById('score').innerText = score;
            floatingTexts.spawn(rc.x, rc.y, "✨수면 마법 발동!✨", "#0ff");
            
            obstacleSnakes.forEach(obs => {
                if(obs.state === STATE.OBS_CHASING) {
                    obs.state = STATE.OBS_BLACK;
                    obs.hitCount = 0;
                    obs.hitCooldown = 1.0; 
                    obs.sleepTimer = 15.0; 
                    
                    obs.cx = obs.nodes[0].x;
                    obs.cy = obs.nodes[0].y;
                    obs.recoil();
                    
                    floatingTexts.spawn(obs.cx, obs.cy - 50, "Zzz...", "#fff");
                }
            });
            
            rainbowCandies.splice(i, 1);
        }
    }

    // 2.5 눈사람 아이템 (즉사 마법)
    for(let i = snowmen.length - 1; i >= 0; i--) {
        let sm = snowmen[i];
        if(Math.hypot(pHead.x - sm.x, pHead.y - sm.y) < 18 + sm.radius) {
            score += 100; // 큰 점수 보상
            document.getElementById('score').innerText = score;
            
            let destroyedCount = 0;
            for (let j = obstacleSnakes.length - 1; j >= 0; j--) {
                if (obstacleSnakes[j].state === STATE.OBS_CHASING) {
                    floatingTexts.spawn(obstacleSnakes[j].nodes[0].x, obstacleSnakes[j].nodes[0].y, "💥눈보라!", "#00ffff");
                    obstacleSnakes.splice(j, 1); // 쫓아오는 뱀 배열에서 즉시 제거
                    destroyedCount++;
                }
            }
            floatingTexts.spawn(sm.x, sm.y, `⛄얼음 마법! ${destroyedCount}마리 제거!`, "#00ffff");
            snowmen.splice(i, 1);
        }
    }
    
    // 3. 환경 장애물(나무, 바위) 
    for(let env of envObstacles) {
        let dx = pHead.x - env.x;
        let dy = pHead.y - env.y;
        let dist = Math.hypot(dx, dy);
        let min_dist = env.radius + 15;
        
        if(dist < min_dist) {
            let overlap = min_dist - dist + 5;
            pHead.x += (dx / dist) * overlap;
            pHead.y += (dy / dist) * overlap;
            
            let turnRight = Math.random() > 0.5;
            let tmp = player.dir.x;
            player.dir.x = turnRight ? -player.dir.y : player.dir.y;
            player.dir.y = turnRight ? tmp : -tmp;
            
            floatingTexts.spawn(env.x, env.y - 40, "아이구!", "#fff");
        }
    }
    
    // 4. 자고 있는 뱀 충돌 
    for(let obs of obstacleSnakes) {
        if(obs.state !== STATE.OBS_CHASING) {
            let dx = pHead.x - obs.cx;
            let dy = pHead.y - obs.cy;
            let dist = Math.hypot(dx, dy);
            let min_dist = 85;
            
            if(dist < min_dist) {
                if(obs.hitCooldown <= 0) {
                    obs.hit();
                    floatingTexts.spawn(obs.cx, obs.cy - 60, "💢", "#ff4757");
                }
                
                let overlap = min_dist - dist + 5;
                pHead.x += (dx / dist) * overlap;
                pHead.y += (dy / dist) * overlap;
                
                let turnRight = Math.random() > 0.5;
                let tmp = player.dir.x;
                player.dir.x = turnRight ? -player.dir.y : player.dir.y;
                player.dir.y = turnRight ? tmp : -tmp;
            }
        }
    }
}

function gameLoop(timestamp) {
    if(isGameOver) return;
    
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if(dt > 0.1) dt = 0.1; 
    
    gameTime += dt;
    timeAccumulator += dt;
    
    if(timeAccumulator >= 30) {
        score += 5;
        document.getElementById('score').innerText = score;
        floatingTexts.spawn(player.nodes[0].x, player.nodes[0].y, "Survive +5", "#2ecc71");
        timeAccumulator = 0;
    }
    
    if(gameTime >= nextPowerItemTime) {
        powerItems.push(new PowerItem(Math.random() > 0.5 ? 'yellow' : 'black'));
        nextPowerItemTime += 15 + Math.random() * 10;
    }
    
    if(gameTime >= nextRainbowCandyTime) {
        spawnRainbowCandy();
        nextRainbowCandyTime += 30 + Math.random() * 20;
    }

    if(gameTime >= nextSnowmanTime) {
        spawnSnowman();
        nextSnowmanTime += 30 + Math.random() * 20; // 무지개 사탕과 동일한 희소성
    }
    
    if(gameTime >= nextSnakeSpawnTime) {
        obstacleSnakes.push(new ObstacleSnake());
        floatingTexts.spawn(player.nodes[0].x, player.nodes[0].y - 80, "경고: 뱀 추가 등장!", "#e67e22");
        nextSnakeSpawnTime += 10;
    }

    let currentEnemySpeed = 130 + enemySpeedBonus + (gameTime * 0.8);

    player.update(dt);
    for(let obs of obstacleSnakes) obs.update(dt, player, currentEnemySpeed);
    handleCollisions();
    
    if(checkGameOverCondition()) {
        isGameOver = true;
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').innerText = score;
        processRankingSync();
        return;
    }

    ctx.fillStyle = '#578a34';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(cw/2, ch/2);
    ctx.scale(cameraScale, cameraScale);
    ctx.translate(-player.nodes[0].x, -player.nodes[0].y);

    ctx.fillStyle = '#a2d149';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    ctx.fillStyle = '#aad751';
    const gridS = 100;
    for(let x = 0; x < MAP_SIZE; x+=gridS) {
        for(let y = 0; y < MAP_SIZE; y+=gridS) {
            if(((x/gridS) + (y/gridS)) % 2 === 0) {
                ctx.fillRect(x, y, gridS, gridS);
            }
        }
    }

    ctx.strokeStyle = '#8B4513'; 
    ctx.lineWidth = 30;
    ctx.lineJoin = 'miter';
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
    
    ctx.strokeStyle = '#5c2a07';
    ctx.lineWidth = 10;
    ctx.strokeRect(-15, -15, MAP_SIZE+30, MAP_SIZE+30);

    envObstacles.forEach(env => env.draw(ctx));
    candies.forEach(c => c.draw(ctx));
    powerItems.forEach(pi => pi.draw(ctx, dt));
    rainbowCandies.forEach(rc => rc.draw(ctx, dt));
    snowmen.forEach(sm => sm.draw(ctx, dt));
    obstacleSnakes.forEach(obs => obs.draw(ctx));
    player.draw(ctx);
    floatingTexts.updateAndDraw(ctx, dt);

    ctx.restore();

    if (isDragging) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        
        ctx.beginPath(); ctx.arc(dragStartX, dragStartY, 60, 0, Math.PI * 2);
        ctx.fillStyle = '#2c3e50'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();

        ctx.beginPath(); ctx.arc(dragCurrentX, dragCurrentY, 25, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2c3e50'; ctx.stroke();
        
        ctx.restore();
    }

    requestAnimationFrame(gameLoop);
}

const startScreen = document.getElementById('start-screen');
const countdownScreen = document.getElementById('countdown-screen');
const countdownText = document.getElementById('countdown-text');
const scoreBoard = document.getElementById('score-board');
const startBtn = document.getElementById('start-btn');

const startCountdown = () => {
    countdownScreen.classList.remove('hidden');
    let count = 3;
    countdownText.innerText = count;
    countdownText.style.animation = 'none';
    void countdownText.offsetWidth;
    countdownText.style.animation = 'popIn 1s ease-out';
    
    let interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownText.innerText = count;
        } else if (count === 0) {
            countdownText.innerText = "GO!";
        } else {
            clearInterval(interval);
            countdownScreen.classList.add('hidden');
            scoreBoard.classList.remove('hidden');
            init();
            return;
        }
        countdownText.style.animation = 'none';
        void countdownText.offsetWidth;
        countdownText.style.animation = 'popIn 1s ease-out';
    }, 1000);
};

startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    startCountdown();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('game-over-screen').classList.add('hidden');
    startCountdown();
});

window.addEventListener('online', () => {
    let offlineQ = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    if(offlineQ.length > 0) {
        console.log("오프라인 데이터 서버 동기화 완료:", offlineQ);
        localStorage.removeItem('offlineQueue');
        document.getElementById('offline-badge').style.display = 'none';
    }
});
