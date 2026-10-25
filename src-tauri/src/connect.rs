use serde::{Deserialize, Serialize};
use serde_json::{Value as Json, json};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Connected,
    Missing,
    Confirm,
    Failed,
}

#[derive(Serialize)]
pub struct Link {
    app: App,
    state: State,
}

#[derive(Debug, Deserialize, PartialEq)]
struct Entry {
    command: PathBuf,
    #[serde(default)]
    args: Vec<String>,
}

#[derive(Clone, Copy, Serialize)]
enum App {
    #[serde(rename = "Claude Code")]
    Code,
    #[serde(rename = "Claude Desktop")]
    Desktop,
    Codex,
}

struct Target {
    name: String,
    exe: PathBuf,
    home: PathBuf,
    cache: PathBuf,
}

fn find(tool: &str, home: &Path) -> Option<PathBuf> {
    env::split_paths(&env::var_os("PATH").unwrap_or_default())
        .chain([
            home.join(".local/bin"),
            "/opt/homebrew/bin".into(),
            "/usr/local/bin".into(),
        ])
        .map(|folder| folder.join(tool))
        .find(|path| path.is_file())
}

fn run(program: &Path, args: &[&str]) -> io::Result<Vec<u8>> {
    let output = Command::new(program).args(args).output()?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(io::ErrorKind::Other.into())
    }
}

fn entry(text: &[u8], path: &[&str]) -> Option<Entry> {
    let mut value: Json = serde_json::from_slice(text).ok()?;
    for key in path {
        value = value.get_mut(key)?.take();
    }
    serde_json::from_value(value).ok()
}

impl Target {
    fn new(app: &AppHandle) -> Result<Self, String> {
        let text = |error: tauri::Error| error.to_string();
        let identifier = &app.config().identifier;
        Ok(Self {
            name: identifier.trim_start_matches("money.").replace('.', "-"),
            exe: env::current_exe().map_err(|error| error.to_string())?,
            home: app.path().home_dir().map_err(text)?,
            cache: app.path().app_cache_dir().map_err(text)?,
        })
    }

    fn extension(&self) -> PathBuf {
        self.home
            .join("Library/Application Support/Claude/Claude Extensions")
            .join(format!("local.mcpb.garner.{}", self.name))
    }

    fn manifest(&self) -> Json {
        let (first, rest) = self.name.split_at(1);
        json!({
            "manifest_version": "0.3",
            "name": self.name,
            "display_name": format!("{}{}", first.to_uppercase(), rest.replace('-', " ")),
            "version": env!("CARGO_PKG_VERSION"),
            "description": "Your portfolio, from Garner running on this machine.",
            "author": { "name": "Garner" },
            "server": {
                "type": "binary",
                "entry_point": self.exe,
                "mcp_config": { "command": self.exe, "args": ["mcp"] }
            }
        })
    }

    fn installed(&self, app: App) -> Option<PathBuf> {
        match app {
            App::Code => find("claude", &self.home),
            App::Codex => find("codex", &self.home),
            App::Desktop => Some(self.home.join("Library/Application Support/Claude"))
                .filter(|folder| folder.is_dir()),
        }
    }

    fn connected(&self, app: App, at: &Path) -> bool {
        let found = match app {
            App::Code => fs::read(self.home.join(".claude.json"))
                .ok()
                .and_then(|text| entry(&text, &["mcpServers", &self.name])),
            App::Codex => run(at, &["mcp", "get", &self.name, "--json"])
                .ok()
                .and_then(|text| entry(&text, &["transport"])),
            App::Desktop => fs::read(self.extension().join("manifest.json"))
                .ok()
                .and_then(|text| entry(&text, &["server", "mcp_config"])),
        };
        found.is_some_and(|entry| entry.command == self.exe && entry.args == ["mcp"])
    }

    fn connect(&self, app: App, at: &Path) -> io::Result<State> {
        let exe = self.exe.to_string_lossy();
        match app {
            App::Code => {
                let _ = run(at, &["mcp", "remove", "--scope", "user", &self.name]);
                run(
                    at,
                    &[
                        "mcp", "add", "--scope", "user", &self.name, "--", &exe, "mcp",
                    ],
                )?;
            }
            App::Codex => {
                run(at, &["mcp", "add", &self.name, "--", &exe, "mcp"])?;
            }
            App::Desktop => {
                let folder = self.cache.join("mcpb");
                let manifest = folder.join("manifest.json");
                let bundle = folder.join(format!("{}.mcpb", self.name));
                fs::create_dir_all(&folder)?;
                fs::write(&manifest, self.manifest().to_string())?;
                let _ = fs::remove_file(&bundle);
                run(
                    Path::new("/usr/bin/zip"),
                    &[
                        "-j",
                        "-q",
                        &bundle.to_string_lossy(),
                        &manifest.to_string_lossy(),
                    ],
                )?;
                run(Path::new("/usr/bin/open"), &[&bundle.to_string_lossy()])?;
                return Ok(State::Confirm);
            }
        }
        Ok(if self.connected(app, at) {
            State::Connected
        } else {
            State::Failed
        })
    }

