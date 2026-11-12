pub mod audio;
pub mod celestial_bodies;
pub mod celestial_sphere;
pub mod controller;
pub mod cube_topology;
pub mod face_renderer;
pub mod flying_arrows;
pub mod generator;
pub mod particles;
pub mod score_manager;
pub mod shapes;
pub mod theme;
pub mod types;
pub mod webgl_renderer;

use std::cell::RefCell;
use std::collections::HashSet;
use std::f32::consts::PI;
use std::rc::Rc;

use glam::{Quat, Vec3};
use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{
    Document, Element, Event, HtmlAnchorElement, HtmlButtonElement, HtmlCanvasElement,
    HtmlElement, HtmlImageElement, HtmlInputElement, KeyboardEvent, PointerEvent, TouchEvent,
    WheelEvent, Window,
};

use crate::audio::SoundManager;
use crate::celestial_bodies::{get_celestial_body, CelestialBody};
use crate::celestial_sphere::CelestialSphere;
use crate::controller::{CubeController, HitResult, PointerInfo};
use crate::face_renderer::CubeFaceRenderer;
use crate::flying_arrows::FlyingArrowManager;
use crate::generator::{can_arrow_fly, generate_cube_puzzle};
use crate::particles::ParticleManager;
use crate::score_manager::{
    format_number_sv, get_today_date_string, now_ms, sanitize_initials, sync_with_cloud,
    ScoreManager, WinBonus,
};
use crate::shapes::{create_shape_geometry, get_level_shape, ShapeDefinition, ShapeMesh, CUBE_BASE_SIZE};
use crate::theme::{get_level_theme, u32_to_rgb_f32, LevelTheme};
use crate::types::{Arrow, ArrowType, GameMode, PortalDef, ReflectorDef, CUBE_FACE_NAMES_SV};
use crate::webgl_renderer::WebGlRenderer;

struct ShakingArrow {
    arrow_id: String,
    start_time: f64,
    faces: Vec<usize>,
}

struct RotateAnimation {
    start_quat: Quat,
    target_quat: Quat,
    start_time: f64,
    duration: f64,
}

struct DissolveAnimation {
    start_time: f64,
    duration: f64,
    win_bonus: WinBonus,
    stars: u32,
}

pub struct CubeAwayGame {
    renderer: WebGlRenderer,
    face_renderer: CubeFaceRenderer,
    celestial_sphere: CelestialSphere,
    flying_manager: FlyingArrowManager,
    particle_manager: ParticleManager,
    controller: CubeController,
    sound: SoundManager,
    score_manager: ScoreManager,

    current_level: u32,
    grid_size: usize,
    current_theme: LevelTheme,
    current_shape: ShapeDefinition,
    current_shape_mesh: ShapeMesh,
    current_celestial_body: CelestialBody,

    all_arrows: Vec<Arrow>,
    grids: Vec<Vec<Vec<Option<String>>>>,
    total_initial_arrows: usize,
    remaining_arrows: usize,
    blocked_clicks_count: u32,
    current_portals: Vec<PortalDef>,
    current_reflectors: Vec<ReflectorDef>,

    hovered_arrow_id: Option<String>,
    hint_arrow_id: Option<String>,
    shaking_arrow: Option<ShakingArrow>,
    rotate_anim: Option<RotateAnimation>,
    dissolve_anim: Option<DissolveAnimation>,
    is_victory_animating: bool,
    is_cube_dissolved: bool,
    cube_opacity: f32,

    leaderboard_tab: String,
    leaderboard_view_level: u32,
    star_map_zone: String,
    star_map_search: String,

    last_animate_time: f64,
    rng_seed: u32,
}

fn window() -> Window {
    web_sys::window().expect("no global window")
}

fn document() -> Document {
    window().document().expect("no document")
}

fn get_el(id: &str) -> Option<Element> {
    document().get_element_by_id(id)
}

fn get_html_el(id: &str) -> Option<HtmlElement> {
    get_el(id)?.dyn_into::<HtmlElement>().ok()
}

impl CubeAwayGame {
    pub fn new() -> Result<Rc<RefCell<Self>>, String> {
        let doc = document();
        let canvas: HtmlCanvasElement = doc
            .get_element_by_id("webgl-canvas")
            .ok_or("Missing #webgl-canvas")?
            .dyn_into()
            .map_err(|_| "#webgl-canvas not a canvas")?;

        let renderer = WebGlRenderer::new(canvas)?;
        let face_renderer = CubeFaceRenderer::new(2048);
        let celestial_sphere = CelestialSphere::new();
        let flying_manager = FlyingArrowManager::new();
        let particle_manager = ParticleManager::new();
        let controller = CubeController::new();
        let sound = SoundManager::new();
        let score_manager = ScoreManager::new();

        let mut saved_level = 1_u32;
        if let Some(storage) = window().local_storage().ok().flatten() {
            if let Ok(Some(lvl_str)) = storage.get_item("cubeaway_level") {
                if let Ok(parsed) = lvl_str.parse::<u32>() {
                    if (1..=1000).contains(&parsed) {
                        saved_level = parsed;
                    }
                }
            }
        }

        let current_shape = get_level_shape(saved_level);
        let current_shape_mesh = create_shape_geometry(current_shape);
        let current_theme = get_level_theme(saved_level);
        let current_celestial_body = get_celestial_body(saved_level);

        let game = Rc::new(RefCell::new(Self {
            renderer,
            face_renderer,
            celestial_sphere,
            flying_manager,
            particle_manager,
            controller,
            sound,
            score_manager,
            current_level: saved_level,
            grid_size: 20,
            current_theme,
            current_shape,
            current_shape_mesh,
            current_celestial_body,
            all_arrows: Vec::new(),
            grids: Vec::new(),
            total_initial_arrows: 0,
            remaining_arrows: 0,
            blocked_clicks_count: 0,
            current_portals: Vec::new(),
            current_reflectors: Vec::new(),
            hovered_arrow_id: None,
            hint_arrow_id: None,
            shaking_arrow: None,
            rotate_anim: None,
            dissolve_anim: None,
            is_victory_animating: false,
            is_cube_dissolved: false,
            cube_opacity: 1.0,
            leaderboard_tab: "alltime".to_string(),
            leaderboard_view_level: saved_level,
            star_map_zone: "inner".to_string(),
            star_map_search: String::new(),
            last_animate_time: now_ms(),
            rng_seed: 0x1357_9bdf,
        }));

        {
            let mut g = game.borrow_mut();
            g.on_resize();
            g.load_level(saved_level, false);
        }

        Self::load_background_texture(Rc::clone(&game));
        Self::bind_events(Rc::clone(&game));
        Self::start_animation_loop(Rc::clone(&game));

        // Initial background cloud sync
        wasm_bindgen_futures::spawn_local(async move {
            let _ = sync_with_cloud().await;
        });

        Ok(game)
    }

