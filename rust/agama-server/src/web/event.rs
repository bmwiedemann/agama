use crate::software::web::PatternStatus;
use agama_lib::progress::Progress;
use serde::Serialize;
use std::collections::HashMap;
use tokio::sync::broadcast::{Receiver, Sender};

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
pub enum Event {
    LocaleChanged { locale: String },
    Progress(Progress),
    ProductChanged { id: String },
    PatternsChanged(HashMap<String, PatternStatus>),
}

pub type EventsSender = Sender<Event>;
pub type EventsReceiver = Receiver<Event>;
