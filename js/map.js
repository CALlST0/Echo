window.EW = window.EW || {};

window.EW.Map = {
    shuffle: function(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },

    assignEnemyCrystal: function(enemy, forceReassign = false) {
        const S = EW.State;
        const C = EW.Config;
        
        if (!forceReassign && enemy.preferredCrystal >= 0 && enemy.preferredCrystal < S.crystals.length) {
            const c = S.crystals[enemy.preferredCrystal];
            if (c && !c.collected) return;
        }
        if (enemy.preferredCrystal >= 0 && enemy.preferredCrystal < S.crystals.length) {
            S.crystalAssignmentCounts[enemy.preferredCrystal] = Math.max(0, S.crystalAssignmentCounts[enemy.preferredCrystal] - 1);
        }
        
        let bestIdx = -1;
        let bestScore = Infinity;
        
        for (let i = 0; i < S.crystals.length; i++) {
            if (S.crystals[i].collected) continue;
            const dist = Math.hypot(S.crystals[i].x - enemy.x, S.crystals[i].y - enemy.y);
            
            const abstractPenalty = S.crystalAssignmentCounts[i] * C.CELL * 6;
            
            let physicalCrowdPenalty = 0;
            for (let j = 0; j < S.enemies.length; j++) {
                if (S.enemies[j] === enemy) continue;
                if (S.enemies[j].preferredCrystal === i) {
                    const dOther = Math.hypot(S.crystals[i].x - S.enemies[j].x, S.crystals[i].y - S.enemies[j].y);
                    if (dOther < C.CELL * 6) {
                        physicalCrowdPenalty += C.CELL * 12;
                    }
                }
            }

            const probabilisticExploration = Math.random() * C.CELL * 15;
            const score = dist + abstractPenalty + physicalCrowdPenalty + probabilisticExploration;
            
            if (score < bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }
        
        if (bestIdx === -1) {
            enemy.preferredCrystal = -1;
        } else {
            enemy.preferredCrystal = bestIdx;
            S.crystalAssignmentCounts[bestIdx]++;
        }
    },

    generateMap: function() {
        const S = EW.State;
        const C = EW.Config;
        
        S.mapGrid = Array.from({ length: C.MAP_ROWS }, () => Array(C.MAP_COLS).fill(1));
        const rooms = [], numRooms = 11 + Math.floor(Math.random() * 7);
        for (let i = 0; i < numRooms; i++) {
            const w = 4 + Math.floor(Math.random() * 9), h = 4 + Math.floor(Math.random() * 7),
                x = 2 + Math.floor(Math.random() * (C.MAP_COLS - w - 4)), y = 2 + Math.floor(Math.random() * (C.MAP_ROWS - h - 4));
            for (let r = y; r < y + h; r++)
                for (let c = x; c < x + w; c++)
                    if (r > 0 && r < C.MAP_ROWS - 1 && c > 0 && c < C.MAP_COLS - 1) S.mapGrid[r][c] = 0;
            rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
        }
        for (let i = 0; i < rooms.length - 1; i++) {
            let cx = rooms[i].cx, cy = rooms[i].cy;
            while (cx !== rooms[i + 1].cx) { cx += cx < rooms[i + 1].cx ? 1 : -1; if (cy >= 0 && cy < C.MAP_ROWS && cx >= 0 && cx < C.MAP_COLS) S.mapGrid[cy][cx] = 0; }
            while (cy !== rooms[i + 1].cy) { cy += cy < rooms[i + 1].cy ? 1 : -1; if (cy >= 0 && cy < C.MAP_ROWS && cx >= 0 && cx < C.MAP_COLS) S.mapGrid[cy][cx] = 0; }
        }
        const floorCells = [];
        for (let r = 1; r < C.MAP_ROWS - 1; r++)
            for (let c = 1; c < C.MAP_COLS - 1; c++)
                if (S.mapGrid[r][c] === 0) floorCells.push({ r, c });
        const startRoom = rooms[Math.floor(Math.random() * rooms.length)];
        const playerCell = { r: startRoom.cy, c: startRoom.cx };
        const startPos = { x: playerCell.c * C.CELL + C.CELL / 2, y: playerCell.r * C.CELL + C.CELL / 2 };

        const centerCol = C.MAP_COLS / 2, centerRow = C.MAP_ROWS / 2;
        const minDistFromPlayer = 12;
        let bestExit = null, bestCenterDist = Infinity;
        for (const cell of floorCells) {
            const dStart = Math.hypot(cell.c - playerCell.c, cell.r - playerCell.r);
            if (dStart < minDistFromPlayer) continue;
            const dCenter = Math.hypot(cell.c - centerCol, cell.r - centerRow);
            if (dCenter < bestCenterDist) { bestCenterDist = dCenter; bestExit = cell; }
        }
        if (!bestExit) bestExit = floorCells[0];
        S.exitPos = { x: bestExit.c * C.CELL + C.CELL / 2, y: bestExit.r * C.CELL + C.CELL / 2 };

        const crystalSpots = floorCells.filter(c => { const ds = Math.hypot(c.c - playerCell.c, c.r - playerCell.r), de = Math.hypot(c.c - bestExit.c, c.r - bestExit.r); return ds > 10 && de > 8; });
        const chosen = [];
        
        const shuffledSpots = this.shuffle(crystalSpots);
        for (const c of shuffledSpots) {
            if (chosen.length >= C.TOTAL_CRYSTALS) break;
            if (!chosen.some(x => Math.hypot(c.c - x.c, c.r - x.r) < 10)) chosen.push(c);
        }
        S.crystals = chosen.map(c => ({ x: c.c * C.CELL + C.CELL / 2, y: c.r * C.CELL + C.CELL / 2, collected: false }));
        
        const enemyCandidates = floorCells.filter(c => {
            const ds = Math.hypot(c.c - playerCell.c, c.r - playerCell.r);
            if (ds < 16) return false;
            let open = 0;
            for (let dr = -2; dr <= 2; dr++)
                for (let dc = -2; dc <= 2; dc++) { const nr = c.r + dr, nc = c.c + dc; if (nr >= 0 && nr < C.MAP_ROWS && nc >= 0 && nc < C.MAP_COLS && S.mapGrid[nr][nc] === 0) open++; }
            return open >= 16;
        });
        
        const numEn = Math.min(7, Math.max(2, C.settings.enemyCount));
        S.crystalAssignmentCounts = new Array(C.TOTAL_CRYSTALS).fill(0);
        
        const shuffledEnemies = this.shuffle(enemyCandidates).slice(0, numEn);
        
        S.enemies = shuffledEnemies.map((c, idx) => ({
            x: c.c * C.CELL + C.CELL / 2, y: c.r * C.CELL + C.CELL / 2, vx: 0, vy: 0,
            state: 'idle', alertTarget: null, idleTimer: Math.random() * 3, idleAngle: Math.random() * Math.PI * 2,
            stunnedTimer: 0, tideConsuming: false, tideConsumeTimer: 0,
            preferredCrystal: -1,
            crystalMoteTimer: 0, stuckTimer: 0, crystalInterestTimer: 0,
            lastStuckRecovery: 0, ignoreCrystalTimer: 0, ignorePlayerTimer: 0,
            escapeTimer: 0,
            lastRegionPos: null,
            regionStuckTimer: 0
        }));
        for (const e of S.enemies) {
            this.assignEnemyCrystal(e, true);
        }
        S.initialEnemyCount = S.enemies.length;
        S.enemiesAllConsumed = false;
        const centerX = C.MAP_COLS / 2 * C.CELL, centerY = C.MAP_ROWS / 2 * C.CELL;
        S.tideMaxRadius = Math.hypot(centerX, centerY) + C.CELL * 3;
        S.tideRadius = S.tideMaxRadius;
        S.tideRetreatTarget = 0;
        return startPos;
    },

    findSafeRespawn: function() {
        const S = EW.State;
        const C = EW.Config;
        const cells = [];
        for (let r = 1; r < C.MAP_ROWS - 1; r++) for (let c = 1; c < C.MAP_COLS - 1; c++) if (S.mapGrid[r][c] === 0) cells.push({ x: c * C.CELL + C.CELL / 2, y: r * C.CELL + C.CELL / 2 });
        const centerX = C.MAP_COLS / 2 * C.CELL, centerY = C.MAP_ROWS / 2 * C.CELL;
        let best = cells[0], bestSafety = -Infinity, foundSafe = false;
        for (const c of cells) {
            let minDist = Infinity;
            for (const e of S.enemies) minDist = Math.min(minDist, Math.hypot(c.x - e.x, c.y - e.y));
            if (minDist > bestSafety && minDist > C.CELL * 10 && Math.hypot(c.x - centerX, c.y - centerY) < S.tideRadius) { bestSafety = minDist; best = c; foundSafe = true; }
        }
        if (!foundSafe) {
            bestSafety = -Infinity;
            for (const c of cells) {
                let minDist = Infinity;
                for (const e of S.enemies) minDist = Math.min(minDist, Math.hypot(c.x - e.x, c.y - e.y));
                if (Math.hypot(c.x - centerX, c.y - centerY) < S.tideRadius && minDist > bestSafety) { bestSafety = minDist; best = c; foundSafe = true; }
            }
        }
        if (!foundSafe) {
            let minCenterDist = Infinity; bestSafety = -Infinity;
            for (const c of cells) {
                const dCenter = Math.hypot(c.x - centerX, c.y - centerY);
                let minDist = Infinity;
                for (const e of S.enemies) minDist = Math.min(minDist, Math.hypot(c.x - e.x, c.y - e.y));
                if (dCenter < minCenterDist || (dCenter === minCenterDist && minDist > bestSafety)) { minCenterDist = dCenter; bestSafety = minDist; best = c; }
            }
        }
        return best;
    }
};