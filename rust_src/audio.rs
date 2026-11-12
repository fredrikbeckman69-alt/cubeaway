use web_sys::{AudioBuffer, AudioContext, AudioContextState, BiquadFilterType, OscillatorType};
use crate::score_manager::now_ms;

pub struct SoundManager {
    ctx: Option<AudioContext>,
    is_muted: bool,
    combo_count: usize,
    last_clear_time: f64,
    noise_buffer: Option<AudioBuffer>,
}

impl SoundManager {
    pub fn new() -> Self {
        Self {
            ctx: None,
            is_muted: false,
            combo_count: 0,
            last_clear_time: 0.0,
            noise_buffer: None,
        }
    }

    pub fn init_ctx(&mut self) {
        if self.ctx.is_none() {
            if let Ok(c) = AudioContext::new() {
                self.ctx = Some(c);
            }
        }
        if let Some(ref c) = self.ctx {
            if c.state() == AudioContextState::Suspended {
                let _ = c.resume();
            }
        }
    }

    pub fn toggle_mute(&mut self) -> bool {
        self.is_muted = !self.is_muted;
        self.is_muted
    }

    pub fn play_arrow_success(&mut self, current_combo_streak: Option<u32>) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };

        let now = now_ms();
        if let Some(streak) = current_combo_streak {
            self.combo_count = streak as usize;
        } else if now - self.last_clear_time < 1800.0 {
            self.combo_count = (self.combo_count + 1).min(14);
        } else {
            self.combo_count = 0;
        }
        self.last_clear_time = now;

        let t = ctx.current_time();
        const PENTATONIC: [i32; 15] = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
        let semitones = PENTATONIC[self.combo_count % PENTATONIC.len()];
        let base_freq = 392.0 * 2.0_f32.powf((semitones as f32) / 12.0);

        if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
            osc.set_type(OscillatorType::Sine);
            let _ = osc.frequency().set_value_at_time(base_freq, t);
            let _ = osc
                .frequency()
                .exponential_ramp_to_value_at_time(base_freq * 1.02, t + 0.15);

            let _ = gain.gain().set_value_at_time(0.24, t);
            let _ = gain.gain().exponential_ramp_to_value_at_time(0.001, t + 0.32);

            let _ = osc.connect_with_audio_node(&gain);
            let _ = gain.connect_with_audio_node(&ctx.destination());
            let _ = osc.start_with_when(t);
            let _ = osc.stop_with_when(t + 0.33);
        }

        if self.combo_count >= 2 {
            let intervals: &[i32] = if self.combo_count >= 6 {
                &[4, 7, 12]
            } else if self.combo_count >= 3 {
                &[4, 7]
            } else {
                &[7]
            };
            let step_duration = 0.055;
            for (idx, &interval) in intervals.iter().enumerate() {
                let note_time = t + ((idx + 1) as f64) * step_duration;
                let note_freq = base_freq * 2.0_f32.powf((interval as f32) / 12.0);

                if let (Ok(arp_osc), Ok(arp_gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
                    arp_osc.set_type(OscillatorType::Sine);
                    let _ = arp_osc.frequency().set_value_at_time(note_freq, note_time);
                    let _ = arp_osc
                        .frequency()
                        .exponential_ramp_to_value_at_time(note_freq * 1.01, note_time + 0.12);

                    let vol = (0.08 + (self.combo_count as f32) * 0.012).min(0.20)
                        / ((idx + 1) as f32);
                    let _ = arp_gain.gain().set_value_at_time(vol, note_time);
                    let _ = arp_gain
                        .gain()
                        .exponential_ramp_to_value_at_time(0.0001, note_time + 0.28);

                    let _ = arp_osc.connect_with_audio_node(&arp_gain);
                    let _ = arp_gain.connect_with_audio_node(&ctx.destination());
                    let _ = arp_osc.start_with_when(note_time);
                    let _ = arp_osc.stop_with_when(note_time + 0.29);
                }
            }

            if let (Ok(harm_osc), Ok(harm_gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
                harm_osc.set_type(OscillatorType::Triangle);
                let _ = harm_osc.frequency().set_value_at_time(base_freq * 2.0, t);
                let h_vol = 0.08 + ((self.combo_count as f32) * 0.015).min(0.12);
                let _ = harm_gain.gain().set_value_at_time(h_vol, t);
                let _ = harm_gain
                    .gain()
                    .exponential_ramp_to_value_at_time(0.001, t + 0.25);

                let _ = harm_osc.connect_with_audio_node(&harm_gain);
                let _ = harm_gain.connect_with_audio_node(&ctx.destination());
                let _ = harm_osc.start_with_when(t);
                let _ = harm_osc.stop_with_when(t + 0.26);
            }
        }

        // Whoosh noise
        if self.noise_buffer.is_none() {
            let sr = ctx.sample_rate();
            let buf_size = (sr * 0.16) as u32;
            if let Ok(buffer) = ctx.create_buffer(1, buf_size, sr) {
                let mut data = vec![0.0_f32; buf_size as usize];
                let mut seed: u32 = 0x1234_5678;
                for sample in &mut data {
                    seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                    *sample = ((seed as f32) / (u32::MAX as f32)) * 2.0 - 1.0;
                }
                let _ = buffer.copy_to_channel(&data, 0);
                self.noise_buffer = Some(buffer);
            }
        }

        if let Some(ref n_buf) = self.noise_buffer {
            if let (Ok(noise), Ok(filter), Ok(n_gain)) = (
                ctx.create_buffer_source(),
                ctx.create_biquad_filter(),
                ctx.create_gain(),
            ) {
                noise.set_buffer(Some(n_buf));
                filter.set_type(BiquadFilterType::Bandpass);
                let f_start = 1000.0 + ((self.combo_count as f32) * 120.0).min(1800.0);
                let _ = filter.frequency().set_value_at_time(f_start, t);
                let _ = filter
                    .frequency()
                    .exponential_ramp_to_value_at_time(3600.0, t + 0.14);
                let _ = filter.q().set_value_at_time(3.5, t);

                let _ = n_gain.gain().set_value_at_time(0.14, t);
                let _ = n_gain
                    .gain()
                    .exponential_ramp_to_value_at_time(0.001, t + 0.16);

                let _ = noise.connect_with_audio_node(&filter);
                let _ = filter.connect_with_audio_node(&n_gain);
                let _ = n_gain.connect_with_audio_node(&ctx.destination());
                let _ = noise.start_with_when(t);
            }
        }
    }

    pub fn play_arrow_blocked(&mut self) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time();

        if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
            osc.set_type(OscillatorType::Sine);
            let _ = osc.frequency().set_value_at_time(180.0, t);
            let _ = osc.frequency().exponential_ramp_to_value_at_time(65.0, t + 0.13);
            let _ = gain.gain().set_value_at_time(0.25, t);
            let _ = gain.gain().exponential_ramp_to_value_at_time(0.001, t + 0.14);
            let _ = osc.connect_with_audio_node(&gain);
            let _ = gain.connect_with_audio_node(&ctx.destination());
            let _ = osc.start_with_when(t);
            let _ = osc.stop_with_when(t + 0.15);
        }
    }

    pub fn play_ice_break(&mut self) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time();

        for (i, &freq) in [2400.0_f32, 3800.0, 5200.0].iter().enumerate() {
            if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
                let start = t + (i as f64) * 0.02;
                osc.set_type(OscillatorType::Sine);
                let _ = osc.frequency().set_value_at_time(freq, start);
                let _ = osc
                    .frequency()
                    .exponential_ramp_to_value_at_time(freq * 0.4, start + 0.08);
                let _ = gain.gain().set_value_at_time(0.18, start);
                let _ = gain
                    .gain()
                    .exponential_ramp_to_value_at_time(0.001, start + 0.09);
                let _ = osc.connect_with_audio_node(&gain);
                let _ = gain.connect_with_audio_node(&ctx.destination());
                let _ = osc.start_with_when(start);
                let _ = osc.stop_with_when(start + 0.10);
            }
        }
    }

    pub fn play_link_whoosh(&mut self) {
        if self.is_muted {
            return;
        }
        let cc = self.combo_count as u32;
        self.play_arrow_success(Some(cc));
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time() + 0.04;

        if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
            osc.set_type(OscillatorType::Triangle);
            let _ = osc.frequency().set_value_at_time(880.0, t);
            let _ = osc.frequency().exponential_ramp_to_value_at_time(1320.0, t + 0.2);
            let _ = gain.gain().set_value_at_time(0.18, t);
            let _ = gain.gain().exponential_ramp_to_value_at_time(0.001, t + 0.28);
            let _ = osc.connect_with_audio_node(&gain);
            let _ = gain.connect_with_audio_node(&ctx.destination());
            let _ = osc.start_with_when(t);
            let _ = osc.stop_with_when(t + 0.30);
        }
    }

    pub fn play_star_pop(&mut self, star_index: usize) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time();
        let notes = [523.25_f32, 659.25, 783.99];
        let freq = notes[star_index.min(notes.len() - 1)];

        if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
            osc.set_type(OscillatorType::Sine);
            let _ = osc.frequency().set_value_at_time(freq, t);
            let _ = osc
                .frequency()
                .exponential_ramp_to_value_at_time(freq * 1.5, t + 0.22);
            let _ = gain.gain().set_value_at_time(0.28, t);
            let _ = gain.gain().exponential_ramp_to_value_at_time(0.001, t + 0.40);
            let _ = osc.connect_with_audio_node(&gain);
            let _ = gain.connect_with_audio_node(&ctx.destination());
            let _ = osc.start_with_when(t);
            let _ = osc.stop_with_when(t + 0.42);
        }
    }

    pub fn play_victory_fanfare(&mut self) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time();
        let freqs = [261.63_f32, 329.63, 392.0, 493.88, 587.33, 783.99, 1046.5];

        for (idx, &freq) in freqs.iter().enumerate() {
            if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
                let start = t + (idx as f64) * 0.07;
                osc.set_type(OscillatorType::Triangle);
                let _ = osc.frequency().set_value_at_time(freq, start);
                let _ = gain.gain().set_value_at_time(0.18, start);
                let _ = gain
                    .gain()
                    .exponential_ramp_to_value_at_time(0.001, start + 0.70);
                let _ = osc.connect_with_audio_node(&gain);
                let _ = gain.connect_with_audio_node(&ctx.destination());
                let _ = osc.start_with_when(start);
                let _ = osc.stop_with_when(start + 0.75);
            }
        }
    }

    pub fn play_high_score(&mut self) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time();
        let notes = [
            (523.25_f32, 0.0, 0.18),
            (659.25, 0.12, 0.18),
            (783.99, 0.24, 0.22),
            (1046.50, 0.38, 0.60),
            (1318.51, 0.44, 0.70),
            (1567.98, 0.50, 0.90),
        ];

        for (f, offset, dur) in notes {
            if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
                let start_time = t + offset;
                osc.set_type(OscillatorType::Triangle);
                let _ = osc.frequency().set_value_at_time(f, start_time);
                let _ = gain.gain().set_value_at_time(0.20, start_time);
                let _ = gain
                    .gain()
                    .exponential_ramp_to_value_at_time(0.001, start_time + dur);
                let _ = osc.connect_with_audio_node(&gain);
                let _ = gain.connect_with_audio_node(&ctx.destination());
                let _ = osc.start_with_when(start_time);
                let _ = osc.stop_with_when(start_time + dur + 0.05);
            }
        }
    }

    pub fn play_click(&mut self) {
        if self.is_muted {
            return;
        }
        self.init_ctx();
        let Some(ref ctx) = self.ctx else { return };
        let t = ctx.current_time();

        if let (Ok(osc), Ok(gain)) = (ctx.create_oscillator(), ctx.create_gain()) {
            osc.set_type(OscillatorType::Sine);
            let _ = osc.frequency().set_value_at_time(660.0, t);
            let _ = osc.frequency().exponential_ramp_to_value_at_time(1100.0, t + 0.08);
            let _ = gain.gain().set_value_at_time(0.22, t);
            let _ = gain.gain().exponential_ramp_to_value_at_time(0.001, t + 0.12);
            let _ = osc.connect_with_audio_node(&gain);
            let _ = gain.connect_with_audio_node(&ctx.destination());
            let _ = osc.start_with_when(t);
            let _ = osc.stop_with_when(t + 0.13);
        }
    }
}
