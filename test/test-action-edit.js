/*\
title: $:/plugins/rimir/appify/test/test-action-edit.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-edit widget: open, save, cancel draft lifecycle.

\*/
"use strict";

describe("appify: action-appify-edit", function() {

	var EDIT_STATE_PREFIX = "$:/state/rimir/appify/edit-target/";
	var APP_TITLE = "TestApp";
	var STATE_TITLE = EDIT_STATE_PREFIX + APP_TITLE;
	var TARGET_TITLE = "MyTiddler";
	var DRAFT_TITLE = "Draft of 'MyTiddler'";

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

	describe("open operation", function() {

		it("should create a draft tiddler with all fields copied", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "hello", tags: "foo bar", custom: "value" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');

			var draft = wiki.getTiddler(DRAFT_TITLE);
			expect(draft).toBeDefined();
			expect(draft.fields.text).toBe("hello");
			expect(draft.fields.custom).toBe("value");
		});

		it("should set draft.of and draft.title on the draft", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "content" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');

			var draft = wiki.getTiddler(DRAFT_TITLE);
			expect(draft.fields["draft.of"]).toBe(TARGET_TITLE);
			expect(draft.fields["draft.title"]).toBe(TARGET_TITLE);
		});

		it("should set the draft title to Draft of '<title>'", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');

			var draft = wiki.getTiddler(DRAFT_TITLE);
			expect(draft).toBeDefined();
			expect(draft.fields.title).toBe(DRAFT_TITLE);
		});

		it("should store draft title in state tiddler", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');

			expect(wiki.getTiddlerText(STATE_TITLE)).toBe(DRAFT_TITLE);
		});

		it("should no-op when tiddler parameter is missing", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="open"/>');

			expect(wiki.getTiddler(STATE_TITLE)).toBeUndefined();
		});

		it("should no-op when target tiddler does not exist", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="NonExistent" operation="open"/>');

			expect(wiki.getTiddler(STATE_TITLE)).toBeUndefined();
		});
	});

	describe("save operation", function() {

		it("should copy draft fields back to original tiddler", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "old", custom: "old-val" }
			]);
			// Open first
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			// Modify draft
			var draft = wiki.getTiddler(DRAFT_TITLE);
			wiki.addTiddler(new $tw.Tiddler(draft, { text: "new", custom: "new-val" }));
			// Save
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			var saved = wiki.getTiddler(TARGET_TITLE);
			expect(saved.fields.text).toBe("new");
			expect(saved.fields.custom).toBe("new-val");
		});

		it("should exclude draft.of and draft.title from saved tiddler", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			var saved = wiki.getTiddler(TARGET_TITLE);
			expect(saved.fields["draft.of"]).toBeUndefined();
			expect(saved.fields["draft.title"]).toBeUndefined();
		});

		it("should delete draft tiddler after save", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			expect(wiki.tiddlerExists(DRAFT_TITLE)).toBe(false);
		});

		it("should clear state tiddler after save", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			expect(wiki.tiddlerExists(STATE_TITLE)).toBe(false);
		});

		it("should restore original title on saved tiddler", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			expect(wiki.tiddlerExists(TARGET_TITLE)).toBe(true);
			expect(wiki.getTiddler(TARGET_TITLE).fields.title).toBe(TARGET_TITLE);
		});

		it("should clear state gracefully when draft is missing", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: STATE_TITLE, text: "Draft of 'Ghost'" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			expect(wiki.tiddlerExists(STATE_TITLE)).toBe(false);
		});

		it("should no-op when state tiddler is empty", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="save"/>');

			// Nothing should crash; state stays absent
			expect(wiki.tiddlerExists(STATE_TITLE)).toBe(false);
		});
	});

	describe("cancel operation", function() {

		it("should delete draft and clear state", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			expect(wiki.tiddlerExists(DRAFT_TITLE)).toBe(true);

			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="cancel"/>');

			expect(wiki.tiddlerExists(DRAFT_TITLE)).toBe(false);
			expect(wiki.tiddlerExists(STATE_TITLE)).toBe(false);
		});

		it("should leave original tiddler unchanged", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "original", custom: "keep" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '" operation="open"/>');
			// Modify draft
			var draft = wiki.getTiddler(DRAFT_TITLE);
			wiki.addTiddler(new $tw.Tiddler(draft, { text: "modified" }));

			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="cancel"/>');

			var original = wiki.getTiddler(TARGET_TITLE);
			expect(original.fields.text).toBe("original");
			expect(original.fields.custom).toBe("keep");
		});

		it("should clear state even when no draft exists", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: STATE_TITLE, text: "" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" operation="cancel"/>');

			expect(wiki.tiddlerExists(STATE_TITLE)).toBe(false);
		});
	});

	describe("no-op guards", function() {

		it("should no-op when app is missing", function() {
			var wiki = setupWiki([
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit tiddler="' + TARGET_TITLE + '" operation="open"/>');

			expect(wiki.tiddlerExists("Draft of '" + TARGET_TITLE + "'")).toBe(false);
		});

		it("should no-op when operation is missing", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE },
				{ title: TARGET_TITLE, text: "x" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-edit app="' + APP_TITLE + '" tiddler="' + TARGET_TITLE + '"/>');

			expect(wiki.tiddlerExists(STATE_TITLE)).toBe(false);
		});
	});
});
