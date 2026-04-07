/*\
title: $:/plugins/rimir/appify/test/test-action-layout.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-layout widget: layout switching with config persistence.

\*/
"use strict";

describe("appify: action-appify-layout", function() {

	var LAYOUT_PREFIX = "$:/plugins/rimir/appify/layouts/";
	var LAYOUT_CONFIG_PREFIX = "$:/config/rimir/appify/layout-config/";
	var SPLITS_PREFIX = "$:/config/rimir/appify/splits/";
	var PROPORTIONS_PREFIX = "$:/config/rimir/appify/proportions/";
	var APP_TITLE = "TestApp";

	function setupWiki(tiddlers) {
		var wiki = new $tw.Wiki();
		// Always add base layout tiddlers
		wiki.addTiddlers([
			{ title: LAYOUT_PREFIX + "sidebar-main", "appify-slots": "sidebar main" },
			{ title: LAYOUT_PREFIX + "focus", "appify-slots": "main" },
			{ title: LAYOUT_PREFIX + "triple", "appify-slots": "left center right" },
			{ title: LAYOUT_PREFIX + "dual-main", "appify-slots": "main secondary" }
		]);
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

	function getField(wiki, field) {
		var t = wiki.getTiddler(APP_TITLE);
		return t ? t.fields[field] : undefined;
	}

	function getJson(wiki, title) {
		var t = wiki.getTiddler(title);
		if(!t || !t.fields.text) return null;
		try { return JSON.parse(t.fields.text); } catch(e) { return null; }
	}

	function setJson(wiki, title, obj) {
		wiki.addTiddler(new $tw.Tiddler({
			title: title,
			type: "application/json",
			text: JSON.stringify(obj)
		}));
	}

	// --- basic switching ---

	describe("basic layout switching", function() {

		it("should set the new layout on the app tiddler", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			expect(getField(wiki, "appify-layout")).toBe("focus");
		});

		it("should default old layout to sidebar-main when field is missing", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			expect(getField(wiki, "appify-layout")).toBe("focus");
			// Should have saved old config under sidebar-main
			var saved = getJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main");
			expect(saved).not.toBeNull();
			expect(saved.views.sidebar).toBe("Nav");
		});
	});

	// --- saving config ---

	describe("saving current layout config", function() {

		it("should save view bindings for old layout slots", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			var saved = getJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main");
			expect(saved.views.sidebar).toBe("Nav");
			expect(saved.views.main).toBe("Content");
		});

		it("should save splits config", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-main": "Content" }
			]);
			setJson(wiki, SPLITS_PREFIX + APP_TITLE, {
				main: { direction: "horizontal", children: [{ view: "A" }, { view: "B" }], ratio: 0.5 }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			var saved = getJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main");
			expect(saved.splits).toBeDefined();
			expect(saved.splits.main).toBeDefined();
			expect(saved.splits.main.direction).toBe("horizontal");
		});

		it("should save proportions config", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-main": "Content" }
			]);
			setJson(wiki, PROPORTIONS_PREFIX + APP_TITLE, { sidebar: 0.3 });
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			var saved = getJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main");
			expect(saved.proportions).toBeDefined();
			expect(saved.proportions.sidebar).toBe(0.3);
		});

		it("should only save views for slots belonging to the old layout", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "focus", "appify-view-main": "Content", "appify-view-sidebar": "Stale" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="sidebar-main"/>');

			var saved = getJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/focus");
			expect(saved.views.main).toBe("Content");
			// sidebar is not a slot of the focus layout so it should not be saved
			expect(saved.views.sidebar).toBeUndefined();
		});
	});

	// --- restoring config ---

	describe("restoring saved config", function() {

		it("should restore view bindings from saved config", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			setJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/focus", {
				views: { main: "SavedFocusView" }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			expect(getField(wiki, "appify-view-main")).toBe("SavedFocusView");
		});

		it("should restore splits from saved config", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "focus", "appify-view-main": "Content" }
			]);
			var savedSplits = { sidebar: { direction: "vertical", children: [{ view: "X" }, { view: "Y" }], ratio: 0.4 } };
			setJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main", {
				views: { sidebar: "Nav", main: "Content" },
				splits: savedSplits
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="sidebar-main"/>');

			var splits = getJson(wiki, SPLITS_PREFIX + APP_TITLE);
			expect(splits.sidebar).toBeDefined();
			expect(splits.sidebar.direction).toBe("vertical");
		});

		it("should restore proportions from saved config", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "focus", "appify-view-main": "Content" }
			]);
			setJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main", {
				views: { sidebar: "Nav", main: "Content" },
				proportions: { sidebar: 0.25 }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="sidebar-main"/>');

			var proportions = getJson(wiki, PROPORTIONS_PREFIX + APP_TITLE);
			expect(proportions.sidebar).toBe(0.25);
		});

		it("should filter restored splits to only include new layout slots", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			setJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/focus", {
				views: { main: "Focused" },
				splits: { main: { direction: "horizontal", children: [{ view: "A" }, { view: "B" }], ratio: 0.5 }, sidebar: { direction: "vertical", children: [{ view: "X" }, { view: "Y" }], ratio: 0.5 } }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			var splits = getJson(wiki, SPLITS_PREFIX + APP_TITLE);
			expect(splits.main).toBeDefined();
			// sidebar is not a slot in focus layout, should be filtered out
			expect(splits.sidebar).toBeUndefined();
		});
	});

	// --- shared slot bindings ---

	describe("shared slot bindings", function() {

		it("should keep shared slot binding when no saved config exists", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "SharedView" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			// focus layout has "main" slot, which is shared with sidebar-main
			expect(getField(wiki, "appify-view-main")).toBe("SharedView");
		});

		it("should remove view fields for slots not in the new layout", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			// focus only has "main", so sidebar view should be gone
			expect(getField(wiki, "appify-view-sidebar")).toBeUndefined();
		});

		it("should prefer saved config over shared slot binding", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Current" }
			]);
			setJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/focus", {
				views: { main: "SavedView" }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			expect(getField(wiki, "appify-view-main")).toBe("SavedView");
		});
	});

	// --- cleanup ---

	describe("stale data cleanup", function() {

		it("should delete splits tiddler when no saved splits and no shared slots have splits", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			setJson(wiki, SPLITS_PREFIX + APP_TITLE, {
				sidebar: { direction: "vertical", children: [{ view: "A" }, { view: "B" }], ratio: 0.5 }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			// focus layout only has "main" slot, sidebar split should be cleaned
			var splits = getJson(wiki, SPLITS_PREFIX + APP_TITLE);
			expect(splits).toBeNull();
		});

		it("should keep splits for shared slots when no saved config", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			setJson(wiki, SPLITS_PREFIX + APP_TITLE, {
				main: { direction: "horizontal", children: [{ view: "A" }, { view: "B" }], ratio: 0.5 },
				sidebar: { direction: "vertical", children: [{ view: "X" }, { view: "Y" }], ratio: 0.5 }
			});
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			var splits = getJson(wiki, SPLITS_PREFIX + APP_TITLE);
			expect(splits).not.toBeNull();
			expect(splits.main).toBeDefined();
			expect(splits.sidebar).toBeUndefined();
		});

		it("should delete proportions tiddler when no saved proportions", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			setJson(wiki, PROPORTIONS_PREFIX + APP_TITLE, { sidebar: 0.3 });
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			var proportions = getJson(wiki, PROPORTIONS_PREFIX + APP_TITLE);
			expect(proportions).toBeNull();
		});
	});

	// --- no-op cases ---

	describe("no-op cases", function() {

		it("should be a no-op when switching to the same layout", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="sidebar-main"/>');

			expect(getField(wiki, "appify-layout")).toBe("sidebar-main");
			// No saved config should have been created
			var saved = getJson(wiki, LAYOUT_CONFIG_PREFIX + APP_TITLE + "/sidebar-main");
			expect(saved).toBeNull();
		});

		it("should be a no-op when new layout does not exist", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "Nav", "appify-view-main": "Content" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="nonexistent"/>');

			expect(getField(wiki, "appify-layout")).toBe("sidebar-main");
		});

		it("should be a no-op when app tiddler does not exist", function() {
			var wiki = setupWiki([]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');

			expect(wiki.getTiddler(APP_TITLE)).toBeUndefined();
		});

		it("should be a no-op when app attribute is empty", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="" layout="focus"/>');

			expect(getField(wiki, "appify-layout")).toBe("sidebar-main");
		});

		it("should be a no-op when layout attribute is empty", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main" }
			]);
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout=""/>');

			expect(getField(wiki, "appify-layout")).toBe("sidebar-main");
		});
	});

	// --- round-trip ---

	describe("round-trip switching", function() {

		it("should restore config when switching back to the original layout", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-layout": "sidebar-main", "appify-view-sidebar": "OrigNav", "appify-view-main": "OrigContent" }
			]);
			setJson(wiki, SPLITS_PREFIX + APP_TITLE, {
				main: { direction: "horizontal", children: [{ view: "A" }, { view: "B" }], ratio: 0.6 }
			});

			// Switch to focus
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="focus"/>');
			expect(getField(wiki, "appify-layout")).toBe("focus");

			// Switch back to sidebar-main
			renderAndInvoke(wiki, '<$action-appify-layout app="' + APP_TITLE + '" layout="sidebar-main"/>');
			expect(getField(wiki, "appify-layout")).toBe("sidebar-main");
			expect(getField(wiki, "appify-view-sidebar")).toBe("OrigNav");
			expect(getField(wiki, "appify-view-main")).toBe("OrigContent");

			var splits = getJson(wiki, SPLITS_PREFIX + APP_TITLE);
			expect(splits.main).toBeDefined();
			expect(splits.main.ratio).toBe(0.6);
		});
	});
});
