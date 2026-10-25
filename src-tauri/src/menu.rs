use objc2::rc::Retained;
use objc2::runtime::NSObject;
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
use objc2_app_kit::{
    NSEvent, NSEventModifierFlags, NSEventType, NSImage, NSMenu, NSMenuItem, NSView,
};
use objc2_foundation::{NSPoint, NSString};
use serde::Deserialize;
use std::cell::RefCell;
use tauri::WebviewWindow;
use tauri::async_runtime::channel;
use tauri::ipc::Channel;

#[derive(Deserialize)]
pub struct Entry {
    label: String,
    symbol: String,
    separated: bool,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "GarnerMenuTarget"]
    #[ivars = Channel<isize>]
    struct Target;

    impl Target {
        #[unsafe(method(pick:))]
        fn pick(&self, item: &NSMenuItem) {
            let _ = self.ivars().send(item.tag());
        }
    }
);

thread_local! {
    static LAST: RefCell<Option<Retained<Target>>> = const { RefCell::new(None) };
}

#[tauri::command]
pub async fn menu(
    window: WebviewWindow,
    entries: Vec<Entry>,
    x: f64,
    y: f64,
    pick: Channel<isize>,
) -> Result<(), String> {
    let (done, mut closed) = channel(1);
    let view = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = done.try_send(show(&view, &entries, x, y, pick));
        })
        .map_err(|error| error.to_string())?;
    closed
        .recv()
        .await
        .flatten()
        .ok_or_else(|| "The menu could not open.".to_owned())
}

fn show(
    window: &WebviewWindow,
    entries: &[Entry],
    x: f64,
    y: f64,
    pick: Channel<isize>,
) -> Option<()> {
    let mtm = MainThreadMarker::new()?;
    let view: &NSView = unsafe { &*window.ns_view().ok()?.cast() };
    let target: Retained<Target> =
        unsafe { msg_send![super(Target::alloc(mtm).set_ivars(pick)), init] };
    let menu = NSMenu::new(mtm);
    menu.setAllowsContextMenuPlugIns(false);
    menu.setAutomaticallyInsertsWritingToolsItems(false);
    for (tag, entry) in (0..).zip(entries) {
        if entry.separated {
            menu.addItem(&NSMenuItem::separatorItem(mtm));
        }
        let item = NSMenuItem::new(mtm);
        item.setTitle(&NSString::from_str(&entry.label));
        item.setImage(
            NSImage::imageWithSystemSymbolName_accessibilityDescription(
                &NSString::from_str(&entry.symbol),
                None,
            )
            .as_deref(),
        );
        let _: () = unsafe { msg_send![&item, setPreferredImageVisibility: 1isize] };
        item.setTag(tag);
        unsafe {
            item.setTarget(Some(&target));
            item.setAction(Some(sel!(pick:)));
        }
        menu.addItem(&item);
    }
    let at = view.convertPoint_toView(NSPoint::new(x, view.frame().size.height - y), None);
    let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::RightMouseDown,
        at,
        NSEventModifierFlags::empty(),
        0.0,
        view.window()?.windowNumber(),
        None,
        0,
        1,
        1.0,
    )?;
    LAST.set(Some(target));
    NSMenu::popUpContextMenu_withEvent_forView(&menu, &event, view);
    Some(())
}