    fn next_rand(&mut self) -> f32 {
        self.rng_seed = self.rng_seed.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.rng_seed as f32) / (u32::MAX as f32)
    }

    fn load_background_texture(game: Rc<RefCell<Self>>) {
        let Ok(img) = HtmlImageElement::new() else { return };
        img.set_cross_origin(Some("anonymous"));
        let img_clone = img.clone();
        let game_clone = Rc::clone(&game);
        let onload = Closure::wrap(Box::new(move || {
            game_clone
                .borrow_mut()
                .renderer
                .upload_background_image(&img_clone);
        }) as Box<dyn FnMut()>);
        img.set_onload(Some(onload.as_ref().unchecked_ref()));
        onload.forget();

        img.set_src("./background_hd.jpg");
    }

    pub fn on_resize(&mut self) {
        let w = window();
        let width = w.inner_width().ok().and_then(|v| v.as_f64()).unwrap_or(1280.0);
        let height = w.inner_height().ok().and_then(|v| v.as_f64()).unwrap_or(720.0);
        let dpr = w.device_pixel_ratio().min(2.0).max(1.0);

        let pixel_w = (width * dpr).round() as u32;
        let pixel_h = (height * dpr).round() as u32;

        self.renderer.canvas.set_width(pixel_w);
        self.renderer.canvas.set_height(pixel_h);
    }

    pub fn load_level(&mut self, level_num: u32, is_restart: bool) {
        self.current_level = level_num.clamp(1, 1000);
        if let Some(storage) = window().local_storage().ok().flatten() {
            let _ = storage.set_item("cubeaway_level", &self.current_level.to_string());
        }

        self.current_shape = get_level_shape(self.current_level);
        self.current_celestial_body = get_celestial_body(self.current_level);
        self.current_theme = get_level_theme(self.current_level);
        self.face_renderer.set_theme(self.current_theme.clone());

        document().set_title(&format!(
            "CubeAway 3D - Bana {} • {}",
            self.current_level, self.current_celestial_body.name
        ));

        self.celestial_sphere.set_focus_mode(false);
        self.celestial_sphere
            .update_celestial_body(self.current_celestial_body);

        self.current_shape_mesh = create_shape_geometry(self.current_shape);
        self.renderer.set_shape_mesh(&self.current_shape_mesh);
        self.flying_manager
            .set_shape_type(self.current_shape.shape_type);
        self.controller.cube_visible = true;
        self.controller.cube_scale = 1.0;
        self.controller
            .set_target_distance(self.current_shape.camera_distance);
        self.cube_opacity = 1.0;

        self.dissolve_anim = None;
        self.rotate_anim = None;
        self.is_cube_dissolved = false;
        self.is_victory_animating = false;

        if let Some(el) = get_el("floating-planet-hud") {
            let _ = el.class_list().add_1("hidden");
        }

        self.flying_manager.clear_all();
        self.particle_manager.clear_all();
        self.hovered_arrow_id = None;
        self.hint_arrow_id = None;
        self.shaking_arrow = None;
        self.blocked_clicks_count = 0;

        if self.remaining_arrows > 0
            && self.remaining_arrows < self.total_initial_arrows
            && !is_restart
        {
            self.score_manager.rollback_unfinished_level();
        }

        let puzzle = generate_cube_puzzle(self.current_level);
        self.grid_size = puzzle.config.grid_size;
        self.all_arrows = puzzle.all_arrows;
        self.grids = puzzle.initial_grids;
        self.current_portals = puzzle.portals;
        self.current_reflectors = puzzle.reflectors;

        self.face_renderer.set_grid_size(self.grid_size);
        self.controller.grid_size = self.grid_size;

        self.total_initial_arrows = self.all_arrows.len();
        self.remaining_arrows = self.all_arrows.len();

        self.score_manager
            .start_level(is_restart, self.total_initial_arrows);

        for f in 0..6 {
            self.render_face_state(f, (0.0, 0.0));
        }

        self.update_hud();
        self.hide_win_modal();
    }

    pub fn render_face_state(&mut self, face_idx: usize, shake_offset: (f64, f64)) {
        let shaking_id = self.shaking_arrow.as_ref().map(|s| s.arrow_id.as_str());
        self.face_renderer.render_face(
            face_idx,
            &self.all_arrows,
            self.hovered_arrow_id.as_deref(),
            shaking_id,
            shake_offset,
            self.hint_arrow_id.as_deref(),
            &self.current_portals,
            &self.current_reflectors,
        );
    }

    pub fn update_score_hud(&self) {
        if let Some(el) = get_el("current-score") {
            let score = self.score_manager.get_score();
            el.set_text_content(Some(&format_number_sv(score)));
            if score < 0 {
                let _ = el.class_list().add_1("negative");
            } else {
                let _ = el.class_list().remove_1("negative");
            }
        }
    }

    pub fn bump_score_hud(&self) {
        if let Some(el) = get_el("current-score") {
            let _ = el.class_list().remove_1("bump");
            let _ = el.class_list().add_1("bump");
        }
    }

    pub fn update_combo_hud(&self) {
        let badge = get_el("combo-badge");
        let text = get_el("combo-text");
        let bar = get_html_el("combo-bar");
        let combo = self.score_manager.get_combo_streak();

        if combo > 1 {
            if let Some(b) = badge {
                let _ = b.class_list().remove_1("hidden");
            }
            if let Some(t) = text {
                t.set_text_content(Some(&format!("COMBO x{} 🔥", combo)));
            }
            if let Some(b) = bar {
                let _ = b.style().set_property(
                    "width",
                    &format!("{:.1}%", self.score_manager.get_combo_time_left_pct()),
                );
            }
        } else if let Some(b) = badge {
            let _ = b.class_list().add_1("hidden");
        }
    }

    pub fn update_hud(&self) {
        if let Some(el) = get_el("level-text") {
            el.set_text_content(Some(&format!(
                "Bana {} • {}",
                self.current_level, self.current_celestial_body.name
            )));
        }

        if let Some(btn) = get_el("celestial-explore-btn")
            .and_then(|e| e.dyn_into::<HtmlAnchorElement>().ok())
        {
            btn.set_href(self.current_celestial_body.url);
            btn.set_title(&format!(
                "Utforska {} ({}) i universum via {}",
                self.current_celestial_body.name,
                self.current_celestial_body.category,
                self.current_celestial_body.source_name
            ));
        }

        if let Some(el) = get_el("celestial-explore-name") {
            el.set_text_content(Some(self.current_celestial_body.name));
        }

        if let Some(badge) = get_html_el("level-display") {
            badge.set_title(&format!(
                "Bana {}: {} ({}) • {} • {}",
                self.current_level,
                self.current_celestial_body.name,
                self.current_celestial_body.category,
                self.current_shape.name,
                self.current_theme.name
            ));
        }

        if let Some(el) = get_el("level-stars") {
            let stars = self.score_manager.get_level_stars(self.current_level) as usize;
            let s = if stars > 0 {
                format!("{}{}", "★".repeat(stars), "☆".repeat(3 - stars))
            } else {
                "☆☆☆".to_string()
            };
            el.set_text_content(Some(&s));
        }

        if let Some(prev) =
            get_el("prev-level-btn").and_then(|e| e.dyn_into::<HtmlButtonElement>().ok())
        {
            prev.set_disabled(self.current_level <= 1);
        }
        if let Some(next) =
            get_el("next-level-btn").and_then(|e| e.dyn_into::<HtmlButtonElement>().ok())
        {
            next.set_disabled(self.current_level >= 1000);
        }

        if let Some(el) = get_el("remaining-arrows") {
            el.set_text_content(Some(&format!(
                "{} / {}",
                self.remaining_arrows, self.total_initial_arrows
            )));
        }

        if let Some(bar) = get_html_el("progress-bar") {
            let cleared = self.total_initial_arrows.saturating_sub(self.remaining_arrows);
            let pct = if self.total_initial_arrows > 0 {
                (cleared as f64 / self.total_initial_arrows as f64) * 100.0
            } else {
                0.0
            };
            let _ = bar.style().set_property("width", &format!("{:.1}%", pct));
            let _ = bar
                .style()
                .set_property("background", &self.current_theme.accent_gradient);
            let _ = bar.style().set_property(
                "box-shadow",
                &format!("0 0 10px {}", self.current_theme.arrow_glow),
            );
        }

        if let Some(el) = get_el("moves-count") {
            el.set_text_content(Some(&self.score_manager.get_moves_count().to_string()));
        }
        if let Some(el) = get_el("par-count") {
            el.set_text_content(Some(&self.score_manager.get_par_moves().to_string()));
        }

        self.update_score_hud();
        self.update_combo_hud();
    }

    pub fn spawn_score_toast(&self, text: &str, x: f64, y: f64, toast_type: &str) {
        let Some(container) = get_el("score-toasts") else { return };
        let Ok(toast) = document().create_element("div") else { return };
        toast.set_class_name(&format!("score-toast {}", toast_type));
        toast.set_text_content(Some(text));

        let win_w = window()
            .inner_width()
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(1280.0);
        let win_h = window()
            .inner_height()
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(720.0);
        let cx = x.clamp(80.0, (win_w - 80.0).max(80.0));
        let cy = y.clamp(80.0, (win_h - 80.0).max(80.0));

        if let Ok(h_toast) = toast.clone().dyn_into::<HtmlElement>() {
            let _ = h_toast.style().set_property("left", &format!("{:.0}px", cx));
            let _ = h_toast.style().set_property("top", &format!("{:.0}px", cy));
        }

        let _ = container.append_child(&toast);
        let toast_clone = toast.clone();
        let cb = Closure::once(Box::new(move || {
            toast_clone.remove();
        }) as Box<dyn FnOnce()>);
        let _ = window().set_timeout_with_callback_and_timeout_and_arguments_0(
            cb.as_ref().unchecked_ref(),
            1100,
        );
        cb.forget();
    }

    pub fn handle_hover(&mut self, hit: Option<HitResult>) {
        let Some(h) = hit else {
            if let Some(old_id) = self.hovered_arrow_id.take() {
                let mut faces = HashSet::new();
                if let Some(old_arrow) = self.all_arrows.iter().find(|a| a.id == old_id) {
                    for c in &old_arrow.cells {
                        faces.insert(c.face_idx);
                    }
                    if let Some(ref twin_id) = old_arrow.linked_with_id {
                        if let Some(twin) = self.all_arrows.iter().find(|a| &a.id == twin_id) {
                            for c in &twin.cells {
                                faces.insert(c.face_idx);
                            }
                        }
                    }
                }
                for f in faces {
                    self.render_face_state(f, (0.0, 0.0));
                }
            }
            return;
        };

        let arrow_id = self
            .grids
            .get(h.face_idx)
            .and_then(|f| f.get(h.r))
            .and_then(|r| r.get(h.c))
            .and_then(|c| c.clone());

        if let Some(new_id) = arrow_id {
            if self.hovered_arrow_id.as_deref() != Some(new_id.as_str()) {
                let old_id = self.hovered_arrow_id.replace(new_id.clone());
                let mut affected = HashSet::new();

                if let Some(oid) = old_id {
                    if let Some(old_arrow) = self.all_arrows.iter().find(|a| a.id == oid) {
                        for cell in &old_arrow.cells {
                            affected.insert(cell.face_idx);
                        }
                        if let Some(ref twin_id) = old_arrow.linked_with_id {
                            if let Some(twin) = self.all_arrows.iter().find(|a| &a.id == twin_id) {
                                for cell in &twin.cells {
                                    affected.insert(cell.face_idx);
                                }
                            }
                        }
                    }
                }

                if let Some(new_arrow) = self.all_arrows.iter().find(|a| a.id == new_id) {
                    for cell in &new_arrow.cells {
                        affected.insert(cell.face_idx);
                    }
                    if let Some(ref twin_id) = new_arrow.linked_with_id {
                        if let Some(twin) = self.all_arrows.iter().find(|a| &a.id == twin_id) {
                            for cell in &twin.cells {
                                affected.insert(cell.face_idx);
                            }
                        }
                    }
                }

                for f in affected {
                    self.render_face_state(f, (0.0, 0.0));
                }
            }
        } else if let Some(old_id) = self.hovered_arrow_id.take() {
            let mut faces = HashSet::new();
            if let Some(old_arrow) = self.all_arrows.iter().find(|a| a.id == old_id) {
                for cell in &old_arrow.cells {
                    faces.insert(cell.face_idx);
                }
                if let Some(ref twin_id) = old_arrow.linked_with_id {
                    if let Some(twin) = self.all_arrows.iter().find(|a| &a.id == twin_id) {
                        for cell in &twin.cells {
                            faces.insert(cell.face_idx);
                        }
                    }
                }
            }
            for f in faces {
                self.render_face_state(f, (0.0, 0.0));
            }
        }
    }

    pub fn launch_arrow(&mut self, arrow_id: &str, client_x: f64, client_y: f64) {
        let Some(arrow_idx) = self.all_arrows.iter().position(|a| a.id == arrow_id) else {
            return;
        };
        let arrow = self.all_arrows.remove(arrow_idx);

        self.score_manager.record_move();
        self.sound
            .play_arrow_success(Some(self.score_manager.get_combo_streak()));

        let (points_added, multiplier, _total, time_bonus_added) = self
            .score_manager
            .add_arrow_score(arrow.cells.len(), arrow.arrow_type == ArrowType::Linked);
        self.update_score_hud();
        self.bump_score_hud();
        self.update_combo_hud();

        let mut toast_msg = if multiplier > 1 {
            format!("+{} (x{}!)", points_added, multiplier)
        } else {
            format!("+{}", points_added)
        };
        if self.score_manager.get_game_mode() == GameMode::TimeAttack && time_bonus_added > 0.0 {
            toast_msg.push_str(&format!(" +{:.0}s ⏱️", time_bonus_added));
        }
        self.spawn_score_toast(
            &toast_msg,
            client_x,
            client_y,
            if multiplier > 1 || time_bonus_added > 0.0 {
                "combo-bonus"
            } else {
                "positive"
            },
        );

        if self.hint_arrow_id.as_deref() == Some(arrow.id.as_str())
            || (arrow.linked_with_id.is_some() && self.hint_arrow_id == arrow.linked_with_id)
        {
            self.hint_arrow_id = None;
        }
        if self.hovered_arrow_id.as_deref() == Some(arrow.id.as_str())
            || (arrow.linked_with_id.is_some() && self.hovered_arrow_id == arrow.linked_with_id)
        {
            self.hovered_arrow_id = None;
        }

        let mut affected_faces = HashSet::new();
        for cell in &arrow.cells {
            self.grids[cell.face_idx][cell.r as usize][cell.c as usize] = None;
            affected_faces.insert(cell.face_idx);
        }

        let arrow_fly_color = if arrow.arrow_type == ArrowType::Linked {
            0xff00ea
        } else {
            self.current_theme.flying_arrow_color
        };

        self.flying_manager.spawn_flying_arrow(
            &arrow,
            self.grid_size,
            CUBE_BASE_SIZE,
            arrow_fly_color,
            now_ms(),
        );

        // Particle burst at arrow head
        let local_head = self.flying_manager.coord_to_local_3d(
            arrow.head.face_idx,
            arrow.head.r as f32,
            arrow.head.c as f32,
            self.grid_size,
        );
        let world_head = self.controller.cube_model_matrix().transform_point3(local_head);
        let (_, tu, tv) = self
            .flying_manager
            .get_face_vectors(arrow.head.face_idx, 0.5, 0.5);
        let (dr, dc) = arrow.dir.delta();
        let world_dir = (self.controller.cube_quat * (tu * (dc as f32) + tv * (-dr as f32)))
            .normalize_or_zero();
        self.particle_manager
            .spawn_arrow_burst(world_head, world_dir, arrow_fly_color, 32);

        for f in affected_faces {
            self.render_face_state(f, (0.0, 0.0));
        }

        self.remaining_arrows = self.remaining_arrows.saturating_sub(1);
        self.update_hud();

        if self.remaining_arrows == 0 {
            self.handle_victory();
        }
    }

    pub fn handle_click(&mut self, hit: HitResult) {
        let Some(arrow_id) = self
            .grids
            .get(hit.face_idx)
            .and_then(|f| f.get(hit.r))
            .and_then(|r| r.get(hit.c))
            .and_then(|c| c.clone())
        else {
            return;
        };

        let Some(arrow_idx) = self.all_arrows.iter().position(|a| a.id == arrow_id) else {
            return;
        };
        let arrow = self.all_arrows[arrow_idx].clone();
        let can_fly = can_arrow_fly(
            &arrow,
            &self.grids,
            self.grid_size,
            &self.current_portals,
            &self.current_reflectors,
        );

        // 1. Frozen arrow
        if arrow.arrow_type == ArrowType::Frozen && arrow.is_frozen {
            self.score_manager.record_move();
            self.update_hud();

            if !can_fly {
                self.sound.play_arrow_blocked();
                self.blocked_clicks_count += 1;
                let faces: Vec<usize> = arrow
                    .cells
                    .iter()
                    .map(|c| c.face_idx)
                    .collect::<HashSet<_>>()
                    .into_iter()
                    .collect();
                self.shaking_arrow = Some(ShakingArrow {
                    arrow_id: arrow.id.clone(),
                    start_time: now_ms(),
                    faces: faces.clone(),
                });
                for f in faces {
                    self.render_face_state(f, (0.0, 0.0));
                }
                self.spawn_score_toast(
                    "❄️ Fryst pil blockerad framåt!",
                    hit.client_x,
                    hit.client_y,
                    "penalty",
                );
                return;
            }

            self.all_arrows[arrow_idx].is_frozen = false;
            self.sound.play_ice_break();

            let local_head = self.flying_manager.coord_to_local_3d(
                arrow.head.face_idx,
                arrow.head.r as f32,
                arrow.head.c as f32,
                self.grid_size,
            );
            let world_head = self.controller.cube_model_matrix().transform_point3(local_head);
            self.particle_manager
                .spawn_arrow_burst(world_head, Vec3::Y, 0x00f0ff, 28);

            self.spawn_score_toast(
                "❄️ Isen spräckt! Tryck igen för att skjuta iväg! ⚡",
                hit.client_x,
                hit.client_y,
                "combo-bonus",
            );

            let affected: HashSet<usize> = arrow.cells.iter().map(|c| c.face_idx).collect();
            for f in affected {
                self.render_face_state(f, (0.0, 0.0));
            }
            return;
        }

        // 2. Linked arrow
        if arrow.arrow_type == ArrowType::Linked {
            if let Some(ref twin_id) = arrow.linked_with_id {
                let twin_opt = self.all_arrows.iter().find(|a| &a.id == twin_id).cloned();
                let twin_can_fly = twin_opt.as_ref().is_some_and(|t| {
                    can_arrow_fly(
                        t,
                        &self.grids,
                        self.grid_size,
                        &self.current_portals,
                        &self.current_reflectors,
                    )
                });

                if !can_fly || !twin_can_fly {
                    self.sound.play_arrow_blocked();
                    self.blocked_clicks_count += 1;
                    self.score_manager.record_move();
                    self.update_hud();

                    let mut combined_faces: HashSet<usize> =
                        arrow.cells.iter().map(|c| c.face_idx).collect();
                    if let Some(ref t) = twin_opt {
                        for c in &t.cells {
                            combined_faces.insert(c.face_idx);
                        }
                    }
                    let faces_vec: Vec<usize> = combined_faces.into_iter().collect();
                    self.shaking_arrow = Some(ShakingArrow {
                        arrow_id: arrow.id.clone(),
                        start_time: now_ms(),
                        faces: faces_vec.clone(),
                    });
                    for f in faces_vec {
                        self.render_face_state(f, (0.0, 0.0));
                    }

                    if !can_fly && !twin_can_fly {
                        self.spawn_score_toast(
                            "🔗 Båda länkade pilarna är blockerade!",
                            hit.client_x,
                            hit.client_y,
                            "penalty",
                        );
                    } else if !can_fly {
                        self.spawn_score_toast(
                            "🔗 Denna pil är blockerad framåt!",
                            hit.client_x,
                            hit.client_y,
                            "penalty",
                        );
                    } else {
                        let twin_face_name = twin_opt
                            .as_ref()
                            .map(|t| CUBE_FACE_NAMES_SV[t.head.face_idx])
                            .unwrap_or("annan sida");
                        self.spawn_score_toast(
                            &format!(
                                "🔗 Länkad pil! Dess partner på {} är blockerad!",
                                twin_face_name
                            ),
                            hit.client_x,
                            hit.client_y,
                            "combo-bonus",
                        );
                    }
                    return;
                }

                // Both linked arrows can fly!
                self.sound.play_link_whoosh();
                self.spawn_score_toast(
                    "🔗 DUO-SKOTT! Länkade pilar fria! 🚀",
                    hit.client_x,
                    hit.client_y,
                    "combo-bonus",
                );
                let tid = twin_id.clone();
                self.launch_arrow(&arrow.id, hit.client_x, hit.client_y);
                self.launch_arrow(&tid, hit.client_x, hit.client_y);
                return;
            }
        }

        // 3. Normal arrow
        if can_fly {
            self.launch_arrow(&arrow.id, hit.client_x, hit.client_y);
        } else {
            self.sound.play_arrow_blocked();
            self.blocked_clicks_count += 1;
            self.score_manager.record_move();
            self.update_hud();

            let (penalty, _) = self.score_manager.on_blocked_arrow();
            self.update_score_hud();
            self.bump_score_hud();
            self.update_combo_hud();

            if penalty > 0 {
                self.spawn_score_toast(
                    &format!("-{}", penalty),
                    hit.client_x,
                    hit.client_y,
                    "penalty",
                );
            }

            let faces: Vec<usize> = arrow
                .cells
                .iter()
                .map(|c| c.face_idx)
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            self.shaking_arrow = Some(ShakingArrow {
                arrow_id: arrow.id.clone(),
                start_time: now_ms(),
                faces: faces.clone(),
            });
            for f in faces {
                self.render_face_state(f, (0.0, 0.0));
            }
        }
    }

    pub fn handle_miss_click(&mut self, client_x: f64, client_y: f64) {
        self.controller
            .update_pointer_pos(&self.renderer.canvas, client_x, client_y);
        let rect = self.renderer.canvas.get_bounding_client_rect();
        let aspect = if rect.height() > 0.0 {
            (rect.width() / rect.height()) as f32
        } else {
            1.0
        };
        let (origin, dir) = self.controller.get_world_ray(aspect);
        if self.celestial_sphere.check_intersection(origin, dir) {
            self.open_celestial_link();
        }
    }

    pub fn handle_hover_background(&mut self, client_x: f64, client_y: f64) {
        self.controller
            .update_pointer_pos(&self.renderer.canvas, client_x, client_y);
        let rect = self.renderer.canvas.get_bounding_client_rect();
        let aspect = if rect.height() > 0.0 {
            (rect.width() / rect.height()) as f32
        } else {
            1.0
        };
        let (origin, dir) = self.controller.get_world_ray(aspect);
        let hits = self.celestial_sphere.check_intersection(origin, dir);

        if hits {
            let _ = self.renderer.canvas.style().set_property("cursor", "pointer");
            self.renderer.canvas.set_title(&format!(
                "Klicka för att utforska {} ({}) ↗",
                self.current_celestial_body.name, self.current_celestial_body.source_name
            ));
        } else {
            let _ = self.renderer.canvas.style().set_property("cursor", "grab");
            let _ = self.renderer.canvas.remove_attribute("title");
        }
    }

    pub fn open_celestial_link(&mut self) {
        self.sound.play_click();
        let w = window();
        let cx = w.inner_width().ok().and_then(|v| v.as_f64()).unwrap_or(1280.0) * 0.5;
        let cy = w.inner_height().ok().and_then(|v| v.as_f64()).unwrap_or(720.0) * 0.5;
        self.spawn_score_toast(
            &format!(
                "🚀 Öppnar {} ({})...",
                self.current_celestial_body.name, self.current_celestial_body.source_name
            ),
            cx,
            cy,
            "positive",
        );
        let _ = w.open_with_url_and_target_and_features(
            self.current_celestial_body.url,
            "_blank",
            "noopener,noreferrer",
        );
    }

    pub fn give_hint(&mut self) {
        let hint_opt = self
            .all_arrows
            .iter()
            .find(|a| {
                if a.arrow_type == ArrowType::Linked {
                    if let Some(ref tid) = a.linked_with_id {
                        let twin = self.all_arrows.iter().find(|t| &t.id == tid);
                        return can_arrow_fly(
                            a,
                            &self.grids,
                            self.grid_size,
                            &self.current_portals,
                            &self.current_reflectors,
                        ) && twin.is_some_and(|tw| {
                            can_arrow_fly(
                                tw,
                                &self.grids,
                                self.grid_size,
                                &self.current_portals,
                                &self.current_reflectors,
                            )
                        });
                    }
                }
                can_arrow_fly(
                    a,
                    &self.grids,
                    self.grid_size,
                    &self.current_portals,
                    &self.current_reflectors,
                )
            })
            .cloned();

        if let Some(hint) = hint_opt {
            let prev_id = self.hint_arrow_id.replace(hint.id.clone());
            let mut affected = HashSet::new();
            if let Some(pid) = prev_id {
                if let Some(pa) = self.all_arrows.iter().find(|a| a.id == pid) {
                    for c in &pa.cells {
                        affected.insert(c.face_idx);
                    }
                }
            }
            for c in &hint.cells {
                affected.insert(c.face_idx);
            }
            for f in affected {
                self.render_face_state(f, (0.0, 0.0));
            }
            self.rotate_to_face(hint.head.face_idx);
        }
    }

    pub fn rotate_to_face(&mut self, face_idx: usize) {
        let target_quat = match face_idx {
            0 => Quat::from_rotation_y(-PI * 0.5),
            1 => Quat::from_rotation_y(PI * 0.5),
            2 => Quat::from_rotation_x(PI * 0.5),
            3 => Quat::from_rotation_x(-PI * 0.5),
            4 => Quat::IDENTITY,
            _ => Quat::from_rotation_y(PI),
        };

        self.rotate_anim = Some(RotateAnimation {
            start_quat: self.controller.cube_quat,
            target_quat,
            start_time: now_ms(),
            duration: 600.0,
        });
    }

    pub fn handle_victory(&mut self) {
        if self.is_victory_animating {
            return;
        }
        self.is_victory_animating = true;

        let stars = self
            .score_manager
            .calculate_stars(self.blocked_clicks_count);
        self.score_manager
            .save_level_stars(self.current_level, stars);
        let win_bonus = self.score_manager.add_level_win_bonus(self.current_level);

        self.update_score_hud();
        self.bump_score_hud();
        self.update_hud();

        self.sound.play_victory_fanfare();
        self.celestial_sphere.set_focus_mode(true);
        self.particle_manager
            .spawn_victory_explosion(Vec3::ZERO, 160);

        self.dissolve_anim = Some(DissolveAnimation {
            start_time: now_ms(),
            duration: 1500.0,
            win_bonus,
            stars,
        });
    }

    pub fn show_win_modal(&mut self, bonus: WinBonus, stars: u32) {
        if let Some(modal) = get_el("win-modal") {
            if let Ok(Some(title)) = modal.query_selector(".win-title") {
                title.set_text_content(Some(&format!(
                    "Bana {} • {} klarad!",
                    self.current_level, self.current_celestial_body.name
                )));
            }
        }
        if let Some(desc) = get_el("win-desc") {
            desc.set_text_content(Some(&format!(
                "Otroligt snyggt! Bana {} • {} ({}) är avklarad.",
                self.current_level, self.current_celestial_body.name, self.current_shape.name
            )));
        }

        if let Some(el) = get_el("win-celestial-category") {
            el.set_text_content(Some(self.current_celestial_body.category));
        }
        if let Some(el) = get_el("win-celestial-name") {
            el.set_text_content(Some(self.current_celestial_body.name));
        }
        if let Some(el) = get_el("win-celestial-desc") {
            el.set_text_content(Some(self.current_celestial_body.description));
        }
        if let Some(el) = get_el("win-celestial-source") {
            el.set_text_content(Some(self.current_celestial_body.source_name));
        }
        if let Some(link) =
            get_el("win-celestial-link").and_then(|e| e.dyn_into::<HtmlAnchorElement>().ok())
        {
            link.set_href(self.current_celestial_body.url);
            link.set_title(&format!(
                "Öppna {} i {}",
                self.current_celestial_body.name, self.current_celestial_body.source_name
            ));
        }

        for i in 1..=3 {
            if let Some(star_el) = get_el(&format!("win-star-{}", i)) {
                let _ = star_el.class_list().remove_1("earned");
                if i <= stars {
                    let _ = star_el.class_list().add_1("earned");
                    self.sound.play_star_pop((i - 1) as usize);
                }
            }
        }

        let par_label = get_el("win-par-label");
        let par_val = get_html_el("win-par-val");
        if let Some(pv) = par_val {
            if bonus.is_par {
                if let Some(pl) = par_label {
                    pl.set_text_content(Some("Par-resultat:"));
                }
                pv.set_text_content(Some(&format!(
                    "🎯 Perfekt Match på Par (+{})",
                    format_number_sv(bonus.par_bonus)
                )));
                let _ = pv.style().set_property("color", "#ffd700");
            } else {
                if let Some(pl) = par_label {
                    pl.set_text_content(Some("Drag / Par:"));
                }
                pv.set_text_content(Some(&format!(
                    "{} drag (Par: {}) +{}",
                    self.score_manager.get_moves_count(),
                    self.score_manager.get_par_moves(),
                    format_number_sv(bonus.par_bonus)
                )));
                let _ = pv.style().set_property("color", "#ff66cc");
            }
        }

        if let Some(el) = get_el("win-level-bonus") {
            el.set_text_content(Some(&format!("+{}", format_number_sv(bonus.total_bonus))));
        }
        if let Some(el) = get_el("win-total-score") {
            el.set_text_content(Some(&format_number_sv(self.score_manager.get_score())));
        }

        let current_score = self.score_manager.get_score();
        let is_level_high = self
            .score_manager
            .is_level_high_score(self.current_level, current_score);
        let is_all_time_high = self.score_manager.is_all_time_high_score(current_score);

        if let Some(banner) = get_el("win-highscore-banner") {
            if is_all_time_high {
                banner.set_text_content(Some("👑 NYTT ALL-TIME HIGH! 👑"));
            } else if is_level_high {
                banner.set_text_content(Some(&format!(
                    "🌟 NYTT REKORD PÅ BANA {} • {}! 🌟",
                    self.current_level,
                    self.current_celestial_body.name.to_uppercase()
                )));
            } else {
                banner.set_text_content(Some(&format!(
                    "🌟 SPARA DITT RESULTAT FÖR BANA {}! 🌟",
                    self.current_level
                )));
            }
        }

        if let Some(hs_sec) = get_el("win-highscore-section") {
            if is_level_high || is_all_time_high || current_score > 0 {
                let _ = hs_sec.class_list().remove_1("hidden");
                if let Some(inp) = get_el("win-initials-input")
                    .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                {
                    inp.set_value("");
                    inp.set_disabled(false);
                    let _ = inp.focus();
                }
                if let Some(btn) = get_el("win-save-score-btn")
                    .and_then(|e| e.dyn_into::<HtmlButtonElement>().ok())
                {
                    btn.set_disabled(false);
                }
                if let Some(msg) = get_el("win-score-saved-msg") {
                    let _ = msg.class_list().add_1("hidden");
                }
            } else {
                let _ = hs_sec.class_list().add_1("hidden");
            }
        }

        if let Some(next_btn) = get_el("next-level-win-btn") {
            if self.current_level >= 1000 {
                next_btn.set_text_content(Some("Börja om från Bana 1 🌟"));
            } else {
                next_btn.set_text_content(Some("Nästa Bana ›"));
            }
        }

        if let Some(modal) = get_el("win-modal") {
            if let Some(ph) = get_el("floating-planet-hud") {
                let _ = ph.class_list().add_1("hidden");
            }
            let _ = modal.class_list().remove_1("hidden");
        }
    }

    pub fn hide_win_modal(&self) {
        if let Some(modal) = get_el("win-modal") {
            let _ = modal.class_list().add_1("hidden");
        }
        if self.is_cube_dissolved && self.remaining_arrows == 0 {
            if let Some(ph) = get_el("floating-planet-hud") {
                let _ = ph.class_list().remove_1("hidden");
                if let Some(name_el) = get_el("floating-planet-name") {
                    name_el.set_text_content(Some(self.current_celestial_body.name));
                }
            }
        }
    }

    pub fn render_leaderboard(&self) {
        let Some(tbody) = get_el("leaderboard-body") else { return };

        let tab_level_btn = get_el("tab-level-lb");
        let tab_alltime_btn = get_el("tab-alltime-lb");
        let level_switcher = get_el("lb-level-switcher");
        let level_title = get_el("lb-level-title");
        let selected_level_num = get_el("lb-selected-level-num");
        let th_level = get_el("lb-th-level");
        let direct_level_el = get_el("lb-direct-current-level");

        if let Some(el) = direct_level_el {
            el.set_text_content(Some(&format!(
                "{} • {}",
                self.current_level, self.current_celestial_body.name
            )));
        }

        if self.leaderboard_tab == "level" {
            if let Some(b) = tab_level_btn {
                let _ = b.class_list().add_1("active");
            }
            if let Some(b) = tab_alltime_btn {
                let _ = b.class_list().remove_1("active");
            }
            if let Some(s) = level_switcher {
                let _ = s.class_list().remove_1("hidden");
            }
            if let Some(th) = th_level {
                let _ = th.class_list().add_1("hidden");
            }
            let target_celestial = get_celestial_body(self.leaderboard_view_level);
            if let Some(el) = selected_level_num {
                el.set_text_content(Some(&self.leaderboard_view_level.to_string()));
            }
            if let Some(el) = level_title {
                el.set_text_content(Some(&format!(
                    "Bana {} • {}",
                    self.leaderboard_view_level, target_celestial.name
                )));
            }

            if let Some(prev) =
                get_el("lb-prev-level").and_then(|e| e.dyn_into::<HtmlButtonElement>().ok())
            {
                prev.set_disabled(self.leaderboard_view_level <= 1);
            }
            if let Some(next) =
                get_el("lb-next-level").and_then(|e| e.dyn_into::<HtmlButtonElement>().ok())
            {
                next.set_disabled(self.leaderboard_view_level >= 1000);
            }
        } else {
            if let Some(b) = tab_level_btn {
                let _ = b.class_list().remove_1("active");
            }
            if let Some(b) = tab_alltime_btn {
                let _ = b.class_list().add_1("active");
            }
            if let Some(s) = level_switcher {
                let _ = s.class_list().add_1("hidden");
            }
            if let Some(th) = th_level {
                let _ = th.class_list().remove_1("hidden");
            }
        }

        if let Some(table_el) = get_el("leaderboard-table") {
            if self.leaderboard_tab == "level" {
                let _ = table_el.class_list().add_1("mode-level");
                let _ = table_el.class_list().remove_1("mode-alltime");
            } else {
                let _ = table_el.class_list().remove_1("mode-level");
                let _ = table_el.class_list().add_1("mode-alltime");
            }
        }

        let list = if self.leaderboard_tab == "level" {
            self.score_manager
                .get_level_leaderboard(self.leaderboard_view_level)
        } else {
            self.score_manager.get_all_time_leaderboard()
        };

        if let Some(summary) = get_el("lb-summary-score") {
            summary.set_text_content(Some(&format_number_sv(self.score_manager.get_score())));
        }

        let mut rows_html = String::new();
        for entry in list {
            let row_class = match entry.rank {
                1 => "top-1",
                2 => "top-2",
                3 => "top-3",
                _ => "",
            };
            let (rank_display, rank_class) = match entry.rank {
                1 => ("🥇 1".to_string(), "gold"),
                2 => ("🥈 2".to_string(), "silver"),
                3 => ("🥉 3".to_string(), "bronze"),
                r => (format!("#{}", r), ""),
            };
            let celestial = get_celestial_body(entry.level);
            let level_cell = if self.leaderboard_tab == "alltime" {
                format!(
                    r#"<td class="col-level"><span class="lb-level-badge" title="Bana {} • {} ({})">{}. {}</span></td>"#,
                    entry.level, celestial.name, celestial.category, entry.level, celestial.name
                )
            } else {
                String::new()
            };

            rows_html.push_str(&format!(
                r#"<tr class="{}">
                    <td class="col-rank"><span class="rank-badge {}">{}</span></td>
                    <td class="col-player"><span class="initials-badge">{}</span></td>
                    <td class="col-score score-col">{}</td>
                    {}
                    <td class="col-date date-col">{}</td>
                </tr>"#,
                row_class,
                rank_class,
                rank_display,
                entry.initials,
                format_number_sv(entry.score),
                level_cell,
                entry.date
            ));
        }

        tbody.set_inner_html(&rows_html);
    }

    pub fn open_leaderboard_modal(game: &Rc<RefCell<Self>>) {
        {
            let mut g = game.borrow_mut();
            g.leaderboard_tab = "alltime".to_string();
            g.leaderboard_view_level = g.current_level;
            g.score_manager.migrate_legacy_vaults();
            g.render_leaderboard();
        }
        if let Some(modal) = get_el("highscore-modal") {
            let _ = modal.class_list().remove_1("hidden");
        }
        if let Some(inp) =
            get_el("direct-initials-input").and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
        {
            inp.set_value("");
            let _ = inp.focus();
        }

        let game_clone = Rc::clone(game);
        wasm_bindgen_futures::spawn_local(async move {
            if sync_with_cloud().await {
                game_clone.borrow().render_leaderboard();
            }
        });
    }

    pub fn render_star_map(game: &Rc<RefCell<Self>>, zone: Option<&str>, query: Option<&str>) {
        let items: Vec<(CelestialBody, u32, bool)> = {
            let mut g = game.borrow_mut();
            if let Some(z) = zone {
                g.star_map_zone = z.to_string();
            }
            if let Some(q) = query {
                g.star_map_search = q.trim().to_lowercase();
            }

            let (min_lvl, max_lvl) = match g.star_map_zone.as_str() {
                "gas" => (11, 35),
                "kuiper" => (36, 75),
                "stars" => (76, 200),
                "nebula" => (201, 500),
                "galaxies" => (501, 1000),
                _ => (1, 10),
            };

            let mut bodies: Vec<CelestialBody> = Vec::new();
            if !g.star_map_search.is_empty() {
                let q = g.star_map_search.clone();
                if let Ok(num) = q.parse::<u32>() {
                    if (1..=1000).contains(&num) {
                        bodies.push(get_celestial_body(num));
                    }
                }
                for i in 1..=1000 {
                    let b = get_celestial_body(i);
                    if b.name.to_lowercase().contains(&q) || b.category.to_lowercase().contains(&q)
                    {
                        if !bodies.iter().any(|x| x.level == b.level) {
                            bodies.push(b);
                        }
                    }
                    if bodies.len() >= 80 {
                        break;
                    }
                }
            } else {
                for i in min_lvl..=max_lvl {
                    bodies.push(get_celestial_body(i));
                }
            }

            bodies
                .into_iter()
                .map(|b| {
                    let stars = g.score_manager.get_level_stars(b.level);
                    let is_cur = b.level == g.current_level;
                    (b, stars, is_cur)
                })
                .collect()
        };

        let Some(grid) = get_el("starmap-grid") else { return };
        grid.set_inner_html("");
        let doc = document();

        for (body, stars, is_cur) in items {
            let Ok(item_el) = doc.create_element("div") else { continue };
            item_el.set_class_name(if is_cur {
                "starmap-item current"
            } else {
                "starmap-item"
            });
            let star_str = if stars > 0 {
                format!(
                    "{}{}",
                    "★".repeat(stars as usize),
                    "☆".repeat(3 - stars as usize)
                )
            } else {
                "☆☆☆".to_string()
            };

            item_el.set_inner_html(&format!(
                r#"<div class="starmap-item-header">
                    <span class="starmap-item-lvl">BANA {}</span>
                    <span class="starmap-item-cat">{}</span>
                </div>
                <div class="starmap-item-name" title="{}">{}</div>
                <div class="starmap-item-stars" title="{} stjärnor">{}</div>"#,
                body.level, body.category, body.name, body.name, stars, star_str
            ));

            let lvl = body.level;
            let game_clone = Rc::clone(game);
            let cb = Closure::wrap(Box::new(move || {
                if let Some(m) = get_el("level-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
                game_clone.borrow_mut().load_level(lvl, false);
            }) as Box<dyn FnMut()>);
            let _ = item_el.add_event_listener_with_callback("click", cb.as_ref().unchecked_ref());
            cb.forget();

            let _ = grid.append_child(&item_el);
        }
    }

    fn bind_events(game: Rc<RefCell<Self>>) {
        let win = window();
        let doc = document();
        let canvas = game.borrow().renderer.canvas.clone();

        // 1. Resize
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move || {
                g.borrow_mut().on_resize();
            }) as Box<dyn FnMut()>);
            let _ = win.add_event_listener_with_callback("resize", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 2. Pointer Down on Canvas
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: PointerEvent| {
                let mut game = g.borrow_mut();
                game.sound.init_ctx();
                game.rotate_anim = None;
                game.controller.is_auto_rotating = false;

                let p_type = e.pointer_type();
                if p_type != "touch" {
                    let _ = game.renderer.canvas.set_pointer_capture(e.pointer_id());
                }

                let cx = e.client_x() as f64;
                let cy = e.client_y() as f64;
                game.controller.active_pointers.insert(
                    e.pointer_id(),
                    PointerInfo {
                        x: cx,
                        y: cy,
                        pointer_type: p_type,
                    },
                );
                let canvas_el = game.renderer.canvas.clone();
                game.controller.update_pointer_pos(&canvas_el, cx, cy);

                if game.controller.active_pointers.len() == 1 {
                    game.controller.is_pointer_down = true;
                    game.controller.has_dragged = false;
                    game.controller.pointer_start_x = cx;
                    game.controller.pointer_start_y = cy;
                    game.controller.last_pointer_x = cx;
                    game.controller.last_pointer_y = cy;
                    game.controller.angular_velocity_x = 0.0;
                    game.controller.angular_velocity_y = 0.0;
                } else if game.controller.active_pointers.len() == 2 {
                    game.controller.has_dragged = true;
                    let pts: Vec<PointerInfo> =
                        game.controller.active_pointers.values().cloned().collect();
                    let dist = (pts[0].x - pts[1].x).hypot(pts[0].y - pts[1].y);
                    game.controller.initial_pinch_distance = dist;
                    game.controller.initial_target_distance = game.controller.target_distance;
                }
            }) as Box<dyn FnMut(PointerEvent)>);
            let _ =
                canvas.add_event_listener_with_callback("pointerdown", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 3. Pointer Move on Window
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: PointerEvent| {
                let mut game = g.borrow_mut();
                let cx = e.client_x() as f64;
                let cy = e.client_y() as f64;
                let p_type = e.pointer_type();
                let pid = e.pointer_id();

                let canvas_el = game.renderer.canvas.clone();
                game.controller.update_pointer_pos(&canvas_el, cx, cy);

                if game.controller.active_pointers.contains_key(&pid) {
                    game.controller.active_pointers.insert(
                        pid,
                        PointerInfo {
                            x: cx,
                            y: cy,
                            pointer_type: p_type.clone(),
                        },
                    );
                }

                if game.controller.active_pointers.len() >= 2 {
                    let pts: Vec<PointerInfo> =
                        game.controller.active_pointers.values().cloned().collect();
                    let current_dist = (pts[0].x - pts[1].x).hypot(pts[0].y - pts[1].y);
                    if game.controller.initial_pinch_distance > 10.0 && current_dist > 10.0 {
                        let factor = (game.controller.initial_pinch_distance / current_dist) as f32;
                        let target = game.controller.initial_target_distance * factor;
                        game.controller.set_target_distance(target);
                    }
                    return;
                }

                if game.controller.is_pointer_down && game.controller.active_pointers.len() == 1 {
                    let dx = cx - game.controller.last_pointer_x;
                    let dy = cy - game.controller.last_pointer_y;

                    let threshold = if p_type == "touch" { 18.0 } else { 6.0 };
                    let total_dist = (cx - game.controller.pointer_start_x)
                        .hypot(cy - game.controller.pointer_start_y);
                    if total_dist > threshold {
                        game.controller.has_dragged = true;
                    }

                    game.controller.last_pointer_x = cx;
                    game.controller.last_pointer_y = cy;

                    if game.controller.has_dragged {
                        let vy = (dx as f32) * 0.006;
                        let vx = (dy as f32) * 0.006;
                        game.controller.angular_velocity_y = vy;
                        game.controller.angular_velocity_x = vx;
                        game.controller.apply_rotation(vx, vy);
                    }
                } else if p_type != "touch" {
                    let hit = {
                        let GameBorrow {
                            ref mut controller,
                            ref renderer,
                            ref current_shape_mesh,
                        } = GameBorrow::split(&mut game);
                        controller.perform_raycast(
                            &renderer.canvas,
                            current_shape_mesh,
                            Some(cx),
                            Some(cy),
                        )
                    };
                    game.handle_hover(hit);
                    if hit.is_none() {
                        game.handle_hover_background(cx, cy);
                    }
                }
            }) as Box<dyn FnMut(PointerEvent)>);
            let _ =
                win.add_event_listener_with_callback("pointermove", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 4. Pointer Up on Window
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: PointerEvent| {
                let mut game = g.borrow_mut();
                let p_type = e.pointer_type();
                let pid = e.pointer_id();
                if p_type != "touch" {
                    let _ = game.renderer.canvas.release_pointer_capture(pid);
                }

                game.controller.active_pointers.remove(&pid);

                if game.controller.active_pointers.len() == 1 {
                    let rem = game
                        .controller
                        .active_pointers
                        .values()
                        .next()
                        .unwrap()
                        .clone();
                    game.controller.last_pointer_x = rem.x;
                    game.controller.last_pointer_y = rem.y;
                    game.controller.pointer_start_x = rem.x;
                    game.controller.pointer_start_y = rem.y;
                    game.controller.has_dragged = true;
                    return;
                }

                if game.controller.active_pointers.is_empty() {
                    if !game.controller.is_pointer_down {
                        return;
                    }
                    game.controller.is_pointer_down = false;
                    game.controller.angular_velocity_x = 0.0;
                    game.controller.angular_velocity_y = 0.0;
                    game.controller.is_auto_rotating = false;

                    let click_x = e.client_x() as f64;
                    let click_y = e.client_y() as f64;
                    let total_dist = (click_x - game.controller.pointer_start_x)
                        .hypot(click_y - game.controller.pointer_start_y);
                    let threshold = if p_type == "touch" { 18.0 } else { 6.0 };

                    if !game.controller.has_dragged && total_dist <= threshold {
                        let hit = {
                            let GameBorrow {
                                ref mut controller,
                                ref renderer,
                                ref current_shape_mesh,
                            } = GameBorrow::split(&mut game);
                            controller.perform_raycast(
                                &renderer.canvas,
                                current_shape_mesh,
                                Some(click_x),
                                Some(click_y),
                            )
                        };
                        if let Some(h) = hit {
                            game.handle_click(h);
                        } else {
                            game.handle_miss_click(click_x, click_y);
                        }
                    }
                }
            }) as Box<dyn FnMut(PointerEvent)>);
            let _ = win.add_event_listener_with_callback("pointerup", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 5. Touch Pinch Zoom fallback
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: TouchEvent| {
                let touches = e.touches();
                if touches.length() >= 2 {
                    e.prevent_default();
                    let mut game = g.borrow_mut();
                    game.controller.is_auto_rotating = false;
                    game.controller.has_dragged = true;
                    if let (Some(t0), Some(t1)) = (touches.get(0), touches.get(1)) {
                        let dx = (t0.client_x() - t1.client_x()) as f64;
                        let dy = (t0.client_y() - t1.client_y()) as f64;
                        game.controller.touch_pinch_start_dist = dx.hypot(dy);
                        game.controller.touch_pinch_start_target_dist =
                            game.controller.target_distance;
                    }
                }
            }) as Box<dyn FnMut(TouchEvent)>);
            let _ =
                canvas.add_event_listener_with_callback("touchstart", cb.as_ref().unchecked_ref());
            cb.forget();
        }
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: TouchEvent| {
                let touches = e.touches();
                if touches.length() >= 2 {
                    e.prevent_default();
                    let mut game = g.borrow_mut();
                    game.controller.has_dragged = true;
                    if let (Some(t0), Some(t1)) = (touches.get(0), touches.get(1)) {
                        let dx = (t0.client_x() - t1.client_x()) as f64;
                        let dy = (t0.client_y() - t1.client_y()) as f64;
                        let cur_dist = dx.hypot(dy);
                        if game.controller.touch_pinch_start_dist > 10.0 && cur_dist > 10.0 {
                            let factor =
                                (game.controller.touch_pinch_start_dist / cur_dist) as f32;
                            let target = game.controller.touch_pinch_start_target_dist * factor;
                            game.controller.set_target_distance(target);
                        }
                    }
                }
            }) as Box<dyn FnMut(TouchEvent)>);
            let _ =
                canvas.add_event_listener_with_callback("touchmove", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 6. Wheel Zoom
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: WheelEvent| {
                e.prevent_default();
                g.borrow_mut().controller.on_wheel(e.delta_y());
            }) as Box<dyn FnMut(WheelEvent)>);
            let _ = canvas.add_event_listener_with_callback("wheel", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 7. Keyboard (Arrows + Escape)
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: KeyboardEvent| {
                if let Some(target) = e
                    .target()
                    .and_then(|t| t.dyn_into::<Element>().ok())
                {
                    let tag = target.tag_name().to_uppercase();
                    if tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT" {
                        return;
                    }
                }
                let key = e.key();
                if key == "Escape" {
                    for id in [
                        "guide-modal",
                        "highscore-modal",
                        "level-modal",
                        "time-over-modal",
                    ] {
                        if let Some(m) = get_el(id) {
                            if !m.class_list().contains("hidden") {
                                let _ = m.class_list().add_1("hidden");
                                return;
                            }
                        }
                    }
                    if let Some(wm) = get_el("win-modal") {
                        if !wm.class_list().contains("hidden") {
                            g.borrow().hide_win_modal();
                            return;
                        }
                    }
                }
                if ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].contains(&key.as_str()) {
                    let mut game = g.borrow_mut();
                    game.controller.is_auto_rotating = false;
                    game.controller.keys_down.insert(key);
                }
            }) as Box<dyn FnMut(KeyboardEvent)>);
            let _ = win.add_event_listener_with_callback("keydown", cb.as_ref().unchecked_ref());
            cb.forget();
        }
        {
            let g = Rc::clone(&game);
            let cb = Closure::wrap(Box::new(move |e: KeyboardEvent| {
                g.borrow_mut().controller.keys_down.remove(&e.key());
            }) as Box<dyn FnMut(KeyboardEvent)>);
            let _ = win.add_event_listener_with_callback("keyup", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        // 8. Bind UI Buttons & Modals
        let bind_click = |id: &str, mut f: Box<dyn FnMut(Event)>| {
            if let Some(el) = doc.get_element_by_id(id) {
                let cb = Closure::wrap(Box::new(move |e: Event| f(e)) as Box<dyn FnMut(Event)>);
                let _ = el.add_event_listener_with_callback("click", cb.as_ref().unchecked_ref());
                cb.forget();
            }
        };

        {
            let g = Rc::clone(&game);
            bind_click(
                "zoom-in-btn",
                Box::new(move |_| g.borrow_mut().controller.zoom_in(0.8)),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "zoom-out-btn",
                Box::new(move |_| g.borrow_mut().controller.zoom_out(0.8)),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "prev-level-btn",
                Box::new(move |e| {
                    e.stop_propagation();
                    let mut game = g.borrow_mut();
                    if game.current_level > 1 {
                        let lvl = game.current_level - 1;
                        game.load_level(lvl, false);
                    }
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "next-level-btn",
                Box::new(move |e| {
                    e.stop_propagation();
                    let mut game = g.borrow_mut();
                    if game.current_level < 1000 {
                        let lvl = game.current_level + 1;
                        game.load_level(lvl, false);
                    }
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "restart-btn",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    let lvl = game.current_level;
                    game.load_level(lvl, true);
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "hint-btn",
                Box::new(move |_| {
                    g.borrow_mut().give_hint();
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "sound-btn",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    game.sound.init_ctx();
                    let muted = game.sound.toggle_mute();
                    if let Some(icon) = get_el("sound-icon") {
                        icon.set_text_content(Some(if muted { "🔇" } else { "🔊" }));
                    }
                }),
            );
        }

        // Star Map Modal
        let open_starmap = {
            let g = Rc::clone(&game);
            move || {
                if let Some(m) = get_el("level-modal") {
                    let _ = m.class_list().remove_1("hidden");
                }
                if let Some(inp) = get_el("level-search-input")
                    .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                {
                    inp.set_value("");
                }
                Self::render_star_map(&g, None, Some(""));
            }
        };
        {
            let f = open_starmap.clone();
            bind_click("levels-modal-btn", Box::new(move |_| f()));
        }
        {
            let f = open_starmap.clone();
            bind_click("level-display", Box::new(move |_| f()));
        }
        bind_click(
            "close-level-modal",
            Box::new(|_| {
                if let Some(m) = get_el("level-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
            }),
        );

        // Star map zone buttons
        if let Ok(nodes) = doc.query_selector_all(".starmap-zone-btn") {
            for i in 0..nodes.length() {
                if let Some(btn) = nodes.get(i).and_then(|n| n.dyn_into::<Element>().ok()) {
                    let g = Rc::clone(&game);
                    let btn_clone = btn.clone();
                    let cb = Closure::wrap(Box::new(move || {
                        if let Ok(all) = document().query_selector_all(".starmap-zone-btn") {
                            for j in 0..all.length() {
                                if let Some(el) =
                                    all.get(j).and_then(|n| n.dyn_into::<Element>().ok())
                                {
                                    let _ = el.class_list().remove_1("active");
                                }
                            }
                        }
                        let _ = btn_clone.class_list().add_1("active");
                        let zone = btn_clone
                            .get_attribute("data-zone")
                            .unwrap_or_else(|| "inner".to_string());
                        if let Some(inp) = get_el("level-search-input")
                            .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                        {
                            inp.set_value("");
                        }
                        Self::render_star_map(&g, Some(&zone), Some(""));
                    }) as Box<dyn FnMut()>);
                    let _ =
                        btn.add_event_listener_with_callback("click", cb.as_ref().unchecked_ref());
                    cb.forget();
                }
            }
        }

        if let Some(search_inp) =
            get_el("level-search-input").and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
        {
            let g = Rc::clone(&game);
            let inp_c = search_inp.clone();
            let cb = Closure::wrap(Box::new(move || {
                let q = inp_c.value();
                Self::render_star_map(&g, None, Some(&q));
            }) as Box<dyn FnMut()>);
            let _ =
                search_inp.add_event_listener_with_callback("input", cb.as_ref().unchecked_ref());
            cb.forget();
        }

        {
            let g = Rc::clone(&game);
            bind_click(
                "jump-level-btn",
                Box::new(move |_| {
                    let Some(inp) = get_el("level-search-input")
                        .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                    else {
                        return;
                    };
                    let q = inp.value().trim().to_string();
                    if let Ok(num) = q.parse::<u32>() {
                        if (1..=1000).contains(&num) {
                            if let Some(m) = get_el("level-modal") {
                                let _ = m.class_list().add_1("hidden");
                            }
                            g.borrow_mut().load_level(num, false);
                            return;
                        }
                    }
                    if !q.is_empty() {
                        let lower_q = q.to_lowercase();
                        for i in 1..=1000 {
                            let b = get_celestial_body(i);
                            if b.name.to_lowercase().contains(&lower_q)
                                || b.category.to_lowercase().contains(&lower_q)
                            {
                                if let Some(m) = get_el("level-modal") {
                                    let _ = m.class_list().add_1("hidden");
                                }
                                g.borrow_mut().load_level(b.level, false);
                                return;
                            }
                        }
                    }
                }),
            );
        }

        // Win modal buttons
        {
            let g = Rc::clone(&game);
            bind_click(
                "next-level-win-btn",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    let next = if game.current_level >= 1000 {
                        1
                    } else {
                        game.current_level + 1
                    };
                    game.load_level(next, false);
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "replay-level-win-btn",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    let cur = game.current_level;
                    game.load_level(cur, true);
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "close-win-modal-btn",
                Box::new(move |_| g.borrow().hide_win_modal()),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "win-view-planet-btn",
                Box::new(move |_| g.borrow().hide_win_modal()),
            );
        }
        bind_click(
            "floating-planet-menu-btn",
            Box::new(|_| {
                if let Some(ph) = get_el("floating-planet-hud") {
                    let _ = ph.class_list().add_1("hidden");
                }
                if let Some(wm) = get_el("win-modal") {
                    let _ = wm.class_list().remove_1("hidden");
                }
            }),
        );
        {
            let g = Rc::clone(&game);
            bind_click(
                "floating-planet-explore-btn",
                Box::new(move |_| g.borrow_mut().open_celestial_link()),
            );
        }
        bind_click(
            "close-time-over-modal-btn",
            Box::new(|_| {
                if let Some(m) = get_el("time-over-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
            }),
        );

        // Guide modal
        bind_click(
            "guide-btn",
            Box::new(|_| {
                if let Some(m) = get_el("guide-modal") {
                    let _ = m.class_list().remove_1("hidden");
                }
            }),
        );
        bind_click(
            "close-guide-modal",
            Box::new(|_| {
                if let Some(m) = get_el("guide-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
            }),
        );
        bind_click(
            "guide-ok-btn",
            Box::new(|_| {
                if let Some(m) = get_el("guide-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
            }),
        );

        // Highscore & Leaderboard buttons
        {
            let g = Rc::clone(&game);
            bind_click(
                "highscore-btn",
                Box::new(move |_| Self::open_leaderboard_modal(&g)),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "win-leaderboard-btn",
                Box::new(move |_| Self::open_leaderboard_modal(&g)),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "time-over-leaderboard-btn",
                Box::new(move |_| Self::open_leaderboard_modal(&g)),
            );
        }
        bind_click(
            "close-highscore-modal",
            Box::new(|_| {
                if let Some(m) = get_el("highscore-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
            }),
        );
        bind_click(
            "close-highscore-btn",
            Box::new(|_| {
                if let Some(m) = get_el("highscore-modal") {
                    let _ = m.class_list().add_1("hidden");
                }
            }),
        );

        // Initials sanitization
        for inp_id in ["win-initials-input", "direct-initials-input"] {
            if let Some(inp) = get_el(inp_id).and_then(|e| e.dyn_into::<HtmlInputElement>().ok()) {
                let inp_c = inp.clone();
                let cb = Closure::wrap(Box::new(move || {
                    let clean = sanitize_initials(&inp_c.value());
                    inp_c.set_value(&clean);
                }) as Box<dyn FnMut()>);
                let _ = inp.add_event_listener_with_callback("input", cb.as_ref().unchecked_ref());
                cb.forget();
            }
        }

        // Save win high score
        {
            let g = Rc::clone(&game);
            bind_click(
                "win-save-score-btn",
                Box::new(move |_| {
                    let Some(inp) = get_el("win-initials-input")
                        .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                    else {
                        return;
                    };
                    if inp.disabled() {
                        return;
                    }
                    let initials = inp.value();
                    let mut game = g.borrow_mut();
                    let score = game.score_manager.get_score();
                    let lvl = game.current_level;
                    let res = game.score_manager.save_high_score(&initials, score, lvl);

                    if res.saved {
                        game.sound.play_high_score();
                        inp.set_disabled(true);
                        if let Some(btn) = get_el("win-save-score-btn")
                            .and_then(|e| e.dyn_into::<HtmlButtonElement>().ok())
                        {
                            btn.set_disabled(true);
                        }
                        if let Some(rank_el) = get_el("win-saved-rank") {
                            let msg = if res.level_rank != -1 && res.all_time_rank != -1 {
                                format!(
                                    "#{} (Bana {} • {}) & #{} All-Time High",
                                    res.level_rank,
                                    lvl,
                                    game.current_celestial_body.name,
                                    res.all_time_rank
                                )
                            } else if res.level_rank != -1 {
                                format!(
                                    "#{} på Bana {} • {}",
                                    res.level_rank, lvl, game.current_celestial_body.name
                                )
                            } else {
                                format!("#{} All-Time High", res.all_time_rank)
                            };
                            rank_el.set_text_content(Some(&msg));
                        }
                        if let Some(saved_msg) = get_el("win-score-saved-msg") {
                            let _ = saved_msg.class_list().remove_1("hidden");
                        }
                    }
                }),
            );
        }

        // Save direct high score
        {
            let g = Rc::clone(&game);
            bind_click(
                "direct-save-score-btn",
                Box::new(move |_| {
                    let Some(inp) = get_el("direct-initials-input")
                        .and_then(|e| e.dyn_into::<HtmlInputElement>().ok())
                    else {
                        return;
                    };
                    let initials = inp.value();
                    let mut game = g.borrow_mut();
                    let score = game.score_manager.get_score();
                    let lvl = game.current_level;
                    let res = game.score_manager.save_high_score(&initials, score, lvl);
                    if res.saved {
                        game.sound.play_high_score();
                        inp.set_value("");
                        game.render_leaderboard();
                    }
                }),
            );
        }

        // Leaderboard tabs & navigation
        {
            let g = Rc::clone(&game);
            bind_click(
                "tab-level-lb",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    game.leaderboard_tab = "level".to_string();
                    game.render_leaderboard();
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "tab-alltime-lb",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    game.leaderboard_tab = "alltime".to_string();
                    game.render_leaderboard();
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "lb-prev-level",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    if game.leaderboard_view_level > 1 {
                        game.leaderboard_view_level -= 1;
                        game.render_leaderboard();
                    }
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "lb-next-level",
                Box::new(move |_| {
                    let mut game = g.borrow_mut();
                    if game.leaderboard_view_level < 1000 {
                        game.leaderboard_view_level += 1;
                        game.render_leaderboard();
                    }
                }),
            );
        }
        {
            let g = Rc::clone(&game);
            bind_click(
                "sync-highscores-btn",
                Box::new(move |_| {
                    if let Some(btn) = get_el("sync-highscores-btn") {
                        btn.set_text_content(Some("⏳ Hämtar..."));
                    }
                    let g_clone = Rc::clone(&g);
                    wasm_bindgen_futures::spawn_local(async move {
                        let _ = sync_with_cloud().await;
                        {
                            let mut game = g_clone.borrow_mut();
                            game.leaderboard_tab = "alltime".to_string();
                            game.render_leaderboard();
                        }
                        if let Some(btn) = get_el("sync-highscores-btn") {
                            btn.set_text_content(Some("🔄 Uppdatera topplista"));
                        }
                    });
                }),
            );
        }

        // Game Modes
        let set_mode = {
            let g = Rc::clone(&game);
            move |mode: GameMode| {
                let mut game = g.borrow_mut();
                game.sound.init_ctx();
                let total = game.total_initial_arrows;
                game.score_manager.set_game_mode(mode, total);

                for id in [
                    "mode-btn-classic",
                    "mode-btn-daily",
                    "mode-btn-time",
                    "mode-btn-zen",
                ] {
                    if let Some(b) = get_el(id) {
                        let _ = b.class_list().remove_1("active");
                    }
                }
                let active_id = match mode {
                    GameMode::Classic => "mode-btn-classic",
                    GameMode::Daily => "mode-btn-daily",
                    GameMode::TimeAttack => "mode-btn-time",
                    GameMode::Zen => "mode-btn-zen",
                };
                if let Some(b) = get_el(active_id) {
                    let _ = b.class_list().add_1("active");
                }

                if let Some(tc) = get_el("time-attack-container") {
                    if mode == GameMode::TimeAttack {
                        let _ = tc.class_list().remove_1("hidden");
                    } else {
                        let _ = tc.class_list().add_1("hidden");
                    }
                }

                if mode == GameMode::Daily {
                    let daily_lvl = game.score_manager.get_daily_level_number();
                    game.load_level(daily_lvl, true);
                    let w = window();
                    let cx =
                        w.inner_width().ok().and_then(|v| v.as_f64()).unwrap_or(1280.0) * 0.5;
                    let cy =
                        w.inner_height().ok().and_then(|v| v.as_f64()).unwrap_or(720.0) * 0.5;
                    game.spawn_score_toast(
                        &format!("🌟 Dagens Bana: {}", get_today_date_string()),
                        cx,
                        cy,
                        "combo-bonus",
                    );
                } else {
                    let cur = game.current_level;
                    game.load_level(cur, true);
                }
            }
        };

        {
            let sm = set_mode.clone();
            bind_click("mode-btn-classic", Box::new(move |_| sm(GameMode::Classic)));
        }
        {
            let sm = set_mode.clone();
            bind_click("mode-btn-daily", Box::new(move |_| sm(GameMode::Daily)));
        }
        {
            let sm = set_mode.clone();
            bind_click(
                "mode-btn-time",
                Box::new(move |_| sm(GameMode::TimeAttack)),
            );
        }
        {
            let sm = set_mode.clone();
            bind_click("mode-btn-zen", Box::new(move |_| sm(GameMode::Zen)));
        }
        {
            let sm = set_mode.clone();
            bind_click(
                "retry-time-attack-btn",
                Box::new(move |_| {
                    if let Some(m) = get_el("time-over-modal") {
                        let _ = m.class_list().add_1("hidden");
                    }
                    sm(GameMode::TimeAttack);
                }),
            );
        }
        {
            let sm = set_mode.clone();
            bind_click(
                "exit-time-attack-btn",
                Box::new(move |_| {
                    if let Some(m) = get_el("time-over-modal") {
                        let _ = m.class_list().add_1("hidden");
                    }
                    sm(GameMode::Classic);
                }),
            );
        }
    }

    fn start_animation_loop(game: Rc<RefCell<Self>>) {
        let f: Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> = Rc::new(RefCell::new(None));
        let g_outer = Rc::clone(&f);

        *g_outer.borrow_mut() = Some(Closure::wrap(Box::new(move |now: f64| {
            {
                let mut g = game.borrow_mut();
                g.animate_frame(now);
            }
            if let Some(ref cb) = *f.borrow() {
                let _ = window().request_animation_frame(cb.as_ref().unchecked_ref());
            }
        }) as Box<dyn FnMut(f64)>));

        if let Some(ref cb) = *g_outer.borrow() {
            let _ = window().request_animation_frame(cb.as_ref().unchecked_ref());
        }
    }

    fn animate_frame(&mut self, now: f64) {
        let delta_seconds = 0.016_f32;
        let delta_ms = (now - self.last_animate_time).clamp(1.0, 100.0);
        self.last_animate_time = now;

        let update_res = self.score_manager.update(delta_ms);
        self.update_combo_hud();

        if self.score_manager.get_game_mode() == GameMode::TimeAttack {
            if let Some(timer_el) = get_el("time-attack-timer") {
                let s = update_res.seconds_left;
                let formatted = if s < 60 {
                    format!("{}s", s)
                } else {
                    format!("{}:{:02}", s / 60, s % 60)
                };
                timer_el.set_text_content(Some(&formatted));
            }
            if let Some(tc) = get_el("time-attack-container") {
                if update_res.seconds_left <= 25 {
                    let _ = tc.class_list().add_1("danger");
                } else {
                    let _ = tc.class_list().remove_1("danger");
                }
            }
            if update_res.time_attack_over {
                if let Some(score_el) = get_el("time-over-total-score") {
                    score_el.set_text_content(Some(&format_number_sv(
                        self.score_manager.get_score(),
                    )));
                }
                if let Some(m) = get_el("time-over-modal") {
                    let _ = m.class_list().remove_1("hidden");
                }
            }
        }

        // Smooth hint rotation animation
        if let Some((start_quat, target_quat, start_time, duration)) = self
            .rotate_anim
            .as_ref()
            .map(|a| (a.start_quat, a.target_quat, a.start_time, a.duration))
        {
            let t = ((now - start_time) / duration).clamp(0.0, 1.0) as f32;
            let ease_t = 1.0 - (1.0 - t).powi(3);
            self.controller.cube_quat = start_quat.slerp(target_quat, ease_t);
            if t >= 1.0 {
                self.rotate_anim = None;
            }
        }

        // Victory dissolve animation
        let mut finished_dissolve: Option<(WinBonus, u32)> = None;
        if let Some((start_time, duration, win_bonus, stars)) = self
            .dissolve_anim
            .as_ref()
            .map(|a| (a.start_time, a.duration, a.win_bonus, a.stars))
        {
            let t = ((now - start_time) / duration).clamp(0.0, 1.0) as f32;
            let ease_t = 1.0 - (1.0 - t).powi(3);

            self.controller
                .apply_rotation(0.0, 0.035 * (1.0 - ease_t * 0.4));
            self.cube_opacity = (1.0 - t * 1.15).max(0.0);
            self.controller.cube_scale = 1.0 + ease_t * 0.1;

            let r_val = self.next_rand();
            if t < 0.85 && r_val < 0.45 {
                let offset = Vec3::new(
                    (self.next_rand() - 0.5) * 2.8,
                    (self.next_rand() - 0.5) * 2.8,
                    (self.next_rand() - 0.5) * 2.8,
                );
                self.particle_manager.spawn_victory_explosion(offset, 10);
            }

            if t >= 1.0 {
                finished_dissolve = Some((win_bonus, stars));
            }
        }
        if let Some((wb, st)) = finished_dissolve {
            self.dissolve_anim = None;
            self.controller.cube_visible = false;
            self.is_cube_dissolved = true;
            self.is_victory_animating = false;
            self.show_win_modal(wb, st);
        }

        self.controller.update(delta_seconds);
        self.particle_manager.update(delta_seconds);

        let (rot_y, rot_x) = self.controller.approximate_euler_yx();
        self.celestial_sphere.update(delta_seconds, rot_y, rot_x);

        // Shaking blocked arrow
        if let Some((start_time, faces)) = self
            .shaking_arrow
            .as_ref()
            .map(|s| (s.start_time, s.faces.clone()))
        {
            let elapsed = now - start_time;
            let duration = 280.0;
            if elapsed < duration {
                let progress = elapsed / duration;
                let decay = 1.0 - progress;
                let amp = 14.0 * decay;
                let sx = (elapsed * 0.09).sin() * amp;
                let sy = (elapsed * 0.07).cos() * amp * 0.5;
                for f in faces {
                    self.render_face_state(f, (sx, sy));
                }
            } else {
                self.shaking_arrow = None;
                for f in faces {
                    self.render_face_state(f, (0.0, 0.0));
                }
            }
        }

        self.flying_manager.update(now);

        let w = (self.renderer.canvas.width().max(1)) as f32;
        let h = (self.renderer.canvas.height().max(1)) as f32;
        let proj = self.controller.projection_matrix(w / h);
        let view = self.controller.view_matrix();
        let cube_model = self.controller.cube_model_matrix();
        let light1_rgb = u32_to_rgb_f32(self.current_theme.dir_light1_color);

        self.renderer.render(
            proj,
            view,
            cube_model,
            self.controller.cube_visible,
            self.cube_opacity,
            light1_rgb,
            &mut self.face_renderer,
            &mut self.celestial_sphere,
            &self.flying_manager,
            &self.particle_manager,
        );
    }
}

struct GameBorrow<'a> {
    controller: &'a mut CubeController,
    renderer: &'a WebGlRenderer,
    current_shape_mesh: &'a ShapeMesh,
}

impl<'a> GameBorrow<'a> {
    fn split(game: &'a mut CubeAwayGame) -> Self {
        Self {
            controller: &mut game.controller,
            renderer: &game.renderer,
            current_shape_mesh: &game.current_shape_mesh,
        }
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    let _ = CubeAwayGame::new();
}
