// The Tauri desktop shell. It only hosts the same local-first web build in a
// native window — no extra native commands, no network, no backend (Arch §7,
// C-7). The offline-capable browser build remains the primary artefact; this
// is the secondary desktop packaging (R-025).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the Evaluative Framework Builder");
}
