window.EW = window.EW || {};

window.EW.Config = {
    CELL: 20, 
    MAP_COLS: 55, 
    MAP_ROWS: 38,
    WORLD_W: 55 * 20, 
    WORLD_H: 38 * 20,
    PLAYER_SPEED: 135, 
    PLAYER_GLOW_CELLS: 3.2, 
    PLAYER_RADIUS: 20 * 0.35,
    PING_MAX_RADIUS: 480, 
    PING_SPEED: 210, 
    PING_COOLDOWN: 0.95,
    VISIBILITY_DECAY: 0.26, 
    TOTAL_CRYSTALS: 6, 
    TOTAL_LIVES: 3,
    TIDE_DAMAGE_INTERVAL: 2.0,
    PARTICLE_MAX: 280,
    CAMERA_SMOOTH: 7.5, 
    SHAKE_DECAY: 5.5, 
    WALL_GLOW_DECAY: 1.6, 
    PING_REVEAL_FACTOR: 0.25,
    ENEMY_WALL_AVOID_RADIUS: 20 * 1.5,
    MESSAGE_FADE_DURATION: 1.5,
    ENEMY_CONSUME_DURATION: 1.5,
    MESSAGE_REVEAL_SPEED: 8,
    
    CRYSTAL_ATTRACTION_WEIGHT: 0.12,
    CROWD_AVOID_RADIUS: 20 * 8,
    CROWD_AVOID_WEIGHT: 0.45,
    SEPARATION_RADIUS: 20 * 5.5,
    SEPARATION_FORCE_MULT: 80,

    settings: {
        tideSpeed: 0.35,
        enemyCount: 4,
        repulsionStrength: 0.7,
        playerSpeedMult: 1.0,
        enemySpeedMult: 1.0
    }
};