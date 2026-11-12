use std::collections::{HashMap, HashSet};
use crate::cube_topology::step_on_cube;
use crate::types::{Arrow, ArrowType, CubeCoord, Direction, LevelConfig, PortalDef, ReflectorDef};

pub struct PuzzleResult {
    pub config: LevelConfig,
    pub all_arrows: Vec<Arrow>,
    pub initial_grids: Vec<Vec<Vec<Option<String>>>>,
    pub portals: Vec<PortalDef>,
    pub reflectors: Vec<ReflectorDef>,
}

pub struct Prng {
    s: u32,
}

impl Prng {
    pub fn new(seed: u32) -> Self {
        Self { s: seed }
    }

    /// Mulberry32
    pub fn next(&mut self) -> f64 {
        self.s = self.s.wrapping_add(0x6d2b79f5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }

    pub fn next_int(&mut self, min: i32, max: i32) -> i32 {
        (self.next() * ((max - min + 1) as f64)).floor() as i32 + min
    }

    pub fn choice<'a, T>(&mut self, arr: &'a [T]) -> &'a T {
        let idx = (self.next() * (arr.len() as f64)).floor() as usize;
        &arr[idx.min(arr.len() - 1)]
    }

    pub fn shuffle<T>(&mut self, arr: &mut [T]) {
        if arr.len() <= 1 {
            return;
        }
        for i in (1..arr.len()).rev() {
            let j = (self.next() * ((i + 1) as f64)).floor() as usize;
            arr.swap(i, j);
        }
    }
}

pub fn get_level_config(level: u32) -> LevelConfig {
    let lvl = level.clamp(1, 1000);
    let (grid_size, target_arrow_count_per_face, max_path_length) = if lvl <= 20 {
        (20, 52, 32)
    } else if lvl <= 100 {
        let t = (lvl - 20) as f64 / 80.0;
        (20, (52.0 + t * 4.0).round() as usize, 32)
    } else if lvl <= 350 {
        let t = (lvl - 100) as f64 / 250.0;
        (22, (56.0 + t * 6.0).round() as usize, 34)
    } else if lvl <= 700 {
        let t = (lvl - 350) as f64 / 350.0;
        (22, (62.0 + t * 6.0).round() as usize, 36)
    } else if lvl <= 950 {
        let t = (lvl - 700) as f64 / 250.0;
        (24, (35.0 - t * 15.0).round() as usize, 38)
    } else {
        (24, 14, 38)
    };

    LevelConfig {
        level_number: lvl,
        grid_size,
        target_arrow_count_per_face,
        max_path_length,
    }
}

