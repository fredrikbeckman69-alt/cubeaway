use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestCache, RequestInit, Response};
use crate::types::GameMode;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HighScoreEntry {
    #[serde(default)]
    pub rank: usize,
    pub initials: String,
    pub score: i64,
    pub level: u32,
    pub date: String,
    #[serde(rename = "isPlayer", default)]
    pub is_player: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct WinBonus {
    pub base_bonus: i64,
    pub speed_bonus: i64,
    pub par_bonus: i64,
    pub is_par: bool,
    pub total_bonus: i64,
    pub total_score: i64,
}

#[derive(Clone, Copy, Debug)]
pub struct ScoreUpdateResult {
    pub combo_expired: bool,
    pub current_combo: u32,
    pub time_attack_over: bool,
    pub seconds_left: u32,
}

#[derive(Clone, Copy, Debug)]
pub struct SaveScoreResult {
    pub saved: bool,
    pub rank: isize,
    pub level_rank: isize,
    pub all_time_rank: isize,
}

const LEVEL_VAULT_KEY: &str = "cubeaway_level_vault";
const ALLTIME_VAULT_KEY: &str = "cubeaway_alltime_vault";
const LEGACY_PLAYER_VAULT_KEY: &str = "cubeaway_player_vault";
const LEGACY_STORAGE_KEY: &str = "cubeaway_highscores";
const STARS_STORAGE_KEY: &str = "cubeaway_stars";

const CLOUD_ENDPOINTS: [&str; 2] = [
    "https://api.restful-api.dev/objects/ff808181a09d98f701a0d250ae200525",
    "https://api.restful-api.dev/objects/ff808181a09d98f701a0d2516e890526",
];

const BENCHMARK_NAMES: [&str; 10] = [
    "ACE", "NEO", "FOX", "ZAP", "MAX", "LIL", "BEN", "SKY", "RED", "SAM",
];

fn default_alltime_highscores() -> Vec<HighScoreEntry> {
    vec![
        HighScoreEntry { rank: 0, initials: "FB".into(), score: 1106450, level: 24, date: "2026-09-21".into(), is_player: true },
        HighScoreEntry { rank: 0, initials: "ACE".into(), score: 62450, level: 25, date: "2026-09-20".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "NEO".into(), score: 58900, level: 22, date: "2026-09-19".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "CYB".into(), score: 54200, level: 20, date: "2026-09-18".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "TRX".into(), score: 49800, level: 18, date: "2026-09-17".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "FOX".into(), score: 46150, level: 16, date: "2026-09-16".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "ZAP".into(), score: 42300, level: 15, date: "2026-09-15".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "VAL".into(), score: 39500, level: 14, date: "2026-09-14".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "MAX".into(), score: 36800, level: 13, date: "2026-09-13".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "ARC".into(), score: 35000, level: 12, date: "2026-09-12".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "LIL".into(), score: 31500, level: 11, date: "2026-09-11".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "BEN".into(), score: 29200, level: 10, date: "2026-09-10".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "SKY".into(), score: 26800, level: 9, date: "2026-09-09".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "REX".into(), score: 24500, level: 8, date: "2026-09-08".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "KOR".into(), score: 22400, level: 7, date: "2026-09-07".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "VEX".into(), score: 20500, level: 7, date: "2026-09-06".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "RED".into(), score: 18700, level: 6, date: "2026-09-05".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "NEX".into(), score: 17100, level: 6, date: "2026-09-04".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "SAM".into(), score: 15600, level: 5, date: "2026-09-03".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "JAX".into(), score: 14200, level: 5, date: "2026-09-02".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "LUM".into(), score: 12900, level: 4, date: "2026-09-01".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "EON".into(), score: 11700, level: 4, date: "2026-08-31".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "ORB".into(), score: 10600, level: 3, date: "2026-08-30".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "ZEN".into(), score: 9500, level: 3, date: "2026-08-29".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "PIX".into(), score: 8400, level: 2, date: "2026-08-28".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "GLW".into(), score: 7500, level: 2, date: "2026-08-27".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "RAY".into(), score: 6600, level: 2, date: "2026-08-26".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "DOT".into(), score: 5800, level: 1, date: "2026-08-25".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "BLU".into(), score: 5100, level: 1, date: "2026-08-24".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "ION".into(), score: 4400, level: 1, date: "2026-08-23".into(), is_player: false },
        HighScoreEntry { rank: 0, initials: "BIT".into(), score: 3800, level: 1, date: "2026-08-22".into(), is_player: false },
    ]
}

fn get_storage() -> Option<web_sys::Storage> {
    web_sys::window()?.local_storage().ok().flatten()
}

pub fn now_ms() -> f64 {
    web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now())
        .unwrap_or(0.0)
}

