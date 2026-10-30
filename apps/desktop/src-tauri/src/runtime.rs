use crate::{
    bridge::{Dispatcher, Sink},
    error::AppError,
    protocol::{self, Response},
};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    os::unix::process::CommandExt,
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
pub struct Runtime {
    pub(crate) child: Mutex<Child>,
    input: Mutex<ChildStdin>,
    dispatcher: Arc<Dispatcher>,
    sequence: AtomicU64,
    stopped: AtomicBool,
}
impl Runtime {
    pub fn start(node: &Path, script: &Path, data: &Path) -> Result<Self, String> {
        let mut command = Command::new(node);
        command
            .arg(script)
            .env("HARNESS_DATA_DIR", data)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .process_group(0);
        let parent = std::process::id() as i32;
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                if libc::getppid() != parent {
                    return Err(std::io::Error::other("Host exited"));
                }
                Ok(())
            });
        }
        let mut child = command
            .spawn()
            .map_err(|_| "Runtime process could not start")?;
        let input = child.stdin.take().ok_or("Runtime stdin unavailable")?;
        let output = child.stdout.take().ok_or("Runtime stdout unavailable")?;
        let dispatcher = Arc::new(Dispatcher::default());
        let reader_dispatcher = dispatcher.clone();
        thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut bytes = Vec::new();
                let read = Read::by_ref(&mut reader)
                    .take(protocol::MAX_BYTES + 2)
                    .read_until(b'\n', &mut bytes);
                if !matches!(read,Ok(n) if n>0)
                    || bytes.len() as u64 > protocol::MAX_BYTES + 1
                    || bytes.last() != Some(&b'\n')
                {
                    break;
                }
                let Ok(line) = String::from_utf8(bytes) else {
                    break;
                };
                if reader_dispatcher.route(&line).is_err() {
                    break;
                }
            }
            reader_dispatcher.fail();
        });
        let runtime = Self {
            child: Mutex::new(child),
            input: Mutex::new(input),
            dispatcher,
            sequence: AtomicU64::new(0),
            stopped: AtomicBool::new(false),
        };
        runtime.request("hello", Duration::from_secs(10))?;
        Ok(runtime)
    }
    pub fn request(&self, method: &str, timeout: Duration) -> Result<Response, String> {
        let response = self
            .envelope(method, None, timeout)
            .map_err(|e| e.message)?;
        protocol::validate(
            &serde_json::to_string(&response).map_err(|_| "Invalid response")?,
            &response.id,
        )
    }
    pub fn call(&self, method: &str, params: Value, timeout: Duration) -> Result<Value, AppError> {
        let response = self.envelope(method, Some(params), timeout)?;
        if !response.ok {
            return Err(response.error.unwrap_or_else(AppError::internal));
        }
        Ok(response.result.unwrap_or(Value::Null))
    }
    fn envelope(
        &self,
        method: &str,
        params: Option<Value>,
        timeout: Duration,
    ) -> Result<Response, AppError> {
        if self.dispatcher.failed.load(Ordering::Acquire) {
            return Err(AppError::internal());
        }
        let id = self.sequence.fetch_add(1, Ordering::Relaxed).to_string();
        let mut request = json!({"version":protocol::VERSION,"id":id,"method":method});
        if let Some(params) = params {
            request["params"] = params;
        }
        let mut bytes = serde_json::to_vec(&request).map_err(|_| AppError::internal())?;
        if bytes.len() as u64 > protocol::MAX_BYTES {
            return Err(AppError::new(
                "INVALID_REQUEST",
                "This conversation is too large. Start a new chat.",
            ));
        }
        bytes.push(b'\n');
        let (sender, receiver) = mpsc::sync_channel(1);
        self.dispatcher
            .pending
            .lock()
            .map_err(|_| AppError::internal())?
            .insert(id.clone(), sender);
        let written = self
            .input
            .lock()
            .map_err(|_| AppError::internal())?
            .write_all(&bytes);
        if written.is_err() {
            self.dispatcher.fail();
            return Err(AppError::internal());
        }
        let result = receiver.recv_timeout(timeout);
        self.dispatcher
            .pending
            .lock()
            .map_err(|_| AppError::internal())?
            .remove(&id);
        match result {
            Ok(response) => response,
            Err(_) => {
                self.dispatcher.fail();
                Err(AppError::new(
                    "UNAVAILABLE",
                    "The runtime did not respond in time. Restart the application.",
                ))
            }
        }
    }
    pub fn subscribe(&self, generation: String, sink: Sink) -> Result<(), AppError> {
        self.dispatcher
            .streams
            .lock()
            .map_err(|_| AppError::internal())?
            .insert(generation, sink);
        Ok(())
    }
    pub fn unsubscribe(&self, generation: &str) {
        if let Ok(mut streams) = self.dispatcher.streams.lock() {
            streams.remove(generation);
        }
    }
    pub fn stop(&self) {
        if self.stopped.swap(true, Ordering::AcqRel) {
            return;
        }
        let _ = self.request("shutdown", Duration::from_secs(2));
        if let Ok(mut child) = self.child.lock() {
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    break;
                }
                thread::sleep(Duration::from_millis(20));
            }
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.wait();
        }
        self.dispatcher.fail();
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.stop();
    }
}
#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
