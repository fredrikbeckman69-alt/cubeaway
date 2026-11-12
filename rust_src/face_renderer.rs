use std::f64::consts::PI;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};
use crate::theme::{get_level_theme, LevelTheme};
use crate::types::{Arrow, ArrowType, PortalDef, ReflectorDef};

pub struct CubeFaceRenderer {
    pub canvases: Vec<HtmlCanvasElement>,
    ctxs: Vec<CanvasRenderingContext2d>,
    resolution: u32,
    pub grid_size: usize,
    theme: LevelTheme,
    pub dirty_faces: [bool; 6],
}

impl CubeFaceRenderer {
    pub fn new(resolution: u32) -> Self {
        let doc = web_sys::window().unwrap().document().unwrap();
        let mut canvases = Vec::with_capacity(6);
        let mut ctxs = Vec::with_capacity(6);

        for _ in 0..6 {
            let canvas: HtmlCanvasElement = doc
                .create_element("canvas")
                .unwrap()
                .dyn_into()
                .unwrap();
            canvas.set_width(resolution);
            canvas.set_height(resolution);
            let ctx: CanvasRenderingContext2d = canvas
                .get_context("2d")
                .unwrap()
                .unwrap()
                .dyn_into()
                .unwrap();
            canvases.push(canvas);
            ctxs.push(ctx);
        }

        Self {
            canvases,
            ctxs,
            resolution,
            grid_size: 20,
            theme: get_level_theme(1),
            dirty_faces: [true; 6],
        }
    }

    pub fn set_grid_size(&mut self, grid_size: usize) {
        self.grid_size = grid_size;
    }

    pub fn set_theme(&mut self, theme: LevelTheme) {
        self.theme = theme;
    }

