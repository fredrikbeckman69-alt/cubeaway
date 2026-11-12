use std::collections::{HashMap, HashSet};
use std::f32::consts::PI;
use glam::{Mat4, Quat, Vec2, Vec3, Vec4};
use web_sys::HtmlCanvasElement;
use crate::shapes::{ray_intersect_triangle, ShapeMesh};

#[derive(Clone, Copy, Debug)]
pub struct HitResult {
    pub face_idx: usize,
    pub r: usize,
    pub c: usize,
    pub client_x: f64,
    pub client_y: f64,
}

#[derive(Clone, Debug)]
pub struct PointerInfo {
    pub x: f64,
    pub y: f64,
    pub pointer_type: String,
}

pub struct CubeController {
    pub target_distance: f32,
    pub current_distance: f32,
    min_distance: f32,
    max_distance: f32,
    pub is_auto_rotating: bool,
    pub cube_quat: Quat,
    pub cube_scale: f32,
    pub cube_visible: bool,

    pub is_pointer_down: bool,
    pub has_dragged: bool,
    pub pointer_start_x: f64,
    pub pointer_start_y: f64,
    pub last_pointer_x: f64,
    pub last_pointer_y: f64,

    pub active_pointers: HashMap<i32, PointerInfo>,
    pub initial_pinch_distance: f64,
    pub initial_target_distance: f32,
    pub touch_pinch_start_dist: f64,
    pub touch_pinch_start_target_dist: f32,

    pub angular_velocity_x: f32,
    pub angular_velocity_y: f32,

    pub keys_down: HashSet<String>,
    pub pointer_ndc: Vec2,
    pub grid_size: usize,
}

impl CubeController {
    pub fn new() -> Self {
        // Sätt startvinkel för kuben (visar topp, fram och vänster sida snyggt: Euler(0.48, -0.62, 0, 'YXZ'))
        let initial_quat = Quat::from_rotation_y(-0.62) * Quat::from_rotation_x(0.48);

        Self {
            target_distance: 6.0,
            current_distance: 6.0,
            min_distance: 3.5,
            max_distance: 14.0,
            is_auto_rotating: true,
            cube_quat: initial_quat,
            cube_scale: 1.0,
            cube_visible: true,
            is_pointer_down: false,
            has_dragged: false,
            pointer_start_x: 0.0,
            pointer_start_y: 0.0,
            last_pointer_x: 0.0,
            last_pointer_y: 0.0,
            active_pointers: HashMap::new(),
            initial_pinch_distance: 0.0,
            initial_target_distance: 6.0,
            touch_pinch_start_dist: 0.0,
            touch_pinch_start_target_dist: 6.0,
            angular_velocity_x: 0.0,
            angular_velocity_y: 0.0,
            keys_down: HashSet::new(),
            pointer_ndc: Vec2::new(-999.0, -999.0),
            grid_size: 20,
        }
    }

    pub fn set_target_distance(&mut self, distance: f32) {
        self.target_distance = distance.clamp(self.min_distance, self.max_distance);
    }

    pub fn zoom_in(&mut self, amount: f32) {
        self.target_distance = (self.target_distance - amount).clamp(self.min_distance, self.max_distance);
    }

    pub fn zoom_out(&mut self, amount: f32) {
        self.target_distance = (self.target_distance + amount).clamp(self.min_distance, self.max_distance);
    }

    pub fn apply_rotation(&mut self, delta_x: f32, delta_y: f32) {
        let rot_y = Quat::from_rotation_y(delta_y);
        let rot_x = Quat::from_rotation_x(delta_x);
        self.cube_quat = (rot_x * (rot_y * self.cube_quat)).normalize();
    }

    pub fn update_pointer_pos(&mut self, canvas: &HtmlCanvasElement, client_x: f64, client_y: f64) {
        let rect = canvas.get_bounding_client_rect();
        if rect.width() > 0.0 && rect.height() > 0.0 {
            let x = (((client_x - rect.left()) / rect.width()) * 2.0 - 1.0) as f32;
            let y = (-((client_y - rect.top()) / rect.height()) * 2.0 + 1.0) as f32;
            self.pointer_ndc = Vec2::new(x, y);
        }
    }

