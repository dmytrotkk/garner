mod connect;
mod fetch;
mod icons;
mod mcp;
mod menu;
mod sql;

use objc2::MainThreadMarker;
use objc2_app_kit::{NSToolbar, NSWindow, NSWindowToolbarStyle, NSWorkspace};
use objc2_foundation::{NSString, NSURL};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use std::{env, panic};
use tauri::webview::NewWindowResponse;
use tauri::{Manager, RunEvent, Url, WebviewWindowBuilder, WindowEvent};

fn origin(url: &Url) -> (&str, Option<&str>, Option<u16>) {
    (url.scheme(), url.host_str(), url.port_or_known_default())
}

fn browse(url: &Url) {
    if url.scheme() == "https"
        && let Some(url) = NSURL::URLWithString(&NSString::from_str(url.as_str()))
    {
        NSWorkspace::sharedWorkspace().openURL(&url);
    }
}

fn log_panics(logs: PathBuf) {
    let report = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|time| time.as_secs())
            .unwrap_or_default();
        let _ = fs::create_dir_all(&logs).and_then(|()| {
            let mut file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(logs.join("panic.log"))?;
            writeln!(file, "{at} {} {info}", env!("CARGO_PKG_VERSION"))
        });
        report(info);
    }));
}

fn main() {
    let context = tauri::generate_context!();
    log_panics(
        PathBuf::from(env::var_os("HOME").unwrap_or_default())
            .join("Library/Logs")
            .join(&context.config().identifier),
    );
    let socket = mcp::socket(&context.config().identifier);
    if env::args().nth(1).as_deref() == Some("mcp") {
        mcp::shim(&socket)
    }
    if mcp::running(&socket) {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(mcp::Relay::new(socket))
        .invoke_handler(tauri::generate_handler![
            sql::query,
            sql::batch,
            sql::migrate,
            sql::backup,
            fetch::fetch,
            icons::icon,
            mcp::mcp_listen,
            mcp::mcp_reply,
            menu::menu,
            connect::links,
            connect::address
        ])
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(sql::Sql::open(&data.join("garner.db"))?);
            app.manage(fetch::client()?);
            let home = match &app.config().build.dev_url {
                Some(url) if tauri::is_dev() => url.clone(),
                _ => Url::parse("tauri://localhost")?,
            };
            let window =
                WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                    .on_navigation(move |url| origin(url) == origin(&home))
                    .on_new_window(|url, _| {
                        browse(&url);
                        NewWindowResponse::Deny
                    })
                    .build()?;
            let ns_window: &NSWindow = unsafe { &*window.ns_window()?.cast() };
            ns_window.setExcludedFromWindowsMenu(true);
            if let Some(thread) = MainThreadMarker::new() {
                ns_window.setToolbar(Some(&NSToolbar::new(thread)));
                ns_window.setToolbarStyle(NSWindowToolbarStyle::Unified);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(context)
        .expect("garner failed to start")
        .run(|app, event| {
            if let RunEvent::Reopen { .. } = event
                && let Some(window) = app.get_webview_window("main")
            {
                let _ = window.show();
                let _ = window.set_focus();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn a_panic_is_appended_to_the_log_with_the_version() {
        let logs = env::temp_dir().join(format!("garner-panic-{}", std::process::id()));
        log_panics(logs.clone());
        assert!(thread::spawn(|| panic!("boom")).join().is_err());
        let log = fs::read_to_string(logs.join("panic.log")).unwrap();
        assert!(log.contains(env!("CARGO_PKG_VERSION")) && log.contains("boom"));
        fs::remove_dir_all(logs).unwrap();
    }
}