    fn links(&self, connect: bool) -> Vec<Link> {
        [App::Code, App::Desktop, App::Codex]
            .into_iter()
            .filter_map(|app| {
                let at = self.installed(app)?;
                let state = match (self.connected(app, &at), connect) {
                    (true, _) => State::Connected,
                    (false, false) => State::Missing,
                    (false, true) => self.connect(app, &at).unwrap_or(State::Failed),
                };
                Some(Link { app, state })
            })
            .collect()
    }
}

#[tauri::command(async)]
pub fn links(app: AppHandle, connect: bool) -> Result<Vec<Link>, String> {
    let target = Target::new(&app)?;
    if connect
        && target
            .exe
            .components()
            .any(|part| part.as_os_str() == "AppTranslocation")
    {
        return Err(
            "Move Garner to the Applications folder, open it from there and connect again.".into(),
        );
    }
    Ok(target.links(connect))
}

#[tauri::command]
pub fn address(app: AppHandle) -> Result<String, String> {
    Ok(format!("{} mcp", Target::new(&app)?.exe.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(label: &str) -> Target {
        let home = env::temp_dir().join(format!("garner-connect-{}-{label}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        fs::create_dir_all(&home).unwrap();
        Target {
            name: "garner-dev".into(),
            exe: "/Applications/Garner.app/Contents/MacOS/garner".into(),
            cache: home.join("cache"),
            home,
        }
    }

    #[test]
    fn an_entry_is_read_from_each_config_shape() {
        let stdio = br#"{"mcpServers":{"garner":{"type":"stdio","command":"/a/garner","args":["mcp"],"env":{}}}}"#;
        let wanted = Entry {
            command: "/a/garner".into(),
            args: vec!["mcp".into()],
        };
        assert_eq!(entry(stdio, &["mcpServers", "garner"]), Some(wanted));
        let http = br#"{"mcpServers":{"garner":{"type":"http","url":"http://localhost:5173/host/mcp/x"}}}"#;
        assert_eq!(entry(http, &["mcpServers", "garner"]), None);
        assert_eq!(entry(stdio, &["mcpServers", "other"]), None);
        let codex = br#"{"name":"garner","transport":{"type":"stdio","command":"/a/garner","args":[],"env":null}}"#;
        assert_eq!(
            entry(codex, &["transport"]),
            Some(Entry {
                command: "/a/garner".into(),
                args: vec![]
            })
        );
        assert_eq!(entry(b"not json", &["transport"]), None);
    }

    #[test]
    fn claude_code_and_desktop_are_connected_only_to_this_binary() {
        let target = target("links");
        let nowhere = Path::new("/nowhere");
        assert_eq!(target.installed(App::Desktop), None);
        assert!(!target.connected(App::Code, nowhere));

        let config = |command: &str| json!({ "mcpServers": { "garner-dev": { "type": "stdio", "command": command, "args": ["mcp"] } } });
        fs::write(
            target.home.join(".claude.json"),
            config("/old/garner").to_string(),
        )
        .unwrap();
        assert!(!target.connected(App::Code, nowhere));
        fs::write(
            target.home.join(".claude.json"),
            config(&target.exe.to_string_lossy()).to_string(),
        )
        .unwrap();
        assert!(target.connected(App::Code, nowhere));

        let extension = target.extension();
        assert!(extension.ends_with("Claude/Claude Extensions/local.mcpb.garner.garner-dev"));
        fs::create_dir_all(&extension).unwrap();
        assert!(target.installed(App::Desktop).is_some());
        assert!(!target.connected(App::Desktop, nowhere));
        fs::write(
            extension.join("manifest.json"),
            target.manifest().to_string(),
        )
        .unwrap();
        assert!(target.connected(App::Desktop, nowhere));
    }

    #[test]
    fn the_bundle_manifest_points_at_this_binary() {
        let manifest = target("manifest").manifest();
        assert_eq!(manifest["name"], "garner-dev");
        assert_eq!(manifest["display_name"], "Garner dev");
        assert_eq!(manifest["server"]["type"], "binary");
        assert_eq!(
            manifest["server"]["mcp_config"],
            json!({ "command": "/Applications/Garner.app/Contents/MacOS/garner", "args": ["mcp"] })
        );
    }

    #[test]
    fn tools_are_found_beyond_the_launchd_path() {
        let target = target("find");
        assert_eq!(find("garner-no-such-tool", &target.home), None);
        fs::create_dir_all(target.home.join(".local/bin")).unwrap();
        fs::write(target.home.join(".local/bin/garner-no-such-tool"), "").unwrap();
        assert_eq!(
            find("garner-no-such-tool", &target.home),
            Some(target.home.join(".local/bin/garner-no-such-tool"))
        );
    }
}
