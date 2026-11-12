use crate::types::Direction;

#[derive(Clone, Copy, Debug)]
pub struct CubeStep {
    pub face: usize,
    pub r: i32,
    pub c: i32,
    pub dir: Direction,
}

/// Utför ett ortogonalt steg på kuben i riktning `d`.
/// Om steget korsar en kubsides-kant, beräknas grannsidan och koordinaterna med
/// 100% matematisk reversibilitet (reciprocitet).
pub fn step_on_cube(f: usize, r: i32, c: i32, d: Direction, n: i32) -> CubeStep {
    let (dr, dc) = d.delta();
    let next_r = r + dr;
    let next_c = c + dc;

    if next_r >= 0 && next_r < n && next_c >= 0 && next_c < n {
        return CubeStep {
            face: f,
            r: next_r,
            c: next_c,
            dir: d,
        };
    }

    // Horisontellt band: Left (1), Front (4), Right (0), Back (5)
    if d == Direction::Right {
        if f == 1 {
            return CubeStep { face: 4, r, c: 0, dir: Direction::Right };
        }
        if f == 4 {
            return CubeStep { face: 0, r, c: 0, dir: Direction::Right };
        }
        if f == 0 {
            return CubeStep { face: 5, r, c: 0, dir: Direction::Right };
        }
        if f == 5 {
            return CubeStep { face: 1, r, c: 0, dir: Direction::Right };
        }
    }
    if d == Direction::Left {
        if f == 4 {
            return CubeStep { face: 1, r, c: n - 1, dir: Direction::Left };
        }
        if f == 1 {
            return CubeStep { face: 5, r, c: n - 1, dir: Direction::Left };
        }
        if f == 5 {
            return CubeStep { face: 0, r, c: n - 1, dir: Direction::Left };
        }
        if f == 0 {
            return CubeStep { face: 4, r, c: n - 1, dir: Direction::Left };
        }
    }

    // Top (2) övergångar
    if f == 4 && d == Direction::Up {
        return CubeStep { face: 2, r: n - 1, c, dir: Direction::Up };
    }
    if f == 2 && d == Direction::Down {
        return CubeStep { face: 4, r: 0, c, dir: Direction::Down };
    }

    if f == 2 && d == Direction::Up {
        return CubeStep { face: 5, r: 0, c: n - 1 - c, dir: Direction::Down };
    }
    if f == 5 && d == Direction::Up {
        return CubeStep { face: 2, r: 0, c: n - 1 - c, dir: Direction::Down };
    }

    if f == 2 && d == Direction::Left {
        return CubeStep { face: 1, r: 0, c: r, dir: Direction::Down };
    }
    if f == 1 && d == Direction::Up {
        return CubeStep { face: 2, r: c, c: 0, dir: Direction::Right };
    }

    if f == 2 && d == Direction::Right {
        return CubeStep { face: 0, r: 0, c: n - 1 - r, dir: Direction::Down };
    }
    if f == 0 && d == Direction::Up {
        return CubeStep { face: 2, r: n - 1 - c, c: n - 1, dir: Direction::Left };
    }

    // Bottom (3) övergångar
    if f == 4 && d == Direction::Down {
        return CubeStep { face: 3, r: 0, c, dir: Direction::Down };
    }
    if f == 3 && d == Direction::Up {
        return CubeStep { face: 4, r: n - 1, c, dir: Direction::Up };
    }

    if f == 3 && d == Direction::Down {
        return CubeStep { face: 5, r: n - 1, c: n - 1 - c, dir: Direction::Up };
    }
    if f == 5 && d == Direction::Down {
        return CubeStep { face: 3, r: n - 1, c: n - 1 - c, dir: Direction::Up };
    }

    if f == 3 && d == Direction::Left {
        return CubeStep { face: 1, r: n - 1, c: n - 1 - r, dir: Direction::Up };
    }
    if f == 1 && d == Direction::Down {
        return CubeStep { face: 3, r: n - 1 - c, c: 0, dir: Direction::Right };
    }

    if f == 3 && d == Direction::Right {
        return CubeStep { face: 0, r: n - 1, c: r, dir: Direction::Up };
    }
    if f == 0 && d == Direction::Down {
        return CubeStep { face: 3, r: c, c: n - 1, dir: Direction::Left };
    }

    CubeStep { face: f, r, c, dir: d }
}
