# Inkwell

Inkwell is a local Markdown editor for Linux.

It stores Markdown files locally and does not require accounts, sync, telemetry, or remote services. The current app uses GTK and WebKitGTK.

![Inkwell new document window](app/assets/windows/Inkwell_NewWindow.png)

## Features

- Open, save, save as, and new document workflows
- Multi-window editing
- Dark and light themes
- Keyboard shortcuts
- Markdown formatting for headings, emphasis, lists, quotes, code blocks, tables, task lists, and horizontal rules
- Basic table editing
- Word and character counts

## Requirements

- Git
- Python 3
- Node.js and npm
- GTK 3
- WebKitGTK 4.1 Python/GObject bindings
- desktop-file-utils

npm is used for project scripts.

On Debian or Ubuntu:

```bash
sudo apt install git nodejs npm python3 python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1 desktop-file-utils
```

Package names vary by distribution. On other Linux distributions, install the equivalent packages for Python 3, GTK 3, WebKitGTK 4.1 introspection bindings, Node.js, npm, and desktop-file-utils.

## Run from source

```bash
git clone https://github.com/VendorBuyMVP/Inkwell.git
cd Inkwell
npm run linux:run
```

Open a Markdown file directly:

```bash
npm run linux:run -- path/to/file.md
```

## Install locally

```bash
npm run linux:install
inkwell
```

The installer adds a desktop entry and registers Markdown file associations.

## WebKitGTK note

The Linux app currently uses WebKitGTK as the editor surface. It is configured for local files only and is not intended to browse the web or load remote content.

## Development

Run the project checks:

```bash
npm run check
```

Run the runtime no-network smoke check against the Linux launcher:

```bash
npm run security:runtime
```

## License

MIT
