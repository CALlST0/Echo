// Deterministic legacy-coarse map generator for A/B validation only.
// Same formulas/consumption as the original js/map.js, but rooms are carved
// from a fixed template so OLD and NEW variants share one identical layout.
window.EW = window.EW || {};
window.EW.Map = {
    shuffle: function(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },
    assignEnemyCrystal: function(enemy, reassign) {
        const S = EW.State; const C = EW.Config;
        if (!S.crystals.length) { enemy.preferredCrystal = -1; return; }
        if (enemy.preferredCrystal >= 0 && enemy.preferredCrystal < S.crystals.length) {
            const current = S.crystals[enemy.preferredCrystal];
            if (current && !current.collected && S.crystalAssignmentCounts[enemy.preferredCrystal] < 2) return;
            else S.crystalAssignmentCounts[enemy.preferredCrystal] = Math.max(0, S.crystalAssignmentCounts[enemy.preferredCrystal] - 1);
        }
        if (!reassign) return;
        let bestIdx = -1, bestScore = Infinity;
        for (let i = 0; i < S.crystals.length; i++) {
            const c = S.crystals[i];
            if (c.collected) continue;
            const dist = Math.hypot(c.x - enemy.x, c.y - enemy.y);
            const count = S.crystalAssignmentCounts[i];
            const score = dist + count * C.CELL * 25;
            if (score < bestScore) { bestScore = score; bestIdx = i; }
        }
        if (bestIdx !== -1) { enemy.preferredCrystal = bestIdx; S.crystalAssignmentCounts[bestIdx]++; }
        else enemy.preferredCrystal = -1;
    },
    generateMap: function() {
        const S = EW.State; const C = EW.Config;
        S.mapGrid = Array.from({ length: C.MAP_ROWS }, () => Array(C.MAP_COLS).fill(1));
        // Fixed coarse template: border walls implicit; carve rooms + corridors deterministically
        const rect = (x, y, w, h) => { for (let r=y;r<y+h;r++) for (let c=x;c<x+w;c++) if (r>0&&r<C.MAP_ROWS-1&&c>0&&c<C.MAP_COLS-1) S.mapGrid[r][c]=0; };
        const hcorr = (x1,x2,y) => { for (let c=Math.min(x1,x2);c<=Math.max(x1,x2);c++) if (y>0&&y<C.MAP_ROWS-1&&c>0&&c<C.MAP_COLS-1) S.mapGrid[y][c]=0; };
        const vcorr = (y1,y2,x) => { for (let r=Math.min(y1,y2);r<=Math.max(y1,y2);r++) if (r>0&&r<C.MAP_ROWS-1&&x>0&&x<C.MAP_COLS-1) S.mapGrid[r][x]=0; };
        rect(3,3,8,6); rect(16,4,7,5); rect(27,3,9,7); rect(40,5,7,6);
        rect(4,13,6,8); rect(15,12,10,9); rect(30,14,8,6); rect(42,15,7,7);
        rect(6,26,9,7); rect(20,24,7,9); rect(31,26,8,7); rect(43,27,6,6);
        hcorr(11,16,6); hcorr(23,27,6); hcorr(36,40,8); hcorr(10,15,16); hcorr(25,30,16); hcorr(38,42,18);
        hcorr(15,20,29); hcorr(27,31,29); hcorr(39,43,30); vcorr(9,13,6); vcorr(11,12,31); vcorr(20,26,23); vcorr(22,27,45); vcorr(9,12,20); vcorr(21,24,34);
        // Single isolated pillar inside big room (tests partial-block obstruction after conversion)
        S.mapGrid[16][19] = 1;
        const floorCells = [];
        for (let r = 1; r < C.MAP_ROWS - 1; r++)
            for (let c = 1; c < C.MAP_COLS - 1; c++)
                if (S.mapGrid[r][c] === 0) floorCells.push({ r, c });
        const playerCell = { r: 6, c: 7 };
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
            stunnedTimer: 0, tideConsuming: false, tideConsumeTimer: 0, preferredCrystal: -1,
            crystalMoteTimer: 0, stuckTimer: 0, crystalInterestTimer: 0,
            lastStuckRecovery: performance.now(), ignoreCrystalTimer: 0, ignorePlayerTimer: 0, escapeTimer: 0,
            lastRegionPos: null, regionStuckTimer: 0
        }));
        for (const e of S.enemies) this.assignEnemyCrystal(e, true);
        S.initialEnemyCount = S.enemies.length;
        S.enemiesAllConsumed = false;
        const centerX = C.MAP_COLS / 2 * C.CELL, centerY = C.MAP_ROWS / 2 * C.CELL;
        S.tideMaxRadius = Math.hypot(centerX, centerY) + C.CELL * 3;
        S.tideRadius = S.tideMaxRadius;
        S.tideRetreatTarget = 0;
        return startPos;
    },
    findSafeRespawn: function() {
        const S = EW.State; const C = EW.Config;
        const candidates = [];
        for (let r = 2; r < C.MAP_ROWS - 2; r++)
            for (let c = 2; c < C.MAP_COLS - 2; c++) {
                if (S.mapGrid[r][c] !== 0) continue;
                let blocked = false;
                for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (S.mapGrid[r + dr][c + dc] === 1) blocked = true;
                if (blocked) continue;
                const wx = c * C.CELL + C.CELL / 2, wy = r * C.CELL + C.CELL / 2;
                if (S.enemies.some(en => Math.hypot(en.x - wx, en.y - wy) < C.CELL * 10)) continue;
                candidates.push({ x: wx, y: wy });
            }
        if (candidates.length === 0) return { x: C.WORLD_W / 2, y: C.WORLD_H / 2 };
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
};
