use std::f32::consts::PI as PI32;
use std::f64::consts::PI as PI64;
use glam::{Mat4, Quat, Vec3};
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};
use crate::celestial_bodies::CelestialBody;
use crate::theme::{hex_to_number, u32_to_rgb_f32};

pub struct CelestialSphere {
    pub position: Vec3,
    base_position: Vec3,
    focus_position: Vec3,
    pub rotation_y: f32,
    pub ring_rotation_z: f32,
    pub current_scale: f32,
    target_scale: f32,
    is_focus_mode: bool,
    pub has_rings_active: bool,
    current_level: i32,
    pub surface_canvas: HtmlCanvasElement,
    pub ring_canvas: HtmlCanvasElement,
    pub texture_dirty: bool,
    pub is_star: bool,
    pub emissive_rgb: [f32; 3],
    pub glow_rgb: [f32; 3],
    pub glow_opacity: f32,
}

impl CelestialSphere {
    pub fn new() -> Self {
        let doc = web_sys::window().unwrap().document().unwrap();
        let surface_canvas: HtmlCanvasElement = doc
            .create_element("canvas")
            .unwrap()
            .dyn_into()
            .unwrap();
        surface_canvas.set_width(512);
        surface_canvas.set_height(256);

        let ring_canvas: HtmlCanvasElement = doc
            .create_element("canvas")
            .unwrap()
            .dyn_into()
            .unwrap();
        ring_canvas.set_width(256);
        ring_canvas.set_height(16);

        let base_position = Vec3::new(3.3, 1.7, -13.5);
        Self {
            position: base_position,
            base_position,
            focus_position: Vec3::new(0.0, 0.2, -9.5),
            rotation_y: 0.0,
            ring_rotation_z: 0.0,
            current_scale: 1.0,
            target_scale: 1.0,
            is_focus_mode: false,
            has_rings_active: false,
            current_level: -1,
            surface_canvas,
            ring_canvas,
            texture_dirty: true,
            is_star: true,
            emissive_rgb: [1.0, 0.53, 0.0],
            glow_rgb: [1.0, 0.67, 0.13],
            glow_opacity: 0.42,
        }
    }

