use super::*;
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
fn fixture(mode: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let directory = std::env::temp_dir().join(format!(
        "harness-rust-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&directory).unwrap();
    let script = directory.join("fixture.cjs");
    let source = format!(
        r#"
const mode = {mode:?};
if(mode==='descendant') {{
 const child=require('node:child_process').spawn('/bin/sleep',['60'],{{stdio:'ignore'}});
 require('node:fs').writeFileSync(require('node:path').join(process.env.HARNESS_DATA_DIR,'descendant.pid'),String(child.pid));
}}
const readline = require('node:readline').createInterface({{input:process.stdin}});
readline.on('line', line => {{
 const request=JSON.parse(line);
 if (mode==='timeout' && request.method!=='hello') return;
 const version=mode==='mismatch'?1:2;
 process.stdout.write(JSON.stringify({{version,id:request.id,ok:true,result:{{status:'ready',protocol:2,storage:'ready'}}}})+'\n');
 if(request.method==='shutdown') {{readline.close();process.stdin.destroy();}}
}});
"#
    );
    fs::write(&script, source).unwrap();
    (directory, script)
}
#[test]
fn handshakes_and_stops_a_real_process() {
    let (directory, script) = fixture("healthy");
    let runtime = Runtime::start(Path::new("node"), &script, &directory).unwrap();
    assert!(runtime.request("health", Duration::from_secs(2)).is_ok());
    runtime.stop();
    assert!(runtime.child.lock().unwrap().try_wait().unwrap().is_some());
    runtime.stop(); // idempotent: do not signal a potentially reused process ID.
    fs::remove_dir_all(directory).unwrap();
}
#[test]
fn timeout_marks_connection_unavailable() {
    let (directory, script) = fixture("timeout");
    let runtime = Runtime::start(Path::new("node"), &script, &directory).unwrap();
    assert!(runtime
        .request("health", Duration::from_millis(50))
        .is_err());
    let start = Instant::now();
    assert!(runtime.request("health", Duration::from_secs(5)).is_err());
    assert!(start.elapsed() < Duration::from_secs(1));
    runtime.stop();
    assert!(runtime.child.lock().unwrap().try_wait().unwrap().is_some());
    fs::remove_dir_all(directory).unwrap();
}
#[test]
fn failed_startup_rejects_protocol_mismatch() {
    let (directory, script) = fixture("mismatch");
    assert!(Runtime::start(Path::new("node"), &script, &directory).is_err());
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn stops_managed_descendants() {
    let (directory, script) = fixture("descendant");
    let runtime = Runtime::start(Path::new("node"), &script, &directory).unwrap();
    let pid = fs::read_to_string(directory.join("descendant.pid")).unwrap();
    runtime.stop();
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        let status = fs::read_to_string(format!("/proc/{}/status", pid.trim()));
        if status
            .as_ref()
            .map_or(true, |value| value.contains("State:\tZ"))
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Managed descendant survived shutdown"
        );
        thread::sleep(Duration::from_millis(20));
    }
    fs::remove_dir_all(directory).unwrap();
}
