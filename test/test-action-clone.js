/*\
title: $:/plugins/rimir/appify/test/test-action-clone.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-clone widget: cloning sample apps into user namespace.

\*/
"use strict";

describe("appify: action-appify-clone", function() {

	var PREFIX_CONFIG = "$:/config/rimir/appify/clone-prefix";
	var DEFAULT_PREFIX = "$:/config/rimir/appify";
	var ACTIVE_APP = "$:/state/rimir/appify/active-app";
	var LLM_TAG = "$:/tags/rimir/llm-accessible";

	var SOURCE_TITLE = "$:/plugins/rimir/appify/samples/demo-app";
	var SOURCE_VIEW_MAIN = "$:/plugins/rimir/appify/samples/views/main-view";
	var SOURCE_VIEW_SIDEBAR = "$:/plugins/rimir/appify/samples/views/sidebar-view";

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

	function makeSource(extra) {
		return $tw.utils.extend({
			title: SOURCE_TITLE,
			text: "Sample app",
			tags: "appify-app " + LLM_TAG,
			"appify-view-main": SOURCE_VIEW_MAIN,
			"appify-view-sidebar": SOURCE_VIEW_SIDEBAR,
			"some-field": "keep-me"
		}, extra || {});
	}

	function makeViews() {
		return [
			{ title: SOURCE_VIEW_MAIN, text: "main view content", tags: "appify-view " + LLM_TAG, type: "text/vnd.tiddlywiki" },
			{ title: SOURCE_VIEW_SIDEBAR, text: "sidebar content", tags: "appify-view " + LLM_TAG }
		];
	}

	describe("basic cloning", function() {

		it("should create app tiddler at default prefix", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			var appTitle = DEFAULT_PREFIX + "/apps/My App";
			expect(wiki.tiddlerExists(appTitle)).toBe(true);
		});

		it("should copy non-view fields from source", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			var app = wiki.getTiddler(DEFAULT_PREFIX + "/apps/My App");
			expect(app.fields["some-field"]).toBe("keep-me");
			expect(app.fields.text).toBe("Sample app");
		});

		it("should set caption to the name parameter", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			var app = wiki.getTiddler(DEFAULT_PREFIX + "/apps/My App");
			expect(app.fields.caption).toBe("My App");
		});

		it("should clone view tiddlers to prefix/views/<baseName>", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			expect(wiki.tiddlerExists(DEFAULT_PREFIX + "/views/main-view")).toBe(true);
			expect(wiki.tiddlerExists(DEFAULT_PREFIX + "/views/sidebar-view")).toBe(true);

			var mainView = wiki.getTiddler(DEFAULT_PREFIX + "/views/main-view");
			expect(mainView.fields.text).toBe("main view content");
		});

		it("should rewrite appify-view-* fields to point to cloned views", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			var app = wiki.getTiddler(DEFAULT_PREFIX + "/apps/My App");
			expect(app.fields["appify-view-main"]).toBe(DEFAULT_PREFIX + "/views/main-view");
			expect(app.fields["appify-view-sidebar"]).toBe(DEFAULT_PREFIX + "/views/sidebar-view");
		});
	});

	describe("tag stripping", function() {

		it("should strip llm-accessible tag from cloned app", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			var app = wiki.getTiddler(DEFAULT_PREFIX + "/apps/My App");
			var tags = $tw.utils.parseStringArray(app.fields.tags);
			expect(tags.indexOf(LLM_TAG)).toBe(-1);
			expect(tags.indexOf("appify-app")).not.toBe(-1);
		});

		it("should strip llm-accessible tag from cloned views", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			var mainView = wiki.getTiddler(DEFAULT_PREFIX + "/views/main-view");
			var tags = $tw.utils.parseStringArray(mainView.fields.tags);
			expect(tags.indexOf(LLM_TAG)).toBe(-1);
			expect(tags.indexOf("appify-view")).not.toBe(-1);
		});
	});

	describe("activation", function() {

		it("should activate the cloned app", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="My App"/>');

			expect(wiki.getTiddlerText(ACTIVE_APP)).toBe(DEFAULT_PREFIX + "/apps/My App");
		});
	});

	describe("custom prefix", function() {

		it("should use custom prefix from config tiddler", function() {
			var wiki = setupWiki([
				makeSource(),
				{ title: PREFIX_CONFIG, text: "$:/user/apps" }
			].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="Custom"/>');

			expect(wiki.tiddlerExists("$:/user/apps/apps/Custom")).toBe(true);
			expect(wiki.tiddlerExists("$:/user/apps/views/main-view")).toBe(true);
		});

		it("should strip trailing slashes from prefix", function() {
			var wiki = setupWiki([
				makeSource(),
				{ title: PREFIX_CONFIG, text: "$:/user/apps///" }
			].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="Trimmed"/>');

			expect(wiki.tiddlerExists("$:/user/apps/apps/Trimmed")).toBe(true);
		});
	});

	describe("no-op guards", function() {

		it("should no-op if target already exists", function() {
			var appTitle = DEFAULT_PREFIX + "/apps/Existing";
			var wiki = setupWiki([
				makeSource(),
				{ title: appTitle, text: "original", caption: "Original" }
			].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '" name="Existing"/>');

			var app = wiki.getTiddler(appTitle);
			expect(app.fields.text).toBe("original");
			expect(app.fields.caption).toBe("Original");
		});

		it("should no-op if source does not exist", function() {
			var wiki = setupWiki([]);
			renderAndInvoke(wiki,
				'<$action-appify-clone source="NonExistentSource" name="Fail"/>');

			expect(wiki.tiddlerExists(DEFAULT_PREFIX + "/apps/Fail")).toBe(false);
		});

		it("should no-op if name is empty", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone source="' + SOURCE_TITLE + '"/>');

			// No app should be created (name defaults to empty)
			expect(wiki.getTiddlerText(ACTIVE_APP, "")).toBe("");
		});

		it("should no-op if source is empty", function() {
			var wiki = setupWiki([makeSource()].concat(makeViews()));
			renderAndInvoke(wiki,
				'<$action-appify-clone name="Orphan"/>');

			expect(wiki.tiddlerExists(DEFAULT_PREFIX + "/apps/Orphan")).toBe(false);
		});
	});
});
