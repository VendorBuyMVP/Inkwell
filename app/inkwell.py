#!/usr/bin/env python3
"""Linux desktop shell for Inkwell."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")

from gi.repository import Gio, Gtk, WebKit2  # noqa: E402


APP_ID = "io.github.VendorBuyMVP.Inkwell"
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
INDEX_FILE = FRONTEND_DIR / "index.html"
APP_ICON_FILE = Path(__file__).resolve().parent / "assets" / "icons" / "inkwell-512.png"
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
MAX_PREFERENCES_BYTES = 16 * 1024
PREFERENCES_FILE = Path.home() / ".config" / "inkwell" / "preferences.json"


class InkwellApp(Gtk.Application):
    def __init__(self, initial_paths: list[Path] | None = None) -> None:
        super().__init__(
            application_id=APP_ID,
            flags=Gio.ApplicationFlags.NON_UNIQUE,
        )
        self.initial_paths = initial_paths or []
        self.sessions: set[InkwellWindowSession] = set()

    def do_activate(self) -> None:
        self._prefer_dark_system_dialogs()
        paths = self.initial_paths or [None]
        self.initial_paths = []
        for path in paths:
            self.new_window(path)

    def new_window(self, initial_path: Path | None = None) -> None:
        session = InkwellWindowSession(self, initial_path)
        self.sessions.add(session)
        session.show()

    def remove_session(self, session: "InkwellWindowSession") -> None:
        self.sessions.discard(session)
        if not self.sessions:
            self.quit()

    def _set_window_icon(self, window: Gtk.ApplicationWindow) -> None:
        if not APP_ICON_FILE.exists():
            return

        try:
            window.set_icon_from_file(str(APP_ICON_FILE))
        except Exception:
            pass

    def _prefer_dark_system_dialogs(self) -> None:
        settings = Gtk.Settings.get_default()
        if settings:
            settings.set_property("gtk-application-prefer-dark-theme", True)

    def _configure_web_context(self, context: WebKit2.WebContext) -> None:
        context.set_cache_model(WebKit2.CacheModel.DOCUMENT_VIEWER)

        data_manager = context.get_website_data_manager()
        if data_manager:
            data_manager.set_persistent_credential_storage_enabled(False)
            data_manager.set_tls_errors_policy(WebKit2.TLSErrorsPolicy.FAIL)
            proxy = WebKit2.NetworkProxySettings.new("http://127.0.0.1:9", [])
            data_manager.set_network_proxy_settings(WebKit2.NetworkProxyMode.CUSTOM, proxy)

    def _configure_webview(self, webview: WebKit2.WebView) -> None:
        settings = webview.get_settings()
        self._set_setting(settings, "allow-file-access-from-file-urls", False)
        self._set_setting(settings, "allow-modal-dialogs", False)
        self._set_setting(settings, "allow-top-navigation-to-data-urls", False)
        self._set_setting(settings, "allow-universal-access-from-file-urls", False)
        self._set_setting(settings, "auto-load-images", False)
        self._set_setting(settings, "disable-web-security", False)
        self._set_setting(settings, "enable-2d-canvas-acceleration", False)
        self._set_setting(settings, "enable-accelerated-2d-canvas", False)
        self._set_setting(settings, "enable-dns-prefetching", False)
        self._set_setting(settings, "enable-developer-extras", False)
        self._set_setting(settings, "enable-encrypted-media", False)
        self._set_setting(settings, "enable-fullscreen", False)
        self._set_setting(settings, "enable-html5-database", False)
        self._set_setting(settings, "enable-html5-local-storage", False)
        self._set_setting(settings, "enable-hyperlink-auditing", False)
        self._set_setting(settings, "enable-media", False)
        self._set_setting(settings, "enable-media-capabilities", False)
        self._set_setting(settings, "enable-media-stream", False)
        self._set_setting(settings, "enable-mediasource", False)
        self._set_setting(settings, "enable-offline-web-application-cache", False)
        self._set_setting(settings, "enable-page-cache", False)
        self._set_setting(settings, "enable-plugins", False)
        self._set_setting(settings, "enable-site-specific-quirks", False)
        self._set_setting(settings, "enable-webaudio", False)
        self._set_setting(settings, "enable-webgl", False)
        self._set_setting(settings, "enable-webrtc", False)
        self._set_setting(settings, "enable-write-console-messages-to-stdout", False)
        self._set_setting(settings, "javascript-can-access-clipboard", False)
        self._set_setting(settings, "javascript-can-open-windows-automatically", False)
        self._set_setting(settings, "load-icons-ignoring-image-load-setting", False)
        self._set_setting(settings, "media-playback-allows-inline", False)
        self._set_setting(settings, "media-playback-requires-user-gesture", True)

        try:
            settings.set_property(
                "hardware-acceleration-policy",
                WebKit2.HardwareAccelerationPolicy.NEVER,
            )
        except TypeError:
            pass

    def _set_setting(self, settings: WebKit2.Settings, name: str, value: bool) -> None:
        try:
            settings.set_property(name, value)
        except TypeError:
            # WebKitGTK properties vary by distro version.
            pass

    def _load_preferences(self) -> dict[str, Any]:
        if not PREFERENCES_FILE.exists():
            return {"preferences": {"version": 1, "shortcuts": {}}}

        if PREFERENCES_FILE.stat().st_size > MAX_PREFERENCES_BYTES:
            raise ValueError("Preferences file is too large.")

        preferences = json.loads(PREFERENCES_FILE.read_text(encoding="utf-8"))
        return {"preferences": self._sanitize_preferences(preferences)}

    def _save_preferences(self, data: dict[str, Any]) -> dict[str, Any]:
        preferences = data.get("preferences")
        sanitized = self._sanitize_preferences(preferences)
        serialized = json.dumps(sanitized, sort_keys=True, separators=(",", ":"))
        if len(serialized.encode("utf-8")) > MAX_PREFERENCES_BYTES:
            raise ValueError("Preferences payload is too large.")

        PREFERENCES_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temp_file = PREFERENCES_FILE.with_suffix(".json.tmp")
        temp_file.write_text(serialized, encoding="utf-8")
        temp_file.chmod(0o600)
        temp_file.replace(PREFERENCES_FILE)
        try:
            PREFERENCES_FILE.chmod(0o600)
        except OSError:
            pass
        return {"preferences": sanitized}

    def _sanitize_preferences(self, preferences: object) -> dict[str, Any]:
        if not isinstance(preferences, dict):
            raise ValueError("Preferences must be an object.")

        allowed_keys = {"version", "shortcuts"}
        if any(key not in allowed_keys for key in preferences):
            raise ValueError("Preferences contain unsupported fields.")

        version = preferences.get("version", 1)
        if version != 1:
            raise ValueError("Unsupported preferences version.")

        shortcuts = preferences.get("shortcuts", {})
        if not isinstance(shortcuts, dict):
            raise ValueError("Shortcut preferences must be an object.")
        if len(shortcuts) > 80:
            raise ValueError("Too many shortcut preferences.")

        sanitized_shortcuts: dict[str, str] = {}
        for command, shortcut in shortcuts.items():
            if not isinstance(command, str) or not command:
                raise ValueError("Shortcut command names must be text.")
            if not command.replace("_", "").replace("-", "").isalnum():
                raise ValueError("Shortcut command names are invalid.")
            if not isinstance(shortcut, str):
                raise ValueError("Shortcut values must be text.")
            if len(command) > 64 or len(shortcut) > 64:
                raise ValueError("Shortcut preference value is too long.")
            sanitized_shortcuts[command] = shortcut

        return {"version": 1, "shortcuts": sanitized_shortcuts}


class InkwellWindowSession:
    def __init__(self, app: InkwellApp, initial_path: Path | None = None) -> None:
        self.app = app
        self.window: Gtk.ApplicationWindow | None = None
        self.webview: WebKit2.WebView | None = None
        self.current_path: Path | None = None
        self.initial_path = initial_path
        self.frontend_ready = False
        self.allow_window_close = False

        manager = WebKit2.UserContentManager()
        manager.register_script_message_handler("inkwell")
        manager.connect("script-message-received::inkwell", self._on_bridge_message)

        context = WebKit2.WebContext.new_ephemeral()
        self.app._configure_web_context(context)

        webview = WebKit2.WebView(
            web_context=context,
            user_content_manager=manager,
        )
        self.webview = webview
        self.app._configure_webview(webview)
        webview.connect("decide-policy", self._on_decide_policy)
        webview.connect("load-changed", self._on_load_changed)

        window = Gtk.ApplicationWindow(application=self.app)
        window.set_title("Inkwell")
        self.app._set_window_icon(window)
        window.set_default_size(1200, 780)
        window.set_position(Gtk.WindowPosition.CENTER)
        window.connect("delete-event", self._on_delete_event)
        window.connect("destroy", self._on_destroy)
        window.add(webview)
        self.window = window

    def show(self) -> None:
        if not self.window:
            return

        if not INDEX_FILE.exists():
            self._show_startup_error(f"Missing frontend file: {INDEX_FILE}")
            return

        self.window.show_all()
        if self.webview:
            self.webview.load_uri(INDEX_FILE.as_uri())

    def _on_load_changed(self, _webview: WebKit2.WebView, load_event: WebKit2.LoadEvent) -> None:
        if load_event == WebKit2.LoadEvent.FINISHED:
            self.frontend_ready = True
            self._load_initial_file()

    def _on_delete_event(self, _window: Gtk.ApplicationWindow, _event: object) -> bool:
        if self.allow_window_close or not self.frontend_ready:
            return False

        self._emit_event("closeRequest", {})
        return True

    def _on_destroy(self, _window: Gtk.ApplicationWindow) -> None:
        self.app.remove_session(self)

    def _on_decide_policy(
        self,
        _webview: WebKit2.WebView,
        decision: WebKit2.PolicyDecision,
        decision_type: WebKit2.PolicyDecisionType,
    ) -> bool:
        if decision_type not in (
            WebKit2.PolicyDecisionType.NAVIGATION_ACTION,
            WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION,
        ):
            return False

        request = decision.get_navigation_action().get_request()
        uri = request.get_uri() if request else ""
        if self._is_allowed_uri(uri):
            return False

        decision.ignore()
        self._emit_event(
            "security",
            {"message": "Blocked navigation outside the local app.", "uri": uri},
        )
        return True

    def _is_allowed_uri(self, uri: str) -> bool:
        parsed = urlparse(uri)
        if parsed.scheme == "about":
            return uri == "about:blank"
        if parsed.scheme != "file":
            return False

        try:
            path = Path(parsed.path).resolve()
        except OSError:
            return False

        return path == INDEX_FILE or FRONTEND_DIR in path.parents

    def _on_bridge_message(
        self,
        _manager: WebKit2.UserContentManager,
        message: object,
    ) -> None:
        try:
            raw = message.get_js_value().to_string()
            payload = json.loads(raw)
            request_id = payload.get("id")
            action = payload.get("action")
            data = payload.get("payload") or {}
            if not isinstance(data, dict):
                raise TypeError("payload must be an object")
        except (AttributeError, TypeError, json.JSONDecodeError) as exc:
            self._reply(None, False, error=f"Invalid bridge message: {exc}")
            return

        try:
            if action == "newFile":
                result = self._new_file()
            elif action == "newWindow":
                self.app.new_window()
                result = {}
            elif action == "openFile":
                result = self._open_file()
            elif action == "saveFile":
                result = self._save_file(data, force_dialog=False)
            elif action == "saveFileAs":
                result = self._save_file(data, force_dialog=True)
            elif action == "loadPreferences":
                result = self.app._load_preferences()
            elif action == "savePreferences":
                result = self.app._save_preferences(data)
            elif action == "closeWindow":
                self._reply(request_id, True, {})
                self._close_window()
                return
            else:
                raise ValueError(f"Unknown bridge action: {action}")
            self._reply(request_id, True, result)
        except UserCancelled:
            self._reply(request_id, False, error="cancelled")
        except Exception as exc:  # noqa: BLE001 - bridge reports user-facing failures.
            self._reply(request_id, False, error=str(exc))

    def _new_file(self) -> dict[str, str]:
        self.current_path = None
        return {"name": "Untitled.md"}

    def _open_file(self) -> dict[str, str]:
        dialog = Gtk.FileChooserDialog(
            title="Open Markdown",
            parent=self.window,
            action=Gtk.FileChooserAction.OPEN,
        )
        dialog.add_buttons("_Cancel", Gtk.ResponseType.CANCEL, "_Open", Gtk.ResponseType.ACCEPT)
        self._add_markdown_filters(dialog)

        try:
            if dialog.run() != Gtk.ResponseType.ACCEPT:
                raise UserCancelled()
            filename = dialog.get_filename()
        finally:
            dialog.destroy()

        if not filename:
            raise UserCancelled()

        path = Path(filename)
        return self._read_document(path)

    def _read_document(self, path: Path) -> dict[str, str]:
        self._assert_document_size(path)
        content = path.read_text(encoding="utf-8")
        self.current_path = path
        return {
            "name": path.name,
            "content": content,
        }

    def _load_initial_file(self) -> None:
        if not self.initial_path:
            return

        path = self.initial_path
        self.initial_path = None
        try:
            result = self._read_document(path)
        except Exception as exc:  # noqa: BLE001 - show open-with failures in the app.
            self._emit_event(
                "security",
                {"message": f"Could not open {path.name}: {exc}", "uri": str(path)},
            )
            return

        self._emit_event("documentLoaded", result)

    def _save_file(self, data: dict[str, str], force_dialog: bool) -> dict[str, str]:
        content = data.get("content", "")
        if not isinstance(content, str):
            raise ValueError("Document content must be text.")
        self._assert_content_size(content)

        path = self.current_path
        if force_dialog or path is None:
            path = self._choose_save_path(data.get("name") or "Untitled.md")

        path.write_text(content, encoding="utf-8")
        self.current_path = path
        return {
            "name": path.name,
        }

    def _choose_save_path(self, suggested_name: str) -> Path:
        dialog = Gtk.FileChooserDialog(
            title="Save Markdown",
            parent=self.window,
            action=Gtk.FileChooserAction.SAVE,
        )
        dialog.add_buttons("_Cancel", Gtk.ResponseType.CANCEL, "_Save", Gtk.ResponseType.ACCEPT)
        dialog.set_do_overwrite_confirmation(True)
        dialog.set_current_name(suggested_name)
        self._add_markdown_filters(dialog)

        try:
            if dialog.run() != Gtk.ResponseType.ACCEPT:
                raise UserCancelled()
            filename = dialog.get_filename()
        finally:
            dialog.destroy()

        if not filename:
            raise UserCancelled()

        return Path(filename)

    def _close_window(self) -> dict[str, str]:
        self.allow_window_close = True
        if self.window:
            self.window.destroy()
        return {}

    def _assert_document_size(self, path: Path) -> None:
        size = path.stat().st_size
        if size > MAX_DOCUMENT_BYTES:
            raise ValueError(
                f"File is too large for Inkwell v0 ({size} bytes, limit {MAX_DOCUMENT_BYTES} bytes)."
            )

    def _assert_content_size(self, content: str) -> None:
        size = len(content.encode("utf-8"))
        if size > MAX_DOCUMENT_BYTES:
            raise ValueError(
                f"Document is too large to save ({size} bytes, limit {MAX_DOCUMENT_BYTES} bytes)."
            )

    def _add_markdown_filters(self, dialog: Gtk.FileChooserDialog) -> None:
        markdown = Gtk.FileFilter()
        markdown.set_name("Markdown")
        markdown.add_mime_type("text/markdown")
        markdown.add_pattern("*.md")
        markdown.add_pattern("*.markdown")
        markdown.add_pattern("*.mdown")
        dialog.add_filter(markdown)

        text = Gtk.FileFilter()
        text.set_name("Text")
        text.add_mime_type("text/plain")
        text.add_pattern("*.txt")
        dialog.add_filter(text)

        all_files = Gtk.FileFilter()
        all_files.set_name("All files")
        all_files.add_pattern("*")
        dialog.add_filter(all_files)

    def _reply(
        self,
        request_id: str | None,
        ok: bool,
        data: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        payload = json.dumps(
            {
                "id": request_id,
                "ok": ok,
                "data": data or {},
                "error": error,
            }
        )
        self._run_js(f"window.InkwellBridgeResponse && window.InkwellBridgeResponse({payload});")

    def _emit_event(self, event_type: str, data: dict[str, str]) -> None:
        payload = json.dumps({"type": event_type, "data": data})
        self._run_js(f"window.InkwellBridgeEvent && window.InkwellBridgeEvent({payload});")

    def _run_js(self, script: str) -> None:
        if self.webview:
            if hasattr(self.webview, "evaluate_javascript"):
                self.webview.evaluate_javascript(script, -1, None, None, None, None, None)
            else:
                self.webview.run_javascript(script, None, None, None)

    def _show_startup_error(self, message: str) -> None:
        dialog = Gtk.MessageDialog(
            transient_for=self.window,
            modal=True,
            destroy_with_parent=True,
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.CLOSE,
            text="Inkwell could not start",
        )
        dialog.format_secondary_text(message)
        dialog.run()
        dialog.destroy()
        self.app.quit()


class UserCancelled(Exception):
    pass


def _initial_paths_from_args(args: list[str]) -> list[Path]:
    paths = []
    for arg in args:
        if arg.startswith("-"):
            continue
        paths.append(Path(arg).expanduser().resolve())
    return paths


def main() -> int:
    app = InkwellApp(_initial_paths_from_args(sys.argv[1:]))
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    raise SystemExit(main())
