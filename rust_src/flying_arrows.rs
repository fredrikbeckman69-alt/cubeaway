use glam::Vec3;
use crate::shapes::{deform_vertex, get_point_on_base_cube, ShapeType};
use crate::theme::u32_to_rgb_f32;
use crate::types::{Arrow, Direction};

#[derive(Clone, Copy, Debug)]
struct TrackPoint {
    pos: Vec3,
    normal: Vec3,
    dist: f32,
}

pub struct SlitheringArrowInstance {
    waypoints: Vec<TrackPoint>,
    total_track_length: f32,
    arrow_length: f32,
    d_tail_exit: f32,
    head_length: f32,
    wing_width: f32,
    stem_width: f32,
    stem_thickness: f32,
    start_time: f64,
    duration: f64,
    pub color_rgb: [f32; 3],
    pub outer_pos: Vec<f32>,
    pub core_pos: Vec<f32>,
}

pub struct FlyingArrowManager {
    pub instances: Vec<SlitheringArrowInstance>,
    shape_type: ShapeType,
}

impl FlyingArrowManager {
    pub fn new() -> Self {
        Self {
            instances: Vec::new(),
            shape_type: ShapeType::Cube,
        }
    }

    pub fn set_shape_type(&mut self, shape_type: ShapeType) {
        self.shape_type = shape_type;
    }

    pub fn get_point_and_normal(
        &self,
        face_idx: usize,
        u: f32,
        v: f32,
    ) -> (Vec3, Vec3, Vec3, Vec3) {
        let p_base = get_point_on_base_cube(face_idx, u, v);
        let p = deform_vertex(p_base, self.shape_type);

        if self.shape_type == ShapeType::Cube {
            let (normal, tangent_u, tangent_v) = match face_idx {
                0 => (Vec3::X, Vec3::NEG_Z, Vec3::Y),
                1 => (Vec3::NEG_X, Vec3::Z, Vec3::Y),
                2 => (Vec3::Y, Vec3::X, Vec3::NEG_Z),
                3 => (Vec3::NEG_Y, Vec3::X, Vec3::Z),
                4 => (Vec3::Z, Vec3::X, Vec3::Y),
                _ => (Vec3::NEG_Z, Vec3::NEG_X, Vec3::Y),
            };
            return (p, normal, tangent_u, tangent_v);
        }

        let eps = 0.003;
        let du = deform_vertex(get_point_on_base_cube(face_idx, u + eps, v), self.shape_type)
            - deform_vertex(get_point_on_base_cube(face_idx, u - eps, v), self.shape_type);
        let dv = deform_vertex(get_point_on_base_cube(face_idx, u, v + eps), self.shape_type)
            - deform_vertex(get_point_on_base_cube(face_idx, u, v - eps), self.shape_type);

        let normal = du.cross(dv).normalize_or_zero();
        let tangent_u = du.normalize_or_zero();
        let tangent_v = dv.normalize_or_zero();

        (p, normal, tangent_u, tangent_v)
    }

    pub fn get_face_vectors(&self, face_idx: usize, u: f32, v: f32) -> (Vec3, Vec3, Vec3) {
        let (_, normal, tangent_u, tangent_v) = self.get_point_and_normal(face_idx, u, v);
        (normal, tangent_u, tangent_v)
    }

    pub fn coord_to_local_3d(&self, face_idx: usize, r: f32, c: f32, grid_size: usize) -> Vec3 {
        let g = grid_size as f32;
        let u = (c + 0.5) / g;
        let v = 1.0 - (r + 0.5) / g;
        self.get_point_and_normal(face_idx, u, v).0
    }

    fn sample_track(waypoints: &[TrackPoint], d: f32) -> (Vec3, Vec3, Vec3, Vec3) {
        let total = waypoints.last().map(|w| w.dist).unwrap_or(0.0);
        let clamped_d = d.clamp(0.0, total);

        let mut low = 0_usize;
        let mut high = waypoints.len().saturating_sub(1);
        while low + 1 < high {
            let mid = (low + high) >> 1;
            if waypoints[mid].dist <= clamped_d {
                low = mid;
            } else {
                high = mid;
            }
        }

        let p_a = waypoints[low];
        let p_b = waypoints[high];
        let seg_len = p_b.dist - p_a.dist;
        let alpha = if seg_len > 0.00001 {
            (clamped_d - p_a.dist) / seg_len
        } else {
            0.0
        };

        let pos = p_a.pos.lerp(p_b.pos, alpha);
        let normal = p_a.normal.lerp(p_b.normal, alpha).normalize_or_zero();

        let mut tangent = p_b.pos - p_a.pos;
        if tangent.length_squared() < 0.000001 {
            tangent = Vec3::X;
        } else {
            tangent = tangent.normalize();
        }

        let mut binormal = normal.cross(tangent);
        if binormal.length_squared() < 0.000001 {
            let mut alt = Vec3::Y;
            if normal.dot(alt).abs() > 0.9 {
                alt = Vec3::X;
            }
            binormal = normal.cross(alt).normalize_or_zero();
        } else {
            binormal = binormal.normalize();
        }

        (pos, normal, tangent, binormal)
    }

