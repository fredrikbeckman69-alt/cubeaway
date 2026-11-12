use glam::{Vec2, Vec3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShapeType {
    Cube,
    Sphere,
    Star,
    Gem,
    Pillow,
    Truncated,
}

#[derive(Clone, Copy, Debug)]
pub struct ShapeDefinition {
    pub shape_type: ShapeType,
    pub name: &'static str,
    pub description: &'static str,
    pub camera_distance: f32,
}

pub const CUBE_BASE_SIZE: f32 = 3.8;

pub const SHAPE_ROTATION: [ShapeDefinition; 6] = [
    ShapeDefinition {
        shape_type: ShapeType::Cube,
        name: "Klassisk Kub",
        description: "Den ikoniska balanserade kuben",
        camera_distance: 6.0,
    },
    ShapeDefinition {
        shape_type: ShapeType::Sphere,
        name: "Cyber-Sfäroid",
        description: "Ett organiskt rundat högteknologiskt klot",
        camera_distance: 6.0,
    },
    ShapeDefinition {
        shape_type: ShapeType::Star,
        name: "Stjärnkristall",
        description: "En konkav hyperkub med inåtbuktande fasetter",
        camera_distance: 6.0,
    },
    ShapeDefinition {
        shape_type: ShapeType::Gem,
        name: "Facetterad Juvel",
        description: "En diamantslipad polyeder med avfasade hörn",
        camera_distance: 6.0,
    },
    ShapeDefinition {
        shape_type: ShapeType::Pillow,
        name: "Konvex Lins-Kub",
        description: "En mjukt välvd aerodynamisk kuddeform",
        camera_distance: 6.0,
    },
    ShapeDefinition {
        shape_type: ShapeType::Truncated,
        name: "Trunkerad Polyeder",
        description: "En mångfacetterad 3D-kristall med avfasade kanter",
        camera_distance: 6.0,
    },
];

pub fn get_level_shape(level: u32) -> ShapeDefinition {
    let safe_level = level.max(1) as usize;
    SHAPE_ROTATION[(safe_level - 1) % SHAPE_ROTATION.len()]
}

pub fn deform_vertex(v: Vec3, shape_type: ShapeType) -> Vec3 {
    let mut p = v;
    let half = CUBE_BASE_SIZE * 0.5;

    match shape_type {
        ShapeType::Cube => {}
        ShapeType::Sphere => {
            let r = half * 1.15;
            let sphere_p = p.normalize_or_zero() * r;
            p = p.lerp(sphere_p, 0.42);
        }
        ShapeType::Star => {
            let d_center = 1.0 - (p.x.abs() + p.y.abs() + p.z.abs()) / (half * 3.0);
            let factor = 1.0 - 0.16 * d_center.max(0.0).powf(1.5);
            p *= factor;
        }
        ShapeType::Gem => {
            let cx = p.x.abs() / half;
            let cy = p.y.abs() / half;
            let cz = p.z.abs() / half;
            if cx > 0.72 && cy > 0.72 && cz > 0.72 {
                p *= 0.92;
            }
        }
        ShapeType::Pillow => {
            let d_edge_x = 1.0 - (p.x.abs() / half).powi(2);
            let d_edge_y = 1.0 - (p.y.abs() / half).powi(2);
            let d_edge_z = 1.0 - (p.z.abs() / half).powi(2);
            p.x += p.x.signum() * d_edge_y * d_edge_z * 0.18;
            p.y += p.y.signum() * d_edge_x * d_edge_z * 0.18;
            p.z += p.z.signum() * d_edge_x * d_edge_y * 0.18;
        }
        ShapeType::Truncated => {
            let dist = p.length();
            if dist > half * 1.25 {
                p *= (half * 1.25) / dist;
            }
        }
    }

    p
}

pub fn get_point_on_base_cube(face_idx: usize, u: f32, v: f32) -> Vec3 {
    let half = CUBE_BASE_SIZE * 0.5;
    let nx = (u - 0.5) * CUBE_BASE_SIZE;
    let ny = (v - 0.5) * CUBE_BASE_SIZE;
    match face_idx {
        0 => Vec3::new(half, ny, -nx),   // +X Right
        1 => Vec3::new(-half, ny, nx),   // -X Left
        2 => Vec3::new(nx, half, -ny),   // +Y Top
        3 => Vec3::new(nx, -half, ny),   // -Y Bottom
        4 => Vec3::new(nx, ny, half),    // +Z Front
        _ => Vec3::new(-nx, ny, -half),  // -Z Back
    }
}

pub struct FaceMeshData {
    pub face_idx: usize,
    /// Interleaved [px, py, pz, nx, ny, nz, u, v] per vertex
    pub vertices: Vec<f32>,
    pub indices: Vec<u16>,
    pub positions: Vec<Vec3>,
    pub uvs: Vec<Vec2>,
}

pub struct ShapeMesh {
    pub faces: [FaceMeshData; 6],
}

pub fn create_shape_geometry(shape: ShapeDefinition) -> ShapeMesh {
    let segs: usize = if shape.shape_type == ShapeType::Cube { 1 } else { 8 };
    let faces = std::array::from_fn(|face_idx| {
        let cols = segs + 1;
        let mut positions = Vec::with_capacity(cols * cols);
        let mut uvs = Vec::with_capacity(cols * cols);

        for iy in 0..=segs {
            // iy = 0 -> top (v = 1.0), iy = segs -> bottom (v = 0.0)
            let v = 1.0 - (iy as f32) / (segs as f32);
            for ix in 0..=segs {
                let u = (ix as f32) / (segs as f32);
                let base_p = get_point_on_base_cube(face_idx, u, v);
                let def_p = deform_vertex(base_p, shape.shape_type);
                positions.push(def_p);
                uvs.push(Vec2::new(u, v));
            }
        }

        let mut indices = Vec::with_capacity(segs * segs * 6);
        for iy in 0..segs {
            for ix in 0..segs {
                let a = (iy * cols + ix) as u16;
                let b = ((iy + 1) * cols + ix) as u16;
                let c = ((iy + 1) * cols + (ix + 1)) as u16;
                let d = (iy * cols + (ix + 1)) as u16;
                // Counter-clockwise winding when looking at the front of the face
                indices.push(a);
                indices.push(b);
                indices.push(d);
                indices.push(b);
                indices.push(c);
                indices.push(d);
            }
        }

        // Compute smooth vertex normals per face
        let mut normals = vec![Vec3::ZERO; positions.len()];
        for tri in indices.chunks_exact(3) {
            let i0 = tri[0] as usize;
            let i1 = tri[1] as usize;
            let i2 = tri[2] as usize;
            let e1 = positions[i1] - positions[i0];
            let e2 = positions[i2] - positions[i0];
            let n = e1.cross(e2);
            normals[i0] += n;
            normals[i1] += n;
            normals[i2] += n;
        }

        let mut vertices = Vec::with_capacity(positions.len() * 8);
        for i in 0..positions.len() {
            let p = positions[i];
            let n = normals[i].normalize_or_zero();
            let uv = uvs[i];
            vertices.extend_from_slice(&[p.x, p.y, p.z, n.x, n.y, n.z, uv.x, uv.y]);
        }

        FaceMeshData {
            face_idx,
            vertices,
            indices,
            positions,
            uvs,
        }
    });

    ShapeMesh { faces }
}

/// Ray-triangle intersection (Möller–Trumbore) returning (t, u_bary, v_bary)
pub fn ray_intersect_triangle(
    ray_origin: Vec3,
    ray_dir: Vec3,
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
) -> Option<(f32, f32, f32)> {
    let eps = 1e-6;
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let h = ray_dir.cross(edge2);
    let a = edge1.dot(h);
    if a.abs() < eps {
        return None;
    }
    let f = 1.0 / a;
    let s = ray_origin - v0;
    let u = f * s.dot(h);
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let q = s.cross(edge1);
    let v = f * ray_dir.dot(q);
    if v < 0.0 || u + v > 1.0 {
        return None;
    }
    let t = f * edge2.dot(q);
    if t > eps {
        Some((t, u, v))
    } else {
        None
    }
}
