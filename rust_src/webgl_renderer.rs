use glam::Mat4;
use wasm_bindgen::JsCast;
use web_sys::{
    HtmlCanvasElement, HtmlImageElement, WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram,
    WebGlShader, WebGlTexture, WebGlUniformLocation, WebGlVertexArrayObject,
};
use crate::celestial_sphere::{build_ring_mesh, build_uv_sphere_mesh, CelestialSphere};
use crate::face_renderer::CubeFaceRenderer;
use crate::flying_arrows::FlyingArrowManager;
use crate::particles::ParticleManager;
use crate::shapes::ShapeMesh;

struct GpuMesh {
    vao: WebGlVertexArrayObject,
    vbo: WebGlBuffer,
    ibo: WebGlBuffer,
    index_count: i32,
}

pub struct WebGlRenderer {
    pub canvas: HtmlCanvasElement,
    pub gl: GL,

    // Background program
    bg_prog: WebGlProgram,
    bg_vao: WebGlVertexArrayObject,
    bg_tex: WebGlTexture,
    pub bg_loaded: bool,
    pub bg_img_w: f32,
    pub bg_img_h: f32,
    u_bg_has_tex: Option<WebGlUniformLocation>,
    u_bg_uv_scale: Option<WebGlUniformLocation>,
    u_bg_uv_offset: Option<WebGlUniformLocation>,

    // Standard Lit Mesh program (Cube faces + Celestial Sphere + Ring)
    mesh_prog: WebGlProgram,
    u_mesh_mvp: Option<WebGlUniformLocation>,
    u_mesh_model: Option<WebGlUniformLocation>,
    u_mesh_light1_color: Option<WebGlUniformLocation>,
    u_mesh_emissive: Option<WebGlUniformLocation>,
    u_mesh_opacity: Option<WebGlUniformLocation>,
    u_mesh_is_unlit_tex: Option<WebGlUniformLocation>,
    u_mesh_is_cube_face: Option<WebGlUniformLocation>,

    // Solid color / additive glow program (Flying arrows + Corona glow)
    solid_prog: WebGlProgram,
    u_solid_mvp: Option<WebGlUniformLocation>,
    u_solid_color: Option<WebGlUniformLocation>,
    u_solid_opacity: Option<WebGlUniformLocation>,
    dynamic_arrow_vao: WebGlVertexArrayObject,
    dynamic_arrow_vbo: WebGlBuffer,

    // Particle program
    particle_prog: WebGlProgram,
    u_part_mvp: Option<WebGlUniformLocation>,
    u_part_viewport_h: Option<WebGlUniformLocation>,
    particle_vao: WebGlVertexArrayObject,
    particle_vbo: WebGlBuffer,

    // Meshes & Textures
    cube_face_meshes: Vec<GpuMesh>,
    cube_face_textures: Vec<WebGlTexture>,

    sphere_mesh: GpuMesh,
    glow_mesh: GpuMesh,
    ring_mesh: GpuMesh,
    celestial_tex: WebGlTexture,
    ring_tex: WebGlTexture,
}

