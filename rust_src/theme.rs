#[derive(Clone, Debug)]
pub struct LevelTheme {
    pub name: String,
    pub cube_core: String,
    pub cube_mid: String,
    pub cube_edge: String,
    pub grid_line: String,
    pub cube_rim: String,
    pub arrow_base: String,
    pub arrow_glow: String,
    pub arrow_core: String,
    pub flying_arrow_color: u32,
    pub point_light_color: u32,
    pub dir_light1_color: u32,
    pub dir_light2_color: u32,
    pub shadow_glow_rgb: [u8; 3],
    pub accent_gradient: String,
    pub is_white_theme: bool,
}

struct BaseThemeDef {
    name: &'static str,
    cube_core: &'static str,
    cube_mid: &'static str,
    cube_edge: &'static str,
    cube_rim: &'static str,
    arrow_base: &'static str,
    arrow_glow: &'static str,
    arrow_core: &'static str,
    flying_arrow_hex: &'static str,
    point_light_hex: &'static str,
    dir_light1_hex: &'static str,
    dir_light2_hex: &'static str,
    accent_gradient: &'static str,
    is_white_theme: bool,
}

const BASE_THEMES: [BaseThemeDef; 16] = [
    BaseThemeDef {
        name: "Termisk Rosa & Magenta",
        cube_core: "#220417",
        cube_mid: "#15020e",
        cube_edge: "#090106",
        cube_rim: "#ff00aa",
        arrow_base: "#ff00d4",
        arrow_glow: "#ff00aa",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ff00d4",
        point_light_hex: "#ff00aa",
        dir_light1_hex: "#ff33aa",
        dir_light2_hex: "#660033",
        accent_gradient: "linear-gradient(90deg, #ff00aa, #ff00d4)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Cyberpunk Indigo & Neon Cyan",
        cube_core: "#080d22",
        cube_mid: "#050716",
        cube_edge: "#02030b",
        cube_rim: "#00f5ff",
        arrow_base: "#00f5ff",
        arrow_glow: "#00ccff",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#00f5ff",
        point_light_hex: "#3b82f6",
        dir_light1_hex: "#60a5fa",
        dir_light2_hex: "#1e1b4b",
        accent_gradient: "linear-gradient(90deg, #3b82f6, #00f5ff)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Solstorm Amber & Solguld",
        cube_core: "#241002",
        cube_mid: "#160901",
        cube_edge: "#090300",
        cube_rim: "#ff9900",
        arrow_base: "#ffd000",
        arrow_glow: "#ff9900",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ffd000",
        point_light_hex: "#f97316",
        dir_light1_hex: "#fb923c",
        dir_light2_hex: "#7c2d12",
        accent_gradient: "linear-gradient(90deg, #ea580c, #ffd000)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Stjärnglans & Diamantvit (Vita Pilar ⚪)",
        cube_core: "#0c0d18",
        cube_mid: "#070810",
        cube_edge: "#020306",
        cube_rim: "#ffffff",
        arrow_base: "#ffffff",
        arrow_glow: "#e0f2fe",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ffffff",
        point_light_hex: "#ffffff",
        dir_light1_hex: "#f8fafc",
        dir_light2_hex: "#1e293b",
        accent_gradient: "linear-gradient(90deg, #94a3b8, #ffffff)",
        is_white_theme: true,
    },
    BaseThemeDef {
        name: "Smaragdenergi & Neon Mint",
        cube_core: "#021e13",
        cube_mid: "#01130c",
        cube_edge: "#000805",
        cube_rim: "#00ff88",
        arrow_base: "#00ff88",
        arrow_glow: "#00cc66",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#00ff88",
        point_light_hex: "#10b981",
        dir_light1_hex: "#34d399",
        dir_light2_hex: "#064e3b",
        accent_gradient: "linear-gradient(90deg, #059669, #00ff88)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Kryo Safir & Neon Korall",
        cube_core: "#031726",
        cube_mid: "#010e19",
        cube_edge: "#00060d",
        cube_rim: "#ff4d00",
        arrow_base: "#ff4d00",
        arrow_glow: "#ff3300",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ff4d00",
        point_light_hex: "#0284c7",
        dir_light1_hex: "#38bdf8",
        dir_light2_hex: "#082f49",
        accent_gradient: "linear-gradient(90deg, #0284c7, #ff4d00)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Plasma Nebula & Neon Pink",
        cube_core: "#1b0529",
        cube_mid: "#11031a",
        cube_edge: "#08010d",
        cube_rim: "#ff00aa",
        arrow_base: "#ff00bb",
        arrow_glow: "#ff0088",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ff00bb",
        point_light_hex: "#9333ea",
        dir_light1_hex: "#c084fc",
        dir_light2_hex: "#3b0764",
        accent_gradient: "linear-gradient(90deg, #9333ea, #ff00bb)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Kosmisk Frost & Vit Laser (Vita Pilar ⚪)",
        cube_core: "#050d1c",
        cube_mid: "#020610",
        cube_edge: "#010206",
        cube_rim: "#ffffff",
        arrow_base: "#ffffff",
        arrow_glow: "#bae6fd",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ffffff",
        point_light_hex: "#ffffff",
        dir_light1_hex: "#e0f2fe",
        dir_light2_hex: "#0c4a6e",
        accent_gradient: "linear-gradient(90deg, #38bdf8, #ffffff)",
        is_white_theme: true,
    },
    BaseThemeDef {
        name: "Vulkan Rubin & Elektrisk Turkos",
        cube_core: "#28040b",
        cube_mid: "#180206",
        cube_edge: "#0c0103",
        cube_rim: "#00ffee",
        arrow_base: "#00ffee",
        arrow_glow: "#00cccc",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#00ffee",
        point_light_hex: "#e11d48",
        dir_light1_hex: "#fb7185",
        dir_light2_hex: "#4c0519",
        accent_gradient: "linear-gradient(90deg, #e11d48, #00ffee)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Radioaktiv Lime & Ultra Violet",
        cube_core: "#131f03",
        cube_mid: "#0c1402",
        cube_edge: "#050800",
        cube_rim: "#d000ff",
        arrow_base: "#d000ff",
        arrow_glow: "#aa00ff",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#d000ff",
        point_light_hex: "#84cc16",
        dir_light1_hex: "#a3e635",
        dir_light2_hex: "#365314",
        accent_gradient: "linear-gradient(90deg, #65a30d, #d000ff)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Aqua Lagoon & Neon Orange",
        cube_core: "#021e1c",
        cube_mid: "#011312",
        cube_edge: "#000807",
        cube_rim: "#ff6600",
        arrow_base: "#ff6600",
        arrow_glow: "#ff5500",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ff6600",
        point_light_hex: "#0d9488",
        dir_light1_hex: "#2dd4bf",
        dir_light2_hex: "#134e4a",
        accent_gradient: "linear-gradient(90deg, #0d9488, #ff6600)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Obsidian & Vit Kristall (Vita Pilar ⚪)",
        cube_core: "#101014",
        cube_mid: "#08080a",
        cube_edge: "#020203",
        cube_rim: "#ffffff",
        arrow_base: "#ffffff",
        arrow_glow: "#f1f5f9",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ffffff",
        point_light_hex: "#ffffff",
        dir_light1_hex: "#ffffff",
        dir_light2_hex: "#334155",
        accent_gradient: "linear-gradient(90deg, #cbd5e1, #ffffff)",
        is_white_theme: true,
    },
    BaseThemeDef {
        name: "Obsidian Guld & Bärnstenslåga",
        cube_core: "#171406",
        cube_mid: "#0f0c03",
        cube_edge: "#060501",
        cube_rim: "#ffcc00",
        arrow_base: "#ffcc00",
        arrow_glow: "#ffaa00",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ffcc00",
        point_light_hex: "#d97706",
        dir_light1_hex: "#fbbf24",
        dir_light2_hex: "#451a03",
        accent_gradient: "linear-gradient(90deg, #b45309, #ffcc00)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Elektro-Blå & Neon Lime",
        cube_core: "#04122b",
        cube_mid: "#020a1a",
        cube_edge: "#01040d",
        cube_rim: "#00ff44",
        arrow_base: "#00ff44",
        arrow_glow: "#00cc33",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#00ff44",
        point_light_hex: "#2563eb",
        dir_light1_hex: "#60a5fa",
        dir_light2_hex: "#1e3a8a",
        accent_gradient: "linear-gradient(90deg, #2563eb, #00ff44)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Magma Basalt & Molten Lava",
        cube_core: "#240502",
        cube_mid: "#160301",
        cube_edge: "#080100",
        cube_rim: "#ff3700",
        arrow_base: "#ff4400",
        arrow_glow: "#ff2200",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ff4400",
        point_light_hex: "#dc2626",
        dir_light1_hex: "#ef4444",
        dir_light2_hex: "#450a0a",
        accent_gradient: "linear-gradient(90deg, #dc2626, #ff4400)",
        is_white_theme: false,
    },
    BaseThemeDef {
        name: "Supernova & Snövit (Vita Pilar ⚪)",
        cube_core: "#16081c",
        cube_mid: "#0e0412",
        cube_edge: "#050107",
        cube_rim: "#ffffff",
        arrow_base: "#ffffff",
        arrow_glow: "#fae8ff",
        arrow_core: "#ffffff",
        flying_arrow_hex: "#ffffff",
        point_light_hex: "#ffffff",
        dir_light1_hex: "#faf5ff",
        dir_light2_hex: "#4a044e",
        accent_gradient: "linear-gradient(90deg, #e879f9, #ffffff)",
        is_white_theme: true,
    },
];

