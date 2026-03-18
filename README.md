# Appify

Transform TiddlyWiki into an app platform. Define full-viewport applications with named layouts, statewrap-powered state channels, and a floating launcher to switch between apps and the default wiki.

## Features

- **App layouts** — predefined grid templates (sidebar+main, topbar+sidebar+main, triple-column, dashboard)
- **Statewrap integration** — each app defines its own state channels and reactive rules
- **View binding** — each slot transcludes a tiddler that reads/writes channels by name
- **Floating app switcher** — always-visible FAB to launch apps or return to default wiki

## Quick start

1. Install the plugin (requires statewrap)
2. Create an app tiddler tagged `$:/tags/rimir/appify/app`
3. Set layout, channel, and view fields
4. Click the floating button (bottom-right) to launch

## App tiddler fields

| Field | Description |
|-------|-------------|
| `appify-layout` | Layout template name (e.g., `topbar-sidebar-main`) |
| `appify-channels` | Space-separated channel names for statewrap |
| `appify-default-<name>` | Default value for channel `<name>` |
| `appify-view-<slot>` | Tiddler title to transclude into slot `<slot>` |
| `caption` | Display name in app switcher |

## License

MIT