    fn build_track_waypoints(
        &self,
        arrow: &Arrow,
        grid_size: usize,
        cube_size: f32,
    ) -> (Vec<TrackPoint>, f32, f32) {
        let g_size = grid_size as f32;
        let cell_size = cube_size / g_size;
        let elevation = 0.024_f32;
        let fillet_radius = cell_size * 0.32;

        #[derive(Clone, Copy)]
        struct CellPt {
            pos: Vec3,
            normal: Vec3,
            face_idx: isize,
            is_corner_transition: bool,
        }

        let mut cell_path: Vec<CellPt> = Vec::new();
        let cells = &arrow.cells;

        for i in 0..cells.len() {
            let c = cells[i];
            let u = (c.c as f32 + 0.5) / g_size;
            let v = 1.0 - (c.r as f32 + 0.5) / g_size;
            let norm = self.get_face_vectors(c.face_idx, u, v).0;
            let pos =
                self.coord_to_local_3d(c.face_idx, c.r as f32, c.c as f32, grid_size) + norm * elevation;

            if i > 0 && cells[i - 1].face_idx != c.face_idx {
                let prev_c = cells[i - 1];
                let prev_u = (prev_c.c as f32 + 0.5) / g_size;
                let prev_v = 1.0 - (prev_c.r as f32 + 0.5) / g_size;
                let prev_norm = self.get_face_vectors(prev_c.face_idx, prev_u, prev_v).0;
                let prev_pos_raw = self.coord_to_local_3d(
                    prev_c.face_idx,
                    prev_c.r as f32,
                    prev_c.c as f32,
                    grid_size,
                );
                let cur_pos_raw =
                    self.coord_to_local_3d(c.face_idx, c.r as f32, c.c as f32, grid_size);

                let p_edge = (prev_pos_raw + cur_pos_raw) * 0.5;
                let p_edge_a = p_edge + prev_norm * elevation;
                let blend_norm = (prev_norm + norm).normalize_or_zero();
                let p_corner = p_edge + blend_norm * (elevation * 1.15);
                let p_edge_b = p_edge + norm * elevation;

                cell_path.push(CellPt {
                    pos: p_edge_a,
                    normal: prev_norm,
                    face_idx: prev_c.face_idx as isize,
                    is_corner_transition: true,
                });
                cell_path.push(CellPt {
                    pos: p_corner,
                    normal: blend_norm,
                    face_idx: -1,
                    is_corner_transition: true,
                });
                cell_path.push(CellPt {
                    pos: p_edge_b,
                    normal: norm,
                    face_idx: c.face_idx as isize,
                    is_corner_transition: true,
                });
            }

            cell_path.push(CellPt {
                pos,
                normal: norm,
                face_idx: c.face_idx as isize,
                is_corner_transition: false,
            });
        }

        let head_cell = *cells.last().unwrap();
        let head_face = head_cell.face_idx;
        let head_u = (head_cell.c as f32 + 0.5) / g_size;
        let head_v = 1.0 - (head_cell.r as f32 + 0.5) / g_size;
        let (head_normal, head_tu, head_tv) = self.get_face_vectors(head_face, head_u, head_v);
        let (dr, dc) = arrow.dir.delta();

        let (du, dv) = match arrow.dir {
            Direction::Up => (0.0_f32, 1.0_f32),
            Direction::Down => (0.0, -1.0),
            Direction::Left => (-1.0, 0.0),
            Direction::Right => (1.0, 0.0),
        };

        let fly_dir = (head_tu * du + head_tv * dv).normalize_or_zero();

        let mut curr_r = head_cell.r + dr;
        let mut curr_c = head_cell.c + dc;
        let mut last_r = head_cell.r;
        let mut last_c = head_cell.c;
        let g_i32 = grid_size as i32;

        while curr_r >= 0 && curr_r < g_i32 && curr_c >= 0 && curr_c < g_i32 {
            let ray_u = (curr_c as f32 + 0.5) / g_size;
            let ray_v = 1.0 - (curr_r as f32 + 0.5) / g_size;
            let ray_norm = self.get_face_vectors(head_face, ray_u, ray_v).0;
            let p_ray =
                self.coord_to_local_3d(head_face, curr_r as f32, curr_c as f32, grid_size)
                    + ray_norm * elevation;
            cell_path.push(CellPt {
                pos: p_ray,
                normal: ray_norm,
                face_idx: head_face as isize,
                is_corner_transition: false,
            });
            last_r = curr_r;
            last_c = curr_c;
            curr_r += dr;
            curr_c += dc;
        }

        let exit_r = match arrow.dir {
            Direction::Up => -0.5,
            Direction::Down => g_size - 0.5,
            _ => last_r as f32,
        };
        let exit_c = match arrow.dir {
            Direction::Left => -0.5,
            Direction::Right => g_size - 0.5,
            _ => last_c as f32,
        };

        let exit_u = (exit_c + 0.5) / g_size;
        let exit_v = 1.0 - (exit_r + 0.5) / g_size;
        let exit_norm = self.get_face_vectors(head_face, exit_u, exit_v).0;
        let p_exit =
            self.coord_to_local_3d(head_face, exit_r, exit_c, grid_size) + exit_norm * elevation;
        cell_path.push(CellPt {
            pos: p_exit,
            normal: exit_norm,
            face_idx: head_face as isize,
            is_corner_transition: false,
        });

        let mut raw_points: Vec<(Vec3, Vec3, bool)> = Vec::new();
        for i in 0..cell_path.len() {
            let cur = cell_path[i];
            let is_exit = i == cell_path.len() - 1;

            if i > 0
                && i + 1 < cell_path.len()
                && !cur.is_corner_transition
                && !cell_path[i - 1].is_corner_transition
                && !cell_path[i + 1].is_corner_transition
                && cell_path[i - 1].face_idx == cur.face_idx
                && cell_path[i + 1].face_idx == cur.face_idx
            {
                let prev = cell_path[i - 1];
                let next = cell_path[i + 1];
                let v_in = cur.pos - prev.pos;
                let v_out = next.pos - cur.pos;
                let len_in = v_in.length();
                let len_out = v_out.length();

                if len_in > 0.001 && len_out > 0.001 {
                    let v_in_n = v_in / len_in;
                    let v_out_n = v_out / len_out;
                    if v_in_n.dot(v_out_n) < 0.7 {
                        let r = fillet_radius.min(len_in * 0.45).min(len_out * 0.45);
                        let p_enter = cur.pos - v_in_n * r;
                        let bisect = (-v_in_n + v_out_n).normalize_or_zero();
                        let p_mid = cur.pos + bisect * (r * 0.414);
                        let p_exit_pt = cur.pos + v_out_n * r;

                        raw_points.push((p_enter, cur.normal, false));
                        raw_points.push((p_mid, cur.normal, false));
                        raw_points.push((p_exit_pt, cur.normal, false));
                        continue;
                    }
                }
            }

            raw_points.push((cur.pos, cur.normal, is_exit));
        }

        for dist in [1.0_f32, 2.5, 5.0, 8.0, 11.5] {
            let p_space = p_exit + fly_dir * dist;
            raw_points.push((p_space, exit_norm, false));
        }

        let mut waypoints: Vec<TrackPoint> = Vec::new();
        let mut cum_dist = 0.0_f32;
        let mut d_tail_exit = 0.0_f32;

        for i in 0..raw_points.len() {
            if i > 0 {
                let d = raw_points[i].0.distance(raw_points[i - 1].0);
                if d < 0.0005 {
                    continue;
                }
                cum_dist += d;
            }
            waypoints.push(TrackPoint {
                pos: raw_points[i].0,
                normal: raw_points[i].1,
                dist: cum_dist,
            });
            if raw_points[i].2 {
                d_tail_exit = cum_dist;
            }
        }

        if d_tail_exit == 0.0 {
            d_tail_exit = cum_dist * 0.35;
        }

        let head_initial_pos = self.coord_to_local_3d(
            head_cell.face_idx,
            head_cell.r as f32,
            head_cell.c as f32,
            grid_size,
        ) + head_normal * elevation;

        let mut head_center_dist = 0.0_f32;
        let mut min_dist = f32::INFINITY;
        for wp in &waypoints {
            let d = wp.pos.distance(head_initial_pos);
            if d < min_dist {
                min_dist = d;
                head_center_dist = wp.dist;
            }
        }

        (waypoints, head_center_dist, d_tail_exit)
    }