    pub fn update_celestial_body(&mut self, body: CelestialBody) {
        if self.current_level == body.level as i32 {
            return;
        }
        self.current_level = body.level as i32;

        let ctx: CanvasRenderingContext2d = self
            .surface_canvas
            .get_context("2d")
            .unwrap()
            .unwrap()
            .dyn_into()
            .unwrap();

        let name = body.name.to_lowercase();
        let cat = body.category;

        let base_grad_colors: [String; 3];
        let emissive_hex: u32;
        let glow_hex: u32;
        let mut has_rings = false;
        let mut ring_colors = ("rgba(200,180,140,0.6)", "rgba(230,210,170,0.8)");

        if cat == "Stjärna" || name.contains("solen") || name.contains("sun") {
            base_grad_colors = ["#ffcc00".into(), "#ff6600".into(), "#cc1100".into()];
            emissive_hex = 0xff8800;
            glow_hex = 0xffaa22;
        } else if name.contains("tellus") || name.contains("jorden") || name.contains("earth") {
            base_grad_colors = ["#0d47a1".into(), "#1976d2".into(), "#1b5e20".into()];
            emissive_hex = 0x002244;
            glow_hex = 0x4fc3f7;
        } else if name.contains("mars") {
            base_grad_colors = ["#c8411b".into(), "#912a0d".into(), "#571705".into()];
            emissive_hex = 0x441105;
            glow_hex = 0xff5722;
        } else if name.contains("venus") {
            base_grad_colors = ["#e6c280".into(), "#c29b47".into(), "#8a6824".into()];
            emissive_hex = 0x3a2800;
            glow_hex = 0xffd54f;
        } else if name.contains("merkurius") || name.contains("mercury") {
            base_grad_colors = ["#8d8d8d".into(), "#5c5c5c".into(), "#333333".into()];
            emissive_hex = 0x151515;
            glow_hex = 0xb0bec5;
        } else if name.contains("jupiter") {
            base_grad_colors = ["#d4a373".into(), "#bc6c25".into(), "#a3501a".into()];
            emissive_hex = 0x2b1405;
            glow_hex = 0xe0a96d;
        } else if name.contains("saturnus") || name.contains("saturn") {
            base_grad_colors = ["#e0cda9".into(), "#c4af88".into(), "#998462".into()];
            emissive_hex = 0x282010;
            glow_hex = 0xffe082;
            has_rings = true;
            ring_colors = ("rgba(215,195,150,0.65)", "rgba(245,230,190,0.85)");
        } else if name.contains("uranus") {
            base_grad_colors = ["#7de2d1".into(), "#47b8a6".into(), "#267b6e".into()];
            emissive_hex = 0x002b25;
            glow_hex = 0x80deea;
            has_rings = true;
            ring_colors = ("rgba(130,220,230,0.4)", "rgba(180,240,250,0.6)");
        } else if name.contains("neptunus") || name.contains("neptune") {
            base_grad_colors = ["#2952a3".into(), "#1e3c78".into(), "#102246".into()];
            emissive_hex = 0x051025;
            glow_hex = 0x448aff;
        } else if cat == "Måne" || name.contains("månen") || name.contains("moon") {
            base_grad_colors = ["#b8b8b8".into(), "#7a7a7a".into(), "#444444".into()];
            emissive_hex = 0x101010;
            glow_hex = 0xcfd8dc;
        } else if cat == "Nebulosa" || cat == "Galax" {
            base_grad_colors = ["#9c27b0".into(), "#e91e63".into(), "#3f51b5".into()];
            emissive_hex = 0x4a148c;
            glow_hex = 0xe040fb;
        } else {
            let hue = (body.level * 47) % 360;
            base_grad_colors = [
                format!("hsl({}, 65%, 45%)", hue),
                format!("hsl({}, 55%, 30%)", (hue + 25) % 360),
                format!("hsl({}, 45%, 15%)", (hue + 50) % 360),
            ];
            emissive_hex = hex_to_number("#221133");
            glow_hex = hex_to_number("#60a5fa");
            if body.level % 7 == 0 {
                has_rings = true;
            }
        }

        let grad = ctx.create_linear_gradient(0.0, 0.0, 0.0, 256.0);
        let _ = grad.add_color_stop(0.0, &base_grad_colors[0]);
        let _ = grad.add_color_stop(0.5, &base_grad_colors[1]);
        let _ = grad.add_color_stop(1.0, &base_grad_colors[2]);
        ctx.set_fill_style_canvas_gradient(&grad);
        ctx.fill_rect(0.0, 0.0, 512.0, 256.0);

        let _ = ctx.set_global_composite_operation("overlay");
        let mut y = 10;
        while y < 250 {
            let alpha = (0.15 + ((y as f64) * 0.1 + (body.level as f64)).sin() * 0.12).max(0.02);
            ctx.set_fill_style_str(&format!("rgba(255, 255, 255, {:.3})", alpha));
            ctx.fill_rect(0.0, y as f64, 512.0, (8 + (body.level % 6)) as f64);
            y += 18;
        }

        let _ = ctx.set_global_composite_operation("soft-light");
        let seed = body.level.wrapping_mul(9301);
        for i in 0..28_u32 {
            let cx = (seed.wrapping_mul(i + 1).wrapping_mul(31) % 512) as f64;
            let cy = (seed.wrapping_mul(i + 1).wrapping_mul(17) % 256) as f64;
            let cr = (4 + (seed.wrapping_mul(i + 1) % 22)) as f64;
            ctx.begin_path();
            let _ = ctx.arc(cx, cy, cr, 0.0, PI64 * 2.0);
            ctx.set_fill_style_str(if i % 2 == 0 {
                "rgba(255, 255, 255, 0.25)"
            } else {
                "rgba(0, 0, 0, 0.35)"
            });
            ctx.fill();
        }
        let _ = ctx.set_global_composite_operation("source-over");

        if has_rings {
            let r_ctx: CanvasRenderingContext2d = self
                .ring_canvas
                .get_context("2d")
                .unwrap()
                .unwrap()
                .dyn_into()
                .unwrap();
            r_ctx.clear_rect(0.0, 0.0, 256.0, 16.0);
            let r_grad = r_ctx.create_linear_gradient(0.0, 0.0, 256.0, 0.0);
            let _ = r_grad.add_color_stop(0.0, "rgba(0,0,0,0)");
            let _ = r_grad.add_color_stop(0.15, ring_colors.0);
            let _ = r_grad.add_color_stop(0.45, "rgba(0,0,0,0.1)");
            let _ = r_grad.add_color_stop(0.65, ring_colors.1);
            let _ = r_grad.add_color_stop(0.92, ring_colors.0);
            let _ = r_grad.add_color_stop(1.0, "rgba(0,0,0,0)");
            r_ctx.set_fill_style_canvas_gradient(&r_grad);
            r_ctx.fill_rect(0.0, 0.0, 256.0, 16.0);
        }

        let is_star = cat == "Stjärna" || cat == "Kvasar";
        self.is_star = is_star;
        self.has_rings_active = has_rings;
        self.emissive_rgb = u32_to_rgb_f32(emissive_hex);
        self.glow_rgb = u32_to_rgb_f32(glow_hex);
        self.glow_opacity = if is_star { 0.42 } else { 0.18 };
        self.current_scale = 0.88;
        self.texture_dirty = true;
    }

    pub fn set_focus_mode(&mut self, active: bool) {
        self.is_focus_mode = active;
        self.target_scale = if active { 1.25 } else { 1.0 };
    }

