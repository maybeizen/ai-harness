use super::{clamp_window, validate_geometry, MonitorFrame, WindowGeometry};
fn geometry(x: f64, y: f64, width: f64, height: f64, maximized: bool) -> WindowGeometry {
    WindowGeometry {
        x,
        y,
        width,
        height,
        maximized,
    }
}
#[test]
fn rejects_geometry_outside_the_saved_bounds() {
    assert!(validate_geometry(&geometry(0.0, 0.0, 100.0, 800.0, false)).is_err());
    assert!(validate_geometry(&geometry(f64::NAN, 0.0, 800.0, 600.0, false)).is_err());
    assert!(validate_geometry(&geometry(0.0, 0.0, 800.0, 600.0, false)).is_ok());
}
#[test]
fn clamps_a_window_onto_the_current_monitor() {
    let monitor = MonitorFrame {
        x: 1920.0,
        y: 0.0,
        width: 1280.0,
        height: 800.0,
    };
    let clamped = clamp_window(geometry(0.0, -40.0, 2000.0, 600.0, true), monitor);
    assert_eq!(clamped, geometry(1920.0, 0.0, 1280.0, 600.0, true));
}
