/*\
title: $:/plugins/rimir/appify/test/test-action-delete.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-delete widget: cascading delete of app and associated tiddlers.

\*/
"use strict";

describe("appify: action-appify-delete", function() {

	var ACTIVE_APP = "$:/state/rimir/appify/active-app";
	var EDIT_MODE = "$:/state/rimir/appify/edit-mode";
	var SPLITS_PREFIX = "$:/config/rimir/appify/splits/";
	var PROPORTIONS_PREFIX = "$:/config/rimir/appify/proportions/";
	var LAYOUT_CONFIG_PREFIX = "$:/config/rimir/appify/layout-config/";

	var APP_TITLE = "MyApp";

	function setupWiki(tiddlers) {
		var wiki = new $tw.Wiki();
		wiki.addTiddlers(tiddlers || []);
		wiki.addIndexersToWiki();
		return wiki;
	}

	function renderAndInvoke(wiki, actionWikitext) {
		var text = '<$button>' + actionWikitext + 'click</$button>';
		var parser = wiki.parseText("text/vnd.tiddlywiki", text, { parseAsInline: false });
		var widgetNode = wiki.makeWidget(parser, { document: $tw.fakeDocument });
		var container = $tw.fakeDocument.createElement("div");
		widgetNode.render(container, null);

		var button = findWidget(widgetNode, "button");
		if(button) button.invokeActions(button, {});
	}

	function findWidget(widget, typeName) {
		if(widget.parseTreeNode && widget.parseTreeNode.type === typeName) return widget;
		if(widget.children) {
			for(var i = 0; i < widget.children.length; i++) {
				var found = findWidget(widget.children[i], typeName);
				if(found) return found;
			}
		}
		return null;
	}

	describe("app tiddler deletion", function() {

		it("should delete the app tiddler", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, text: "app content" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists(APP_TITLE)).toBe(false);
		});
	});

	describe("view tiddler deletion", function() {

		it("should delete all view tiddlers referenced in appify-view-* fields", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-view-main": "ViewMain", "appify-view-sidebar": "ViewSidebar" },
				{ title: "ViewMain", text: "main" },
				{ title: "ViewSidebar", text: "sidebar" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists("ViewMain")).toBe(false);
			expect(wiki.tiddlerExists("ViewSidebar")).toBe(false);
		});

		it("should not fail when view tiddler does not exist", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-view-main": "NonExistentView" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists(APP_TITLE)).toBe(false);
		});
	});

	describe("config tiddler deletion", function() {

		it("should delete splits config tiddler", function() {
			var splitsTitle = SPLITS_PREFIX + APP_TITLE;
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: splitsTitle, text: '{"main":{}}' }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists(splitsTitle)).toBe(false);
		});

		it("should delete proportions config tiddler", function() {
			var proportionsTitle = PROPORTIONS_PREFIX + APP_TITLE;
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: proportionsTitle, text: '{"main":0.5}' }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists(proportionsTitle)).toBe(false);
		});

		it("should delete all layout-config tiddlers matching the app prefix", function() {
			var layoutA = LAYOUT_CONFIG_PREFIX + APP_TITLE + "/desktop";
			var layoutB = LAYOUT_CONFIG_PREFIX + APP_TITLE + "/mobile";
			var otherLayout = LAYOUT_CONFIG_PREFIX + "OtherApp/desktop";
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: layoutA, text: "layout-a" },
				{ title: layoutB, text: "layout-b" },
				{ title: otherLayout, text: "other" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists(layoutA)).toBe(false);
			expect(wiki.tiddlerExists(layoutB)).toBe(false);
			expect(wiki.tiddlerExists(otherLayout)).toBe(true);
		});
	});

	describe("deactivation", function() {

		it("should deactivate app if it was the active app", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: ACTIVE_APP, text: APP_TITLE },
				{ title: EDIT_MODE, text: "yes" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.getTiddlerText(ACTIVE_APP)).toBe("");
			expect(wiki.getTiddlerText(EDIT_MODE)).toBe("no");
		});

		it("should not deactivate a different active app", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: ACTIVE_APP, text: "OtherApp" },
				{ title: EDIT_MODE, text: "yes" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.getTiddlerText(ACTIVE_APP)).toBe("OtherApp");
			expect(wiki.getTiddlerText(EDIT_MODE)).toBe("yes");
		});
	});

	describe("shadow tiddler protection", function() {

		it("should not delete shadow-only tiddlers", function() {
			var shadowTitle = "$:/plugins/rimir/appify/samples/demo-app";
			var wiki = setupWiki([]);
			// Add as shadow tiddler (via plugin info)
			var pluginInfo = {
				title: "$:/plugins/rimir/appify",
				type: "application/json",
				"plugin-type": "plugin",
				text: JSON.stringify({ tiddlers: {
					"$:/plugins/rimir/appify/samples/demo-app": {
						title: shadowTitle,
						text: "shadow content",
						"appify-view-main": "ShadowView"
					}
				}})
			};
			wiki.addTiddler(new $tw.Tiddler(pluginInfo));
			wiki.readPluginInfo();
			wiki.registerPluginTiddlers("plugin");
			wiki.unpackPluginTiddlers();

			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + shadowTitle + '"/>');

			// Shadow should still be accessible
			expect(wiki.isShadowTiddler(shadowTitle)).toBe(true);
			expect(wiki.getTiddler(shadowTitle)).toBeDefined();
		});
	});

	describe("no-op guards", function() {

		it("should no-op when app parameter is empty", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete/>');

			expect(wiki.tiddlerExists(APP_TITLE)).toBe(true);
		});

		it("should no-op when app tiddler does not exist", function() {
			var wiki = setupWiki([]);
			// Should not throw
			renderAndInvoke(wiki,
				'<$action-appify-delete app="NonExistent"/>');

			// Just verify no crash
			expect(true).toBe(true);
		});
	});

	describe("full cascading delete", function() {

		it("should delete app, views, splits, proportions, layouts, and deactivate", function() {
			var splitsTitle = SPLITS_PREFIX + APP_TITLE;
			var proportionsTitle = PROPORTIONS_PREFIX + APP_TITLE;
			var layoutTitle = LAYOUT_CONFIG_PREFIX + APP_TITLE + "/default";
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-view-main": "ViewA", "appify-view-side": "ViewB" },
				{ title: "ViewA", text: "a" },
				{ title: "ViewB", text: "b" },
				{ title: splitsTitle, text: "{}" },
				{ title: proportionsTitle, text: "{}" },
				{ title: layoutTitle, text: "layout" },
				{ title: ACTIVE_APP, text: APP_TITLE },
				{ title: EDIT_MODE, text: "yes" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-delete app="' + APP_TITLE + '"/>');

			expect(wiki.tiddlerExists(APP_TITLE)).toBe(false);
			expect(wiki.tiddlerExists("ViewA")).toBe(false);
			expect(wiki.tiddlerExists("ViewB")).toBe(false);
			expect(wiki.tiddlerExists(splitsTitle)).toBe(false);
			expect(wiki.tiddlerExists(proportionsTitle)).toBe(false);
			expect(wiki.tiddlerExists(layoutTitle)).toBe(false);
			expect(wiki.getTiddlerText(ACTIVE_APP)).toBe("");
			expect(wiki.getTiddlerText(EDIT_MODE)).toBe("no");
		});
	});
});
