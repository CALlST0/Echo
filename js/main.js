window.EW = window.EW || {};

window.EW.DOM = {};

window.EW.Main = {
    boot: function() {
        const D = EW.DOM;
        const S = EW.State;
        const C = EW.Config;

        D.canvas = document.getElementById('game');
        D.ctx = D.canvas.getContext('2d');
        D.messageEl = document.getElementById('message');
        D.achievementEl = document.getElementById('achievement');
        D.crystalCountEl = document.getElementById('crystal-count');
        D.livesCountEl = document.getElementById('lives-count');
        D.tideStatusEl = document.getElementById('tide-status');
        D.tideHudEl = document.getElementById('tide-hud');
        D.settingsPanel = document.getElementById('settings-panel');
        D.tideSpeedInput = document.getElementById('tide-speed');
        D.tideSpeedVal = document.getElementById('tide-speed-val');
        D.enemyCountInput = document.getElementById('enemy-count');
        D.enemyCountVal = document.getElementById('enemy-count-val');
        D.repulsionInput = document.getElementById('repulsion');
        D.repulsionVal = document.getElementById('repulsion-val');
        D.enemySpeedInput = document.getElementById('enemy-speed');
        D.enemySpeedVal = document.getElementById('enemy-speed-val');
        D.playerSpeedInput = document.getElementById('player-speed');
        D.playerSpeedVal = document.getElementById('player-speed-val');
        D.closeSettingsBtn = document.getElementById('close-settings');
        D.settingsBtn = document.getElementById('settings-btn');
        D.resetBtn = document.getElementById('reset-btn');
        D.muteBtn = document.getElementById('mute-btn');
        D.touchLayer = document.getElementById('touch-layer');
        D.dynBase = document.getElementById('dyn-joy-base');
        D.dynKnob = document.getElementById('dyn-joy-knob');

        EW.audio = new EW.AudioEngine();

        this.resize();
        EW.Game.initGame();
        EW.Game.updateHUD();
        S.lastTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));

        this.setupEventListeners();
    },

    resize: function() {
        const S = EW.State;
        const D = EW.DOM;
        const C = EW.Config;
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const aspect = C.WORLD_W / C.WORLD_H;
        const displayW = viewW;
        const displayH = displayW / aspect;
        D.canvas.style.width = displayW + 'px';
        D.canvas.style.height = displayH + 'px';
        D.canvas.style.left = '0';
        D.canvas.style.top = '50%';
        D.canvas.style.transform = 'translateY(-50%)';
        D.canvas.width = displayW;
        D.canvas.height = displayH;
        S.canvasW = D.canvas.width;
        S.canvasH = D.canvas.height;
    },

    toggleSettings: function() {
        const S = EW.State;
        const D = EW.DOM;
        const C = EW.Config;
        
        const hidden = D.settingsPanel.classList.toggle('hidden');
        S.gamePaused = !hidden;
        EW.audio.mute(S.gamePaused || S.muted);
        if (!hidden) {
            D.tideSpeedInput.value = C.settings.tideSpeed; 
            D.enemyCountInput.value = C.settings.enemyCount; 
            D.repulsionInput.value = C.settings.repulsionStrength;
            D.enemySpeedInput.value = C.settings.enemySpeedMult; 
            D.playerSpeedInput.value = C.settings.playerSpeedMult;
            
            D.tideSpeedVal.textContent = C.settings.tideSpeed.toFixed(2); 
            D.enemyCountVal.textContent = C.settings.enemyCount;
            D.repulsionVal.textContent = C.settings.repulsionStrength.toFixed(2); 
            D.enemySpeedVal.textContent = C.settings.enemySpeedMult.toFixed(1);
            D.playerSpeedVal.textContent = C.settings.playerSpeedMult.toFixed(1);
        }
    },

    setupEventListeners: function() {
        const S = EW.State;
        const D = EW.DOM;
        const C = EW.Config;

        window.addEventListener('resize', this.resize.bind(this));

        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') { e.preventDefault(); this.toggleSettings(); return; }
            S.keys[e.code] = true;
            if (e.code === 'Space') { e.preventDefault(); EW.Game.emitPing(); }
            if (e.code === 'KeyR' && (S.gameOver || S.gameWon)) EW.Game.initGame();
            EW.audio.init(); EW.audio.resume();
        });
        window.addEventListener('keyup', e => { S.keys[e.code] = false; });

        D.settingsBtn.addEventListener('click', () => { EW.audio.init(); EW.audio.resume(); this.toggleSettings(); });
        
        D.resetBtn.addEventListener('click', () => { 
            EW.audio.init(); EW.audio.resume(); 
            if (!D.settingsPanel.classList.contains('hidden')) {
                D.settingsPanel.classList.add('hidden');
                S.gamePaused = false;
                EW.audio.mute(S.muted);
            }
            EW.Game.initGame(); 
        });

        D.muteBtn.addEventListener('click', () => { 
            S.muted = !S.muted; 
            EW.audio.mute(S.muted || S.gamePaused); 
            D.muteBtn.textContent = S.muted ? '🔇' : '🔊'; 
        });

        const maxJoyRadius = 52;

        D.touchLayer.addEventListener('pointerdown', e => {
            e.preventDefault(); // Moved to top to prevent phantom clicks
            EW.audio.init(); EW.audio.resume();
            if (S.joyPointerId !== null) {
                EW.Game.emitPing();
                return;
            }
            S.joyPointerId = e.pointerId;
            D.touchLayer.setPointerCapture(e.pointerId);
            S.joyOriginX = e.clientX;
            S.joyOriginY = e.clientY;
            S.joyActive = true;
            D.dynBase.style.left = S.joyOriginX + 'px';
            D.dynBase.style.top  = S.joyOriginY + 'px';
            D.dynBase.style.display = 'block';
            D.dynKnob.style.transform = 'translate(-50%,-50%)';
            S.joyX = 0; S.joyY = 0;
        }, { passive: false });

        D.touchLayer.addEventListener('pointermove', e => {
            if (!S.joyActive || e.pointerId !== S.joyPointerId) return;
            e.preventDefault();
            const dx = e.clientX - S.joyOriginX;
            const dy = e.clientY - S.joyOriginY;
            const dist = Math.hypot(dx, dy);
            const clampedX = dist > maxJoyRadius ? (dx / dist) * maxJoyRadius : dx;
            const clampedY = dist > maxJoyRadius ? (dy / dist) * maxJoyRadius : dy;
            S.joyX = clampedX / maxJoyRadius;
            S.joyY = clampedY / maxJoyRadius;
            D.dynKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
        }, { passive: false });

        const endJoy = (e) => {
            if (e.pointerId !== S.joyPointerId) return;
            S.joyActive = false; S.joyPointerId = null; S.joyX = 0; S.joyY = 0;
            D.dynBase.style.display = 'none';
            D.dynKnob.style.transform = 'translate(-50%,-50%)';
        };
        D.touchLayer.addEventListener('pointerup',     endJoy);
        D.touchLayer.addEventListener('pointercancel', endJoy);

        D.canvas.addEventListener('click', e => {
            if (S.gameOver || S.gameWon || S.gamePaused) return;
            EW.audio.init(); EW.audio.resume();
            EW.Game.emitPing();
        });

        D.closeSettingsBtn.addEventListener('click', () => {
            D.settingsPanel.classList.add('hidden'); 
            S.gamePaused = false; 
            EW.audio.mute(S.muted);
            C.settings.tideSpeed = parseFloat(D.tideSpeedInput.value); 
            C.settings.enemyCount = parseInt(D.enemyCountInput.value, 10);
            C.settings.repulsionStrength = parseFloat(D.repulsionInput.value); 
            C.settings.enemySpeedMult = parseFloat(D.enemySpeedInput.value);
            C.settings.playerSpeedMult = parseFloat(D.playerSpeedInput.value);
            
            D.tideSpeedVal.textContent = C.settings.tideSpeed.toFixed(2); 
            D.enemyCountVal.textContent = C.settings.enemyCount;
            D.repulsionVal.textContent = C.settings.repulsionStrength.toFixed(2); 
            D.enemySpeedVal.textContent = C.settings.enemySpeedMult.toFixed(1);
            D.playerSpeedVal.textContent = C.settings.playerSpeedMult.toFixed(1);
        });
        
        D.tideSpeedInput.addEventListener('input', () => D.tideSpeedVal.textContent = parseFloat(D.tideSpeedInput.value).toFixed(2));
        D.enemyCountInput.addEventListener('input', () => D.enemyCountVal.textContent = D.enemyCountInput.value);
        D.repulsionInput.addEventListener('input', () => D.repulsionVal.textContent = parseFloat(D.repulsionInput.value).toFixed(2));
        D.enemySpeedInput.addEventListener('input', () => D.enemySpeedVal.textContent = parseFloat(D.enemySpeedInput.value).toFixed(1));
        D.playerSpeedInput.addEventListener('input', () => D.playerSpeedVal.textContent = parseFloat(D.playerSpeedInput.value).toFixed(1));
    },

    gameLoop: function(time) { 
        const S = EW.State;
        const dt = Math.min(0.2, (time - (S.lastTime || time)) / 1000); 
        S.lastTime = time; 
        S.frameCount++; 
        EW.Game.update(dt); 
        EW.Game.render(); 
        requestAnimationFrame(this.gameLoop.bind(this)); 
    }
};

window.addEventListener('DOMContentLoaded', () => EW.Main.boot());