    pub fn spawn_flying_arrow(
        &mut self,
        arrow: &Arrow,
        grid_size: usize,
        cube_size: f32,
        color_hex: u32,
        now: f64,
    ) {
        let cell_size = cube_size / (grid_size as f32);
        let stem_width = cell_size * 0.28;
        let stem_thickness = cell_size * 0.14;
        let head_length = cell_size * 0.48;
        let wing_width = cell_size * 0.36;

        let (waypoints, head_center_dist, d_tail_exit) =
            self.build_track_waypoints(arrow, grid_size, cube_size);
        let total_track_length = waypoints.last().map(|w| w.dist).unwrap_or(1.0);
        let arrow_length = head_center_dist + head_length;

        let mut instance = SlitheringArrowInstance {
            waypoints,
            total_track_length,
            arrow_length,
            d_tail_exit,
            head_length,
            wing_width,
            stem_width,
            stem_thickness,
            start_time: now,
            duration: (1550 + (arrow.cells.len() * 24).min(450)) as f64,
            color_rgb: u32_to_rgb_f32(color_hex),
            outer_pos: Vec::new(),
            core_pos: Vec::new(),
        };

        Self::build_geometry_for_instance(&mut instance, 0.0);
        self.instances.push(instance);
    }

    fn build_geometry_for_instance(instance: &mut SlitheringArrowInstance, t: f32) {
        instance.outer_pos.clear();
        instance.core_pos.clear();

        let t_cube = 0.58_f32;
        let s = if t <= t_cube {
            let u = t / t_cube;
            let ease_cube = 0.25 * u + 0.75 * u.powf(1.2);
            ease_cube * instance.d_tail_exit
        } else {
            let v = (t - t_cube) / (1.0 - t_cube);
            let ease_space = 0.3 * v + 0.7 * v.powi(2);
            instance.d_tail_exit + ease_space * (instance.total_track_length - instance.d_tail_exit)
        };

        let d_tail = s;
        let d_head = (s + instance.arrow_length).min(instance.total_track_length);
        if d_tail >= instance.total_track_length {
            return;
        }

        let d_stem_end = d_tail.max(d_head - instance.head_length);

        #[derive(Clone, Copy)]
        struct SpinePoint {
            pos: Vec3,
            normal: Vec3,
            binormal: Vec3,
            dist: f32,
        }

        let mut spine: Vec<SpinePoint> = Vec::new();
        let (pos, normal, _t, binormal) = Self::sample_track(&instance.waypoints, d_tail);
        spine.push(SpinePoint {
            pos,
            normal,
            binormal,
            dist: d_tail,
        });

        for wp in &instance.waypoints {
            if wp.dist > d_tail + 0.01 && wp.dist < d_stem_end - 0.01 {
                let (p, n, _, b) = Self::sample_track(&instance.waypoints, wp.dist);
                spine.push(SpinePoint {
                    pos: p,
                    normal: n,
                    binormal: b,
                    dist: wp.dist,
                });
            }
        }

        if d_stem_end > d_tail + 0.005 {
            let (p, n, _, b) = Self::sample_track(&instance.waypoints, d_stem_end);
            spine.push(SpinePoint {
                pos: p,
                normal: n,
                binormal: b,
                dist: d_stem_end,
            });
        }

        let mut refined_spine: Vec<SpinePoint> = Vec::new();
        let max_seg = 0.35_f32;
        for i in 0..spine.len() {
            refined_spine.push(spine[i]);
            if i + 1 < spine.len() {
                let cur = spine[i];
                let nxt = spine[i + 1];
                let seg_dist = nxt.dist - cur.dist;
                if seg_dist > max_seg {
                    let sub_count = (seg_dist / max_seg).floor() as usize;
                    for k in 1..=sub_count {
                        let inter_d = cur.dist + (seg_dist * (k as f32)) / ((sub_count + 1) as f32);
                        let (p, n, _, b) = Self::sample_track(&instance.waypoints, inter_d);
                        refined_spine.push(SpinePoint {
                            pos: p,
                            normal: n,
                            binormal: b,
                            dist: inter_d,
                        });
                    }
                }
            }
        }

        let add_tri = |arr: &mut Vec<f32>, p0: Vec3, p1: Vec3, p2: Vec3| {
            arr.extend_from_slice(&[p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z]);
        };
        let add_quad = |arr: &mut Vec<f32>, p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3| {
            add_tri(arr, p0, p1, p2);
            add_tri(arr, p0, p2, p3);
        };

        let hw = instance.stem_width * 0.5;
        let ht = instance.stem_thickness * 0.5;
        let hw_core = instance.stem_width * 0.22;
        let ht_core = instance.stem_thickness * 0.52;

        if refined_spine.len() >= 2 {
            for i in 0..(refined_spine.len() - 1) {
                let s_a = refined_spine[i];
                let s_b = refined_spine[i + 1];

                let a_top_l = s_a.pos - s_a.binormal * hw + s_a.normal * ht;
                let a_top_r = s_a.pos + s_a.binormal * hw + s_a.normal * ht;
                let a_bot_l = s_a.pos - s_a.binormal * hw - s_a.normal * ht;
                let a_bot_r = s_a.pos + s_a.binormal * hw - s_a.normal * ht;

                let b_top_l = s_b.pos - s_b.binormal * hw + s_b.normal * ht;
                let b_top_r = s_b.pos + s_b.binormal * hw + s_b.normal * ht;
                let b_bot_l = s_b.pos - s_b.binormal * hw - s_b.normal * ht;
                let b_bot_r = s_b.pos + s_b.binormal * hw - s_b.normal * ht;

                add_quad(&mut instance.outer_pos, a_top_l, a_top_r, b_top_r, b_top_l);
                add_quad(&mut instance.outer_pos, a_bot_r, a_bot_l, b_bot_l, b_bot_r);
                add_quad(&mut instance.outer_pos, a_bot_l, a_top_l, b_top_l, b_bot_l);
                add_quad(&mut instance.outer_pos, a_top_r, a_bot_r, b_bot_r, b_top_r);

                if i == 0 {
                    add_quad(&mut instance.outer_pos, a_bot_l, a_bot_r, a_top_r, a_top_l);
                }

                let ca_l = s_a.pos - s_a.binormal * hw_core + s_a.normal * ht_core;
                let ca_r = s_a.pos + s_a.binormal * hw_core + s_a.normal * ht_core;
                let cb_l = s_b.pos - s_b.binormal * hw_core + s_b.normal * ht_core;
                let cb_r = s_b.pos + s_b.binormal * hw_core + s_b.normal * ht_core;

                add_quad(&mut instance.core_pos, ca_l, ca_r, cb_r, cb_l);
            }
        }

        if d_head > d_stem_end {
            let (tip_pos, head_norm, head_tang, head_binorm) =
                Self::sample_track(&instance.waypoints, d_head);
            let (base_pos, _, _, _) = Self::sample_track(&instance.waypoints, d_stem_end);

            let wing_w = instance.wing_width;
            let wing_back = instance.head_length * 0.12;

            let w_l = base_pos - head_binorm * wing_w - head_tang * wing_back;
            let w_r = base_pos + head_binorm * wing_w - head_tang * wing_back;

            let tip_top = tip_pos + head_norm * ht;
            let tip_bot = tip_pos - head_norm * ht;
            let wl_top = w_l + head_norm * ht;
            let wl_bot = w_l - head_norm * ht;
            let wr_top = w_r + head_norm * ht;
            let wr_bot = w_r - head_norm * ht;
            let base_top = base_pos + head_norm * ht;
            let base_bot = base_pos - head_norm * ht;

            add_tri(&mut instance.outer_pos, tip_top, wr_top, wl_top);
            add_tri(&mut instance.outer_pos, tip_bot, wl_bot, wr_bot);
            add_quad(&mut instance.outer_pos, tip_top, tip_bot, wl_bot, wl_top);
            add_quad(&mut instance.outer_pos, tip_top, wr_top, wr_bot, tip_bot);
            add_quad(&mut instance.outer_pos, wl_top, wl_bot, base_bot, base_top);
            add_quad(&mut instance.outer_pos, base_top, base_bot, wr_bot, wr_top);

            let core_tip_top = tip_pos + head_norm * ht_core;
            let core_wl = base_pos - head_binorm * (wing_w * 0.45)
                - head_tang * (wing_back * 0.5)
                + head_norm * ht_core;
            let core_wr = base_pos + head_binorm * (wing_w * 0.45)
                - head_tang * (wing_back * 0.5)
                + head_norm * ht_core;
            add_tri(&mut instance.core_pos, core_tip_top, core_wr, core_wl);
        }
    }

    pub fn update(&mut self, now: f64) {
        self.instances.retain_mut(|sa| {
            let elapsed = now - sa.start_time;
            let t = ((elapsed / sa.duration) as f32).min(1.0);
            Self::build_geometry_for_instance(sa, t);
            t < 1.0
        });
    }

    pub fn clear_all(&mut self) {
        self.instances.clear();
    }
}