pub fn get_today_date_string() -> String {
    let d = js_sys::Date::new_0();
    let y = d.get_full_year();
    let m = d.get_month() + 1;
    let day = d.get_date();
    format!("{:04}-{:02}-{:02}", y, m, day)
}

pub fn sanitize_initials(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == 'Å' || *c == 'Ä' || *c == 'Ö')
        .take(3)
        .collect();
    if cleaned.is_empty() {
        "AAA".to_string()
    } else {
        cleaned
    }
}

pub fn format_number_sv(val: i64) -> String {
    let neg = val < 0;
    let s = val.abs().to_string();
    let mut out = String::new();
    let chars: Vec<char> = s.chars().collect();
    for (i, c) in chars.iter().enumerate() {
        if i > 0 && (chars.len() - i) % 3 == 0 {
            out.push('\u{00a0}');
        }
        out.push(*c);
    }
    if neg {
        format!("-{}", out)
    } else {
        out
    }
}

pub struct ScoreManager {
    current_score: i64,
    combo_streak: u32,
    combo_timer_ms: f64,
    combo_window_ms: f64,
    level_start_time: f64,
    game_mode: GameMode,
    time_attack_seconds_left: f64,
    time_attack_active: bool,
    max_combo_in_current_level: u32,
    moves_count: u32,
    par_moves: u32,
}

impl ScoreManager {
    pub fn new() -> Self {
        let mut sm = Self {
            current_score: 0,
            combo_streak: 0,
            combo_timer_ms: 0.0,
            combo_window_ms: 2800.0,
            level_start_time: now_ms(),
            game_mode: GameMode::Classic,
            time_attack_seconds_left: 60.0,
            time_attack_active: false,
            max_combo_in_current_level: 0,
            moves_count: 0,
            par_moves: 0,
        };
        sm.migrate_legacy_vaults();
        sm
    }

    pub fn migrate_legacy_vaults(&mut self) {
        let Some(storage) = get_storage() else { return };
        let keys = [
            LEGACY_STORAGE_KEY,
            "cubeaway_highscores_backup",
            LEGACY_PLAYER_VAULT_KEY,
            ALLTIME_VAULT_KEY,
        ];
        let mut found: Vec<HighScoreEntry> = Vec::new();
        for key in keys {
            if let Ok(Some(raw)) = storage.get_item(key) {
                if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                    for e in parsed {
                        let score = e.get("score").and_then(|v| v.as_i64()).unwrap_or(0);
                        if score > 0 {
                            let initials = e
                                .get("initials")
                                .and_then(|v| v.as_str())
                                .map(sanitize_initials)
                                .unwrap_or_else(|| "FB".to_string());
                            let level = e.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                            let date = e
                                .get("date")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(get_today_date_string);
                            found.push(HighScoreEntry {
                                rank: 0,
                                initials,
                                score,
                                level: level.max(1),
                                date,
                                is_player: true,
                            });
                        }
                    }
                }
            }
        }

        if let Ok(Some(cur_raw)) = storage.get_item("cubeaway_current_score") {
            if let Ok(c_score) = cur_raw.parse::<i64>() {
                if c_score > 1000 {
                    let current_lvl = storage
                        .get_item("cubeaway_level")
                        .ok()
                        .flatten()
                        .and_then(|s| s.parse::<u32>().ok())
                        .unwrap_or(1);
                    found.push(HighScoreEntry {
                        rank: 0,
                        initials: "FB".to_string(),
                        score: c_score,
                        level: current_lvl,
                        date: get_today_date_string(),
                        is_player: true,
                    });
                }
            }
        }

        found.push(HighScoreEntry {
            rank: 0,
            initials: "FB".to_string(),
            score: 1106450,
            level: 24,
            date: "2026-09-21".to_string(),
            is_player: true,
        });

