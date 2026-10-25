use serde::Serialize;
use std::{
    collections::HashMap,
    env, fs,
    io::{self, BufRead, BufReader, Write},
    net::Shutdown,
    os::unix::{
        fs::PermissionsExt,
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    process::exit,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU32, Ordering},
    },
    thread,
};
use tauri::{State, ipc::Channel};

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Frame {
    Open { id: u32 },
    Line { id: u32, line: String },
    Close { id: u32 },
}

struct Client {
    stream: UnixStream,
    turn: Mutex<()>,
}

pub struct Relay {
    socket: PathBuf,
    channel: Mutex<Option<Channel<Frame>>>,
    clients: Mutex<HashMap<u32, Arc<Client>>>,
    next: AtomicU32,
}

pub fn socket(identifier: &str) -> PathBuf {
    PathBuf::from(env::var_os("HOME").unwrap_or_default())
        .join("Library/Application Support")
        .join(identifier)
        .join("mcp.sock")
}

pub fn running(socket: &Path) -> bool {
    UnixStream::connect(socket).is_ok()
}

pub fn shim(socket: &Path) -> ! {
    let connect = || {
        let down = UnixStream::connect(socket)?;
        Ok::<_, io::Error>((down.try_clone()?, down))
    };
    let Ok((mut up, down)) = connect() else {
        eprintln!("Garner is not running. Open Garner and reconnect.");
        exit(1)
    };
    thread::spawn(move || {
        let _ = io::copy(&mut io::stdin().lock(), &mut up);
        let _ = up.shutdown(Shutdown::Write);
    });
    let mut out = io::stdout().lock();
    let _ = io::copy(&mut &down, &mut out);
    let _ = out.flush();
    exit(0)
}

impl Relay {
    pub fn new(socket: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            socket,
            channel: Mutex::new(None),
            clients: Mutex::new(HashMap::new()),
            next: AtomicU32::new(1),
        })
    }

    fn send(&self, frame: Frame) {
        if let Some(channel) = self.channel.lock().unwrap().as_ref() {
            let _ = channel.send(frame);
        }
    }

    fn serve(&self, stream: UnixStream) {
        let Ok(writer) = stream.try_clone() else {
            return;
        };
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let client = Client {
            stream: writer,
            turn: Mutex::new(()),
        };
        self.clients.lock().unwrap().insert(id, Arc::new(client));
        self.send(Frame::Open { id });
        for line in BufReader::new(&stream).lines().map_while(Result::ok) {
            self.send(Frame::Line { id, line });
        }
        self.clients.lock().unwrap().remove(&id);
        let _ = stream.shutdown(Shutdown::Both);
        self.send(Frame::Close { id });
    }

    fn listen(self: &Arc<Self>, channel: Channel<Frame>) -> io::Result<()> {
        let mut current = self.channel.lock().unwrap();
        if current.is_some() {
            for (_, client) in self.clients.lock().unwrap().drain() {
                let _ = client.stream.shutdown(Shutdown::Both);
            }
        } else {
            let _ = fs::remove_file(&self.socket);
            let listener = UnixListener::bind(&self.socket)?;
            fs::set_permissions(&self.socket, fs::Permissions::from_mode(0o600))?;
            let relay = Arc::clone(self);
            thread::spawn(move || {
                for stream in listener.incoming().map_while(Result::ok) {
                    let relay = relay.clone();
                    thread::spawn(move || relay.serve(stream));
                }
            });
        }
        *current = Some(channel);
        Ok(())
    }

    fn reply(&self, id: u32, line: &str) -> io::Result<()> {
        let Some(client) = self.clients.lock().unwrap().get(&id).cloned() else {
            return Ok(());
        };
        let _turn = client.turn.lock().unwrap();
        (&client.stream).write_all(format!("{line}\n").as_bytes())
    }
}

#[tauri::command(async)]
pub fn mcp_listen(relay: State<Arc<Relay>>, channel: Channel<Frame>) -> Result<(), String> {
    relay
        .listen(channel)
        .map_err(|error| format!("{}: {error}", relay.socket.display()))
}