    pub fn render_face(
        &mut self,
        face_idx: usize,
        all_arrows: &[Arrow],
        hovered_arrow_id: Option<&str>,
        shaking_arrow_id: Option<&str>,
        shake_offset: (f64, f64),
        hint_arrow_id: Option<&str>,
        portals: &[PortalDef],
        reflectors: &[ReflectorDef],
    ) {
        let ctx = &self.ctxs[face_idx];
        let res = self.resolution as f64;
        let g_size = self.grid_size as f64;
        let cell_size = res / g_size;

        // 1. Glödande termisk gradient på kubsidan
        let cx = res * 0.5;
        let cy = res * 0.5;
        if let Ok(grad) = ctx.create_radial_gradient(cx, cy, res * 0.08, cx, cy, res * 0.74) {
            let _ = grad.add_color_stop(0.0, &self.theme.cube_core);
            let _ = grad.add_color_stop(0.55, &self.theme.cube_mid);
            let _ = grad.add_color_stop(1.0, &self.theme.cube_edge);
            ctx.set_fill_style_canvas_gradient(&grad);
            ctx.fill_rect(0.0, 0.0, res, res);
        }

        // 2. Subtila glödande rutnätslinjer
        ctx.set_stroke_style_str(&self.theme.grid_line);
        ctx.set_line_width(1.0);
        for i in 1..self.grid_size {
            let p = ((i as f64) * cell_size).round();
            ctx.begin_path();
            ctx.move_to(p, 0.0);
            ctx.line_to(p, res);
            ctx.stroke();

            ctx.begin_path();
            ctx.move_to(0.0, p);
            ctx.line_to(res, p);
            ctx.stroke();
        }

        // Yttre glödande ram
        ctx.set_stroke_style_str(&self.theme.cube_rim);
        ctx.set_line_width(5.0);
        ctx.stroke_rect(2.0, 2.0, res - 4.0, res - 4.0);

        // 3. Rita alla pilar som har celler på denna sida
        for arrow in all_arrows {
            if !arrow.cells.iter().any(|c| c.face_idx == face_idx) {
                continue;
            }

            let is_hovered = hovered_arrow_id.is_some_and(|hid| {
                arrow.id == hid || arrow.linked_with_id.as_deref() == Some(hid)
            });
            let is_shaking = shaking_arrow_id.is_some_and(|sid| arrow.id == sid);
            let is_hint = hint_arrow_id.is_some_and(|hid| arrow.id == hid);

            let mut base_color = self.theme.arrow_base.as_str();
            let mut glow_color = self.theme.arrow_glow.as_str();
            let mut core_color = self.theme.arrow_core.as_str();

            if arrow.arrow_type == ArrowType::Frozen && arrow.is_frozen {
                base_color = "#38bdf8";
                glow_color = "#00f0ff";
                core_color = "#e0f7ff";
            } else if arrow.arrow_type == ArrowType::Linked {
                base_color = "#ff2df7";
                glow_color = "#ff00ea";
            }

            if is_shaking {
                base_color = "#ff1e27";
                glow_color = "#ff0033";
                core_color = "rgba(255, 230, 180, 0.95)";
            } else if is_hovered {
                base_color = "#ffffff";
                if arrow.arrow_type == ArrowType::Frozen && arrow.is_frozen {
                    glow_color = "#00f0ff";
                } else if arrow.arrow_type == ArrowType::Linked {
                    glow_color = "#ff00ea";
                } else if self.theme.is_white_theme {
                    glow_color = "#38bdf8";
                } else {
                    glow_color = &self.theme.arrow_glow;
                }
                core_color = "#ffffff";
            } else if is_hint {
                base_color = "#ffe500";
                glow_color = "#ffea00";
                core_color = "#ffffff";
            }

            let offset = if is_shaking { shake_offset } else { (0.0, 0.0) };
            self.draw_arrow_on_face(
                ctx,
                arrow,
                face_idx,
                cell_size,
                res,
                base_color,
                glow_color,
                core_color,
                offset,
                is_hovered || is_hint,
            );
        }

        // 4. Rita kosmiska portaler (maskhål)
        for portal in portals {
            for c in [portal.portal_a, portal.portal_b] {
                if c.face_idx != face_idx {
                    continue;
                }
                let px = (c.c as f64) * cell_size + cell_size * 0.5;
                let py = (c.r as f64) * cell_size + cell_size * 0.5;
                let rad = cell_size * 0.42;

                ctx.save();
                if let Ok(p_grad) = ctx.create_radial_gradient(px, py, rad * 0.15, px, py, rad) {
                    let _ = p_grad.add_color_stop(0.0, "#000000");
                    let _ = p_grad.add_color_stop(0.5, "#7928ca");
                    let _ = p_grad.add_color_stop(0.85, "#00dfd8");
                    let _ = p_grad.add_color_stop(1.0, "rgba(0, 223, 216, 0)");
                    ctx.set_fill_style_canvas_gradient(&p_grad);
                    ctx.begin_path();
                    let _ = ctx.arc(px, py, rad, 0.0, PI * 2.0);
                    ctx.fill();
                }

                ctx.set_stroke_style_str("#00f0ff");
                ctx.set_line_width(3.0);
                ctx.set_shadow_color("#00dfd8");
                ctx.set_shadow_blur(12.0);
                ctx.begin_path();
                let _ = ctx.arc(px, py, rad * 0.75, 0.0, PI * 2.0);
                ctx.stroke();

                ctx.set_fill_style_str("#ffffff");
                ctx.begin_path();
                let _ = ctx.arc(px, py, rad * 0.22, 0.0, PI * 2.0);
                ctx.fill();
                ctx.restore();
            }
        }

        // 5. Rita prismor / reflektorer
        for refl in reflectors {
            if refl.coord.face_idx != face_idx {
                continue;
            }
            let rx = (refl.coord.c as f64) * cell_size;
            let ry = (refl.coord.r as f64) * cell_size;

            ctx.save();
            ctx.set_stroke_style_str("#67e8f9");
            ctx.set_line_width(4.0);
            ctx.set_shadow_color("#00f0ff");
            ctx.set_shadow_blur(14.0);
            ctx.set_line_cap("round");

            ctx.begin_path();
            if refl.orientation == '/' {
                ctx.move_to(rx + cell_size * 0.15, ry + cell_size * 0.85);
                ctx.line_to(rx + cell_size * 0.85, ry + cell_size * 0.15);
            } else {
                ctx.move_to(rx + cell_size * 0.15, ry + cell_size * 0.15);
                ctx.line_to(rx + cell_size * 0.85, ry + cell_size * 0.85);
            }
            ctx.stroke();

            ctx.set_fill_style_str("#ffffff");
            ctx.set_shadow_color("#ffffff");
            ctx.set_shadow_blur(8.0);
            ctx.begin_path();
            let _ = ctx.arc(rx + cell_size * 0.5, ry + cell_size * 0.5, 3.5, 0.0, PI * 2.0);
            ctx.fill();
            ctx.restore();
        }

        self.dirty_faces[face_idx] = true;
    }

