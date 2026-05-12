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
        
        let isPower = this.type === 'yellow3' || this.type === 'yellow5';
        ctx.fillStyle = (this.type === 'yellow' || isPower) ? '#f1c40f' : '#2d3436';
        ctx.strokeStyle = (this.type === 'yellow' || isPower) ? '#fff' : '#e74c3c';
        ctx.lineWidth = isPower ? 5 : 3;
        ctx.shadowBlur = isPower ? 25 : 15;
        ctx.shadowColor = ctx.fillStyle;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y + floatY, this.radius, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = (this.type === 'yellow' || isPower) ? '#fff' : '#f1c40f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${isPower ? 18 : 24}px Arial`;
        
        let icon = "⚡";
        if (this.type === 'yellow3') icon = "⚡⚡⚡";
        if (this.type === 'yellow5') icon = "⚡⚡⚡⚡⚡";
        ctx.fillText(icon, this.x, this.y + floatY + 2);
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
        ctx.save();
        // Subtle shadow
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.arc(this.x + 5, this.y + 5, this.radius, 0, Math.PI*2); ctx.fill();

        if(this.type === 'tree') {
            // Trunk
            ctx.fillStyle = '#5d4037';
            ctx.strokeStyle = '#3e2723';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(this.x - 10, this.y - 5, 20, 35, 5); ctx.fill(); ctx.stroke();
            
            // Foliage (Layers)
            const drawLeaves = (ox, oy, r, color) => {
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.arc(this.x + ox, this.y + oy, r, 0, Math.PI*2); ctx.fill();
            };
            drawLeaves(0, -35, 35, '#2e7d32');
            drawLeaves(-20, -15, 28, '#388e3c');
            drawLeaves(20, -15, 28, '#388e3c');
            drawLeaves(0, -45, 20, '#43a047'); // Top layer
            
            // Highlights
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath(); ctx.arc(this.x - 10, this.y - 40, 10, 0, Math.PI*2); ctx.fill();
        } else {
            // Rock
            let grad = ctx.createRadialGradient(this.x - 10, this.y - 10, 5, this.x, this.y, 40);
            grad.addColorStop(0, '#b0bec5');
            grad.addColorStop(1, '#546e7a');
            ctx.fillStyle = grad;
            ctx.strokeStyle = '#37474f';
            ctx.lineWidth = 3;
            
            ctx.beginPath();
            ctx.moveTo(this.x - 30, this.y + 10);
            ctx.lineTo(this.x - 20, this.y - 20);
            ctx.lineTo(this.x + 15, this.y - 25);
            ctx.lineTo(this.x + 35, this.y);
            ctx.lineTo(this.x + 20, this.y + 25);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            
            // Cracks
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(this.x - 10, this.y - 10); ctx.lineTo(this.x + 5, this.y + 5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(this.x + 10, this.y - 5); ctx.lineTo(this.x + 20, this.y - 15); ctx.stroke();
        }
        ctx.restore();
    }
}

