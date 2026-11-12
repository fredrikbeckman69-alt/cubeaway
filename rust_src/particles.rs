use std::f32::consts::PI;
use glam::Vec3;
use crate::theme::u32_to_rgb_f32;

#[derive(Clone, Copy)]
struct Particle {
    pos: Vec3,
    vel: Vec3,
    rgb: [f32; 3],
    base_size: f32,
    life: f32,
    max_life: f32,
    active: bool,
}

pub struct ParticleManager {
    particles: Vec<Particle>,
    /// Interleaved [px, py, pz, r, g, b, size] for active particles
    pub render_data: Vec<f32>,
    rng_state: u32,
}

impl ParticleManager {
    pub fn new() -> Self {
        let max_particles = 1200;
        let particles = vec![
            Particle {
                pos: Vec3::ZERO,
                vel: Vec3::ZERO,
                rgb: [1.0, 1.0, 1.0],
                base_size: 0.0,
                life: 0.0,
                max_life: 1.0,
                active: false,
            };
            max_particles
        ];
        Self {
            particles,
            render_data: Vec::with_capacity(max_particles * 7),
            rng_state: 0x9e37_79b9,
        }
    }

    fn rand_f32(&mut self) -> f32 {
        self.rng_state = self.rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.rng_state as f32) / (u32::MAX as f32)
    }

    pub fn spawn_arrow_burst(
        &mut self,
        origin: Vec3,
        direction: Vec3,
        color_hex: u32,
        count: usize,
    ) {
        let rgb = u32_to_rgb_f32(color_hex);
        let mut spawned = 0;

        for i in 0..self.particles.len() {
            if spawned >= count {
                break;
            }
            if !self.particles[i].active {
                let spread_speed = 1.2 + self.rand_f32() * 2.8;
                let rand_v = Vec3::new(
                    (self.rand_f32() - 0.5) * 1.6,
                    (self.rand_f32() - 0.5) * 1.6,
                    (self.rand_f32() - 0.5) * 1.6,
                );
                let base_size = 0.25 + self.rand_f32() * 0.25;
                let max_life = 0.6 + self.rand_f32() * 0.6;

                self.particles[i] = Particle {
                    pos: origin,
                    vel: direction * spread_speed + rand_v,
                    rgb,
                    base_size,
                    life: max_life,
                    max_life,
                    active: true,
                };
                spawned += 1;
            }
        }
    }

    pub fn spawn_victory_explosion(&mut self, center: Vec3, count: usize) {
        let palette = [
            u32_to_rgb_f32(0xffe600),
            u32_to_rgb_f32(0xff00aa),
            u32_to_rgb_f32(0x00ffff),
        ];

        let mut spawned = 0;
        for i in 0..self.particles.len() {
            if spawned >= count {
                break;
            }
            if !self.particles[i].active {
                let offset = Vec3::new(
                    (self.rand_f32() - 0.5) * 1.5,
                    (self.rand_f32() - 0.5) * 1.5,
                    (self.rand_f32() - 0.5) * 1.5,
                );
                let theta = self.rand_f32() * PI * 2.0;
                let phi = (self.rand_f32() * 2.0 - 1.0).acos();
                let speed = 2.0 + self.rand_f32() * 4.0;

                let vel = Vec3::new(
                    phi.sin() * theta.cos() * speed,
                    phi.sin() * theta.sin() * speed,
                    phi.cos() * speed,
                );
                let c_idx = ((self.rand_f32() * 3.0) as usize).min(2);
                let base_size = 0.35 + self.rand_f32() * 0.35;
                let max_life = 1.2 + self.rand_f32() * 1.0;

                self.particles[i] = Particle {
                    pos: center + offset,
                    vel,
                    rgb: palette[c_idx],
                    base_size,
                    life: max_life,
                    max_life,
                    active: true,
                };
                spawned += 1;
            }
        }
    }

    pub fn update(&mut self, delta_seconds: f32) {
        self.render_data.clear();
        let drag = 0.88_f32.powf(delta_seconds * 60.0);

        for p in &mut self.particles {
            if !p.active {
                continue;
            }
            p.life -= delta_seconds;
            if p.life <= 0.0 {
                p.active = false;
                continue;
            }
            p.vel *= drag;
            p.pos += p.vel * delta_seconds;

            let life_ratio = (p.life / p.max_life).clamp(0.0, 1.0);
            let size = p.base_size * (life_ratio * PI).sin();
            self.render_data.extend_from_slice(&[
                p.pos.x,
                p.pos.y,
                p.pos.z,
                p.rgb[0] * life_ratio,
                p.rgb[1] * life_ratio,
                p.rgb[2] * life_ratio,
                size,
            ]);
        }
    }

    pub fn clear_all(&mut self) {
        for p in &mut self.particles {
            p.active = false;
        }
        self.render_data.clear();
    }
}