pub fn can_arrow_fly(
    arrow: &Arrow,
    grids: &[Vec<Vec<Option<String>>>],
    grid_size: usize,
    portals: &[PortalDef],
    reflectors: &[ReflectorDef],
) -> bool {
    let g_size = grid_size as i32;
    let mut curr_dir = arrow.dir;
    let mut curr_face = arrow.head.face_idx;
    let (dr, dc) = curr_dir.delta();
    let mut curr_r = arrow.head.r + dr;
    let mut curr_c = arrow.head.c + dc;

    let mut steps = 0;
    let max_steps = grid_size * 4;

    while curr_r >= 0 && curr_r < g_size && curr_c >= 0 && curr_c < g_size && steps < max_steps {
        steps += 1;

        // 1. Maskhål / Portal
        if !portals.is_empty() {
            if let Some(portal) = portals.iter().find(|p| {
                (p.portal_a.face_idx == curr_face && p.portal_a.r == curr_r && p.portal_a.c == curr_c)
                    || (p.portal_b.face_idx == curr_face
                        && p.portal_b.r == curr_r
                        && p.portal_b.c == curr_c)
            }) {
                let is_a = portal.portal_a.face_idx == curr_face
                    && portal.portal_a.r == curr_r
                    && portal.portal_a.c == curr_c;
                let target = if is_a { &portal.portal_b } else { &portal.portal_a };
                curr_face = target.face_idx;
                let (d_r, d_c) = curr_dir.delta();
                curr_r = target.r + d_r;
                curr_c = target.c + d_c;
                continue;
            }
        }

        // 2. Prisma / Reflektor
        if !reflectors.is_empty() {
            if let Some(refl) = reflectors.iter().find(|r| {
                r.coord.face_idx == curr_face && r.coord.r == curr_r && r.coord.c == curr_c
            }) {
                if refl.orientation == '/' {
                    curr_dir = match curr_dir {
                        Direction::Up => Direction::Right,
                        Direction::Left => Direction::Down,
                        Direction::Down => Direction::Left,
                        Direction::Right => Direction::Up,
                    };
                } else {
                    curr_dir = match curr_dir {
                        Direction::Up => Direction::Left,
                        Direction::Right => Direction::Down,
                        Direction::Down => Direction::Right,
                        Direction::Left => Direction::Up,
                    };
                }
                let (d_r, d_c) = curr_dir.delta();
                curr_r += d_r;
                curr_c += d_c;
                continue;
            }
        }

        // 3. Kontrollera om cellen är upptagen av en pil
        if let Some(face_grid) = grids.get(curr_face) {
            if let Some(row) = face_grid.get(curr_r as usize) {
                if let Some(Some(_)) = row.get(curr_c as usize) {
                    return false;
                }
            }
        }

        let (d_r, d_c) = curr_dir.delta();
        curr_r += d_r;
        curr_c += d_c;
    }

    true
}

fn is_cell_in_exit_ray(
    head: CubeCoord,
    dir: Direction,
    cell_face: usize,
    cell_r: i32,
    cell_c: i32,
    grid_size: i32,
) -> bool {
    if cell_face != head.face_idx {
        return false;
    }
    let (dr, dc) = dir.delta();
    let mut cr = head.r + dr;
    let mut cc = head.c + dc;
    while cr >= 0 && cr < grid_size && cc >= 0 && cc < grid_size {
        if cr == cell_r && cc == cell_c {
            return true;
        }
        cr += dr;
        cc += dc;
    }
    false
}

fn choose_target_length(prng: &mut Prng, max_path_len: usize) -> usize {
    let roll = prng.next();
    let max_l = max_path_len as i32;
    let len = if roll < 0.52 {
        prng.next_int(3, 6)
    } else if roll < 0.77 {
        prng.next_int(7, 12)
    } else if roll < 0.93 {
        prng.next_int(13, 22.min(max_l))
    } else {
        prng.next_int(23, max_l.max(23))
    };
    len as usize
}

