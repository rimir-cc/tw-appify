# Appify

> App-like layouts with view switching, statewrap integration, and a floating app launcher

Transform TiddlyWiki into an app platform. Define full-viewport applications with named layouts, statewrap-powered state channels, and a floating launcher to switch between apps and the default wiki.

## Features

- **App layouts** -- predefined grid templates (sidebar+main, topbar+sidebar+main, triple-column, dashboard, focus) with named view slots
- **Statewrap integration** -- each app defines its own state channels and reactive rules
- **View binding** -- each slot transcludes a tiddler that reads/writes channels by name
- **Floating app switcher** -- always-visible FAB button to launch apps or return to the default wiki
- **Edit mode modals** -- channel editor, rule editor, debug inspector (Ctrl+M)
- **In-app tiddler editor** -- edit view tiddlers with the full TW EditTemplate in a draft-based overlay
- **Layout switching** -- switch layouts from the debug inspector; configs saved per layout and restored
- **Conditional panes** -- split panes with filter-based conditions; hidden panes collapse automatically
- **Stacked views (tab groups)** -- multiple views per pane with a tab bar and per-view conditions
- **Draggable grid borders** -- resize grid tracks and split panes by dragging
- **Clone & delete** -- clone blueprint apps/views into your namespace; delete with full cleanup
- **LLM integration** -- in-app chat panel (requires llm-connect)
- **Extensible** -- register apps via `$:/tags/rimir/appify/app`; views via `$:/tags/rimir/appify/view`

## Built-in layouts

| Name | Slots | Description |
|------|-------|-------------|
| `sidebar-main` | sidebar, main | Left sidebar + main content |
| `topbar-sidebar-main` | topbar, sidebar, main | Top bar + left sidebar + main content |
| `triple-column` | left, center, right | Three equal columns |
| `dashboard` | topbar, left, right | Top bar + two equal panels |
| `focus` | main | Single full-viewport pane |

## Quick start

1. Install the plugin (requires statewrap)
2. Open the sample app from the FAB (bottom-right)
3. Enter edit mode (Ctrl+M) and click Clone to create your own copy
4. Customize the cloned app -- edit views, add channels, change layouts

## Prerequisites

- TiddlyWiki 5.3.0 or later
- statewrap plugin

## Plugin Library

Install from the [rimir plugin library](https://rimir-cc.github.io/tw-plugin-library/) via *Control Panel > Plugins > Get more plugins*.

## Demo

Try this plugin in the [live demo wiki](https://rimir-cc.github.io/tw-demo/).

## License

MIT -- see [LICENSE.md](LICENSE.md)
