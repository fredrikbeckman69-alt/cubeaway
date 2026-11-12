use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

impl Direction {
    pub const ALL: [Direction; 4] = [
        Direction::Up,
        Direction::Down,
        Direction::Left,
        Direction::Right,
    ];

    pub fn delta(self) -> (i32, i32) {
        match self {
            Direction::Up => (-1, 0),
            Direction::Down => (1, 0),
            Direction::Left => (0, -1),
            Direction::Right => (0, 1),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArrowType {
    Normal,
    Frozen,
    Linked,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameMode {
    Classic,
    TimeAttack,
    Zen,
    Daily,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CubeCoord {
    pub face_idx: usize,
    pub r: i32,
    pub c: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Arrow {
    pub id: String,
    pub cells: Vec<CubeCoord>,
    pub head: CubeCoord,
    pub dir: Direction,
    pub arrow_type: ArrowType,
    pub is_frozen: bool,
    pub linked_with_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PortalDef {
    pub id: String,
    pub portal_a: CubeCoord,
    pub portal_b: CubeCoord,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReflectorDef {
    pub id: String,
    pub coord: CubeCoord,
    pub orientation: char, // '/' or '\\'
}

#[derive(Clone, Copy, Debug)]
pub struct LevelConfig {
    pub level_number: u32,
    pub grid_size: usize,
    pub target_arrow_count_per_face: usize,
    pub max_path_length: usize,
}

pub const CUBE_FACE_NAMES_SV: [&str; 6] = [
    "högra sidan",
    "vänstra sidan",
    "toppen",
    "botten",
    "framsidan",
    "baksidan",
];