    #[allow(clippy::too_many_arguments)]
    fn draw_arrow_on_face(
        &self,
        ctx: &CanvasRenderingContext2d,
        arrow: &Arrow,
        face_idx: usize,
        cell_size: f64,
        res: f64,
        base_color: &str,
        glow_color: &str,
        core_color: &str,
        offset: (f64, f64),
        is_highlighted: bool,
    ) {
        let total_cells = arrow.cells.len();
        if total_cells < 2 {
            return;
        }

        ctx.save();
        let _ = ctx.translate(offset.0, offset.1);

        let line_width = (cell_size * 0.22).max(4.5);

        let mut in_run = false;
        let mut run_start = 0;

        for i in 0..=total_cells {
            let on_face = i < total_cells && arrow.cells[i].face_idx == face_idx;
            if on_face && !in_run {
                in_run = true;
                run_start = i;
            } else if !on_face && in_run {
                in_run = false;
                let run_end = i - 1;
                self.draw_sub_run(
                    ctx,
                    arrow,
                    run_start,
                    run_end,
                    cell_size,
                    res,
                    base_color,
                    glow_color,
                    core_color,
                    line_width,
                    is_highlighted,
                );
            }
        }

        ctx.restore();
    }

    #[allow(clippy::too_many_arguments)]
    fn draw_sub_run(
        &self,
        ctx: &CanvasRenderingContext2d,
        arrow: &Arrow,
        start_idx: usize,
        end_idx: usize,
        cell_size: f64,
        res: f64,
        base_color: &str,
        glow_color: &str,
        core_color: &str,
        line_width: f64,
        is_highlighted: bool,
    ) {
        let s = cell_size;
        let is_tail = start_idx == 0;
        let is_head = end_idx == arrow.cells.len() - 1;

        let first_cell = arrow.cells[start_idx];
        let last_cell = arrow.cells[end_idx];

        let get_center = |r: i32, c: i32| -> (f64, f64) {
            ((c as f64 + 0.5) * cell_size, (r as f64 + 0.5) * cell_size)
        };

        let mut points: Vec<(f64, f64)> = Vec::new();
        let g_max = (self.grid_size as i32) - 1;

        if is_tail {
            points.push(get_center(first_cell.r, first_cell.c));
        } else {
            let pt = get_center(first_cell.r, first_cell.c);
            let mut edge_x = pt.0;
            let mut edge_y = pt.1;
            if first_cell.c == 0 {
                edge_x = 0.0;
            } else if first_cell.c == g_max {
                edge_x = res;
            } else if first_cell.r == 0 {
                edge_y = 0.0;
            } else if first_cell.r == g_max {
                edge_y = res;
            }
            points.push((edge_x, edge_y));
            points.push(pt);
        }

        let loop_end = if is_head { end_idx } else { end_idx + 1 };
        for i in (start_idx + 1)..loop_end {
            let c = arrow.cells[i];
            points.push(get_center(c.r, c.c));
        }

        let mut head_tip = (0.0, 0.0);
        let mut head_wing1 = (0.0, 0.0);
        let mut head_wing2 = (0.0, 0.0);
        let mut core_tip = (0.0, 0.0);
        let mut core_wing1 = (0.0, 0.0);
        let mut core_wing2 = (0.0, 0.0);
        let mut head_center = (0.0, 0.0);

        if is_head {
            let (dr_i, dc_i) = arrow.dir.delta();
            let dr = dr_i as f64;
            let dc = dc_i as f64;
            let tip_dist = s * 0.44;
            let arrow_len = s * 0.48;
            let wing_width = s * 0.34;

            head_center = get_center(last_cell.r, last_cell.c);
            head_tip = (head_center.0 + dc * tip_dist, head_center.1 + dr * tip_dist);

            let base_center_x = head_tip.0 - dc * arrow_len;
            let base_center_y = head_tip.1 - dr * arrow_len;

            let perp_x = -dr;
            let perp_y = dc;

            head_wing1 = (
                base_center_x + perp_x * wing_width,
                base_center_y + perp_y * wing_width,
            );
            head_wing2 = (
                base_center_x - perp_x * wing_width,
                base_center_y - perp_y * wing_width,
            );

            points.push((
                base_center_x + dc * (s * 0.05),
                base_center_y + dr * (s * 0.05),
            ));

            let core_tip_dist = tip_dist - s * 0.08;
            let core_len = arrow_len * 0.65;
            let core_wing_w = wing_width * 0.55;
            core_tip = (
                head_center.0 + dc * core_tip_dist,
                head_center.1 + dr * core_tip_dist,
            );
            let core_base_x = core_tip.0 - dc * core_len;
            let core_base_y = core_tip.1 - dr * core_len;
            core_wing1 = (
                core_base_x + perp_x * core_wing_w,
                core_base_y + perp_y * core_wing_w,
            );
            core_wing2 = (
                core_base_x - perp_x * core_wing_w,
                core_base_y - perp_y * core_wing_w,
            );
        } else {
            let pt = get_center(last_cell.r, last_cell.c);
            let mut edge_x = pt.0;
            let mut edge_y = pt.1;
            if last_cell.c == 0 {
                edge_x = 0.0;
            } else if last_cell.c == g_max {
                edge_x = res;
            } else if last_cell.r == 0 {
                edge_y = 0.0;
            } else if last_cell.r == g_max {
                edge_y = res;
            }
            points.push((edge_x, edge_y));
        }

        if points.is_empty() {
            return;
        }

        // PASS 1: Yttre glödande neon-kropp
        ctx.save();
        ctx.set_shadow_color(glow_color);
        ctx.set_shadow_blur(if is_highlighted {
            (s * 0.45).max(16.0)
        } else {
            0.0
        });

        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);
        for pt in &points[1..] {
            ctx.line_to(pt.0, pt.1);
        }
        ctx.set_stroke_style_str(base_color);
        ctx.set_line_width(line_width);
        ctx.set_line_cap("round");
        ctx.set_line_join("round");
        ctx.stroke();