#[tauri::command(async)]
pub fn mcp_reply(relay: State<Arc<Relay>>, id: u32, line: String) -> Result<(), String> {
    relay.reply(id, &line).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::mpsc, time::Duration};
    use tauri::ipc::InvokeResponseBody;

    fn relay(name: &str) -> (Arc<Relay>, PathBuf, mpsc::Receiver<String>) {
        let folder = env::temp_dir().join(format!("garner-mcp-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        let socket = folder.join("mcp.sock");
        let relay = Relay::new(socket.clone());
        let (frames, seen) = mpsc::channel();
        relay
            .listen(Channel::new(move |body| {
                if let InvokeResponseBody::Json(frame) = body {
                    frames.send(frame).unwrap();
                }
                Ok(())
            }))
            .unwrap();
        (relay, socket, seen)
    }

    fn next(seen: &mpsc::Receiver<String>) -> String {
        seen.recv_timeout(Duration::from_secs(5)).unwrap()
    }

    #[test]
    fn lines_reach_the_page_and_replies_reach_the_client() {
        let (relay, socket, seen) = relay("lines");
        assert_eq!(
            fs::metadata(&socket).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(running(&socket));
        assert_eq!(next(&seen), r#"{"type":"open","id":1}"#);
        assert_eq!(next(&seen), r#"{"type":"close","id":1}"#);

        let mut client = UnixStream::connect(&socket).unwrap();
        client.write_all(b"{\"a\":1}\n{\"b\":2}\n").unwrap();
        assert_eq!(next(&seen), r#"{"type":"open","id":2}"#);
        assert_eq!(next(&seen), r#"{"type":"line","id":2,"line":"{\"a\":1}"}"#);
        assert_eq!(next(&seen), r#"{"type":"line","id":2,"line":"{\"b\":2}"}"#);

        relay.reply(2, "{\"ok\":true}").unwrap();
        relay.reply(9, "dropped").unwrap();
        let mut answer = String::new();
        BufReader::new(&client).read_line(&mut answer).unwrap();
        assert_eq!(answer, "{\"ok\":true}\n");

        client.shutdown(Shutdown::Write).unwrap();
        assert_eq!(next(&seen), r#"{"type":"close","id":2}"#);
    }

    #[test]
    fn a_page_reload_drops_every_open_client() {
        let (relay, socket, seen) = relay("reload");
        let client = UnixStream::connect(&socket).unwrap();
        assert_eq!(next(&seen), r#"{"type":"open","id":1}"#);
        let (frames, reloaded) = mpsc::channel();
        relay
            .listen(Channel::new(move |body| {
                if let InvokeResponseBody::Json(frame) = body {
                    frames.send(frame).unwrap();
                }
                Ok(())
            }))
            .unwrap();
        let mut rest = String::new();
        assert_eq!(BufReader::new(&client).read_line(&mut rest).unwrap(), 0);
        assert_eq!(next(&reloaded), r#"{"type":"close","id":1}"#);
        assert!(running(&socket));
    }

    #[test]
    fn a_reload_is_not_held_up_by_a_client_that_stopped_reading() {
        let (relay, socket, seen) = relay("stalled");
        let _client = UnixStream::connect(&socket).unwrap();
        assert_eq!(next(&seen), r#"{"type":"open","id":1}"#);
        let writer = relay.clone();
        let stuck = thread::spawn(move || writer.reply(1, &"x".repeat(1 << 22)));
        thread::sleep(Duration::from_millis(200));
        assert!(!stuck.is_finished());
        relay.listen(Channel::new(|_| Ok(()))).unwrap();
        assert!(stuck.join().unwrap().is_err());
    }

    #[test]
    fn a_failed_bind_is_tried_again() {
        let folder = env::temp_dir().join(format!("garner-mcp-{}-retry", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        let relay = Relay::new(folder.join("mcp.sock"));
        assert!(relay.listen(Channel::new(|_| Ok(()))).is_err());
        fs::create_dir_all(&folder).unwrap();
        relay.listen(Channel::new(|_| Ok(()))).unwrap();
        assert!(running(&folder.join("mcp.sock")));
    }

    #[test]
    fn nothing_answers_on_a_stale_socket() {
        let folder = env::temp_dir().join(format!("garner-mcp-{}-stale", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        drop(UnixListener::bind(folder.join("mcp.sock")).unwrap());
        assert!(!running(&folder.join("mcp.sock")));
        assert!(
            socket("money.garner").ends_with("Library/Application Support/money.garner/mcp.sock")
        );
    }
}