    pub fn check_intersection(&self, ray_origin: Vec3, ray_dir: Vec3) -> bool {
        let radius = (if self.has_rings_active { 10.5 } else { 5.4 }) * self.current_scale;
        let oc = ray_origin - self.position;
        let b = oc.dot(ray_dir);
        let c = oc.dot(oc) - radius * radius;
        let disc = b * b - c;
        disc >= 0.0 && (-b + disc.sqrt()) > 0.0
    }

    pub fn update(&mut self, delta_seconds: f32, camera_rot_y: f32, camera_rot_x: f32) {
        self.rotation_y += delta_seconds * 0.08;
        if self.has_rings_active {
            self.ring_rotation_z += delta_seconds * 0.02;
        }

        if (self.current_scale - self.target_scale).abs() > 0.001 {
            self.current_scale += (self.target_scale - self.current_scale) * 0.06;
        }

        if self.is_focus_mode {
            let target = Vec3::new(
                self.focus_position.x - camera_rot_y * 0.15,
                self.focus_position.y + camera_rot_x * 0.15,
                self.focus_position.z,
            );
            self.position = self.position.lerp(target, 0.05);
        } else {
            let target = Vec3::new(
                self.base_position.x - camera_rot_y * 0.35,
                self.base_position.y + camera_rot_x * 0.25,
                self.base_position.z,
            );
            self.position = self.position.lerp(target, 0.06);
        }
    }

    pub fn sphere_model_matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(
            Vec3::splat(self.current_scale),
            Quat::from_rotation_y(self.rotation_y),
            self.position,
        )
    }

    pub fn glow_model_matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(
            Vec3::splat(self.current_scale * (5.35 / 5.0)),
            Quat::IDENTITY,
            self.position,
        )
    }

    pub fn ring_model_matrix(&self) -> Mat4 {
        let q = Quat::from_rotation_x(PI32 * 0.42)
            * Quat::from_rotation_y(PI32 * 0.08)
            * Quat::from_rotation_z(self.ring_rotation_z);
        Mat4::from_scale_rotation_translation(Vec3::splat(self.current_scale), q, self.position)
    }
}

/// Generates UV sphere vertices `[px, py, pz, nx, ny, nz, u, v]` and triangle indices
pub fn build_uv_sphere_mesh(radius: f32, width_segs: usize, height_segs: usize) -> (Vec<f32>, Vec<u16>) {
    let mut vertices = Vec::with_capacity((width_segs + 1) * (height_segs + 1) * 8);
    let mut indices = Vec::with_capacity(width_segs * height_segs * 6);

    for iy in 0..=height_segs {
        let v = (iy as f32) / (height_segs as f32);
        let theta = v * PI32;
        let sin_theta = theta.sin();
        let cos_theta = theta.cos();

        for ix in 0..=width_segs {
            let u = (ix as f32) / (width_segs as f32);
            let phi = u * PI32 * 2.0;
            let nx = - phi.cos() * sin_theta;
            let ny = cos_theta;
            let nz = phi.sin() * sin_theta;

            vertices.extend_from_slice(&[
                nx * radius,
                ny * radius,
                nz * radius,
                nx,
                ny,
                nz,
                u,
                1.0 - v,
            ]);
        }
    }

    let cols = width_segs + 1;
    for iy in 0..height_segs {
        for ix in 0..width_segs {
            let a = (iy * cols + ix) as u16;
            let b = ((iy + 1) * cols + ix) as u16;
            let c = ((iy + 1) * cols + ix + 1) as u16;
            let d = (iy * cols + ix + 1) as u16;
            indices.extend_from_slice(&[a, b, d, b, c, d]);
        }
    }

    (vertices, indices)
}

/// Generates concentric ring mesh `[px, py, pz, nx, ny, nz, u, v]` and indices
pub fn build_ring_mesh(inner_r: f32, outer_r: f32, segs: usize) -> (Vec<f32>, Vec<u16>) {
    let mut vertices = Vec::with_capacity((segs + 1) * 2 * 8);
    let mut indices = Vec::with_capacity(segs * 6);

    for i in 0..=segs {
        let t = (i as f32) / (segs as f32);
        let angle = t * PI32 * 2.0;
        let c = angle.cos();
        let s = angle.sin();

        // Inner vertex (u = 0.0)
        vertices.extend_from_slice(&[inner_r * c, inner_r * s, 0.0, 0.0, 0.0, 1.0, 0.0, t]);
        // Outer vertex (u = 1.0)
        vertices.extend_from_slice(&[outer_r * c, outer_r * s, 0.0, 0.0, 0.0, 1.0, 1.0, t]);
    }

    for i in 0..segs {
        let base = (i * 2) as u16;
        indices.extend_from_slice(&[base, base + 1, base + 2, base + 1, base + 3, base + 2]);
    }

    (vertices, indices)
}