pub fn hex_to_number(hex: &str) -> u32 {
    u32::from_str_radix(hex.trim_start_matches('#'), 16).unwrap_or(0xffffff)
}

pub fn hex_to_rgb(hex: &str) -> [u8; 3] {
    let num = hex_to_number(hex);
    [
        ((num >> 16) & 0xff) as u8,
        ((num >> 8) & 0xff) as u8,
        (num & 0xff) as u8,
    ]
}

pub fn u32_to_rgb_f32(color: u32) -> [f32; 3] {
    [
        ((color >> 16) & 0xff) as f32 / 255.0,
        ((color >> 8) & 0xff) as f32 / 255.0,
        (color & 0xff) as f32 / 255.0,
    ]
}

fn shift_hex_hue(hex: &str, delta_hue: f32) -> String {
    if delta_hue == 0.0 {
        return hex.to_string();
    }
    let [r8, g8, b8] = hex_to_rgb(hex);
    let mut r = r8 as f32 / 255.0;
    let mut g = g8 as f32 / 255.0;
    let mut b = b8 as f32 / 255.0;

    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let mut h = 0.0;
    let mut s = 0.0;
    let l = (max + min) * 0.5;

    if (max - min).abs() > 1e-6 {
        let d = max - min;
        s = if l > 0.5 {
            d / (2.0 - max - min)
        } else {
            d / (max + min)
        };
        if (max - r).abs() < 1e-6 {
            h = ((g - b) / d + if g < b { 6.0 } else { 0.0 }) / 6.0;
        } else if (max - g).abs() < 1e-6 {
            h = ((b - r) / d + 2.0) / 6.0;
        } else {
            h = ((r - g) / d + 4.0) / 6.0;
        }
    }

    h = (((h * 360.0 + delta_hue) % 360.0) + 360.0) % 360.0 / 360.0;

    fn hue2rgb(p: f32, q: f32, mut t: f32) -> f32 {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            return p + (q - p) * 6.0 * t;
        }
        if t < 0.5 {
            return q;
        }
        if t < 2.0 / 3.0 {
            return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        }
        p
    }

    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    r = hue2rgb(p, q, h + 1.0 / 3.0);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1.0 / 3.0);

    let ri = (r * 255.0).round().clamp(0.0, 255.0) as u8;
    let gi = (g * 255.0).round().clamp(0.0, 255.0) as u8;
    let bi = (b * 255.0).round().clamp(0.0, 255.0) as u8;
    format!("#{:02x}{:02x}{:02x}", ri, gi, bi)
}