    pub fn camera_position(&self) -> Vec3 {
        Vec3::new(0.0, 0.0, self.current_distance)
    }

    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.camera_position(), Vec3::ZERO, Vec3::Y)
    }

    pub fn projection_matrix(&self, aspect: f32) -> Mat4 {
        let base_fov_rad = 42.0_f32 * PI / 180.0;
        let fov_y = if aspect < 1.0 {
            let target_half_width = (base_fov_rad * 0.5).tan();
            2.0 * (target_half_width / aspect.max(0.1)).atan()
        } else {
            base_fov_rad
        };
        Mat4::perspective_rh_gl(fov_y, aspect.max(0.1), 0.1, 100.0)
    }

    pub fn cube_model_matrix(&self) -> Mat4 {
        Mat4::from_scale_rotation_translation(
            Vec3::splat(self.cube_scale),
            self.cube_quat,
            Vec3::ZERO,
        )
    }

    pub fn get_world_ray(&self, aspect: f32) -> (Vec3, Vec3) {
        let proj = self.projection_matrix(aspect);
        let view = self.view_matrix();
        let inv_vp = (proj * view).inverse();

        let near_clip = Vec4::new(self.pointer_ndc.x, self.pointer_ndc.y, -1.0, 1.0);
        let far_clip = Vec4::new(self.pointer_ndc.x, self.pointer_ndc.y, 1.0, 1.0);

        let near_w = inv_vp * near_clip;
        let far_w = inv_vp * far_clip;

        let p_near = near_w.truncate() / near_w.w;
        let p_far = far_w.truncate() / far_w.w;

        let origin = self.camera_position();
        let dir = (p_far - p_near).normalize_or_zero();
        (origin, dir)
    }

    pub fn perform_raycast(
        &mut self,
        canvas: &HtmlCanvasElement,
        shape_mesh: &ShapeMesh,
        client_x: Option<f64>,
        client_y: Option<f64>,
    ) -> Option<HitResult> {
        if !self.cube_visible {
            return None;
        }

        if let (Some(cx), Some(cy)) = (client_x, client_y) {
            self.update_pointer_pos(canvas, cx, cy);
        }

        let rect = canvas.get_bounding_client_rect();
        let aspect = if rect.height() > 0.0 {
            (rect.width() / rect.height()) as f32
        } else {
            1.0
        };

        let (world_origin, world_dir) = self.get_world_ray(aspect);
        let inv_model = self.cube_model_matrix().inverse();

        let local_origin = inv_model.transform_point3(world_origin);
        let local_dir = inv_model.transform_vector3(world_dir).normalize_or_zero();

        let mut best_t = f32::INFINITY;
        let mut best_face = 0_usize;
        let mut best_uv = Vec2::ZERO;
        let mut hit_any = false;

        for face in &shape_mesh.faces {
            for tri in face.indices.chunks_exact(3) {
                let i0 = tri[0] as usize;
                let i1 = tri[1] as usize;
                let i2 = tri[2] as usize;

                let v0 = face.positions[i0];
                let v1 = face.positions[i1];
                let v2 = face.positions[i2];

                if let Some((t, u_bary, v_bary)) =
                    ray_intersect_triangle(local_origin, local_dir, v0, v1, v2)
                {
                    if t < best_t {
                        best_t = t;
                        best_face = face.face_idx;
                        let w_bary = 1.0 - u_bary - v_bary;
                        best_uv =
                            face.uvs[i0] * w_bary + face.uvs[i1] * u_bary + face.uvs[i2] * v_bary;
                        hit_any = true;
                    }
                }
            }
        }

        if hit_any {
            let u = best_uv.x.clamp(0.0, 0.9999);
            let v = best_uv.y.clamp(0.0, 0.9999);
            let g = self.grid_size as f32;
            let c = (u * g).floor() as usize;
            let r = ((1.0 - v) * g).floor() as usize;

            Some(HitResult {
                face_idx: best_face,
                r: r.min(self.grid_size - 1),
                c: c.min(self.grid_size - 1),
                client_x: client_x.unwrap_or(self.last_pointer_x),
                client_y: client_y.unwrap_or(self.last_pointer_y),
            })
        } else {
            None
        }
    }

    pub fn update(&mut self, delta_seconds: f32) {
        if self.keys_down.contains("ArrowUp") {
            self.zoom_in(3.0 * delta_seconds);
        }
        if self.keys_down.contains("ArrowDown") {
            self.zoom_out(3.0 * delta_seconds);
        }
        if self.keys_down.contains("ArrowLeft") {
            self.apply_rotation(0.0, -1.8 * delta_seconds);
        }
        if self.keys_down.contains("ArrowRight") {
            self.apply_rotation(0.0, 1.8 * delta_seconds);
        }

        self.current_distance += (self.target_distance - self.current_distance) * 0.12;

        if self.is_auto_rotating {
            self.apply_rotation(0.0, 0.22 * delta_seconds);
        }
    }

    pub fn on_wheel(&mut self, delta_y: f64) {
        self.is_auto_rotating = false;
        let zoom_delta = (delta_y as f32) * 0.005;
        self.set_target_distance(self.target_distance + zoom_delta);
    }

    pub fn approximate_euler_yx(&self) -> (f32, f32) {
        let (y, x, _z) = self.cube_quat.to_euler(glam::EulerRot::YXZ);
        (y, x)
    }
}
