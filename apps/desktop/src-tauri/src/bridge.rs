use crate::{
    error::AppError,
    protocol::{self, Response, StreamEvent},
};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::SyncSender,
        Mutex,
    },
};
use tauri::ipc::Channel;
pub struct Sink {
    pub conversation: String,
    pub sequence: u64,
    pub channel: Channel<StreamEvent>,
}
#[derive(Default)]
pub struct Dispatcher {
    pub pending: Mutex<HashMap<String, SyncSender<Result<Response, AppError>>>>,
    pub streams: Mutex<HashMap<String, Sink>>,
    pub failed: AtomicBool,
}
impl Dispatcher {
    pub fn route(&self, line: &str) -> Result<(), AppError> {
        let value: Value = serde_json::from_str(line).map_err(|_| AppError::internal())?;
        if value.get("version").and_then(Value::as_u64) != Some(protocol::VERSION) {
            return Err(AppError::internal());
        }
        if let Some(event) = value.get("event") {
            let event: StreamEvent =
                serde_json::from_value(event.clone()).map_err(|_| AppError::internal())?;
            let (id, conversation, sequence, terminal) = event.identity();
            let id = id.to_string();
            let mut streams = self.streams.lock().map_err(|_| AppError::internal())?;
            if let Some(sink) = streams.get_mut(&id) {
                if sink.conversation != conversation || sink.sequence != sequence {
                    return Err(AppError::internal());
                }
                sink.sequence += 1;
                let failed = sink.channel.send(event.clone()).is_err();
                if terminal || failed {
                    streams.remove(&id);
                }
            }
        } else {
            let response: Response =
                serde_json::from_value(value).map_err(|_| AppError::internal())?;
            if let Some(sender) = self
                .pending
                .lock()
                .map_err(|_| AppError::internal())?
                .remove(&response.id)
            {
                let _ = sender.send(Ok(response));
            }
        }
        Ok(())
    }
    pub fn fail(&self) {
        self.failed.store(true, Ordering::Release);
        if let Ok(mut pending) = self.pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err(AppError::internal()));
            }
        }
        if let Ok(mut streams) = self.streams.lock() {
            for (id, sink) in streams.drain() {
                let _=sink.channel.send(StreamEvent::Error{generation_id:id,conversation_id:sink.conversation,sequence:sink.sequence,error:AppError::new("UNAVAILABLE","The runtime disconnected. Restart the application before sending another message.")});
            }
        }
    }
}