pub fn generate_cube_puzzle(level_number: u32) -> PuzzleResult {
    let mut prng = Prng::new(level_number.wrapping_mul(10007).wrapping_add(7919));
    let config = get_level_config(level_number);
    let grid_size = config.grid_size;
    let g_size = grid_size as i32;
    let target_arrow_count_per_face = config.target_arrow_count_per_face;
    let max_path_length = config.max_path_length;
    let lvl = config.level_number;

    let (round0_cap, base_max_deps, require_blocker_prob): (usize, usize, f64) = if lvl <= 20 {
        (120, 999, 0.0)
    } else if lvl <= 100 {
        let t = (lvl - 20) as f64 / 80.0;
        (
            (70.0 - t * 45.0).round() as usize,
            (6.0 - t * 2.0).round() as usize,
            0.30 + t * 0.40,
        )
    } else if lvl <= 350 {
        let t = (lvl - 100) as f64 / 250.0;
        ((20.0 - t * 14.0).round() as usize, 3, 0.70 + t * 0.20)
    } else if lvl <= 700 {
        let t = (lvl - 350) as f64 / 350.0;
        ((6.0 - t * 4.0).round() as usize, 2, 0.90 + t * 0.08)
    } else {
        (1, 1, 1.0)
    };

    let total_target_arrows = target_arrow_count_per_face * 6;

    let mut grids: Vec<Vec<Vec<Option<String>>>> =
        vec![vec![vec![None; grid_size]; grid_size]; 6];

    let mut arrow_round_map: HashMap<String, usize> = HashMap::new();
    let mut placed_arrows: Vec<Arrow> = Vec::new();
    let mut direct_blocked_count: HashMap<String, usize> = HashMap::new();

    let mut reserved_exit_rays: Vec<Vec<Vec<usize>>> =
        vec![vec![vec![999_999; grid_size]; grid_size]; 6];

    let max_rounds = 500;
    let mut consecutive_failures = 0;

    #[derive(Clone)]
    struct CandidateHead {
        head: CubeCoord,
        behind: CubeCoord,
        dir: Direction,
        first_blocker: Option<String>,
    }

    for round in 0..max_rounds {
        if placed_arrows.len() >= total_target_arrows {
            break;
        }
        let round_limit = if round == 0 { round0_cap } else { 1 };
        let mut placed_in_round = 0;
        let max_attempts = 180;

        let relaxation_threshold = if lvl > 950 {
            99999
        } else if lvl > 700 {
            50
        } else {
            25
        };
        let effective_max_deps = if consecutive_failures > relaxation_threshold {
            base_max_deps + 1
        } else {
            base_max_deps
        };

        for _attempt in 0..max_attempts {
            if placed_in_round >= round_limit || placed_arrows.len() >= total_target_arrows {
                break;
            }
            let mut face = prng.next_int(0, 5) as usize;
            let mut candidate_heads: Vec<CandidateHead> = Vec::new();

            let eligible_indices: Vec<usize> = placed_arrows
                .iter()
                .enumerate()
                .filter(|(_, a)| {
                    direct_blocked_count.get(&a.id).copied().unwrap_or(0) < effective_max_deps
                })
                .map(|(idx, _)| idx)
                .collect();

            if round > 0
                && !eligible_indices.is_empty()
                && prng.next() < if lvl > 700 { 0.96 } else { 0.75 }
            {
                let target_idx = *prng.choice(&eligible_indices);
                let cell = *prng.choice(&placed_arrows[target_idx].cells);
                face = cell.face_idx;

                for dir in Direction::ALL {
                    let (dr, dc) = dir.delta();
                    for dist in 1..g_size {
                        let r = cell.r - dr * dist;
                        let c = cell.c - dc * dist;
                        if r < 0 || r >= g_size || c < 0 || c >= g_size {
                            continue;
                        }
                        if grids[face][r as usize][c as usize].is_some() {
                            continue;
                        }
                        if reserved_exit_rays[face][r as usize][c as usize] <= round {
                            continue;
                        }

                        let behind_r = r - dr;
                        let behind_c = c - dc;
                        if behind_r < 0 || behind_r >= g_size || behind_c < 0 || behind_c >= g_size
                        {
                            continue;
                        }
                        if grids[face][behind_r as usize][behind_c as usize].is_some() {
                            continue;
                        }
                        if reserved_exit_rays[face][behind_r as usize][behind_c as usize] <= round {
                            continue;
                        }

                        let mut cr = r + dr;
                        let mut cc = c + dc;
                        let mut clear = true;
                        let mut first_blocker: Option<String> = None;

                        while cr >= 0 && cr < g_size && cc >= 0 && cc < g_size {
                            if let Some(occ) = &grids[face][cr as usize][cc as usize] {
                                let occ_round = arrow_round_map.get(occ).copied();
                                if occ_round.is_none() || occ_round.unwrap() >= round {
                                    clear = false;
                                    break;
                                } else if first_blocker.is_none() {
                                    first_blocker = Some(occ.clone());
                                }
                            }
                            cr += dr;
                            cc += dc;
                        }

                        if first_blocker.is_none() {
                            clear = false;
                        }
                        if let Some(ref fb) = first_blocker {
                            if direct_blocked_count.get(fb).copied().unwrap_or(0)
                                >= effective_max_deps
                            {
                                clear = false;
                            }
                        }

                        if clear {
                            candidate_heads.push(CandidateHead {
                                head: CubeCoord { face_idx: face, r, c },
                                behind: CubeCoord {
                                    face_idx: face,
                                    r: behind_r,
                                    c: behind_c,
                                },
                                dir,
                                first_blocker,
                            });
                        }
                    }
                }
            }

            if candidate_heads.is_empty() {
                for r in 0..g_size {
                    for c in 0..g_size {
                        if grids[face][r as usize][c as usize].is_some() {
                            continue;
                        }
                        if reserved_exit_rays[face][r as usize][c as usize] <= round {
                            continue;
                        }

                        for dir in Direction::ALL {
                            let (dr, dc) = dir.delta();
                            let behind_r = r - dr;
                            let behind_c = c - dc;

                            if behind_r < 0
                                || behind_r >= g_size
                                || behind_c < 0
                                || behind_c >= g_size
                            {
                                continue;
                            }
                            if grids[face][behind_r as usize][behind_c as usize].is_some() {
                                continue;
                            }
                            if reserved_exit_rays[face][behind_r as usize][behind_c as usize]
                                <= round
                            {
                                continue;
                            }

                            let mut cr = r + dr;
                            let mut cc = c + dc;
                            let mut clear = true;
                            let mut first_blocker: Option<String> = None;

                            while cr >= 0 && cr < g_size && cc >= 0 && cc < g_size {
                                if let Some(occ) = &grids[face][cr as usize][cc as usize] {
                                    let occ_round = arrow_round_map.get(occ).copied();
                                    if occ_round.is_none() || occ_round.unwrap() >= round {
                                        clear = false;
                                        break;
                                    } else if first_blocker.is_none() {
                                        first_blocker = Some(occ.clone());
                                    }
                                }
                                cr += dr;
                                cc += dc;
                            }

                            if round > 0 && require_blocker_prob >= 1.0 && first_blocker.is_none() {
                                clear = false;
                            } else if round > 0
                                && prng.next() < require_blocker_prob
                                && first_blocker.is_none()
                            {
                                clear = false;
                            }
                            if let Some(ref fb) = first_blocker {
                                if effective_max_deps < 999
                                    && direct_blocked_count.get(fb).copied().unwrap_or(0)
                                        >= effective_max_deps
                                {
                                    clear = false;
                                }
                            }

                            if clear {
                                candidate_heads.push(CandidateHead {
                                    head: CubeCoord { face_idx: face, r, c },
                                    behind: CubeCoord {
                                        face_idx: face,
                                        r: behind_r,
                                        c: behind_c,
                                    },
                                    dir,
                                    first_blocker,
                                });
                            }
                        }
                    }
                }
            }

            if candidate_heads.is_empty() {
                continue;
            }
            let chosen = prng.choice(&candidate_heads).clone();
            let head = chosen.head;
            let behind = chosen.behind;
            let dir = chosen.dir;
            let first_blocker = chosen.first_blocker;

            let mut path: Vec<CubeCoord> = vec![behind, head];
            let target_len = choose_target_length(&mut prng, max_path_length);
            let mut curr = behind;

            let (dr, dc) = dir.delta();
            let mut last_back_dir = if dr == 1 && dc == 0 {
                Direction::Up
            } else if dr == -1 && dc == 0 {
                Direction::Down
            } else if dr == 0 && dc == 1 {
                Direction::Left
            } else {
                Direction::Right
            };

            let mut straight_count = 1;

            #[derive(Clone, Copy)]
            struct ValidNeighbor {
                coord: CubeCoord,
                dir: Direction,
                crosses_corner: bool,
            }

            for _step in 2..target_len {
                let mut neighbors: Vec<ValidNeighbor> = Vec::new();

                for d in Direction::ALL {
                    let next_step = step_on_cube(curr.face_idx, curr.r, curr.c, d, g_size);
                    if grids[next_step.face][next_step.r as usize][next_step.c as usize].is_some() {
                        continue;
                    }
                    if path.iter().any(|p| {
                        p.face_idx == next_step.face && p.r == next_step.r && p.c == next_step.c
                    }) {
                        continue;
                    }
                    if is_cell_in_exit_ray(
                        head,
                        dir,
                        next_step.face,
                        next_step.r,
                        next_step.c,
                        g_size,
                    ) {
                        continue;
                    }
                    if reserved_exit_rays[next_step.face][next_step.r as usize]
                        [next_step.c as usize]
                        <= round
                    {
                        continue;
                    }

                    neighbors.push(ValidNeighbor {
                        coord: CubeCoord {
                            face_idx: next_step.face,
                            r: next_step.r,
                            c: next_step.c,
                        },
                        dir: d,
                        crosses_corner: next_step.face != curr.face_idx,
                    });
                }

                if neighbors.is_empty() {
                    break;
                }

                let straight_neighbor = neighbors.iter().find(|n| n.dir == last_back_dir).copied();
                let corner_neighbors: Vec<ValidNeighbor> =
                    neighbors.iter().filter(|n| n.crosses_corner).copied().collect();

                let chosen_neighbor = if !corner_neighbors.is_empty() && prng.next() < 0.42 {
                    *prng.choice(&corner_neighbors)
                } else if let Some(sn) = straight_neighbor.filter(|_| straight_count < 2) {
                    sn
                } else if let Some(sn) =
                    straight_neighbor.filter(|_| straight_count < 7 && prng.next() < 0.68)
                {
                    sn
                } else {
                    let turns: Vec<ValidNeighbor> = neighbors
                        .iter()
                        .filter(|n| n.dir != last_back_dir)
                        .copied()
                        .collect();
                    if !turns.is_empty() {
                        *prng.choice(&turns)
                    } else {
                        *prng.choice(&neighbors)
                    }
                };

                if chosen_neighbor.dir == last_back_dir {
                    straight_count += 1;
                } else {
                    last_back_dir = chosen_neighbor.dir;
                    straight_count = 1;
                }

                curr = chosen_neighbor.coord;
                path.insert(0, curr);
            }

            if path.len() >= 2 {
                let arrow_id = format!(
                    "a_{}_{}_{}_{}",
                    placed_arrows.len(),
                    head.face_idx,
                    head.r,
                    head.c
                );
                for cell in &path {
                    grids[cell.face_idx][cell.r as usize][cell.c as usize] = Some(arrow_id.clone());
                }
                arrow_round_map.insert(arrow_id.clone(), round);

                if let Some(fb) = first_blocker {
                    *direct_blocked_count.entry(fb).or_insert(0) += 1;
                }

                let mut cr = head.r + dr;
                let mut cc = head.c + dc;
                while cr >= 0 && cr < g_size && cc >= 0 && cc < g_size {
                    if round < reserved_exit_rays[head.face_idx][cr as usize][cc as usize] {
                        reserved_exit_rays[head.face_idx][cr as usize][cc as usize] = round;
                    }
                    cr += dr;
                    cc += dc;
                }

                placed_arrows.push(Arrow {
                    id: arrow_id,
                    cells: path,
                    head,
                    dir,
                    arrow_type: ArrowType::Normal,
                    is_frozen: false,
                    linked_with_id: None,
                });
                placed_in_round += 1;
                consecutive_failures = 0;
            }
        }

        if placed_in_round == 0 {
            consecutive_failures += 1;
        }
    }

    let verified_arrows = solve_and_filter_global(&placed_arrows, &grids, grid_size);
    let final_arrows =
        annotate_special_arrows(verified_arrows, config.level_number, &mut prng, grid_size);
    let (portals, reflectors) =
        generate_cosmic_elements(config.level_number, &final_arrows, grid_size, &mut prng);

    let mut final_grids: Vec<Vec<Vec<Option<String>>>> =
        vec![vec![vec![None; grid_size]; grid_size]; 6];
    for arrow in &final_arrows {
        for cell in &arrow.cells {
            final_grids[cell.face_idx][cell.r as usize][cell.c as usize] = Some(arrow.id.clone());
        }
    }

    PuzzleResult {
        config,
        all_arrows: final_arrows,
        initial_grids: final_grids,
        portals,
        reflectors,
    }
}