        for entry in found {
            Self::save_to_all_time_vault(&entry);
            Self::save_to_level_vault(entry.level, &entry);
        }
    }

    pub fn get_game_mode(&self) -> GameMode {
        self.game_mode
    }

    pub fn calculate_initial_time_attack_seconds(&self, total_arrows: usize) -> f64 {
        let safe_arrows = total_arrows.max(10) as f64;
        (90.0 + safe_arrows * 2.5).round().max(120.0)
    }

    pub fn set_game_mode(&mut self, mode: GameMode, total_arrows: usize) {
        self.game_mode = mode;
        if mode == GameMode::TimeAttack {
            self.time_attack_seconds_left = self.calculate_initial_time_attack_seconds(total_arrows);
            self.time_attack_active = true;
        } else {
            self.time_attack_active = false;
        }
        self.reset_combo();
    }

    pub fn get_score(&self) -> i64 {
        self.current_score
    }

    pub fn get_combo_streak(&self) -> u32 {
        self.combo_streak
    }

    pub fn get_combo_time_left_pct(&self) -> f64 {
        if self.game_mode == GameMode::Zen {
            return 100.0;
        }
        if self.combo_streak <= 1 || self.combo_timer_ms <= 0.0 {
            return 0.0;
        }
        ((self.combo_timer_ms / self.combo_window_ms) * 100.0).clamp(0.0, 100.0)
    }

    pub fn record_move(&mut self) {
        self.moves_count += 1;
    }

    pub fn get_moves_count(&self) -> u32 {
        self.moves_count
    }

    pub fn get_par_moves(&self) -> u32 {
        self.par_moves
    }

    pub fn get_daily_level_number(&self) -> u32 {
        let s = get_today_date_string();
        let mut hash: i32 = 0;
        for b in s.bytes() {
            hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(b as i32);
        }
        25 + ((hash.unsigned_abs()) % 326)
    }

    pub fn start_level(&mut self, _is_restart: bool, total_arrows: usize) {
        self.current_score = 0;
        self.level_start_time = now_ms();
        self.reset_combo();
        self.max_combo_in_current_level = 0;
        self.moves_count = 0;
        self.par_moves = total_arrows as u32;

        if self.game_mode == GameMode::TimeAttack {
            self.time_attack_seconds_left = self.calculate_initial_time_attack_seconds(total_arrows);
            self.time_attack_active = true;
        }
    }

    pub fn rollback_unfinished_level(&mut self) {
        self.current_score = 0;
        self.reset_combo();
        self.moves_count = 0;
    }

    pub fn update(&mut self, delta_ms: f64) -> ScoreUpdateResult {
        let mut combo_expired = false;
        let mut time_attack_over = false;

        if self.game_mode != GameMode::Zen && self.combo_timer_ms > 0.0 {
            self.combo_timer_ms -= delta_ms;
            if self.combo_timer_ms <= 0.0 {
                self.combo_timer_ms = 0.0;
                if self.combo_streak > 1 {
                    combo_expired = true;
                }
                self.combo_streak = 0;
            }
        }

        if self.game_mode == GameMode::TimeAttack && self.time_attack_active {
            self.time_attack_seconds_left -= delta_ms * 0.001;
            if self.time_attack_seconds_left <= 0.0 {
                self.time_attack_seconds_left = 0.0;
                self.time_attack_active = false;
                time_attack_over = true;
            }
        }

        ScoreUpdateResult {
            combo_expired,
            current_combo: self.combo_streak,
            time_attack_over,
            seconds_left: self.time_attack_seconds_left.ceil().max(0.0) as u32,
        }
    }

    pub fn add_arrow_score(
        &mut self,
        cell_count: usize,
        is_linked: bool,
    ) -> (i64, u32, i64, f64) {
        self.combo_streak += 1;
        self.max_combo_in_current_level = self.max_combo_in_current_level.max(self.combo_streak);
        self.combo_timer_ms = self.combo_window_ms;

        let mut time_bonus_added = 0.0;
        if self.game_mode == GameMode::TimeAttack && self.time_attack_active {
            let mut bonus_sec = if is_linked {
                6.0
            } else if cell_count >= 4 {
                4.0
            } else {
                3.0
            };
            if self.combo_streak >= 8 {
                bonus_sec += 3.0;
            } else if self.combo_streak >= 5 {
                bonus_sec += 2.0;
            } else if self.combo_streak >= 3 {
                bonus_sec += 1.0;
            }
            time_bonus_added = bonus_sec;
            self.time_attack_seconds_left = (self.time_attack_seconds_left + bonus_sec).min(3600.0);
        }

        let multiplier = if self.game_mode == GameMode::Zen {
            1
        } else {
            self.combo_streak.min(10)
        };
        let base_points = 100 + (cell_count as i64) * 25;
        let points_added = base_points * (multiplier as i64);
        self.current_score += points_added;

        (points_added, multiplier, self.current_score, time_bonus_added)
    }

    pub fn on_blocked_arrow(&mut self) -> (i64, i64) {
        self.combo_streak = 0;
        self.combo_timer_ms = 0.0;
        let penalty = if self.game_mode == GameMode::Zen { 0 } else { 50 };
        self.current_score -= penalty;
        (penalty, self.current_score)
    }

    pub fn get_level_stars(&self, level: u32) -> u32 {
        let Some(storage) = get_storage() else { return 0 };
        if let Ok(Some(raw)) = storage.get_item(STARS_STORAGE_KEY) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, u32>>(&raw) {
                return map.get(&level.to_string()).copied().unwrap_or(0);
            }
        }
        0
    }

    pub fn save_level_stars(&self, level: u32, stars: u32) -> u32 {
        let current = self.get_level_stars(level);
        let new_best = current.max(stars.clamp(1, 3));
        if let Some(storage) = get_storage() {
            let mut map: HashMap<String, u32> = storage
                .get_item(STARS_STORAGE_KEY)
                .ok()
                .flatten()
                .and_then(|r| serde_json::from_str(&r).ok())
                .unwrap_or_default();
            map.insert(level.to_string(), new_best);
            if let Ok(json) = serde_json::to_string(&map) {
                let _ = storage.set_item(STARS_STORAGE_KEY, &json);
            }
        }
        new_best
    }

    pub fn calculate_stars(&self, blocked_clicks: u32) -> u32 {
        if blocked_clicks == 0 || self.max_combo_in_current_level >= 5 {
            3
        } else if blocked_clicks <= 2 {
            2
        } else {
            1
        }
    }

    pub fn add_level_win_bonus(&mut self, level: u32) -> WinBonus {
        let elapsed_seconds = ((now_ms() - self.level_start_time) / 1000.0).max(1.0);
        let base_bonus = 1500 + (level as i64) * 250;

        let target_seconds = (120.0 - (level as f64) * 2.0).max(30.0);
        let speed_ratio = ((target_seconds - elapsed_seconds) / target_seconds).max(0.0);
        let speed_bonus = (speed_ratio * 2500.0).floor() as i64;

        let is_par = self.moves_count <= self.par_moves;
        let par_bonus = if is_par {
            2000
        } else {
            let over = (self.moves_count.saturating_sub(self.par_moves)) as i64;
            (1500 - over * 150).max(0)
        };

        let total_bonus = base_bonus + speed_bonus + par_bonus;
        self.current_score += total_bonus;

        WinBonus {
            base_bonus,
            speed_bonus,
            par_bonus,
            is_par,
            total_bonus,
            total_score: self.current_score,
        }
    }

    pub fn reset_combo(&mut self) {
        self.combo_streak = 0;
        self.combo_timer_ms = 0.0;
    }

    pub fn get_player_level_vault() -> HashMap<String, Vec<HighScoreEntry>> {
        let Some(storage) = get_storage() else {
            return HashMap::new();
        };
        storage
            .get_item(LEVEL_VAULT_KEY)
            .ok()
            .flatten()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default()
    }

    pub fn save_to_level_vault(level: u32, entry: &HighScoreEntry) {
        let Some(storage) = get_storage() else { return };
        let mut vault = Self::get_player_level_vault();
        let key = level.to_string();
        let list = vault.entry(key).or_default();
        let exists = list
            .iter()
            .any(|v| v.initials == entry.initials && v.score == entry.score);
        if !exists {
            list.push(entry.clone());
            if let Ok(json) = serde_json::to_string(&vault) {
                let _ = storage.set_item(LEVEL_VAULT_KEY, &json);
            }
        }
    }

    fn generate_default_level_entries(level: u32) -> Vec<HighScoreEntry> {
        let base_score = 3200.0 + (level as f64) * 1400.0;
        BENCHMARK_NAMES
            .iter()
            .enumerate()
            .map(|(index, &initials)| {
                let score = (base_score * (1.0 - (index as f64) * 0.075)).round() as i64;
                HighScoreEntry {
                    rank: 0,
                    initials: initials.to_string(),
                    score,
                    level,
                    date: "2026-09-15".to_string(),
                    is_player: false,
                }
            })
            .collect()
    }

    pub fn get_level_leaderboard(&self, level: u32) -> Vec<HighScoreEntry> {
        let vault = Self::get_player_level_vault();
        let player_entries = vault.get(&level.to_string()).cloned().unwrap_or_default();

        let mut map: HashMap<String, HighScoreEntry> = HashMap::new();
        for mut e in player_entries {
            e.is_player = true;
            let k = format!("{}_{}_{}", e.initials, e.score, e.date);
            map.insert(k, e);
        }

        for e in Self::generate_default_level_entries(level) {
            let k = format!("{}_{}", e.initials, e.score);
            map.entry(k).or_insert(e);
        }

        let mut list: Vec<HighScoreEntry> = map.into_values().collect();
        list.sort_by(|a, b| b.score.cmp(&a.score));
        list.truncate(10);
        for (idx, item) in list.iter_mut().enumerate() {
            item.rank = idx + 1;
        }
        list
    }

    pub fn is_level_high_score(&self, level: u32, score: i64) -> bool {
        if score <= 0 {
            return false;
        }
        let top10 = self.get_level_leaderboard(level);
        if top10.len() < 10 {
            return true;
        }
        score > top10.last().unwrap().score
    }

    pub fn get_player_all_time_vault() -> Vec<HighScoreEntry> {
        let Some(storage) = get_storage() else {
            return Vec::new();
        };
        let mut entries: Vec<HighScoreEntry> = storage
            .get_item(ALLTIME_VAULT_KEY)
            .ok()
            .flatten()
            .and_then(|r| serde_json::from_str(&r).ok())
            .unwrap_or_default();
        for e in &mut entries {
            e.initials = sanitize_initials(&e.initials);
            e.is_player = true;
        }
        entries
    }

    pub fn save_to_all_time_vault(entry: &HighScoreEntry) {
        let Some(storage) = get_storage() else { return };
        let mut vault = Self::get_player_all_time_vault();
        let exists = vault.iter().any(|v| {
            v.initials == entry.initials && v.score == entry.score && v.level == entry.level
        });
        if !exists {
            vault.push(entry.clone());
            if let Ok(json) = serde_json::to_string(&vault) {
                let _ = storage.set_item(ALLTIME_VAULT_KEY, &json);
                let _ = storage.set_item(LEGACY_PLAYER_VAULT_KEY, &json);
                let _ = storage.set_item(LEGACY_STORAGE_KEY, &json);
            }
        }
    }

    pub fn get_all_time_leaderboard(&self) -> Vec<HighScoreEntry> {
        let player_entries = Self::get_player_all_time_vault();
        let mut map: HashMap<String, HighScoreEntry> = HashMap::new();

        for mut e in player_entries {
            e.is_player = true;
            let k = format!("{}_{}_{}_{}", e.initials, e.score, e.level, e.date);
            map.insert(k, e);
        }

        for e in default_alltime_highscores() {
            let k = format!("{}_{}_{}", e.initials, e.score, e.level);
            map.entry(k).or_insert(e);
        }

        let mut list: Vec<HighScoreEntry> = map.into_values().collect();
        list.sort_by(|a, b| b.score.cmp(&a.score));
        list.truncate(30);
        for (idx, item) in list.iter_mut().enumerate() {
            item.rank = idx + 1;
        }
        list
    }

    pub fn is_all_time_high_score(&self, score: i64) -> bool {
        if score <= 0 {
            return false;
        }
        let top30 = self.get_all_time_leaderboard();
        if top30.len() < 30 {
            return true;
        }
        score > top30.last().unwrap().score
    }

    pub fn save_high_score(&mut self, initials: &str, score: i64, level: u32) -> SaveScoreResult {
        let clean = sanitize_initials(initials);
        let today = get_today_date_string();

        let entry = HighScoreEntry {
            rank: 0,
            initials: clean.clone(),
            score,
            level,
            date: today,
            is_player: true,
        };

        Self::save_to_level_vault(level, &entry);
        Self::save_to_all_time_vault(&entry);

        // Trigger background cloud sync
        wasm_bindgen_futures::spawn_local(async move {
            let _ = sync_with_cloud().await;
        });

        let level_list = self.get_level_leaderboard(level);
        let level_rank = level_list
            .iter()
            .position(|e| e.initials == clean && e.score == score && e.is_player)
            .map(|i| (i + 1) as isize)
            .unwrap_or(-1);

        let all_time_list = self.get_all_time_leaderboard();
        let all_time_rank = all_time_list
            .iter()
            .position(|e| e.initials == clean && e.score == score && e.level == level && e.is_player)
            .map(|i| (i + 1) as isize)
            .unwrap_or(-1);

        SaveScoreResult {
            saved: level_rank != -1 || all_time_rank != -1,
            rank: if level_rank != -1 {
                level_rank
            } else {
                all_time_rank
            },
            level_rank,
            all_time_rank,
        }
    }
}

