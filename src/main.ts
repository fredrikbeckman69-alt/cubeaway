import './style.css';
import init from './wasm-pkg/cubeaway_wasm.js';

// Starta hela CubeAway 3D-motorn (WebGL 2.0 + Rust Edition 2024 WebAssembly)
init().catch((err) => {
  console.error('Failed to initialize CubeAway Rust/WebAssembly module:', err);
});