fn generate_cosmic_elements(
    level: u32,
    arrows: &[Arrow],
    grid_size: usize,
    rng: &mut Prng,
) -> (Vec<PortalDef>, Vec<ReflectorDef>) {
    let mut portals = Vec::new();
    let mut reflectors = Vec::new();

    let mut occupied = HashSet::new();
    for a in arrows {
        for c in &a.cells {
            occupied.insert((c.face_idx, c.r, c.c));
        }
    }

    let mut empty_coords = Vec::new();
    let g_size = grid_size as i32;
    for f in 0..6 {
        for r in 2..(g_size - 2) {
            for c in 2..(g_size - 2) {
                if !occupied.contains(&(f, r, c)) {
                    empty_coords.push(CubeCoord { face_idx: f, r, c });
                }
            }
        }
    }

    rng.shuffle(&mut empty_coords);

    if level >= 9 && (level % 3 == 0 || level % 7 == 0) && empty_coords.len() >= 4 {
        let p_a = empty_coords.pop().unwrap();
        let other_idx = empty_coords.iter().position(|c| c.face_idx != p_a.face_idx);
        let p_b = if let Some(idx) = other_idx {
            empty_coords.remove(idx)
        } else {
            empty_coords.pop().unwrap()
        };
        portals.push(PortalDef {
            id: format!("portal-{}-1", level),
            portal_a: p_a,
            portal_b: p_b,
        });
    }

    if level >= 12 && (level % 4 == 0 || level % 5 == 0) && empty_coords.len() >= 2 {
        let r_coord = empty_coords.pop().unwrap();
        let orientation = if rng.next() > 0.5 { '/' } else { '\\' };
        reflectors.push(ReflectorDef {
            id: format!("refl-{}-1", level),
            coord: r_coord,
            orientation,
        });
    }

    if !portals.is_empty() || !reflectors.is_empty() {
        if !can_solve_with_links(arrows, grid_size, &portals, &reflectors) {
            return (Vec::new(), Vec::new());
        }
    }

    (portals, reflectors)
}