impl WebGlRenderer {
    pub fn new(canvas: HtmlCanvasElement) -> Result<Self, String> {
        let gl: GL = canvas
            .get_context("webgl2")
            .map_err(|_| "Failed to get webgl2 context")?
            .ok_or("WebGL2 not supported")?
            .dyn_into()
            .map_err(|_| "Failed to cast WebGl2RenderingContext")?;

        // 1. Background Shader
        let bg_vs = r#"#version 300 es
        precision highp float;
        layout(location = 0) in vec2 a_pos;
        out vec2 v_uv;
        uniform vec2 u_uv_scale;
        uniform vec2 u_uv_offset;
        void main() {
            vec2 raw_uv = a_pos * 0.5 + 0.5;
            raw_uv.y = 1.0 - raw_uv.y;
            v_uv = raw_uv * u_uv_scale + u_uv_offset;
            gl_Position = vec4(a_pos, 0.9999, 1.0);
        }
        "#;

        let bg_fs = r#"#version 300 es
        precision highp float;
        in vec2 v_uv;
        uniform sampler2D u_tex;
        uniform int u_has_tex;
        out vec4 fragColor;
        void main() {
            if (u_has_tex == 1) {
                vec3 c = texture(u_tex, v_uv).rgb;
                fragColor = vec4(c, 1.0);
            } else {
                vec3 top = vec3(0.06, 0.01, 0.11);
                vec3 bot = vec3(0.02, 0.005, 0.05);
                fragColor = vec4(mix(top, bot, v_uv.y), 1.0);
            }
        }
        "#;
        let bg_prog = link_program(&gl, bg_vs, bg_fs)?;
        let u_bg_has_tex = gl.get_uniform_location(&bg_prog, "u_has_tex");
        let u_bg_uv_scale = gl.get_uniform_location(&bg_prog, "u_uv_scale");
        let u_bg_uv_offset = gl.get_uniform_location(&bg_prog, "u_uv_offset");

        let bg_vao = gl.create_vertex_array().ok_or("bg vao")?;
        gl.bind_vertex_array(Some(&bg_vao));
        let bg_vbo = gl.create_buffer().ok_or("bg vbo")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&bg_vbo));
        let quad_verts: [f32; 12] = [
            -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
        ];
        unsafe {
            let view = js_sys::Float32Array::view(&quad_verts);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::STATIC_DRAW);
        }
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 2, GL::FLOAT, false, 8, 0);
        gl.bind_vertex_array(None);

        let bg_tex = gl.create_texture().ok_or("bg tex")?;
        gl.bind_texture(GL::TEXTURE_2D, Some(&bg_tex));
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);

        // 2. Lit Textured Mesh Shader (Cube Faces + Celestial Sphere + Rings) with ACES Filmic & Neon Bloom boost
        let mesh_vs = r#"#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_pos;
        layout(location = 1) in vec3 a_norm;
        layout(location = 2) in vec2 a_uv;
        uniform mat4 u_mvp;
        uniform mat4 u_model;
        out vec3 v_world_norm;
        out vec3 v_world_pos;
        out vec2 v_uv;
        void main() {
            vec4 wp = u_model * vec4(a_pos, 1.0);
            v_world_pos = wp.xyz;
            v_world_norm = normalize(mat3(u_model) * a_norm);
            v_uv = vec2(a_uv.x, 1.0 - a_uv.y);
            gl_Position = u_mvp * vec4(a_pos, 1.0);
        }
        "#;

        let mesh_fs = r#"#version 300 es
        precision highp float;
        in vec3 v_world_norm;
        in vec3 v_world_pos;
        in vec2 v_uv;
        uniform sampler2D u_tex;
        uniform vec3 u_light1_color;
        uniform vec3 u_emissive;
        uniform float u_opacity;
        uniform int u_is_unlit_tex;
        uniform int u_is_cube_face;
        out vec4 fragColor;

        vec3 aces_filmic(vec3 x) {
            float a = 2.51;
            float b = 0.03;
            float c = 2.43;
            float d = 0.59;
            float e = 0.14;
            return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        void main() {
            vec4 texel = texture(u_tex, v_uv);
            if (u_is_unlit_tex == 1) {
                fragColor = vec4(texel.rgb, texel.a * u_opacity);
                return;
            }

            vec3 n = normalize(v_world_norm);
            vec3 l1 = normalize(vec3(5.0, 10.0, 7.0));
            vec3 l2 = normalize(vec3(-5.0, 5.0, -5.0));
            vec3 v = normalize(vec3(0.0, 0.0, 6.0) - v_world_pos);
            vec3 h1 = normalize(l1 + v);

            float ndl1 = max(dot(n, l1), 0.0);
            float ndl2 = max(dot(n, l2), 0.0);

            vec3 ambient = vec3(0.55);
            vec3 diff = u_light1_color * (ndl1 * 0.65) + vec3(1.0) * (ndl2 * 0.18);

            // Detect bright neon arrow pixels on the cube face so they self-illuminate crisply
            float lum = max(texel.r, max(texel.g, texel.b));
            float neon_mask = (u_is_cube_face == 1) ? smoothstep(0.28, 0.65, lum) : 0.0;

            float spec = pow(max(dot(n, h1), 0.0), 36.0) * 0.18 * (1.0 - neon_mask * 0.7);
            vec3 lit = texel.rgb * mix(ambient + diff, vec3(1.38), neon_mask) + u_emissive + vec3(spec);
            vec3 mapped = aces_filmic(lit);

            fragColor = vec4(mapped, texel.a * u_opacity);
        }
        "#;
        let mesh_prog = link_program(&gl, mesh_vs, mesh_fs)?;
        let u_mesh_mvp = gl.get_uniform_location(&mesh_prog, "u_mvp");
        let u_mesh_model = gl.get_uniform_location(&mesh_prog, "u_model");
        let u_mesh_light1_color = gl.get_uniform_location(&mesh_prog, "u_light1_color");
        let u_mesh_emissive = gl.get_uniform_location(&mesh_prog, "u_emissive");
        let u_mesh_opacity = gl.get_uniform_location(&mesh_prog, "u_opacity");
        let u_mesh_is_unlit_tex = gl.get_uniform_location(&mesh_prog, "u_is_unlit_tex");
        let u_mesh_is_cube_face = gl.get_uniform_location(&mesh_prog, "u_is_cube_face");

        // 3. Solid / Glow Shader (Flying arrows + Corona sphere)
        let solid_vs = r#"#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_pos;
        uniform mat4 u_mvp;
        void main() {
            gl_Position = u_mvp * vec4(a_pos, 1.0);
        }
        "#;
        let solid_fs = r#"#version 300 es
        precision highp float;
        uniform vec3 u_color;
        uniform float u_opacity;
        out vec4 fragColor;
        void main() {
            fragColor = vec4(u_color, u_opacity);
        }
        "#;
        let solid_prog = link_program(&gl, solid_vs, solid_fs)?;
        let u_solid_mvp = gl.get_uniform_location(&solid_prog, "u_mvp");
        let u_solid_color = gl.get_uniform_location(&solid_prog, "u_color");
        let u_solid_opacity = gl.get_uniform_location(&solid_prog, "u_opacity");

        let dynamic_arrow_vao = gl.create_vertex_array().ok_or("arrow vao")?;
        let dynamic_arrow_vbo = gl.create_buffer().ok_or("arrow vbo")?;
        gl.bind_vertex_array(Some(&dynamic_arrow_vao));
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&dynamic_arrow_vbo));
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 3, GL::FLOAT, false, 12, 0);
        gl.bind_vertex_array(None);

        // 4. Particle Shader
        let part_vs = r#"#version 300 es
        precision highp float;
        layout(location = 0) in vec3 a_pos;
        layout(location = 1) in vec3 a_color;
        layout(location = 2) in float a_size;
        uniform mat4 u_mvp;
        uniform float u_viewport_h;
        out vec3 v_color;
        void main() {
            vec4 clip = u_mvp * vec4(a_pos, 1.0);
            gl_Position = clip;
            v_color = a_color;
            gl_PointSize = max(2.0, (a_size * u_viewport_h * 0.45) / max(0.5, clip.w));
        }
        "#;
        let part_fs = r#"#version 300 es
        precision highp float;
        in vec3 v_color;
        out vec4 fragColor;
        void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float r = length(p);
            if (r > 1.0) discard;
            float a = pow(1.0 - r, 1.6);
            fragColor = vec4(v_color * a, a);
        }
        "#;
        let particle_prog = link_program(&gl, part_vs, part_fs)?;
        let u_part_mvp = gl.get_uniform_location(&particle_prog, "u_mvp");
        let u_part_viewport_h = gl.get_uniform_location(&particle_prog, "u_viewport_h");

        let particle_vao = gl.create_vertex_array().ok_or("part vao")?;
        let particle_vbo = gl.create_buffer().ok_or("part vbo")?;
        gl.bind_vertex_array(Some(&particle_vao));
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&particle_vbo));
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_with_i32(0, 3, GL::FLOAT, false, 28, 0);
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_with_i32(1, 3, GL::FLOAT, false, 28, 12);
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_with_i32(2, 1, GL::FLOAT, false, 28, 24);
        gl.bind_vertex_array(None);

        // Create 6 cube face textures
        let mut cube_face_textures = Vec::with_capacity(6);
        for _ in 0..6 {
            let tex = gl.create_texture().ok_or("face tex")?;
            gl.bind_texture(GL::TEXTURE_2D, Some(&tex));
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
            gl.tex_parameteri(
                GL::TEXTURE_2D,
                GL::TEXTURE_MIN_FILTER,
                GL::LINEAR_MIPMAP_LINEAR as i32,
            );
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);
            cube_face_textures.push(tex);
        }

        // Create Celestial Sphere & Ring GPU meshes
        let (sph_v, sph_i) = build_uv_sphere_mesh(5.0, 48, 48);
        let sphere_mesh = create_gpu_mesh(&gl, &sph_v, &sph_i)?;

        let (glow_v, glow_i) = build_uv_sphere_mesh(5.0, 32, 32);
        let glow_mesh = create_gpu_mesh(&gl, &glow_v, &glow_i)?;

        let (ring_v, ring_i) = build_ring_mesh(6.0, 10.0, 64);
        let ring_mesh = create_gpu_mesh(&gl, &ring_v, &ring_i)?;

        let celestial_tex = gl.create_texture().ok_or("celestial tex")?;
        gl.bind_texture(GL::TEXTURE_2D, Some(&celestial_tex));
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::REPEAT as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);

        let ring_tex = gl.create_texture().ok_or("ring tex")?;
        gl.bind_texture(GL::TEXTURE_2D, Some(&ring_tex));
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);

        Ok(Self {
            canvas,
            gl,
            bg_prog,
            bg_vao,
            bg_tex,
            bg_loaded: false,
            bg_img_w: 1024.0,
            bg_img_h: 576.0,
            u_bg_has_tex,
            u_bg_uv_scale,
            u_bg_uv_offset,
            mesh_prog,
            u_mesh_mvp,
            u_mesh_model,
            u_mesh_light1_color,
            u_mesh_emissive,
            u_mesh_opacity,
            u_mesh_is_unlit_tex,
            u_mesh_is_cube_face,
            solid_prog,
            u_solid_mvp,
            u_solid_color,
            u_solid_opacity,
            dynamic_arrow_vao,
            dynamic_arrow_vbo,
            particle_prog,
            u_part_mvp,
            u_part_viewport_h,
            particle_vao,
            particle_vbo,
            cube_face_meshes: Vec::new(),
            cube_face_textures,
            sphere_mesh,
            glow_mesh,
            ring_mesh,
            celestial_tex,
            ring_tex,
        })
    }

    pub fn upload_background_image(&mut self, img: &HtmlImageElement) {
        self.gl.bind_texture(GL::TEXTURE_2D, Some(&self.bg_tex));
        if self
            .gl
            .tex_image_2d_with_u32_and_u32_and_html_image_element(
                GL::TEXTURE_2D,
                0,
                GL::RGBA as i32,
                GL::RGBA,
                GL::UNSIGNED_BYTE,
                img,
            )
            .is_ok()
        {
            self.bg_img_w = (img.width() as f32).max(1.0);
            self.bg_img_h = (img.height() as f32).max(1.0);
            self.bg_loaded = true;
        }
    }

    pub fn set_shape_mesh(&mut self, shape_mesh: &ShapeMesh) {
        for m in &self.cube_face_meshes {
            self.gl.delete_vertex_array(Some(&m.vao));
            self.gl.delete_buffer(Some(&m.vbo));
            self.gl.delete_buffer(Some(&m.ibo));
        }
        self.cube_face_meshes.clear();

        for face in &shape_mesh.faces {
            if let Ok(gm) = create_gpu_mesh(&self.gl, &face.vertices, &face.indices) {
                self.cube_face_meshes.push(gm);
            }
        }
    }

    pub fn sync_face_textures(&self, face_renderer: &mut CubeFaceRenderer) {
        for i in 0..6 {
            if face_renderer.dirty_faces[i] {
                self.gl
                    .bind_texture(GL::TEXTURE_2D, Some(&self.cube_face_textures[i]));
                let _ = self.gl.tex_image_2d_with_u32_and_u32_and_html_canvas_element(
                    GL::TEXTURE_2D,
                    0,
                    GL::RGBA as i32,
                    GL::RGBA,
                    GL::UNSIGNED_BYTE,
                    &face_renderer.canvases[i],
                );
                self.gl.generate_mipmap(GL::TEXTURE_2D);
                face_renderer.dirty_faces[i] = false;
            }
        }
    }

    pub fn sync_celestial_textures(&self, celestial: &mut CelestialSphere) {
        if !celestial.texture_dirty {
            return;
        }
        self.gl
            .bind_texture(GL::TEXTURE_2D, Some(&self.celestial_tex));
        let _ = self.gl.tex_image_2d_with_u32_and_u32_and_html_canvas_element(
            GL::TEXTURE_2D,
            0,
            GL::RGBA as i32,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            &celestial.surface_canvas,
        );

        if celestial.has_rings_active {
            self.gl.bind_texture(GL::TEXTURE_2D, Some(&self.ring_tex));
            let _ = self.gl.tex_image_2d_with_u32_and_u32_and_html_canvas_element(
                GL::TEXTURE_2D,
                0,
                GL::RGBA as i32,
                GL::RGBA,
                GL::UNSIGNED_BYTE,
                &celestial.ring_canvas,
            );
        }
        celestial.texture_dirty = false;
    }

    #[allow(clippy::too_many_arguments)]
    pub fn render(
        &mut self,
        proj: Mat4,
        view: Mat4,
        cube_model: Mat4,
        cube_visible: bool,
        cube_opacity: f32,
        light1_rgb: [f32; 3],
        face_renderer: &mut CubeFaceRenderer,
        celestial: &mut CelestialSphere,
        flying_manager: &FlyingArrowManager,
        particle_manager: &ParticleManager,
    ) {
        let gl = &self.gl;
        let w = self.canvas.width() as i32;
        let h = self.canvas.height() as i32;
        gl.viewport(0, 0, w, h);

        self.sync_face_textures(face_renderer);
        self.sync_celestial_textures(celestial);

        gl.clear_color(0.043, 0.008, 0.075, 1.0);
        gl.clear(GL::COLOR_BUFFER_BIT | GL::DEPTH_BUFFER_BIT);

        // 1. Space Background Quad
        gl.disable(GL::DEPTH_TEST);
        gl.depth_mask(false);
        gl.disable(GL::BLEND);
        gl.use_program(Some(&self.bg_prog));

        let screen_aspect = (w.max(1) as f32) / (h.max(1) as f32);
        let img_aspect = self.bg_img_w / self.bg_img_h.max(1.0);
        let (sx, sy, tx, ty) = if screen_aspect < img_aspect {
            let s = screen_aspect / img_aspect;
            (s, 1.0, (1.0 - s) * 0.5, 0.0)
        } else {
            let s = img_aspect / screen_aspect;
            (1.0, s, 0.0, (1.0 - s) * 0.5)
        };
        gl.uniform1i(self.u_bg_has_tex.as_ref(), if self.bg_loaded { 1 } else { 0 });
        gl.uniform2f(self.u_bg_uv_scale.as_ref(), sx, sy);
        gl.uniform2f(self.u_bg_uv_offset.as_ref(), tx, ty);

        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.bg_tex));
        gl.bind_vertex_array(Some(&self.bg_vao));
        gl.draw_arrays(GL::TRIANGLES, 0, 6);

        let vp = proj * view;

        // 2. Celestial Sphere & Rings & Corona Glow
        gl.enable(GL::DEPTH_TEST);
        gl.depth_mask(true);
        gl.enable(GL::CULL_FACE);
        gl.cull_face(GL::BACK);

        gl.use_program(Some(&self.mesh_prog));
        let sph_model = celestial.sphere_model_matrix();
        let sph_mvp = vp * sph_model;
        gl.uniform_matrix4fv_with_f32_array(
            self.u_mesh_mvp.as_ref(),
            false,
            &sph_mvp.to_cols_array(),
        );
        gl.uniform_matrix4fv_with_f32_array(
            self.u_mesh_model.as_ref(),
            false,
            &sph_model.to_cols_array(),
        );
        gl.uniform3fv_with_f32_array(self.u_mesh_light1_color.as_ref(), &[1.0, 1.0, 1.0]);
        let em_scale = if celestial.is_star { 0.75 } else { 0.08 };
        gl.uniform3f(
            self.u_mesh_emissive.as_ref(),
            celestial.emissive_rgb[0] * em_scale,
            celestial.emissive_rgb[1] * em_scale,
            celestial.emissive_rgb[2] * em_scale,
        );
        gl.uniform1f(self.u_mesh_opacity.as_ref(), 1.0);
        gl.uniform1i(self.u_mesh_is_unlit_tex.as_ref(), 0);
        gl.uniform1i(self.u_mesh_is_cube_face.as_ref(), 0);

        gl.bind_texture(GL::TEXTURE_2D, Some(&self.celestial_tex));
        gl.bind_vertex_array(Some(&self.sphere_mesh.vao));
        gl.draw_elements_with_i32(
            GL::TRIANGLES,
            self.sphere_mesh.index_count,
            GL::UNSIGNED_SHORT,
            0,
        );

        // Celestial Rings
        if celestial.has_rings_active {
            gl.disable(GL::CULL_FACE);
            gl.enable(GL::BLEND);
            gl.blend_func(GL::SRC_ALPHA, GL::ONE_MINUS_SRC_ALPHA);
            let ring_model = celestial.ring_model_matrix();
            let ring_mvp = vp * ring_model;
            gl.uniform_matrix4fv_with_f32_array(
                self.u_mesh_mvp.as_ref(),
                false,
                &ring_mvp.to_cols_array(),
            );
            gl.uniform_matrix4fv_with_f32_array(
                self.u_mesh_model.as_ref(),
                false,
                &ring_model.to_cols_array(),
            );
            gl.uniform1f(self.u_mesh_opacity.as_ref(), 0.75);
            gl.uniform1i(self.u_mesh_is_unlit_tex.as_ref(), 1);
            gl.bind_texture(GL::TEXTURE_2D, Some(&self.ring_tex));
            gl.bind_vertex_array(Some(&self.ring_mesh.vao));
            gl.draw_elements_with_i32(
                GL::TRIANGLES,
                self.ring_mesh.index_count,
                GL::UNSIGNED_SHORT,
                0,
            );
        }

        // Corona Glow (BackSide + Additive Blending)
        gl.enable(GL::CULL_FACE);
        gl.cull_face(GL::FRONT);
        gl.enable(GL::BLEND);
        gl.blend_func(GL::SRC_ALPHA, GL::ONE);
        gl.depth_mask(false);
        gl.use_program(Some(&self.solid_prog));
        let glow_mvp = vp * celestial.glow_model_matrix();
        gl.uniform_matrix4fv_with_f32_array(
            self.u_solid_mvp.as_ref(),
            false,
            &glow_mvp.to_cols_array(),
        );
        gl.uniform3fv_with_f32_array(self.u_solid_color.as_ref(), &celestial.glow_rgb);
        gl.uniform1f(self.u_solid_opacity.as_ref(), celestial.glow_opacity);
        gl.bind_vertex_array(Some(&self.glow_mesh.vao));
        gl.draw_elements_with_i32(
            GL::TRIANGLES,
            self.glow_mesh.index_count,
            GL::UNSIGNED_SHORT,
            0,
        );

        // 3. Deformed 3D Polyhedron (6 faces)
        gl.cull_face(GL::BACK);
        gl.depth_mask(true);
        if cube_visible && cube_opacity > 0.001 && self.cube_face_meshes.len() == 6 {
            if cube_opacity < 0.999 {
                gl.enable(GL::BLEND);
                gl.blend_func(GL::SRC_ALPHA, GL::ONE_MINUS_SRC_ALPHA);
            } else {
                gl.disable(GL::BLEND);
            }

            gl.use_program(Some(&self.mesh_prog));
            let cube_mvp = vp * cube_model;
            gl.uniform_matrix4fv_with_f32_array(
                self.u_mesh_mvp.as_ref(),
                false,
                &cube_mvp.to_cols_array(),
            );
            gl.uniform_matrix4fv_with_f32_array(
                self.u_mesh_model.as_ref(),
                false,
                &cube_model.to_cols_array(),
            );
            gl.uniform3fv_with_f32_array(self.u_mesh_light1_color.as_ref(), &light1_rgb);
            gl.uniform3f(self.u_mesh_emissive.as_ref(), 0.0, 0.0, 0.0);
            gl.uniform1f(self.u_mesh_opacity.as_ref(), cube_opacity);
            gl.uniform1i(self.u_mesh_is_unlit_tex.as_ref(), 0);
            gl.uniform1i(self.u_mesh_is_cube_face.as_ref(), 1);

            for i in 0..6 {
                gl.bind_texture(GL::TEXTURE_2D, Some(&self.cube_face_textures[i]));
                gl.bind_vertex_array(Some(&self.cube_face_meshes[i].vao));
                gl.draw_elements_with_i32(
                    GL::TRIANGLES,
                    self.cube_face_meshes[i].index_count,
                    GL::UNSIGNED_SHORT,
                    0,
                );
            }
        }

        // 4. 3D Slithering Flying Arrows (in cube local space -> transformed by cube_model)
        if !flying_manager.instances.is_empty() {
            gl.disable(GL::CULL_FACE);
            gl.disable(GL::BLEND);
            gl.use_program(Some(&self.solid_prog));
            let arrow_mvp = vp * cube_model;
            gl.uniform_matrix4fv_with_f32_array(
                self.u_solid_mvp.as_ref(),
                false,
                &arrow_mvp.to_cols_array(),
            );
            gl.uniform1f(self.u_solid_opacity.as_ref(), 1.0);
            gl.bind_vertex_array(Some(&self.dynamic_arrow_vao));
            gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.dynamic_arrow_vbo));

            for inst in &flying_manager.instances {
                if !inst.outer_pos.is_empty() {
                    gl.uniform3fv_with_f32_array(self.u_solid_color.as_ref(), &inst.color_rgb);
                    unsafe {
                        let view = js_sys::Float32Array::view(&inst.outer_pos);
                        gl.buffer_data_with_array_buffer_view(
                            GL::ARRAY_BUFFER,
                            &view,
                            GL::DYNAMIC_DRAW,
                        );
                    }
                    gl.draw_arrays(GL::TRIANGLES, 0, (inst.outer_pos.len() / 3) as i32);
                }

                if !inst.core_pos.is_empty() {
                    gl.uniform3fv_with_f32_array(self.u_solid_color.as_ref(), &[1.0, 1.0, 1.0]);
                    unsafe {
                        let view = js_sys::Float32Array::view(&inst.core_pos);
                        gl.buffer_data_with_array_buffer_view(
                            GL::ARRAY_BUFFER,
                            &view,
                            GL::DYNAMIC_DRAW,
                        );
                    }
                    gl.draw_arrays(GL::TRIANGLES, 0, (inst.core_pos.len() / 3) as i32);
                }
            }
        }

        // 5. Additive 3D Particles
        if !particle_manager.render_data.is_empty() {
            gl.enable(GL::BLEND);
            gl.blend_func(GL::SRC_ALPHA, GL::ONE);
            gl.depth_mask(false);
            gl.use_program(Some(&self.particle_prog));
            gl.uniform_matrix4fv_with_f32_array(
                self.u_part_mvp.as_ref(),
                false,
                &vp.to_cols_array(),
            );
            gl.uniform1f(self.u_part_viewport_h.as_ref(), h as f32);

            gl.bind_vertex_array(Some(&self.particle_vao));
            gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.particle_vbo));
            unsafe {
                let view = js_sys::Float32Array::view(&particle_manager.render_data);
                gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
            }
            gl.draw_arrays(
                GL::POINTS,
                0,
                (particle_manager.render_data.len() / 7) as i32,
            );
            gl.depth_mask(true);
        }

        gl.bind_vertex_array(None);
    }
}

