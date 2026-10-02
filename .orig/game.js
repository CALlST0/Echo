// js/game.js
window.EW = window.EW || {};

window.EW.State = {
    mapGrid: [], visGrid: [], wallGlow: [],
    player: null, enemies: [], crystals: [], exitPos: null,
    particles: [], tideEffects: [],
    lives: 3, crystalsCollected: 0, pingCooldownRemaining: 0,
    gameOver: false, gameWon: false, gamePaused: false,
    camera: { x: 0, y: 0, targetX: 0, targetY: 0 },
    canvasW: 800, canvasH: 560, lastTime: 0,
    messageTimer: 0, shakeAmount: 0, frameCount: 0,
    tideRadius: 0, tideMaxRadius: 0, tideDamageTimer: 0, tideWarningPlayed: false,
    tideRetreatTimer: 0, tideRetreatTarget: 0, playerInTide: false, invulnTimer: 0,
    muted: false, crystalAssignmentCounts: new Array(window.EW.Config.TOTAL_CRYSTALS).fill(0),enemiesAllConsumed: false, initialEnemyCount: 0,
    currentFullMessage: '', messageRevealIndex: 0, messageFadeOut: false,
    keys: {}, joyActive: false, joyX: 0, joyY: 0, joyPointerId: null, joyOriginX: 0, joyOriginY: 0,
    acoustic: {
        arrivalTime: null,
        energy: null,
        gradX: null,
        gradY: null,
        currentTime: 0,
        maxTime: 0,
        active: false,
        heapIdx: null,
        heapTime: null,
        heapEnergy: null,
        heapPx: null,
        heapPy: null,
        heapSize: 0
    }
};