fn can_solve_with_links(
    arrows: &[Arrow],
    grid_size: usize,
    portals: &[PortalDef],
    reflectors: &[ReflectorDef],
) -> bool {
    let mut sim_grids: Vec<Vec<Vec<Option<String>>>> =
        vec![vec![vec![None; grid_size]; grid_size]; 6];
    for a in arrows {
        for c in &a.cells {
            sim_grids[c.face_idx][c.r as usize][c.c as usize] = Some(a.id.clone());
        }
    }

    let mut remaining: Vec<Arrow> = arrows.to_vec();
    let mut changed = true;

    while changed && !remaining.is_empty() {
        changed = false;
        let mut remove_ids: Vec<String> = Vec::new();

        for a in &remaining {
            if a.arrow_type == ArrowType::Linked {
                if let Some(ref twin_id) = a.linked_with_id {
                    if let Some(twin) = remaining.iter().find(|t| &t.id == twin_id) {
                        if can_arrow_fly(a, &sim_grids, grid_size, portals, reflectors)
                            && can_arrow_fly(twin, &sim_grids, grid_size, portals, reflectors)
                        {
                            for c in &a.cells {
                                sim_grids[c.face_idx][c.r as usize][c.c as usize] = None;
                            }
                            for c in &twin.cells {
                                sim_grids[c.face_idx][c.r as usize][c.c as usize] = None;
                            }
                            remove_ids.push(a.id.clone());
                            remove_ids.push(twin.id.clone());
                            changed = true;
                            break;
                        }
                    }
                }
            } else if can_arrow_fly(a, &sim_grids, grid_size, portals, reflectors) {
                for c in &a.cells {
                    sim_grids[c.face_idx][c.r as usize][c.c as usize] = None;
                }
                remove_ids.push(a.id.clone());
                changed = true;
                break;
            }
        }

        if !remove_ids.is_empty() {
            remaining.retain(|x| !remove_ids.contains(&x.id));
        }
    }

    remaining.is_empty()
}

