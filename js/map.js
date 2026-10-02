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
            
            const abstractPenalty = S.crystalAssignmentCounts[i] * C.COARSE_CELL * 6;
            
            let physicalCrowdPenalty = 0;
            for (let j = 0; j < S.enemies.length; j++) {
                if (S.enemies[j] === enemy) continue;
                if (S.enemies[j].preferredCrystal === i) {
                    const dOther = Math.hypot(S.crystals[i].x - S.enemies[j].x, S.crystals[i].y - S.enemies[j].y);
                    if (dOther < C.COARSE_CELL * 6) {
                        physicalCrowdPenalty += C.COARSE_CELL * 12;
                    }
                }
            }

            const probabilisticExploration = Math.random() * C.COARSE_CELL * 15;
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
        
        // --- Level layout is authored on the legacy COARSE grid (55x38 blocks) ---
        // Each coarse block becomes a GRID_SUBDIV x GRID_SUBDIV group of fine cells.
        const coarseGrid = Array.from({ length: C.COARSE_ROWS }, () => Array(C.COARSE_COLS).fill(1));
        let rooms;
        if (EW.TestTemplate) {
            // Validation hook only: load an identical coarse map for OLD/NEW A/B comparison.
            rooms = [];
            for (let r = 0; r < C.COARSE_ROWS; r++)
                for (let c = 0; c < C.COARSE_COLS; c++)
                    coarseGrid[r][c] = EW.TestTemplate[r][c];
        } else {
        rooms = [];
        const numRooms = 11 + Math.floor(Math.random() * 7);
        for (let i = 0; i < numRooms; i++) {
            const w = 4 + Math.floor(Math.random() * 9), h = 4 + Math.floor(Math.random() * 7),
                x = 2 + Math.floor(Math.random() * (C.COARSE_COLS - w - 4)), y = 2 + Math.floor(Math.random() * (C.COARSE_ROWS - h - 4));
            for (let r = y; r < y + h; r++)
                for (let c = x; c < x + w; c++)
                    if (r > 0 && r < C.COARSE_ROWS - 1 && c > 0 && c < C.COARSE_COLS - 1) coarseGrid[r][c] = 0;
            rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
        }
        for (let i = 0; i < rooms.length - 1; i++) {
            let cx = rooms[i].cx, cy = rooms[i].cy;
            while (cx !== rooms[i + 1].cx) { cx += cx < rooms[i + 1].cx ? 1 : -1; if (cy >= 0 && cy < C.COARSE_ROWS && cx >= 0 && cx < C.COARSE_COLS) coarseGrid[cy][cx] = 0; }
            while (cy !== rooms[i + 1].cy) { cy += cy < rooms[i + 1].cy ? 1 : -1; if (cy >= 0 && cy < C.COARSE_ROWS && cx >= 0 && cx < C.COARSE_COLS) coarseGrid[cy][cx] = 0; }
        }
        }

        // --- Convert coarse level data to the fine simulation grid (no geometry lost) ---
        const SUB = C.GRID_SUBDIV;
        S.mapGrid = Array.from({ length: C.MAP_ROWS }, () => new Uint8Array(C.MAP_COLS).fill(1));
        for (let cr = 0; cr < C.COARSE_ROWS; cr++)
            for (let cc = 0; cc < C.COARSE_COLS; cc++)
                if (coarseGrid[cr][cc] === 0)
                    for (let fr = cr * SUB; fr < (cr + 1) * SUB; fr++)
                        for (let fc = cc * SUB; fc < (cc + 1) * SUB; fc++)
                            S.mapGrid[fr][fc] = 0;
        const floorCells = [];
        for (let r = 1; r < C.MAP_ROWS - 1; r++)
            for (let c = 1; c < C.MAP_COLS - 1; c++)
                if (S.mapGrid[r][c] === 0) floorCells.push({ r, c });
        let playerCell;
        if (EW.TestTemplate) {
            playerCell = { r: 6 * SUB + Math.floor(SUB / 2), c: 7 * SUB + Math.floor(SUB / 2) }; // reference coarse cell (7,6) -> world centre (150,130)
        } else {
            const startRoom = rooms[Math.floor(Math.random() * rooms.length)];
            playerCell = { r: startRoom.cy * SUB + Math.floor(SUB / 2), c: startRoom.cx * SUB + Math.floor(SUB / 2) };
        }
        const startPos = { x: playerCell.c * C.CELL + C.CELL / 2, y: playerCell.r * C.CELL + C.CELL / 2 };

        const centerCol = C.MAP_COLS / 2, centerRow = C.MAP_ROWS / 2;
        const minDistFromPlayer = 12 * SUB;
        let bestExit = null, bestCenterDist = Infinity;
        for (const cell of floorCells) {
            const dStart = Math.hypot(cell.c - playerCell.c, cell.r - playerCell.r);
            if (dStart < minDistFromPlayer) continue;
            const dCenter = Math.hypot(cell.c - centerCol, cell.r - centerRow);
            if (dCenter < bestCenterDist) { bestCenterDist = dCenter; bestExit = cell; }
        }
        if (!bestExit) bestExit = floorCells[0];
        S.exitPos = { x: bestExit.c * C.CELL + C.CELL / 2, y: bestExit.r * C.CELL + C.CELL / 2 };

        const crystalSpots = floorCells.filter(c => { const ds = Math.hypot(c.c - playerCell.c, c.r - playerCell.r), de = Math.hypot(c.c - bestExit.c, c.r - bestExit.r); return ds > 10 * SUB && de > 8 * SUB; });
        const chosen = [];
        
        const shuffledSpots = this.shuffle(crystalSpots);
        for (const c of shuffledSpots) {
            if (chosen.length >= C.TOTAL_CRYSTALS) break;
            if (!chosen.some(x => Math.hypot(c.c - x.c, c.r - x.r) < 10 * SUB)) chosen.push(c);
        }
        S.crystals = chosen.map(c => ({ x: c.c * C.CELL + C.CELL / 2, y: c.r * C.CELL + C.CELL / 2, collected: false }));
        
        const enemyCandidates = floorCells.filter(c => {
            const ds = Math.hypot(c.c - playerCell.c, c.r - playerCell.r);
            if (ds < 16 * SUB) return false;
            let open = 0;
            for (let dr = -2 * SUB; dr <= 2 * SUB; dr++)
                for (let dc = -2 * SUB; dc <= 2 * SUB; dc++) { const nr = c.r + dr, nc = c.c + dc; if (nr >= 0 && nr < C.MAP_ROWS && nc >= 0 && nc < C.MAP_COLS && S.mapGrid[nr][nc] === 0) open++; }
            return open >= 21 * SUB * SUB;
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
        S.tideMaxRadius = Math.hypot(centerX, centerY) + C.COARSE_CELL * 3;
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
            if (minDist > bestSafety && minDist > C.COARSE_CELL * 10 && Math.hypot(c.x - centerX, c.y - centerY) < S.tideRadius) { bestSafety = minDist; best = c; foundSafe = true; }
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