pub fn get_level_theme(level_number: u32) -> LevelTheme {
    let lvl = level_number.clamp(1, 1000) as usize;
    let total_base = BASE_THEMES.len();
    let base_idx = (lvl - 1) % total_base;
    let cycle = (lvl - 1) / total_base;
    let delta_hue = ((cycle * 29) % 360) as f32;

    let base = &BASE_THEMES[base_idx];
    let theme_name = if cycle == 0 {
        base.name.to_string()
    } else {
        format!("{} (Fas {})", base.name, cycle + 1)
    };

    if base.is_white_theme {
        let cube_core = shift_hex_hue(base.cube_core, delta_hue);
        let cube_mid = shift_hex_hue(base.cube_mid, delta_hue);
        let cube_edge = shift_hex_hue(base.cube_edge, delta_hue);
        return LevelTheme {
            name: theme_name,
            cube_core,
            cube_mid,
            cube_edge,
            grid_line: "rgba(255, 255, 255, 0.18)".to_string(),
            cube_rim: "#ffffff".to_string(),
            arrow_base: "#ffffff".to_string(),
            arrow_glow: base.arrow_glow.to_string(),
            arrow_core: "#ffffff".to_string(),
            flying_arrow_color: 0xffffff,
            point_light_color: 0xffffff,
            dir_light1_color: hex_to_number(base.dir_light1_hex),
            dir_light2_color: hex_to_number(&shift_hex_hue(base.dir_light2_hex, delta_hue)),
            shadow_glow_rgb: [255, 255, 255],
            accent_gradient: base.accent_gradient.to_string(),
            is_white_theme: true,
        };
    }

    let cube_core = shift_hex_hue(base.cube_core, delta_hue);
    let cube_mid = shift_hex_hue(base.cube_mid, delta_hue);
    let cube_edge = shift_hex_hue(base.cube_edge, delta_hue);
    let cube_rim = shift_hex_hue(base.cube_rim, delta_hue);

    let arrow_base = shift_hex_hue(base.arrow_base, delta_hue);
    let arrow_glow = shift_hex_hue(base.arrow_glow, delta_hue);
    let flying_arrow_hex = shift_hex_hue(base.flying_arrow_hex, delta_hue);

    let point_light_hex = shift_hex_hue(base.point_light_hex, delta_hue);
    let dir_light1_hex = shift_hex_hue(base.dir_light1_hex, delta_hue);
    let dir_light2_hex = shift_hex_hue(base.dir_light2_hex, delta_hue);

    let [cr, cg, cb] = hex_to_rgb(&cube_rim);
    let shadow_rgb = hex_to_rgb(&arrow_base);

    LevelTheme {
        name: theme_name,
        cube_core,
        cube_mid,
        cube_edge,
        grid_line: format!("rgba({}, {}, {}, 0.12)", cr, cg, cb),
        cube_rim,
        arrow_base: arrow_base.clone(),
        arrow_glow,
        arrow_core: base.arrow_core.to_string(),
        flying_arrow_color: hex_to_number(&flying_arrow_hex),
        point_light_color: hex_to_number(&point_light_hex),
        dir_light1_color: hex_to_number(&dir_light1_hex),
        dir_light2_color: hex_to_number(&dir_light2_hex),
        shadow_glow_rgb: shadow_rgb,
        accent_gradient: format!("linear-gradient(90deg, {}, {})", point_light_hex, arrow_base),
        is_white_theme: false,
    }
}