fn annotate_special_arrows(
    mut arrows: Vec<Arrow>,
    level: u32,
    rng: &mut Prng,
    grid_size: usize,
) -> Vec<Arrow> {
    if level < 5 || arrows.len() < 12 {
        return arrows;
    }

    let max_frozen = 4.min(1 + ((level - 5) as f64 * 0.12).floor() as usize);
    let mut candidate_indices: Vec<usize> = arrows
        .iter()
        .enumerate()
        .filter(|(_, a)| a.cells.len() >= 3)
        .map(|(idx, _)| idx)
        .collect();
    rng.shuffle(&mut candidate_indices);

    for &idx in candidate_indices.iter().take(max_frozen) {
        arrows[idx].arrow_type = ArrowType::Frozen;
        arrows[idx].is_frozen = true;
    }

    if (7..=700).contains(&level) {
        let max_pairs = 2.min(1 + ((level - 7) as f64 * 0.08).floor() as usize);
        let mut pair_candidates: Vec<usize> = arrows
            .iter()
            .enumerate()
            .filter(|(_, a)| a.arrow_type == ArrowType::Normal)
            .map(|(idx, _)| idx)
            .collect();
        rng.shuffle(&mut pair_candidates);

        let mut paired = 0;
        let mut i = 0;
        while i + 1 < pair_candidates.len() && paired < max_pairs {
            let i1 = pair_candidates[i];
            let i2 = pair_candidates[i + 1];
            i += 2;

            let id1 = arrows[i1].id.clone();
            let id2 = arrows[i2].id.clone();

            arrows[i1].arrow_type = ArrowType::Linked;
            arrows[i2].arrow_type = ArrowType::Linked;
            arrows[i1].linked_with_id = Some(id2);
            arrows[i2].linked_with_id = Some(id1);

            if can_solve_with_links(&arrows, grid_size, &[], &[]) {
                paired += 1;
            } else {
                arrows[i1].arrow_type = ArrowType::Normal;
                arrows[i2].arrow_type = ArrowType::Normal;
                arrows[i1].linked_with_id = None;
                arrows[i2].linked_with_id = None;
            }
        }
    }

    arrows
}

fn solve_and_filter_global(
    arrows: &[Arrow],
    original_grids: &[Vec<Vec<Option<String>>>],
    grid_size: usize,
) -> Vec<Arrow> {
    let mut sim_grids = original_grids.to_vec();
    let mut remaining: Vec<Arrow> = arrows.to_vec();

    let mut changed = true;
    while changed && !remaining.is_empty() {
        changed = false;
        let mut solved_ids = HashSet::new();
        for a in &remaining {
            if can_arrow_fly(a, &sim_grids, grid_size, &[], &[]) {
                for c in &a.cells {
                    sim_grids[c.face_idx][c.r as usize][c.c as usize] = None;
                }
                solved_ids.insert(a.id.clone());
                changed = true;
            }
        }
        if !solved_ids.is_empty() {
            remaining.retain(|a| !solved_ids.contains(&a.id));
        }
    }

    if remaining.is_empty() {
        return arrows.to_vec();
    }

    let remaining_ids: HashSet<String> = remaining.into_iter().map(|a| a.id).collect();
    arrows
        .iter()
        .filter(|a| !remaining_ids.contains(&a.id))
        .cloned()
        .collect()
}
