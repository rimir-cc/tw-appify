/*\
title: $:/plugins/rimir/appify/test/test-action-split.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-split widget: split, delete, set-view operations.

\*/
"use strict";

describe("appify: action-appify-split", function() {

	var CONFIG_PREFIX = "$:/config/rimir/appify/splits/";
	var APP_TITLE = "TestApp";
	var CONFIG_TITLE = CONFIG_PREFIX + APP_TITLE;

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

		// Find and invoke button
		var button = findWidget(widgetNode, "button");
		if(button) button.invokeActions(button, {});
	}

	function getConfig(wiki) {
		var tiddler = wiki.getTiddler(CONFIG_TITLE);
		if(!tiddler || !tiddler.fields.text) return {};
		try { return JSON.parse(tiddler.fields.text); } catch(e) { return {}; }
	}

	function setConfig(wiki, config) {
		wiki.addTiddler(new $tw.Tiddler({
			title: CONFIG_TITLE,
			type: "application/json",
			text: JSON.stringify(config)
		}));
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

	describe("split-h operation", function() {

		it("should create a horizontal split at root level", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-view-main": "MyView" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main" operation="split-h"/>');

			var config = getConfig(wiki);
			expect(config.main).toBeDefined();
			expect(config.main.direction).toBe("horizontal");
			expect(config.main.children.length).toBe(2);
			expect(config.main.children[0].view).toBe("MyView");
			expect(config.main.children[1].view).toBe("");
			expect(config.main.ratio).toBe(0.5);
		});

		it("should create a vertical split at root level", function() {
			var wiki = setupWiki([
				{ title: APP_TITLE, "appify-view-sidebar": "SideView" }
			]);
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="sidebar" operation="split-v"/>');

			var config = getConfig(wiki);
			expect(config.sidebar.direction).toBe("vertical");
			expect(config.sidebar.children[0].view).toBe("SideView");
		});

		it("should split a nested child", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [{ view: "A" }, { view: "B" }],
					ratio: 0.5
				}
			});
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main.1" operation="split-v"/>');

			var config = getConfig(wiki);
			expect(config.main.children[1].direction).toBe("vertical");
			expect(config.main.children[1].children[0].view).toBe("B");
			expect(config.main.children[1].children[1].view).toBe("");
		});
	});

	describe("delete operation", function() {

		it("should delete root split and revert to default", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [{ view: "A" }, { view: "B" }],
					ratio: 0.5
				}
			});
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main" operation="delete"/>');

			var config = getConfig(wiki);
			expect(config.main).toBeUndefined();
		});

		it("should promote sibling when deleting child 0", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [{ view: "A" }, { view: "B" }],
					ratio: 0.5
				}
			});
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main.0" operation="delete"/>');

			var config = getConfig(wiki);
			expect(config.main.view).toBe("B");
			expect(config.main.direction).toBeUndefined();
		});

		it("should promote sibling when deleting child 1", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [{ view: "A" }, { view: "B" }],
					ratio: 0.5
				}
			});
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main.1" operation="delete"/>');

			var config = getConfig(wiki);
			expect(config.main.view).toBe("A");
		});

		it("should handle nested delete correctly", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [
						{ view: "A" },
						{
							direction: "vertical",
							children: [{ view: "B" }, { view: "C" }],
							ratio: 0.5
						}
					],
					ratio: 0.6
				}
			});
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main.1.0" operation="delete"/>');

			var config = getConfig(wiki);
			// main.1 should now be the promoted sibling {view: "C"}
			expect(config.main.children[1].view).toBe("C");
			expect(config.main.children[1].direction).toBeUndefined();
		});
	});

	describe("set-view operation", function() {

		it("should set view on a leaf node", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [{ view: "A" }, { view: "" }],
					ratio: 0.5
				}
			});
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main.1" operation="set-view" value="NewView"/>');

			var config = getConfig(wiki);
			expect(config.main.children[1].view).toBe("NewView");
		});

		it("should create root config when setting view on unconfigured slot", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main" operation="set-view" value="CustomView"/>');

			var config = getConfig(wiki);
			expect(config.main.view).toBe("CustomView");
		});
	});

	describe("cleanup", function() {

		it("should remove root entry when leaf has empty view after delete", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setConfig(wiki, {
				main: {
					direction: "horizontal",
					children: [{ view: "" }, { view: "B" }],
					ratio: 0.5
				}
			});
			// Delete child 1 → promotes child 0 ({view: ""}) → cleanup removes it
			renderAndInvoke(wiki,
				'<$action-appify-split app="' + APP_TITLE + '" slot="main.1" operation="delete"/>');

			var config = getConfig(wiki);
			expect(config.main).toBeUndefined();
		});
	});
});