fn compile_shader(gl: &GL, shader_type: u32, src: &str) -> Result<WebGlShader, String> {
    let shader = gl.create_shader(shader_type).ok_or("create_shader")?;
    gl.shader_source(&shader, src);
    gl.compile_shader(&shader);
    if gl
        .get_shader_parameter(&shader, GL::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(gl
            .get_shader_info_log(&shader)
            .unwrap_or_else(|| "Shader compile error".into()))
    }
}

fn link_program(gl: &GL, vs_src: &str, fs_src: &str) -> Result<WebGlProgram, String> {
    let vs = compile_shader(gl, GL::VERTEX_SHADER, vs_src)?;
    let fs = compile_shader(gl, GL::FRAGMENT_SHADER, fs_src)?;
    let prog = gl.create_program().ok_or("create_program")?;
    gl.attach_shader(&prog, &vs);
    gl.attach_shader(&prog, &fs);
    gl.link_program(&prog);
    gl.delete_shader(Some(&vs));
    gl.delete_shader(Some(&fs));

    if gl
        .get_program_parameter(&prog, GL::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(prog)
    } else {
        Err(gl
            .get_program_info_log(&prog)
            .unwrap_or_else(|| "Program link error".into()))
    }
}

fn create_gpu_mesh(gl: &GL, vertices: &[f32], indices: &[u16]) -> Result<GpuMesh, String> {
    let vao = gl.create_vertex_array().ok_or("create vao")?;
    let vbo = gl.create_buffer().ok_or("create vbo")?;
    let ibo = gl.create_buffer().ok_or("create ibo")?;

    gl.bind_vertex_array(Some(&vao));
    gl.bind_buffer(GL::ARRAY_BUFFER, Some(&vbo));
    unsafe {
        let v_view = js_sys::Float32Array::view(vertices);
        gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &v_view, GL::STATIC_DRAW);
    }

    gl.bind_buffer(GL::ELEMENT_ARRAY_BUFFER, Some(&ibo));
    unsafe {
        let i_view = js_sys::Uint16Array::view(indices);
        gl.buffer_data_with_array_buffer_view(GL::ELEMENT_ARRAY_BUFFER, &i_view, GL::STATIC_DRAW);
    }

    // stride = 8 * 4 = 32 bytes: [px, py, pz, nx, ny, nz, u, v]
    gl.enable_vertex_attrib_array(0);
    gl.vertex_attrib_pointer_with_i32(0, 3, GL::FLOAT, false, 32, 0);
    gl.enable_vertex_attrib_array(1);
    gl.vertex_attrib_pointer_with_i32(1, 3, GL::FLOAT, false, 32, 12);
    gl.enable_vertex_attrib_array(2);
    gl.vertex_attrib_pointer_with_i32(2, 2, GL::FLOAT, false, 32, 24);

    gl.bind_vertex_array(None);

    Ok(GpuMesh {
        vao,
        vbo,
        ibo,
        index_count: indices.len() as i32,
    })
}