window.EW.Game = {
    worldToGrid: function(wx, wy) { return { c: Math.floor(wx / EW.Config.CELL), r: Math.floor(wy / EW.Config.CELL) }; },
    isWall: function(wx, wy) { const { c, r } = this.worldToGrid(wx, wy); const S = EW.State; return r < 0 || r >= EW.Config.MAP_ROWS || c < 0 || c >= EW.Config.MAP_COLS || S.mapGrid[r][c] === 1; },
    isExposedWall: function(c, r) { const S = EW.State; if (r < 0 || r >= EW.Config.MAP_ROWS || c < 0 || c >= EW.Config.MAP_COLS || S.mapGrid[r][c] !== 1) return false; const dirs = [[0,-1],[0,1],[-1,0],[1,0]]; for (const [dc, dr] of dirs) { const nc = c+dc, nr = r+dr; if (nc>=0 && nc<EW.Config.MAP_COLS && nr>=0 && nr<EW.Config.MAP_ROWS && S.mapGrid[nr][nc]===0) return true; } return false; },
    revealCircle: function(wx, wy, radius) { const S = EW.State; const C = EW.Config; const gridR = Math.floor(radius / C.CELL) + 1; const { c: cx, r: cy } = this.worldToGrid(wx, wy); for (let dr = -gridR; dr <= gridR; dr++) for (let dc = -gridR; dc <= gridR; dc++) { const r = cy + dr, c = cx + dc; if (r >= 0 && r < C.MAP_ROWS && c >= 0 && c < C.MAP_COLS) { const dist = Math.hypot(c * C.CELL + C.CELL / 2 - wx, r * C.CELL + C.CELL / 2 - wy); if (dist <= radius) S.visGrid[r][c] = Math.max(S.visGrid[r][c], 1 - dist / radius); } } },
    spawnParticles: function(wx, wy, count, color, speed, life) { const S = EW.State; const C = EW.Config; for (let i = 0; i < count; i++) { if (S.particles.length >= C.PARTICLE_MAX) S.particles.shift(); const angle = Math.random() * Math.PI * 2, spd = speed * (0.4 + Math.random() * 0.6); S.particles.push({ x: wx, y: wy, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: life * (0.5 + Math.random() * 0.5), maxLife: life, color, size: 1.2 + Math.random() * 2.8 }); } },
    updateParticles: function(dt) { const S = EW.State; for (const p of S.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= 0.965; p.vy *= 0.965; } S.particles = S.particles.filter(p => p.life > 0); },
    spawnTideEffect: function() {
        const S = EW.State; const C = EW.Config;
        const cx = C.MAP_COLS / 2 * C.CELL, cy = C.MAP_ROWS / 2 * C.CELL;
        if (S.tideRadius <= 0) return;
        const angle = Math.random() * Math.PI * 2, dist = S.tideRadius + Math.random() * (S.tideMaxRadius - S.tideRadius) * 0.6;
        const x = cx + Math.cos(angle) * dist, y = cy + Math.sin(angle) * dist;
        const r = Math.random();
        let type, vx = 0, vy = 0, life = 1.5 + Math.random() * 1.5;
        if (r < 0.45) { type = 'leaper'; const inward = Math.atan2(cy - y, cx - x); const spd = 50 + Math.random() * 60; vx = Math.cos(inward) * spd; vy = Math.sin(inward) * spd; life = 0.8 + Math.random() * 0.6; }
        else if (r < 0.85) { type = 'swimmer'; const perp = angle + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); const spd = 30 + Math.random() * 50; vx = Math.cos(perp) * spd; vy = Math.sin(perp) * spd; life = 2 + Math.random() * 2; }
        else { type = 'ripple'; life = 1 + Math.random() * 1; }
        S.tideEffects.push({ type, x, y, vx, vy, life, maxLife: life, angle, size: 0.7 + Math.random() * 1.3, trail: [], trailTimer: 0 });
    },
    updateTideEffects: function(dt) {
        const S = EW.State;
        for (const e of S.tideEffects) {
            e.life -= dt;
            if (e.type === 'leaper' || e.type === 'swimmer') {
                e.x += e.vx * dt; e.y += e.vy * dt;
                e.trailTimer += dt;
                if (e.trailTimer > 0.03) { e.trail.push({ x: e.x, y: e.y, life: 0.4 }); if (e.trail.length > 20) e.trail.shift(); e.trailTimer = 0; }
                for (const t of e.trail) t.life -= dt;
                e.trail = e.trail.filter(t => t.life > 0);
            }
            if (e.type === 'leaper' && e.life < 0.3) this.spawnParticles(e.x, e.y, 8, '#9d4edd', 60, 0.5);
        }
        S.tideEffects = S.tideEffects.filter(e => e.life > 0);
        if (!S.gamePaused && !S.gameOver && !S.gameWon && Math.random() < 0.06) this.spawnTideEffect();
    },
    
    computeAcousticField: function(startX, startY) {
        const C = EW.Config;
        const S = EW.State;
        const A = S.acoustic;
        const cols = C.MAP_COLS;
        const rows = C.MAP_ROWS;

        A.arrivalTime.fill(Infinity);
        A.energy.fill(0);
        A.gradX.fill(0);
        A.gradY.fill(0);
        A.heapSize = 0;

        const startC = Math.floor(startX / C.CELL);
        const startR = Math.floor(startY / C.CELL);
        const startIdx = startR * cols + startC;

        A.arrivalTime[startIdx] = 0;
        A.energy[startIdx] = 1.0;
        
        A.heapIdx[0] = startIdx;
        A.heapTime[0] = 0;
        A.heapEnergy[0] = 1.0;
        A.heapPx[0] = startX;
        A.heapPy[0] = startY;
        A.heapSize = 1;

        const dirs = [
            { dc: 1, dr: 0, dist: 1 }, { dc: -1, dr: 0, dist: 1 },
            { dc: 0, dr: 1, dist: 1 }, { dc: 0, dr: -1, dist: 1 },
            { dc: 1, dr: 1, dist: 1.414 }, { dc: -1, dr: -1, dist: 1.414 },
            { dc: 1, dr: -1, dist: 1.414 }, { dc: -1, dr: 1, dist: 1.414 }
        ];

        let maxTime = 0;

        while (A.heapSize > 0) {
            const cIdx = A.heapIdx[0];
            const cTime = A.heapTime[0];
            const cEnergy = A.heapEnergy[0];
            const cPx = A.heapPx[0];
            const cPy = A.heapPy[0];

            A.heapSize--;
            if (A.heapSize > 0) {
                A.heapIdx[0] = A.heapIdx[A.heapSize];
                A.heapTime[0] = A.heapTime[A.heapSize];
                A.heapEnergy[0] = A.heapEnergy[A.heapSize];
                A.heapPx[0] = A.heapPx[A.heapSize];
                A.heapPy[0] = A.heapPy[A.heapSize];
                
                let i = 0;
                while (true) {
                    let l = (i << 1) + 1, r = l + 1, m = i;
                    if (l < A.heapSize && A.heapTime[l] < A.heapTime[m]) m = l;
                    if (r < A.heapSize && A.heapTime[r] < A.heapTime[m]) m = r;
                    if (m !== i) {
                        [A.heapIdx[i], A.heapIdx[m]] = [A.heapIdx[m], A.heapIdx[i]];
                        [A.heapTime[i], A.heapTime[m]] = [A.heapTime[m], A.heapTime[i]];
                        [A.heapEnergy[i], A.heapEnergy[m]] = [A.heapEnergy[m], A.heapEnergy[i]];
                        [A.heapPx[i], A.heapPx[m]] = [A.heapPx[m], A.heapPx[i]];
                        [A.heapPy[i], A.heapPy[m]] = [A.heapPy[m], A.heapPy[i]];
                        i = m;
                    } else break;
                }
            }

            const cr = Math.floor(cIdx / cols);
            const cc = cIdx % cols;

            for (const dir of dirs) {
                const nr = cr + dir.dr;
                const nc = cc + dir.dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                
                if (dir.dist > 1) {
                    if (S.mapGrid[cr + dir.dr][cc] === 1 && S.mapGrid[cr][cc + dir.dc] === 1) continue;
                }

                if (S.mapGrid[nr][nc] === 1) continue; 

                const nIdx = nr * cols + nc;
                const worldDist = dir.dist * C.CELL;
                const newTime = cTime + (worldDist / C.ACOUSTIC_SPEED);
                const dist = newTime * C.ACOUSTIC_SPEED;

                if (dist > C.PING_MAX_RADIUS) continue;

                let spatialFade = 1.0;
                const fadeStart = C.PING_MAX_RADIUS * C.PING_EDGE_FADE_START;
                if (dist > fadeStart) {
                    spatialFade = 1.0 - (dist - fadeStart) / (C.PING_MAX_RADIUS - fadeStart);
                }

                const newEnergy = cEnergy * C.ACOUSTIC_ENERGY_DECAY * spatialFade;

                if (newTime < A.arrivalTime[nIdx]) {
                    A.arrivalTime[nIdx] = newTime;
                    A.energy[nIdx] = newEnergy;
                    
                    const dx = cPx - (nc * C.CELL + C.CELL / 2);
                    const dy = cPy - (nr * C.CELL + C.CELL / 2);
                    const len = Math.hypot(dx, dy) || 1;
                    A.gradX[nIdx] = dx / len;
                    A.gradY[nIdx] = dy / len;

                    let i = A.heapSize++;
                    A.heapIdx[i] = nIdx;
                    A.heapTime[i] = newTime;
                    A.heapEnergy[i] = newEnergy;
                    A.heapPx[i] = nc * C.CELL + C.CELL / 2;
                    A.heapPy[i] = nr * C.CELL + C.CELL / 2;
                    
                    while (i > 0) {
                        const p = (i - 1) >> 1;
                        if (A.heapTime[i] < A.heapTime[p]) {
                            [A.heapIdx[i], A.heapIdx[p]] = [A.heapIdx[p], A.heapIdx[i]];
                            [A.heapTime[i], A.heapTime[p]] = [A.heapTime[p], A.heapTime[i]];
                            [A.heapEnergy[i], A.heapEnergy[p]] = [A.heapEnergy[p], A.heapEnergy[i]];
                            [A.heapPx[i], A.heapPx[p]] = [A.heapPx[p], A.heapPx[i]];
                            [A.heapPy[i], A.heapPy[p]] = [A.heapPy[p], A.heapPy[i]];
                            i = p;
                        } else break;
                    }
                    
                    if (newTime > maxTime) maxTime = newTime;
                }
            }
        }
        A.maxTime = maxTime;
        A.currentTime = 0;
        A.active = true;
    },

    emitPing: function() {
        const S = EW.State; const C = EW.Config;
        if (S.pingCooldownRemaining > 0 || S.gameOver || S.gameWon || S.gamePaused) return;
        
        S.pingCooldownRemaining = C.PING_COOLDOWN;
        
        this.spawnParticles(S.player.x, S.player.y, 35, '#5ce1e6', 170, 0.65);
        S.shakeAmount = Math.max(S.shakeAmount, 2.8);
        EW.audio.playPing();
        
        this.computeAcousticField(S.player.x, S.player.y);
    },

    updateAcoustics: function(dt) {
        const S = EW.State; const C = EW.Config;
        
        if (S.acoustic.active) {
            S.acoustic.currentTime += dt;
            
            // Keep active until the visual decay of the last wavefront is completely finished
            if (S.acoustic.currentTime > S.acoustic.maxTime + C.ACOUSTIC_VISUAL_DECAY_DURATION) {
                S.acoustic.active = false;
            } else {
                // Only populate visGrid and wallGlow while the wave is actually propagating
                if (S.acoustic.currentTime <= S.acoustic.maxTime) {
                    const timeWindow = C.ACOUSTIC_VISUAL_WINDOW;
                    const tCurrent = S.acoustic.currentTime;
                    
                    for (let r = 0; r < C.MAP_ROWS; r++) {
                        for (let c = 0; c < C.MAP_COLS; c++) {
                            const idx = r * C.MAP_COLS + c;
                            const t = S.acoustic.arrivalTime[idx];
                            
                            if (t < Infinity && Math.abs(tCurrent - t) < timeWindow) {
                                const energy = S.acoustic.energy[idx];
                                
                                S.visGrid[r][c] = Math.max(S.visGrid[r][c], 0.8 * energy); 
                                
                                const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
                                for (const [dc, dr] of dirs) {
                                    const nr = r + dr, nc = c + dc;
                                    if (nr >= 0 && nr < C.MAP_ROWS && nc >= 0 && nc < C.MAP_COLS) {
                                        if (S.mapGrid[nr][nc] === 1) {
                                            S.wallGlow[nr][nc] = Math.max(S.wallGlow[nr][nc], energy); 
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        for (let r = 0; r < C.MAP_ROWS; r++) {
            for (let c = 0; c < C.MAP_COLS; c++) {
                if (S.wallGlow[r][c] > 0) {
                    S.wallGlow[r][c] = Math.max(0, S.wallGlow[r][c] - C.WALL_GLOW_DECAY * dt);
                }
            }
        }
    },

    updateVisibility: function(dt) { const S = EW.State; const C = EW.Config; for (let r = 0; r < C.MAP_ROWS; r++) for (let c = 0; c < C.MAP_COLS; c++) S.visGrid[r][c] = Math.max(0, S.visGrid[r][c] - C.VISIBILITY_DECAY * dt); },

    updateEnemies: function(dt) {
        const S = EW.State; const C = EW.Config;
        const spdMult = C.settings.enemySpeedMult;
        const centerX = C.MAP_COLS / 2 * C.CELL;
        const centerY = C.MAP_ROWS / 2 * C.CELL;
        const rep = C.settings.repulsionStrength;

        for (let i = 0; i < S.enemies.length; i++) {
            for (let j = i + 1; j < S.enemies.length; j++) {
                const a = S.enemies[i], b = S.enemies[j],
                    dx = a.x - b.x, dy = a.y - b.y,
                    dist = Math.hypot(dx, dy) || 0.01;
                if (dist < C.SEPARATION_RADIUS) {
                    const f = rep * (C.SEPARATION_RADIUS - dist) / C.SEPARATION_RADIUS * C.SEPARATION_FORCE_MULT;
                    a.vx += (dx / dist) * f * dt;
                    a.vy += (dy / dist) * f * dt;
                    b.vx -= (dx / dist) * f * dt;
                    b.vy -= (dy / dist) * f * dt;
                }
            }
        }

        for (let i = S.enemies.length - 1; i >= 0; i--) {
            const e = S.enemies[i];

            if (S.acoustic.active) {
                const cellIdx = Math.floor(e.y / C.CELL) * C.MAP_COLS + Math.floor(e.x / C.CELL);
                const timeArrived = S.acoustic.arrivalTime[cellIdx];
                const energy = S.acoustic.energy[cellIdx];

                if (S.acoustic.currentTime >= timeArrived && S.acoustic.currentTime - dt < timeArrived) {
                    if (energy > 0.05) {
                        if (e.stunnedTimer <= 0) {
                            e.state = 'alerted';
                            e.alertTarget = { x: S.player.x, y: S.player.y };
                        }
                        if (timeArrived * C.ACOUSTIC_SPEED < C.CELL * 4) {
                            e.stunnedTimer = 0.35;
                            e.vx *= 0.2;
                            e.vy *= 0.2;
                        }
                    }
                }
            }

            const distToCenter = Math.hypot(e.x - centerX, e.y - centerY);
            if (distToCenter > S.tideRadius && !e.tideConsuming) {
                e.tideConsuming = true;
                e.tideConsumeTimer = C.ENEMY_CONSUME_DURATION;
                EW.audio.playEnemyConsumed();
            }
            if (distToCenter <= S.tideRadius && e.tideConsuming) {
                e.tideConsuming = false;
                e.tideConsumeTimer = 0;
            }
            if (e.tideConsuming) {
                e.tideConsumeTimer -= dt;
                if (e.tideConsumeTimer <= 0) {
                    if (e.preferredCrystal >= 0 && e.preferredCrystal < S.crystals.length)
                        S.crystalAssignmentCounts[e.preferredCrystal] = Math.max(0, S.crystalAssignmentCounts[e.preferredCrystal] - 1);
                    S.enemies.splice(i, 1);
                    continue;
                }
                for (let j = 0; j < 5; j++) {
                    const angle = Math.random() * Math.PI * 2, radius = C.CELL * 1.2 * (0.5 + Math.random() * 0.5);
                    const px = e.x + Math.cos(angle) * radius, py = e.y + Math.sin(angle) * radius;
                    const dirToEnemy = Math.atan2(e.y - py, e.x - px), spd = 90 + Math.random() * 70;
                    if (S.particles.length < C.PARTICLE_MAX) S.particles.push({ x: px, y: py, vx: Math.cos(dirToEnemy) * spd, vy: Math.sin(dirToEnemy) * spd, life: 0.3 + Math.random() * 0.25, maxLife: 0.3 + Math.random() * 0.25, color: '#e63946', size: 0.8 + Math.random() * 2.2 });
                }
            }

            if (e.stunnedTimer > 0) {
                e.stunnedTimer -= dt;
                e.vx *= Math.exp(-dt * 8);
                e.vy *= Math.exp(-dt * 8);
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                if (this.isWall(e.x, e.y)) { e.x -= e.vx * dt; e.y -= e.vy * dt; e.vx = 0; e.vy = 0; }
                e.stuckTimer = 0;
                continue;
            }

            const prevX = e.x, prevY = e.y;
            
            e.ignorePlayerTimer = Math.max(0, (e.ignorePlayerTimer || 0) - dt);

            const distToPlayer = Math.hypot(e.x - S.player.x, e.y - S.player.y);
            const grid = this.worldToGrid(e.x, e.y);
            const visible = distToPlayer < 3.2 * C.CELL && S.visGrid[grid.r]?.[grid.c] > 0.3;
            
            if (visible && e.state !== 'hunting' && e.ignorePlayerTimer <= 0) { 
                e.state = 'hunting'; 
                e.idleTimer = 0; 
            }
            if (e.state === 'alerted' && e.alertTarget && Math.hypot(e.x - e.alertTarget.x, e.y - e.alertTarget.y) < C.CELL * 3) {
                e.state = 'idle';
                e.alertTarget = null;
                e.idleTimer = 1 + Math.random() * 2;
            }
            if (e.state === 'hunting' && (!visible || e.ignorePlayerTimer > 0) && distToPlayer > 3.8 * C.CELL) {
                e.state = 'alerted';
                e.alertTarget = { x: S.player.x, y: S.player.y };
            }

            let speed, targetAngle;

            if (e.escapeTimer > 0) {
                e.escapeTimer -= dt;
                speed = 80 * spdMult;
                targetAngle = e.idleAngle;
            } else if (e.state === 'idle') {
                speed = 35 * spdMult;
                e.idleTimer -= dt;
                if (e.idleTimer <= 0) {
                    e.idleAngle = Math.random() * Math.PI * 2;
                    e.idleTimer = 2.5 + Math.random() * 5.0; 
                    EW.Map.assignEnemyCrystal(e, true);
                }
                targetAngle = e.idleAngle;

                const lookAhead = speed * dt * 2.5;
                const futureX = e.x + Math.cos(targetAngle) * lookAhead;
                const futureY = e.y + Math.sin(targetAngle) * lookAhead;
                const futureDist = Math.hypot(futureX - centerX, futureY - centerY);
                if (futureDist > S.tideRadius - C.CELL * 1.2) {
                    const inwardAngle = Math.atan2(centerY - e.y, centerX - e.x);
                    targetAngle = inwardAngle * 0.7 + targetAngle * 0.3;
                    if (distToCenter > S.tideRadius - C.CELL * 0.5) {
                        targetAngle = inwardAngle;
                    }
                }

                if (e.preferredCrystal >= 0 && e.preferredCrystal < S.crystals.length) {
                    e.ignoreCrystalTimer -= dt;
                    if (e.ignoreCrystalTimer <= 0 && Math.random() < 0.15 * dt) {
                        e.ignoreCrystalTimer = 1.2 + Math.random() * 2.0;
                    }
                    const c = S.crystals[e.preferredCrystal];
                    if (c && !c.collected && e.ignoreCrystalTimer <= 0) {
                        const dx = c.x - e.x, dy = c.y - e.y, dist = Math.hypot(dx, dy);
                        const crystalAngle = Math.atan2(dy, dx);
                        if (dist > C.CELL * 2.5) {
                            targetAngle = targetAngle * (1 - C.CRYSTAL_ATTRACTION_WEIGHT) + crystalAngle * C.CRYSTAL_ATTRACTION_WEIGHT;
                        }
                    } else if (!c || c.collected) {
                        EW.Map.assignEnemyCrystal(e, true);
                    }
                }

                if (e.preferredCrystal >= 0 && e.preferredCrystal < S.crystals.length) {
                    const c = S.crystals[e.preferredCrystal];
                    if (c && !c.collected) {
                        const dx = c.x - e.x, dy = c.y - e.y, dist = Math.hypot(dx, dy);
                        const crystalAngle = Math.atan2(dy, dx);
                        e.crystalMoteTimer += dt;
                        if (e.crystalMoteTimer > 0.35 && dist < C.CELL * 10 && dist > C.CELL * 2) {
                            e.crystalMoteTimer = 0;
                            const spawnDist = C.CELL * 0.85;
                            const moteX = e.x + Math.cos(crystalAngle) * spawnDist;
                            const moteY = e.y + Math.sin(crystalAngle) * spawnDist;
                            const moteSpd = 15 + Math.random() * 15;
                            if (S.particles.length < C.PARTICLE_MAX) S.particles.push({
                                x: moteX, y: moteY,
                                vx: Math.cos(crystalAngle + (Math.random() - 0.5) * 0.6) * moteSpd,
                                vy: Math.sin(crystalAngle + (Math.random() - 0.5) * 0.6) * moteSpd,
                                life: 0.2 + Math.random() * 0.15, maxLife: 0.2 + Math.random() * 0.15,
                                color: '#ffb142', size: 0.3 + Math.random() * 0.7
                            });
                        }
                    }
                }

            } else if (e.state === 'alerted' && e.alertTarget) {
                speed = 95 * spdMult;
                targetAngle = Math.atan2(e.alertTarget.y - e.y, e.alertTarget.x - e.x);
            } else if (e.state === 'hunting') {
                speed = 145 * spdMult;
                targetAngle = Math.atan2(S.player.y - e.y, S.player.x - e.x);
            } else {
                speed = 35 * spdMult;
                targetAngle = e.idleAngle;
            }

            let crowdX = 0, crowdY = 0, closeNeighbors = 0;
            for (const other of S.enemies) {
                if (other === e) continue;
                const dx = e.x - other.x, dy = e.y - other.y, dist = Math.hypot(dx, dy);
                if (dist < C.CROWD_AVOID_RADIUS && dist > 0.01) {
                    const strength = (1 - dist / C.CROWD_AVOID_RADIUS) * 1.5;
                    crowdX += (dx / dist) * strength;
                    crowdY += (dy / dist) * strength;
                    if (dist < C.CELL * 4) closeNeighbors++;
                }
            }
            const crowdLen = Math.hypot(crowdX, crowdY);
            
            if (closeNeighbors >= 2 && Math.random() < 0.25 * dt) {
                EW.Map.assignEnemyCrystal(e, true);
            }
            
            if (crowdLen > 0.05 && e.escapeTimer <= 0) {
                const crowdAngle = Math.atan2(crowdY, crowdX);
                const blendWeight = Math.min(1.0, crowdLen) * C.CROWD_AVOID_WEIGHT;
                targetAngle = Math.atan2(
                    Math.sin(targetAngle) * (1 - blendWeight) + Math.sin(crowdAngle) * blendWeight,
                    Math.cos(targetAngle) * (1 - blendWeight) + Math.cos(crowdAngle) * blendWeight
                );
            }

            if (e.escapeTimer <= 0) {
                const feelDist = C.CELL * 1.2;
                const hit = this.isWall(e.x + Math.cos(targetAngle) * feelDist, e.y + Math.sin(targetAngle) * feelDist);
                if (hit) {
                    const sweeps = [0.785, -0.785, 1.57, -1.57, 2.356, -2.356];
                    let bestA = null, bestDelta = Infinity;
                    for (const sweep of sweeps) {
                        const testA = targetAngle + sweep;
                        if (!this.isWall(e.x + Math.cos(testA) * feelDist, e.y + Math.sin(testA) * feelDist)) {
                            const absDelta = Math.abs(sweep);
                            if (absDelta < bestDelta) { bestDelta = absDelta; bestA = testA; }
                        }
                    }
                    if (bestA !== null) targetAngle = bestA;
                }
            }

            let curAngle = Math.atan2(e.vy || 0.001, e.vx || 0.001);
            let diff = targetAngle - curAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            curAngle += diff * Math.min(dt * 6, 1);
            e.vx = Math.cos(curAngle) * speed;
            e.vy = Math.sin(curAngle) * speed;

            const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
            if (!this.isWall(nx, e.y)) {
                e.x = nx;
            } else {
                e.vx = 0;
            }
            if (!this.isWall(e.x, ny)) {
                e.y = ny;
            } else {
                e.vy = 0;
            }

            if (Math.abs(e.vx) > 0.01 || Math.abs(e.vy) > 0.01) {
                e.idleAngle = Math.atan2(e.vy, e.vx);
            }

            if (!e.tideConsuming) {
                const moved = Math.hypot(e.x - prevX, e.y - prevY);
                const expectedMove = speed * dt;
                
                if (moved < expectedMove * 0.3) {
                    e.stuckTimer += dt;
                } else {
                    e.stuckTimer = Math.max(0, e.stuckTimer - dt * 1.5);
                }
                
                if (!e.lastRegionPos) e.lastRegionPos = { x: e.x, y: e.y };
                const regionDist = Math.hypot(e.x - e.lastRegionPos.x, e.y - e.lastRegionPos.y);
                if (regionDist > C.CELL * 2) {
                    e.lastRegionPos = { x: e.x, y: e.y };
                    e.regionStuckTimer = 0;
                } else {
                    e.regionStuckTimer += dt;
                    if (e.regionStuckTimer > 1.0 && e.lastStuckRecovery < performance.now() - 600) {
                        let bestDx = 0, bestDy = 0, bestDist = Infinity;
                        const srGridR = Math.ceil(C.CELL * 4 / C.CELL) + 1;
                        const sgx = Math.floor(e.x / C.CELL), sgy = Math.floor(e.y / C.CELL);
                        for (let dr = -srGridR; dr <= srGridR; dr++) {
                            for (let dc = -srGridR; dc <= srGridR; dc++) {
                                const nr = sgy + dr, nc = sgx + dc;
                                if (nr < 0 || nr >= C.MAP_ROWS || nc < 0 || nc >= C.MAP_COLS) continue;
                                if (S.mapGrid[nr][nc] !== 0) continue;
                                const wx = nc * C.CELL + C.CELL / 2, wy = nr * C.CELL + C.CELL / 2;
                                const dx = wx - e.x, dy = wy - e.y;
                                const d = Math.hypot(dx, dy);
                                if (d > C.CELL * 0.3 && d < bestDist) {
                                    bestDist = d;
                                    bestDx = dx / d;
                                    bestDy = dy / d;
                                }
                            }
                        }
                        if (bestDist < Infinity) {
                            e.idleAngle = Math.atan2(bestDy, bestDx);
                        } else {
                            e.idleAngle = Math.random() * Math.PI * 2;
                        }
                        const joltSpeed = 70 * spdMult;
                        e.vx = Math.cos(e.idleAngle) * joltSpeed;
                        e.vy = Math.sin(e.idleAngle) * joltSpeed;
                        e.stuckTimer = -0.2;
                        e.lastStuckRecovery = performance.now();
                        e.ignorePlayerTimer = 1.5; 
                        e.escapeTimer = 1.5; 
                        e.state = 'idle';
                        e.alertTarget = null;
                        EW.Map.assignEnemyCrystal(e, true);
                        e.regionStuckTimer = 0;
                        e.lastRegionPos = { x: e.x, y: e.y };
                    }
                }
                
                if (e.stuckTimer > 0.45 && e.lastStuckRecovery < performance.now() - 600) {
                    let bestDx = 0, bestDy = 0, bestDist = Infinity;
                    const srGridR = Math.ceil(C.CELL * 4 / C.CELL) + 1;
                    const sgx = Math.floor(e.x / C.CELL), sgy = Math.floor(e.y / C.CELL);
                    for (let dr = -srGridR; dr <= srGridR; dr++) {
                        for (let dc = -srGridR; dc <= srGridR; dc++) {
                            const nr = sgy + dr, nc = sgx + dc;
                            if (nr < 0 || nr >= C.MAP_ROWS || nc < 0 || nc >= C.MAP_COLS) continue;
                            if (S.mapGrid[nr][nc] !== 0) continue;
                            const wx = nc * C.CELL + C.CELL / 2, wy = nr * C.CELL + C.CELL / 2;
                            const dx = wx - e.x, dy = wy - e.y;
                            const d = Math.hypot(dx, dy);
                            if (d > C.CELL * 0.3 && d < bestDist) {
                                bestDist = d;
                                bestDx = dx / d;
                                bestDy = dy / d;
                            }
                        }
                    }
                    if (bestDist < Infinity) {
                        e.idleAngle = Math.atan2(bestDy, bestDx);
                    } else {
                        e.idleAngle = Math.random() * Math.PI * 2;
                    }
                    const joltSpeed = 70 * spdMult;
                    e.vx = Math.cos(e.idleAngle) * joltSpeed;
                    e.vy = Math.sin(e.idleAngle) * joltSpeed;
                    e.stuckTimer = -0.2;
                    e.lastStuckRecovery = performance.now();
                    e.ignorePlayerTimer = 1.5; 
                    e.escapeTimer = 1.5; 
                    e.state = 'idle';
                    e.alertTarget = null;
                    EW.Map.assignEnemyCrystal(e, true);
                }
            }
        }

        if (!S.enemiesAllConsumed && S.initialEnemyCount > 0 && S.enemies.length === 0 && !S.gameOver) {
            S.enemiesAllConsumed = true;
            S.tideRetreatTarget = Math.min(S.tideMaxRadius, S.tideRadius + 15 * C.CELL);
            S.tideRetreatTimer = 5.0;
            EW.DOM.achievementEl.textContent = 'Tide\'s Hunger Sated';
            EW.DOM.achievementEl.classList.add('show');
            setTimeout(() => EW.DOM.achievementEl.classList.remove('show'), 4000);
            this.setMessage('The Tide Hesitates…', 3.5);
        }
    },

    updateHUD: function() {
        const S = EW.State; const C = EW.Config; const D = EW.DOM;
        D.crystalCountEl.textContent = S.crystalsCollected + ' / ' + C.TOTAL_CRYSTALS;
        D.livesCountEl.textContent = Array.from({ length: C.TOTAL_LIVES }, (_, i) => i < S.lives ? '♥' : '♡').join(' ');
        const dist = Math.hypot(S.player.x - C.MAP_COLS / 2 * C.CELL, S.player.y - C.MAP_ROWS / 2 * C.CELL);
        if (dist > S.tideRadius) { D.tideStatusEl.textContent = 'IN TIDE!'; D.tideHudEl.classList.add('tide-warning'); }
        else if (S.tideRadius < S.tideMaxRadius * 0.5) { D.tideStatusEl.textContent = 'Tide Closing'; D.tideHudEl.classList.add('tide-warning'); }
        else { D.tideStatusEl.textContent = 'Tide Rising'; D.tideHudEl.classList.remove('tide-warning'); }
    },

    setMessage: function(text, duration = 0) {
        const S = EW.State; const D = EW.DOM;
        S.currentFullMessage = text;
        S.messageRevealIndex = 0;
        S.messageTimer = duration;
        S.messageFadeOut = false;
        D.messageEl.style.opacity = '1';
        D.messageEl.classList.remove('hidden');
        if (text === '') {
            D.messageEl.classList.add('hidden');
            D.messageEl.textContent = '';
        }
    },

    updateMessage: function(dt) {
        const S = EW.State; const C = EW.Config; const D = EW.DOM;
        if (S.currentFullMessage && S.messageRevealIndex < S.currentFullMessage.length) {
            S.messageRevealIndex = Math.min(S.currentFullMessage.length, S.messageRevealIndex + dt * C.MESSAGE_REVEAL_SPEED);
            D.messageEl.textContent = S.currentFullMessage.substring(0, Math.floor(S.messageRevealIndex));
        }
    },

    initGame: function() {
        const S = EW.State; const C = EW.Config; const D = EW.DOM;
        
        const size = C.MAP_COLS * C.MAP_ROWS;
        S.acoustic.arrivalTime = new Float32Array(size);
        S.acoustic.energy = new Float32Array(size);
        S.acoustic.gradX = new Float32Array(size);
        S.acoustic.gradY = new Float32Array(size);
        S.acoustic.heapIdx = new Uint16Array(C.ACOUSTIC_MAX_HEAP);
        S.acoustic.heapTime = new Float32Array(C.ACOUSTIC_MAX_HEAP);
        S.acoustic.heapEnergy = new Float32Array(C.ACOUSTIC_MAX_HEAP);
        S.acoustic.heapPx = new Float32Array(C.ACOUSTIC_MAX_HEAP);
        S.acoustic.heapPy = new Float32Array(C.ACOUSTIC_MAX_HEAP);
        S.acoustic.active = false;

        const startPos = EW.Map.generateMap();
        S.player = { x: startPos.x, y: startPos.y, vx: 0, vy: 0, radius: C.PLAYER_RADIUS, trailPositions: [] };
        S.visGrid = Array.from({ length: C.MAP_ROWS }, () => Array(C.MAP_COLS).fill(0));
        S.wallGlow = Array.from({ length: C.MAP_ROWS }, () => Array(C.MAP_COLS).fill(0));
        S.particles = [];
        S.tideEffects = [];
        S.lives = C.TOTAL_LIVES;
        S.crystalsCollected = 0;
        S.crystals.forEach(c => c.collected = false);
        S.pingCooldownRemaining = 0;
        S.gameOver = false;
        S.gameWon = false;
        S.shakeAmount = 0;
        S.messageTimer = 0;
        S.tideRadius = S.tideMaxRadius;
        S.tideDamageTimer = 0;
        S.tideWarningPlayed = false;
        S.tideRetreatTimer = 0;
        S.tideRetreatTarget = 0;
        S.playerInTide = false;
        S.invulnTimer = 0;
        this.setMessage('', 0);
        D.tideHudEl.classList.remove('tide-warning');
        D.tideStatusEl.textContent = 'Tide Rising';
        D.achievementEl.classList.remove('show');
        this.updateHUD();
        this.revealCircle(S.player.x, S.player.y, C.PLAYER_GLOW_CELLS * C.CELL);
        S.camera.x = S.player.x;
        S.camera.y = S.player.y;
        S.camera.targetX = S.player.x;
        S.camera.targetY = S.player.y;
    },

    update: function(dt) {
        const S = EW.State; const C = EW.Config;
        if (S.gamePaused) return;
        
        const realDt = Math.min(dt, 0.15);
        let mx = 0, my = 0;
        if (S.joyActive) { mx = S.joyX; my = S.joyY; }
        else {
            if (S.keys['ArrowLeft'] || S.keys['KeyA'] || S.keys['left']) mx = -1;
            if (S.keys['ArrowRight'] || S.keys['KeyD'] || S.keys['right']) mx = 1;
            if (S.keys['ArrowUp'] || S.keys['KeyW'] || S.keys['up']) my = -1;
            if (S.keys['ArrowDown'] || S.keys['KeyS'] || S.keys['down']) my = 1;
            if (mx || my) { const len = Math.hypot(mx, my); mx /= len; my /= len; }
        }
        const pSpeed = C.PLAYER_SPEED * C.settings.playerSpeedMult;
        S.player.vx += (mx * pSpeed - S.player.vx) * Math.min(realDt * 9, 1);
        S.player.vy += (my * pSpeed - S.player.vy) * Math.min(realDt * 9, 1);
        const nx = S.player.x + S.player.vx * realDt, ny = S.player.y + S.player.vy * realDt;
        if (!this.isWall(nx, S.player.y)) S.player.x = nx; else S.player.vx *= -0.2;
        if (!this.isWall(S.player.x, ny)) S.player.y = ny; else S.player.vy *= -0.2;
        S.player.x = Math.max(C.CELL, Math.min(C.WORLD_W - C.CELL, S.player.x));
        S.player.y = Math.max(C.CELL, Math.min(C.WORLD_H - C.CELL, S.player.y));
        if (Math.hypot(S.player.vx, S.player.vy) > 10) {
            S.player.trailPositions.push({ x: S.player.x, y: S.player.y, life: 1.3 });
            if (S.player.trailPositions.length > 75) S.player.trailPositions.shift();
        }
        for (const t of S.player.trailPositions) t.life -= realDt;
        S.player.trailPositions = S.player.trailPositions.filter(t => t.life > 0);
        this.revealCircle(S.player.x, S.player.y, C.PLAYER_GLOW_CELLS * C.CELL);
        this.updateAcoustics(realDt);
        this.updateVisibility(realDt);
        if (S.pingCooldownRemaining > 0) S.pingCooldownRemaining -= realDt;
        if (!S.gameOver && !S.gameWon) {
            this.updateEnemies(realDt);
            this.updateTideEffects(realDt);
            const centerX = C.MAP_COLS / 2 * C.CELL, centerY = C.MAP_ROWS / 2 * C.CELL;
            if (S.tideRetreatTimer > 0) {
                S.tideRetreatTimer -= realDt;
                if (S.tideRadius < S.tideRetreatTarget) { S.tideRadius += (S.tideRetreatTarget - S.tideRadius) * 3 * realDt; if (S.tideRadius > S.tideRetreatTarget) S.tideRadius = S.tideRetreatTarget; }
            } else {
                S.tideRadius = Math.max(0, S.tideRadius - C.settings.tideSpeed * C.CELL * realDt);
            }
            const playerDist = Math.hypot(S.player.x - centerX, S.player.y - centerY);
            S.playerInTide = (playerDist > S.tideRadius);
            if (S.invulnTimer > 0) { S.invulnTimer -= realDt; S.tideDamageTimer = 0; }
            else if (S.playerInTide) {
                S.tideDamageTimer += realDt;
                if (!S.tideWarningPlayed && S.tideDamageTimer > 0.3) { EW.audio.playTideWarning(); S.tideWarningPlayed = true; }
                if (S.tideDamageTimer >= C.TIDE_DAMAGE_INTERVAL) {
                    S.tideDamageTimer = 0; S.lives--;
                    this.spawnParticles(S.player.x, S.player.y, 30, '#9d4edd', 150, 0.9);
                    S.shakeAmount = 7;
                    EW.audio.playDamage();
                    this.updateHUD();
                    if (S.lives <= 0) { S.gameOver = true; this.setMessage('Consumed by the Tide...', 3); EW.audio.playTideDeath(); }
                }
                for (let j = 0; j < 2; j++) {
                    const angle = Math.random() * Math.PI * 2, dist = C.CELL * 0.8 + Math.random() * C.CELL * 1.2;
                    const px = S.player.x + Math.cos(angle) * dist, py = S.player.y + Math.sin(angle) * dist;
                    if (S.particles.length < C.PARTICLE_MAX) S.particles.push({ x: px, y: py, vx: Math.cos(angle) * 15 + (Math.random() - 0.5) * 30, vy: Math.sin(angle) * 15 + (Math.random() - 0.5) * 30, life: 0.4 + Math.random() * 0.3, maxLife: 0.4 + Math.random() * 0.3, color: '#9d4edd', size: 0.8 + Math.random() * 1.8 });
                }
            } else { S.tideDamageTimer = 0; S.tideWarningPlayed = false; }
            for (const c of S.crystals) {
                if (!c.collected && Math.hypot(S.player.x - c.x, S.player.y - c.y) < C.CELL * 1.4) {
                    c.collected = true; S.crystalsCollected++;
                    this.spawnParticles(c.x, c.y, 45, '#ffb142', 160, 1.0);
                    this.revealCircle(c.x, c.y, C.CELL * 7);
                    S.shakeAmount = Math.max(S.shakeAmount, 2.2);
                    EW.audio.playCrystalCollect();
                    for (const en of S.enemies) {
                        EW.Map.assignEnemyCrystal(en, true);
                    }
                    this.updateHUD();
                    if (S.crystalsCollected >= C.TOTAL_CRYSTALS) { this.spawnParticles(S.exitPos.x, S.exitPos.y, 60, '#ff69b4', 230, 1.6); this.revealCircle(S.exitPos.x, S.exitPos.y, C.CELL * 10); EW.audio.playExitReveal(); }
                }
            }
            if (S.crystalsCollected >= C.TOTAL_CRYSTALS && Math.hypot(S.player.x - S.exitPos.x, S.player.y - S.exitPos.y) < C.CELL * 1.8) {
                S.gameWon = true; this.setMessage(' Light Found! You Escaped ', 4.5);
                this.spawnParticles(S.player.x, S.player.y, 120, '#ff69b4', 280, 2.8);
                S.shakeAmount = 10;
                EW.audio.playVictory();
            }
            for (const e of S.enemies) {
                if (Math.hypot(S.player.x - e.x, S.player.y - e.y) < C.CELL * 1.0 && e.stunnedTimer <= 0 && !e.tideConsuming) {
                    S.lives--; this.spawnParticles(S.player.x, S.player.y, 50, '#ff5252', 210, 1.2);
                    S.shakeAmount = 12; EW.audio.playDamage(); this.updateHUD();
                    if (S.lives <= 0) { S.gameOver = true; this.setMessage('Darkness takes you...', 3); EW.audio.playDarknessDeath(); }
                    else {
                        const safe = EW.Map.findSafeRespawn();
                        S.player.x = safe.x; S.player.y = safe.y; S.player.vx = 0; S.player.vy = 0; S.player.trailPositions = [];
                        S.invulnTimer = 1.5;
                        for (let r = 0; r < C.MAP_ROWS; r++) for (let c = 0; c < C.MAP_COLS; c++) S.visGrid[r][c] *= 0.3;
                        this.revealCircle(S.player.x, S.player.y, C.PLAYER_GLOW_CELLS * C.CELL);
                        S.enemies.forEach(en => { en.state = 'idle'; en.alertTarget = null; en.stunnedTimer = 0; });
                        this.setMessage('Lost… but you persist', 3.8);
                    }
                    break;
                }
            }
        } else { this.updateTideEffects(realDt); }
        S.messageTimer -= realDt;
        this.updateMessage(realDt);
        if (S.currentFullMessage && S.messageRevealIndex >= S.currentFullMessage.length && S.messageTimer > 0) {
            const fadeProgress = Math.min(1, S.messageTimer / C.MESSAGE_FADE_DURATION);
            EW.DOM.messageEl.style.opacity = fadeProgress;
        }
        if (S.messageTimer <= 0 && S.currentFullMessage) {
            EW.DOM.messageEl.classList.add('hidden'); EW.DOM.messageEl.textContent = ''; S.currentFullMessage = '';
            if (S.gameOver && S.lives <= 0) this.initGame();
            else if (S.gameWon) this.initGame();
        }
        this.updateParticles(realDt);
        S.shakeAmount *= Math.exp(-realDt * C.SHAKE_DECAY);
        S.camera.targetX = S.player.x; S.camera.targetY = S.player.y;
        S.camera.x += (S.camera.targetX - S.camera.x) * Math.min(realDt * C.CAMERA_SMOOTH, 1);
        S.camera.y += (S.camera.targetY - S.camera.y) * Math.min(realDt * C.CAMERA_SMOOTH, 1);
        if (S.shakeAmount < 0.05) S.shakeAmount = 0;
        this.updateHUD();
    },

    render: function() {
        const S = EW.State; const C = EW.Config; const D = EW.DOM;
        const ctx = D.ctx;
        ctx.clearRect(0, 0, S.canvasW, S.canvasH);
        const shakeX = (Math.random() - 0.5) * S.shakeAmount * 2.2, shakeY = (Math.random() - 0.5) * S.shakeAmount * 2.2;
        if (S.shakeAmount > 6) D.canvas.classList.add('shake-heavy'); else D.canvas.classList.remove('shake-heavy');
        ctx.save();
        ctx.translate(shakeX, shakeY);
        const scaleX = S.canvasW / C.WORLD_W, scaleY = S.canvasH / C.WORLD_H;
        const viewLeft = S.camera.x - S.canvasW / 2 / scaleX, viewTop = S.camera.y - S.canvasH / 2 / scaleY;
        const gridLeft = Math.max(0, Math.floor(viewLeft / C.CELL) - 1), gridTop = Math.max(0, Math.floor(viewTop / C.CELL) - 1);
        const gridRight = Math.min(C.MAP_COLS - 1, Math.ceil((S.camera.x + S.canvasW / 2 / scaleX) / C.CELL) + 1), gridBottom = Math.min(C.MAP_ROWS - 1, Math.ceil((S.camera.y + S.canvasH / 2 / scaleY) / C.CELL) + 1);
        const offsetX = S.canvasW / 2 - S.camera.x * scaleX, offsetY = S.canvasH / 2 - S.camera.y * scaleY;

        for (let r = gridTop; r <= gridBottom; r++)
            for (let c = gridLeft; c <= gridRight; c++) {
                const vis = S.visGrid[r][c], glow = S.wallGlow[r][c] || 0;
                if (vis < 0.01 && glow < 0.01) continue;
                let sx = c * C.CELL * scaleX + offsetX, sy = r * C.CELL * scaleY + offsetY, sw = C.CELL * scaleX + 0.5, sh = C.CELL * scaleY + 0.5;
                if (S.mapGrid[r][c] === 1) {
                    const b = Math.min(1, vis * 1.15);
                    let rr = Math.floor(28 * b), gg = Math.floor(18 * b), bb = Math.floor(38 * b);
                    if (glow > 0.01) { 
                        const p = Math.min(1, glow * 1.5); 
                        
                        // Dynamic target color: shifts to pure white at max energy
                        const targetR = Math.floor(200 + 55 * glow);
                        const targetG = Math.floor(230 + 25 * glow);
                        const targetB = 255;
                        
                        rr = Math.floor(rr + (targetR - rr) * p); 
                        gg = Math.floor(gg + (targetG - gg) * p); 
                        bb = Math.floor(bb + (targetB - bb) * p); 
                        
                        // Squared curve for tremble: weak pulses have almost zero tremble
                        const trembleAmt = glow * glow * 6.0;
                        sx += (Math.random() - 0.5) * trembleAmt; 
                        sy += (Math.random() - 0.5) * trembleAmt; 
                    }
                    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
                    ctx.fillRect(sx, sy, sw, sh);
                } else { const b = Math.min(1, vis * 0.95); ctx.fillStyle = `rgb(${Math.floor(7+20*b)},${Math.floor(7+18*b)},${Math.floor(8+32*b)})`; ctx.fillRect(sx, sy, sw, sh); }
            }

        // --- Acoustic Wavefront Visual ---
        if (S.acoustic.active) {
            const A = S.acoustic;
            const decayDuration = C.ACOUSTIC_VISUAL_DECAY_DURATION;
            
            ctx.globalCompositeOperation = 'lighter';
            
            for (let r = gridTop; r <= gridBottom; r++) {
                for (let c = gridLeft; c <= gridRight; c++) {
                    const idx = r * C.MAP_COLS + c;
                    const t = A.arrivalTime[idx];
                    if (t < Infinity) {
                        const timeSinceArrival = A.currentTime - t;
                        
                        if (timeSinceArrival >= 0 && timeSinceArrival < decayDuration) {
                            let fadeFactor = 1.0 - (timeSinceArrival / decayDuration);
                            fadeFactor = fadeFactor * fadeFactor * (3.0 - 2.0 * fadeFactor);
                            
                            // Brighter color and higher alpha multiplier
                            const alpha = fadeFactor * 0.85 * A.energy[idx];
                            
                            if (alpha > 0.01) {
                                const sx = c * C.CELL * scaleX + offsetX;
                                const sy = r * C.CELL * scaleY + offsetY;
                                const sw = C.CELL * scaleX; 
                                const sh = C.CELL * scaleY; 
                                
                                ctx.fillStyle = `rgba(130, 245, 255, ${alpha})`;
                                ctx.fillRect(sx, sy, sw, sh);
                            }
                        }
                    }
                }
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        // ---------------------------------

        const tideCX = C.MAP_COLS / 2 * C.CELL * scaleX + offsetX, tideCY = C.MAP_ROWS / 2 * C.CELL * scaleY + offsetY, safeR = S.tideRadius * Math.min(scaleX, scaleY);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + S.frameCount * 0.003, rR = safeR + Math.sin(S.frameCount * 0.08 + i) * 4; ctx.fillStyle = 'rgba(157,78,221,0.2)'; ctx.beginPath(); ctx.arc(tideCX + Math.cos(a) * rR, tideCY + Math.sin(a) * rR, 2.5, 0, Math.PI * 2); ctx.fill(); }
        const tideGrad = ctx.createRadialGradient(tideCX, tideCY, safeR * 0.92, tideCX, tideCY, safeR + 22);
        tideGrad.addColorStop(0, 'rgba(0,0,0,0)'); tideGrad.addColorStop(0.7, 'rgba(30,0,50,0.25)'); tideGrad.addColorStop(1, 'rgba(18,0,32,0.9)');
        ctx.fillStyle = tideGrad; ctx.fillRect(0, 0, S.canvasW, S.canvasH);
        ctx.strokeStyle = 'rgba(157,78,221,0.5)'; ctx.lineWidth = 2.5 + Math.sin(S.frameCount * 0.035) * 1.8;
        ctx.beginPath(); ctx.arc(tideCX, tideCY, safeR, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;

        for (const e of S.tideEffects) {
            const sx = e.x * scaleX + offsetX, sy = e.y * scaleY + offsetY, alpha = Math.min(1, e.life / e.maxLife);
            if (e.type === 'leaper') {
                for (let i = 0; i < e.trail.length; i++) { const t = e.trail[i], tsx = t.x * scaleX + offsetX, tsy = t.y * scaleY + offsetY, ta = (t.life / 0.4) * alpha * 0.5; ctx.fillStyle = `rgba(200,160,230,${ta})`; ctx.beginPath(); ctx.arc(tsx, tsy, 1.5, 0, Math.PI * 2); ctx.fill(); }
                ctx.fillStyle = `rgba(180,130,220,${alpha})`; ctx.beginPath(); ctx.ellipse(sx, sy, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
            } else if (e.type === 'swimmer') {
                for (const t of e.trail) { const tsx = t.x * scaleX + offsetX, tsy = t.y * scaleY + offsetY, ta = (t.life / 0.4) * alpha * 0.4; ctx.strokeStyle = `rgba(200,170,230,${ta})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tsx - 2, tsy); ctx.lineTo(tsx + 2, tsy - 4); ctx.lineTo(tsx + 5, tsy + 1); ctx.stroke(); }
            } else { ctx.strokeStyle = `rgba(180,140,220,${alpha*0.4})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 3 + alpha * 5, 0, Math.PI * 2); ctx.stroke(); }
        }

        const exitVis = S.visGrid[Math.floor(S.exitPos.y / C.CELL)]?.[Math.floor(S.exitPos.x / C.CELL)] || 0;
        if (exitVis > 0.015) {
            const esx = S.exitPos.x * scaleX + offsetX, esy = S.exitPos.y * scaleY + offsetY, active = S.crystalsCollected >= C.TOTAL_CRYSTALS;
            const pulse = C.CELL * 1.3 + Math.sin(S.frameCount * 0.07) * C.CELL * 0.5;
            const glow = ctx.createRadialGradient(esx, esy, C.CELL * 0.15, esx, esy, pulse);
            if (active) { glow.addColorStop(0, 'rgba(255,190,255,1)'); glow.addColorStop(0.25, 'rgba(255,105,180,0.85)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); }
            else { glow.addColorStop(0, 'rgba(110,90,140,0.5)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); }
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(esx, esy, pulse, 0, Math.PI * 2); ctx.fill();
        }

        for (const c of S.crystals) {
            if (c.collected) continue;
            const gr = Math.floor(c.y / C.CELL), gc = Math.floor(c.x / C.CELL);
            if ((S.visGrid[gr]?.[gc] || 0) < 0.035) continue;
            const sx = c.x * scaleX + offsetX, sy = c.y * scaleY + offsetY, pv = 0.65 + Math.sin(S.frameCount * 0.09 + c.x * 0.7) * 0.35;
            const gg = ctx.createRadialGradient(sx, sy, C.CELL * 0.15, sx, sy, C.CELL * 1.05);
            gg.addColorStop(0, `rgba(255,230,160,${pv})`); gg.addColorStop(0.6, `rgba(255,180,80,${pv*0.5})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sx, sy, C.CELL * 1.0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(255,230,160,${pv})`; ctx.beginPath();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + S.frameCount * 0.05 + c.x, r = C.CELL * 0.55; if (i === 0) ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); else ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, C.CELL * 0.18, 0, Math.PI * 2); ctx.fill();
        }

        for (let ei = 0; ei < S.enemies.length; ei++) {
            const e = S.enemies[ei];
            const gr = Math.floor(e.y / C.CELL), gc = Math.floor(e.x / C.CELL), vis = S.visGrid[gr]?.[gc] || 0;
            const sx = e.x * scaleX + offsetX, sy = e.y * scaleY + offsetY;
            const consumeScale = e.tideConsuming ? Math.max(0.5, e.tideConsumeTimer / C.ENEMY_CONSUME_DURATION) : 1.0;
            if (vis < 0.025 && e.stunnedTimer <= 0 && e.state === 'idle' && !e.tideConsuming) {
                ctx.fillStyle = `rgba(255,60,60,${0.18+Math.sin(S.frameCount*0.22+ei)*0.08})`;
                ctx.beginPath(); ctx.arc(sx - C.CELL * 0.15, sy - C.CELL * 0.1, C.CELL * 0.1, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(sx + C.CELL * 0.15, sy - C.CELL * 0.1, C.CELL * 0.1, 0, Math.PI * 2); ctx.fill();
                continue;
            }
            const alpha = Math.min(0.85, vis * 1.5 + 0.08);
            ctx.save(); ctx.translate(sx, sy); ctx.scale(consumeScale, consumeScale); ctx.translate(-sx, -sy);
            const bodyGrad = ctx.createRadialGradient(sx, sy, C.CELL * 0.3, sx, sy, C.CELL * 1.0);
            bodyGrad.addColorStop(0, `rgba(10, 2, 5, ${alpha})`); bodyGrad.addColorStop(0.6, `rgba(5, 0, 3, ${alpha*0.8})`); bodyGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.arc(sx, sy, C.CELL * 1.0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(15, 5, 10, ${alpha*0.9})`; ctx.beginPath();
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2 + S.frameCount * 0.02 + ei;
                const r = C.CELL * 0.85 * (0.6 + 0.4 * Math.sin(a * 3 + S.frameCount * 0.04));
                const px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ff4040'; ctx.beginPath(); ctx.arc(sx - C.CELL * 0.18, sy - C.CELL * 0.15, C.CELL * 0.15, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(sx + C.CELL * 0.18, sy - C.CELL * 0.15, C.CELL * 0.15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(sx - C.CELL * 0.16, sy - C.CELL * 0.13, C.CELL * 0.06, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(sx + C.CELL * 0.20, sy - C.CELL * 0.13, C.CELL * 0.06, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        if (!S.gameOver && !S.gameWon) {
            const px = S.player.x * scaleX + offsetX, py = S.player.y * scaleY + offsetY;
            const t = S.frameCount * 0.025, pulse = 1 + Math.sin(t * 2.5) * 0.15;
            ctx.save(); if (S.playerInTide) ctx.globalAlpha = 0.65;
            const glow = ctx.createRadialGradient(px, py, C.CELL * 0.15 * scaleX, px, py, C.CELL * 1.1 * scaleX * pulse);
            glow.addColorStop(0, 'rgba(180,250,255,0.7)'); glow.addColorStop(0.5, 'rgba(92,225,230,0.3)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, C.CELL * 1.2 * scaleX, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#4df0ff'; ctx.beginPath();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + t * 0.7, r = C.CELL * 0.4 * scaleX * (i % 2 === 0 ? 1.1 : 0.7); i === 0 ? ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r) : ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, C.CELL * 0.18 * scaleX, 0, Math.PI * 2); ctx.fill();
            for (let i = 0; i < 2; i++) { const a = t * 2 + i * Math.PI; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(px + Math.cos(a) * C.CELL * 0.6 * scaleX, py + Math.sin(a) * C.CELL * 0.6 * scaleX, C.CELL * 0.08 * scaleX, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
        }

        for (const p of S.particles) { const sx = p.x * scaleX + offsetX, sy = p.y * scaleY + offsetY; ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(sx, sy, p.size * Math.min(scaleX, scaleY), 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        ctx.restore();

        const vig = ctx.createRadialGradient(S.canvasW / 2, S.canvasH / 2, S.canvasW * 0.36, S.canvasW / 2, S.canvasH / 2, S.canvasW * 0.8);
        vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.52)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, S.canvasW, S.canvasH);
    }
};