        if is_head {
            ctx.begin_path();
            ctx.move_to(head_tip.0, head_tip.1);
            ctx.line_to(head_wing1.0, head_wing1.1);
            ctx.line_to(head_wing2.0, head_wing2.1);
            ctx.close_path();
            ctx.set_fill_style_str(base_color);
            ctx.fill();
        }
        ctx.restore();

        // PASS 2: Intensiv vitglödgad inre energikärna
        ctx.save();
        ctx.begin_path();
        ctx.move_to(points[0].0, points[0].1);
        for pt in &points[1..] {
            ctx.line_to(pt.0, pt.1);
        }
        ctx.set_stroke_style_str(core_color);
        ctx.set_line_width((line_width * 0.38).max(2.0));
        ctx.set_line_cap("round");
        ctx.set_line_join("round");
        ctx.stroke();

        if is_head {
            ctx.begin_path();
            ctx.move_to(core_tip.0, core_tip.1);
            ctx.line_to(core_wing1.0, core_wing1.1);
            ctx.line_to(core_wing2.0, core_wing2.1);
            ctx.close_path();
            ctx.set_fill_style_str(core_color);
            ctx.fill();

            if arrow.arrow_type == ArrowType::Frozen && arrow.is_frozen {
                ctx.save();
                let badge_r = s * 0.28;
                ctx.begin_path();
                let _ = ctx.arc(head_center.0, head_center.1, badge_r, 0.0, PI * 2.0);
                ctx.set_fill_style_str("rgba(8, 24, 44, 0.88)");
                ctx.fill();
                ctx.set_stroke_style_str("#00f0ff");
                ctx.set_line_width(2.5);
                ctx.stroke();

                ctx.set_fill_style_str("#ffffff");
                ctx.set_font(&format!("bold {}px sans-serif", (s * 0.36).round() as i32));
                ctx.set_text_align("center");
                ctx.set_text_baseline("middle");
                ctx.set_shadow_color("#00f0ff");
                ctx.set_shadow_blur(8.0);
                let _ = ctx.fill_text("❄", head_center.0, head_center.1);
                ctx.restore();
            } else if arrow.arrow_type == ArrowType::Linked {
                ctx.save();
                let badge_r = s * 0.28;
                ctx.begin_path();
                let _ = ctx.arc(head_center.0, head_center.1, badge_r, 0.0, PI * 2.0);
                ctx.set_fill_style_str("rgba(38, 4, 45, 0.92)");
                ctx.fill();
                ctx.set_stroke_style_str("#ff00ea");
                ctx.set_line_width(2.5);
                ctx.stroke();

                ctx.set_fill_style_str("#ffffff");
                ctx.set_font(&format!("bold {}px sans-serif", (s * 0.34).round() as i32));
                ctx.set_text_align("center");
                ctx.set_text_baseline("middle");
                ctx.set_shadow_color("#ff00ea");
                ctx.set_shadow_blur(8.0);
                let _ = ctx.fill_text("🔗", head_center.0, head_center.1);
                ctx.restore();
            }
        }
        ctx.restore();
    }
}