pub async fn sync_with_cloud() -> bool {
    let Some(window) = web_sys::window() else {
        return false;
    };

    for url in CLOUD_ENDPOINTS {
        let opts = RequestInit::new();
        opts.set_method("GET");
        opts.set_cache(RequestCache::NoStore);

        let Ok(request) = Request::new_with_str_and_init(url, &opts) else {
            continue;
        };
        let _ = request.headers().set("Accept", "application/json");

        let Ok(resp_val) = JsFuture::from(window.fetch_with_request(&request)).await else {
            continue;
        };
        let Ok(resp): Result<Response, _> = resp_val.dyn_into() else {
            continue;
        };
        if !resp.ok() {
            continue;
        }
        let Ok(text_promise) = resp.text() else {
            continue;
        };
        let Ok(text_val) = JsFuture::from(text_promise).await else {
            continue;
        };
        let Some(text) = text_val.as_string() else {
            continue;
        };

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(cloud_data) = json.get("data") {
                if let Some(alltime) = cloud_data.get("alltime").and_then(|v| v.as_array()) {
                    for e in alltime {
                        let score = e.get("score").and_then(|v| v.as_i64()).unwrap_or(0);
                        if score > 0 {
                            let initials = e
                                .get("initials")
                                .and_then(|v| v.as_str())
                                .map(sanitize_initials)
                                .unwrap_or_else(|| "AAA".to_string());
                            let level = e.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                            let date = e
                                .get("date")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(get_today_date_string);
                            ScoreManager::save_to_all_time_vault(&HighScoreEntry {
                                rank: 0,
                                initials,
                                score,
                                level: level.max(1),
                                date,
                                is_player: true,
                            });
                        }
                    }
                }

                if let Some(levels) = cloud_data.get("levels").and_then(|v| v.as_object()) {
                    for (lvl_key, entries_val) in levels {
                        if let (Ok(lvl), Some(arr)) =
                            (lvl_key.parse::<u32>(), entries_val.as_array())
                        {
                            for e in arr {
                                let score = e.get("score").and_then(|v| v.as_i64()).unwrap_or(0);
                                if score > 0 {
                                    let initials = e
                                        .get("initials")
                                        .and_then(|v| v.as_str())
                                        .map(sanitize_initials)
                                        .unwrap_or_else(|| "AAA".to_string());
                                    let date = e
                                        .get("date")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                        .unwrap_or_else(get_today_date_string);
                                    ScoreManager::save_to_level_vault(
                                        lvl,
                                        &HighScoreEntry {
                                            rank: 0,
                                            initials,
                                            score,
                                            level: lvl,
                                            date,
                                            is_player: true,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        // Push merged local vaults back to cloud
        let local_alltime = ScoreManager::get_player_all_time_vault();
        let local_levels = ScoreManager::get_player_level_vault();
        let payload = serde_json::json!({
            "name": "CubeAway_Global_Leaderboard",
            "data": {
                "alltime": local_alltime,
                "levels": local_levels,
            }
        });

        if let Ok(body_str) = serde_json::to_string(&payload) {
            let put_opts = RequestInit::new();
            put_opts.set_method("PUT");
            put_opts.set_body(&wasm_bindgen::JsValue::from_str(&body_str));
            if let Ok(put_req) = Request::new_with_str_and_init(url, &put_opts) {
                let _ = put_req.headers().set("Content-Type", "application/json");
                let _ = JsFuture::from(window.fetch_with_request(&put_req)).await;
            }
        }
        return true;
    }

    false
}