class WaterFeature {
    constructor() {
        this.w = 300 + Math.random() * 400;
        this.h = 200 + Math.random() * 300;
        // 테두리 벽(MAP_SIZE)을 넘지 않도록 위치 계산 (여유 공간 50px)
        this.x = Math.random() * (MAP_SIZE - this.w - 100) + 50;
        this.y = Math.random() * (MAP_SIZE - this.h - 100) + 50;
        this.seed = Math.random() * 100;
    }
    draw(ctx) {
        ctx.save();
        // Water body
        let grad = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y + this.h);
        grad.addColorStop(0, '#4fc3f7');
        grad.addColorStop(1, '#0288d1');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.w, this.h, 80);
        ctx.fill();
        
        // Shore highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Ripples
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        for(let i=0; i<3; i++) {
            let rx = this.x + 50 + (this.seed * 7 + i * 100) % (this.w - 100);
            let ry = this.y + 50 + (this.seed * 13 + i * 70) % (this.h - 100);
            ctx.beginPath();
            ctx.ellipse(rx, ry, 30 + Math.sin(gameTime + i) * 10, 10, 0, 0, Math.PI*2);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function isInWater(x, y) {
    if (!waterFeatures) return false;
    for(let wf of waterFeatures) {
        if(x >= wf.x && x <= wf.x + wf.w && y >= wf.y && y <= wf.y + wf.h) return true;
    }
    return false;
}

// --- Entities ---
class PlayerSnake {
    constructor() {
        this.nodes = Array.from({length: 15}, (_, i) => ({x: MAP_SIZE/2, y: MAP_SIZE/2 + i*CONFIG.NODE_DIST}));
        this.dir = {x: 0, y: -1}; 
        this.speed = CONFIG.BASE_SPEED; 
        this.nodesToAdd = 0;
        this.speedEffect = 1;
        this.speedEffectTimer = 0;
    }
    
    update(dt) {
        if (inputQueue.length > 0) {
            const nextDir = inputQueue.shift();
            this.dir = nextDir;
        }
        
        let currentBaseSpeed = this.speed;
        if (this.speedEffectTimer > 0) {
            currentBaseSpeed *= this.speedEffect;
            this.speedEffectTimer -= dt;
            if (this.speedEffectTimer <= 0) {
                this.speedEffect = 1;
                floatingTexts.spawn(this.nodes[0].x, this.nodes[0].y, "⚡SPEED OFF", "#fff");
            }
        }

        // Water Speed Penalty (3배 느리게)
        if (isInWater(this.nodes[0].x, this.nodes[0].y)) {
            currentBaseSpeed /= 3;
        }

        const head = this.nodes[0];
        head.x += this.dir.x * currentBaseSpeed * dt;
        head.y += this.dir.y * currentBaseSpeed * dt;

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
        const n = this.nodes.length;
        const baseT = 30, tailT = 12;

        // Draw segments from tail to head
        for (let i = n - 1; i >= 0; i--) {
            const curr = this.nodes[i];
            const prev = this.nodes[i - 1] || this.nodes[i];
            const next = this.nodes[i + 1] || this.nodes[i];
            
            // Angle for segment rotation
            const angle = (i === 0) ? Math.atan2(this.dir.y, this.dir.x) : Math.atan2(prev.y - curr.y, prev.x - curr.x);
            
            // Thickness
            const t = baseT - (i / n) * (baseT - tailT);
            
            // Rainbow color for player
            const hue = (gameTime * 50 + i * 15) % 360;
            const color = `hsl(${hue}, 85%, 60%)`;
            const darkColor = `hsl(${hue}, 85%, 30%)`;

            ctx.save();
            ctx.translate(curr.x, curr.y);
            ctx.rotate(angle);

            if (i === 0) {
                // --- Head ---
                // Body
                ctx.fillStyle = color;
                ctx.strokeStyle = darkColor;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.roundRect(-15, -18, 36, 36, 12);
                ctx.fill(); ctx.stroke();

                // Armor Plate on Head
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath(); ctx.roundRect(-5, -12, 20, 24, 5); ctx.fill();

                // Horns
                ctx.fillStyle = '#f1c40f';
                ctx.strokeStyle = '#95a5a6';
                ctx.lineWidth = 2;
                // Left horn
                ctx.beginPath(); ctx.moveTo(-10, -15); ctx.lineTo(-25, -25); ctx.lineTo(-15, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
                // Right horn
                ctx.beginPath(); ctx.moveTo(-10, 15); ctx.lineTo(-25, 25); ctx.lineTo(-15, 10); ctx.closePath(); ctx.fill(); ctx.stroke();

                // Eyes (Blue for Player)
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.arc(10, -10, 7, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(10, 10, 7, 0, Math.PI*2); ctx.fill();
                
                ctx.fillStyle = '#3498db'; // Bright Blue
                ctx.beginPath(); ctx.arc(13, -10, 3.5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(13, 10, 3.5, 0, Math.PI*2); ctx.fill();
                
                // Pupils
                ctx.fillStyle = 'black';
                ctx.beginPath(); ctx.arc(14, -10, 1.5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(14, 10, 1.5, 0, Math.PI*2); ctx.fill();

            } else {
                // --- Body Segment ---
                ctx.fillStyle = color;
                ctx.strokeStyle = darkColor;
                ctx.lineWidth = 3;
                
                // Draw as a rounded segment
                const segW = t * 1.2;
                const segH = t;
                ctx.beginPath();
                ctx.roundRect(-segW/2, -segH/2, segW, segH, 8);
                ctx.fill(); ctx.stroke();

                // Scale/Armor detail
                ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.moveTo(-segW/4, -segH/3); ctx.lineTo(segW/4, 0); ctx.lineTo(-segW/4, segH/3);
                ctx.stroke();

                if (i === n - 1) {
                    // Tail Tip
                    ctx.fillStyle = darkColor;
                    ctx.beginPath();
                    ctx.moveTo(-segW/2, -segH/2); ctx.lineTo(-segW*1.2, 0); ctx.lineTo(-segW/2, segH/2);
                    ctx.closePath(); ctx.fill();
                }
            }
            ctx.restore();
        }

        // (혀 낼름거리는 효과 삭제됨)
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
                this.isEdible = false; // 기상 시 포식 불가
                floatingTexts.spawn(this.nodes[0].x, this.nodes[0].y - 40, "💢기상!", "#ff4757");
            }
        }
        
        if(this.state === STATE.OBS_CHASING) {
            let head = this.nodes[0], pHead = player.nodes[0];
            
            let targetX = pHead.x + Math.cos(this.id + gameTime) * 60;
            let targetY = pHead.y + Math.sin(this.id + gameTime) * 60;
            
            let dx = targetX - head.x, dy = targetY - head.y;
            let dist = Math.hypot(dx, dy);
            
            let speed = currentEnemySpeed;
            if (isInWater(head.x, head.y)) speed /= 3; // 3배 느리게

            if(dist > 0) {
                head.x += (dx/dist) * speed * dt;
                head.y += (dy/dist) * speed * dt;
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
        const n = this.nodes.length;
        const baseT = 26, tailT = 10;
        const isSleeping = this.state < STATE.OBS_CHASING;

        // Base color theme for this enemy
        const hue = this.baseHue;
        const bodyColor = isSleeping ? `hsl(${hue}, 20%, 40%)` : `hsl(${hue}, 85%, 50%)`;
        const darkColor = `hsl(${hue}, 85%, 20%)`;

        for (let i = n - 1; i >= 0; i--) {
            const curr = this.nodes[i];
            const prev = this.nodes[i - 1] || this.nodes[i];
            const next = this.nodes[i + 1] || this.nodes[i];
            const angle = (i === 0) ? Math.atan2(curr.y - next.y, curr.x - next.x) : Math.atan2(prev.y - curr.y, prev.x - curr.x);
            
            // Adjust size if sleeping
            const sizeScale = isSleeping ? 0.7 : 1.0;
            const t = (baseT - (i / n) * (baseT - tailT)) * sizeScale;

            ctx.save();
            ctx.translate(curr.x, curr.y);
            ctx.rotate(angle);

            if (i === 0) {
                // --- Enemy Head ---
                ctx.fillStyle = bodyColor;
                ctx.strokeStyle = darkColor;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.roundRect(-12, -15, 30, 30, 10);
                ctx.fill(); ctx.stroke();

                if (isSleeping) {
                    // Closed eyes
                    ctx.strokeStyle = darkColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(8, -6, 4, 0, Math.PI); ctx.stroke();
                    ctx.beginPath(); ctx.arc(8, 6, 4, 0, Math.PI); ctx.stroke();
                    
                    // Zzz
                    let zTxt = this.state === STATE.OBS_RED ? '!!' : 'zZ';
                    ctx.font = 'bold 16px Arial';
                    ctx.fillStyle = 'white';
                    ctx.fillText(zTxt, 15, -15);
                } else {
                    // Horns
                    ctx.fillStyle = '#95a5a6';
                    ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(-15, -18); ctx.lineTo(-10, -8); ctx.closePath(); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(-15, 18); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();

                    // Eyes (Red for Enemies)
                    ctx.fillStyle = 'white';
                    ctx.beginPath(); ctx.arc(8, -8, 6, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI*2); ctx.fill();
                    
                    ctx.fillStyle = '#e74c3c'; // Bright Red
                    ctx.beginPath(); ctx.arc(10, -8, 3, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(10, 8, 3, 0, Math.PI*2); ctx.fill();
                }
            } else {
                // --- Enemy Body Segment ---
                ctx.fillStyle = bodyColor;
                ctx.strokeStyle = darkColor;
                ctx.lineWidth = 2.5;
                
                const segW = t * 1.1;
                const segH = t;
                ctx.beginPath();
                ctx.roundRect(-segW/2, -segH/2, segW, segH, 6);
                ctx.fill(); ctx.stroke();
                
                // Segment detail
                ctx.fillStyle = 'rgba(0,0,0,0.1)';
                ctx.beginPath(); ctx.arc(0, 0, t/3, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        }

        // Awakening Countdown (3초 전부터 머리 위에 표시)
        if (isSleeping && this.sleepTimer <= 3 && this.sleepTimer > 0) {
            let head = this.nodes[0];
            let count = Math.ceil(this.sleepTimer);
            ctx.save();
            ctx.font = 'bold 36px Arial';
            ctx.fillStyle = '#ff4757';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 5;
            ctx.textAlign = 'center';
            ctx.strokeText(count, head.x, head.y - 40);
            ctx.fillText(count, head.x, head.y - 40);
            ctx.restore();
        }
    }
}

class Candy {
    constructor() {
        this.type = Math.floor(Math.random() * 10) + 1; 
        this.radius = 24; // 무지개 아이템과 동일한 크기
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
        let hue = this.type * 36;
        let color = `hsl(${hue}, 100%, 65%)`; 
        ctx.fillStyle = color;
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 3;
        
        // Draw circular container
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        // Shiny effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x - this.radius*0.3, this.y - this.radius*0.3, this.radius*0.3, 0, Math.PI*2);
        ctx.fill();

        // Candy icon
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${this.radius * 1.2}px Arial`;
        ctx.fillText("🍬", this.x, this.y + 2);
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

// (눈사람 아이템 클래스 삭제됨)

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
let player, obstacleSnakes = [], envObstacles = [], waterFeatures = [], candies = [], rainbowCandies = [], powerItems = [], floatingTexts;
let score = 0, cameraScale = 1, gameTime = 0, timeAccumulator = 0;
let sessionUUID, lastTime = 0, isGameOver = false;
let candiesEaten = 0, nextSnakeSpawnTime = 20, nextPowerItemTime = 10, nextRainbowCandyTime = 15;
let enemySpeedBonus = 0;

function spawnRainbowCandy() {
    rainbowCandies.push(new RainbowCandy());
    floatingTexts.spawn(player.nodes[0].x, player.nodes[0].y - 120, "🌈 무지개 사탕 스폰!", "#0ff");
}

// (spawnSnowman 함수 삭제됨)

function init() {
    player = new PlayerSnake();
    
    envObstacles = [];
    for(let i=0; i<35; i++) envObstacles.push(new EnvironmentObstacle(Math.random() > 0.5 ? 'tree' : 'rock'));

    waterFeatures = [];
    for(let i=0; i<6; i++) {
        let valid = false;
        let wf;
        let attempts = 0;
        while(!valid && attempts < 50) {
            wf = new WaterFeature();
            valid = true;
            for(let other of waterFeatures) {
                // 겹침 방지 (약간의 여유 공간 50px 추가)
                if (!(wf.x + wf.w + 50 < other.x || wf.x > other.x + other.w + 50 ||
                      wf.y + wf.h + 50 < other.y || wf.y > other.y + other.h + 50)) {
                    valid = false;
                    break;
                }
            }
            attempts++;
        }
        waterFeatures.push(wf);
    }

    obstacleSnakes = [];
    obstacleSnakes.push(new ObstacleSnake());
    obstacleSnakes.push(new ObstacleSnake());
    obstacleSnakes.push(new ObstacleSnake());
    
    candies = [];
    rainbowCandies = [];
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
    nextRainbowCandyTime = 15; 
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
            } else if(item.type === 'yellow3') {
                player.speedEffect = 3;
                player.speedEffectTimer = 3;
                floatingTexts.spawn(item.x, item.y, "⚡x3 SPEED (3s)!", "#f1c40f");
            } else if(item.type === 'yellow5') {
                player.speedEffect = 5;
                player.speedEffectTimer = 5;
                floatingTexts.spawn(item.x, item.y, "⚡x5 SPEED (5s)!", "#f1c40f");
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
    
    // 2. 무지개 사탕 (수면 + 포식 마법)
    for(let i = rainbowCandies.length - 1; i >= 0; i--) {
        let rc = rainbowCandies[i];
        if(Math.hypot(pHead.x - rc.x, pHead.y - rc.y) < 18 + rc.radius) {
            score += 50;
            document.getElementById('score').innerText = score;
            floatingTexts.spawn(rc.x, rc.y, "✨포식 마법 발동!✨", "#0ff");
            
            obstacleSnakes.forEach(obs => {
                obs.state = STATE.OBS_BLACK;
                obs.hitCount = 0;
                obs.hitCooldown = 1.0; 
                obs.sleepTimer = 15.0; 
                obs.isEdible = true;
                
                // 뱀들이 겹치지 않게 서로 밀어내기 (머리 기준)
                obstacleSnakes.forEach(other => {
                    if (obs === other) return;
                    let dx = obs.nodes[0].x - other.nodes[0].x;
                    let dy = obs.nodes[0].y - other.nodes[0].y;
                    let dist = Math.hypot(dx, dy);
                    if (dist < 100) { // 겹침 판정 거리
                        let push = (100 - dist) / 2;
                        let ang = Math.atan2(dy, dx);
                        if (dist === 0) ang = Math.random() * Math.PI * 2;
                        obs.nodes.forEach(n => { n.x += Math.cos(ang) * push; n.y += Math.sin(ang) * push; });
                        other.nodes.forEach(n => { n.x -= Math.cos(ang) * push; n.y -= Math.sin(ang) * push; });
                    }
                });

                // ("먹어줘!" 텍스트 제거됨)
            });
            
            rainbowCandies.splice(i, 1);
        }
    }

    // 2.2 잠든 뱀 잡아먹기
    for(let i = obstacleSnakes.length - 1; i >= 0; i--) {
        let obs = obstacleSnakes[i];
        if(obs.isEdible) {
            // 뱀의 머리나 마디 어디든 닿으면 먹을 수 있게 처리
            for(let node of obs.nodes) {
                if(Math.hypot(pHead.x - node.x, pHead.y - node.y) < 35) {
                    score += 200;
                    document.getElementById('score').innerText = score;
                    floatingTexts.spawn(node.x, node.y, "냠냠! +200", "#0ff");
                    player.nodesToAdd += 10;
                    obstacleSnakes.splice(i, 1);
                    break;
                }
            }
        }
    }

// (눈사람 충돌 로직 삭제됨)
    
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
            let rnd = Math.random();
            let type = 'yellow';
            if (rnd > 0.9) type = 'yellow5';
            else if (rnd > 0.7) type = 'yellow3';
            else if (rnd > 0.4) type = 'black';
            
            powerItems.push(new PowerItem(type));
            nextPowerItemTime += 15 + Math.random() * 10;
    }
    
    if(gameTime >= nextRainbowCandyTime) {
        spawnRainbowCandy();
        nextRainbowCandyTime += 15 + Math.random() * 15;
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

    waterFeatures.forEach(wf => wf.draw(ctx));
    envObstacles.forEach(env => env.draw(ctx));
    candies.forEach(c => c.draw(ctx));
    powerItems.forEach(pi => pi.draw(ctx, dt));
    rainbowCandies.forEach(rc => rc.draw(ctx, dt));
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
