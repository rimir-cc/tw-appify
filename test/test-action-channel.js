/*\
title: $:/plugins/rimir/appify/test/test-action-channel.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-channel widget: add, delete, rename, set-default operations.

\*/
"use strict";

describe("appify: action-appify-channel", function() {

	var APP_TITLE = "TestApp";

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

	function getChannelList(wiki) {
		var t = wiki.getTiddler(APP_TITLE);
		if(!t || !t.fields["appify-channels"]) return [];
		return t.fields["appify-channels"].split(/\s+/).filter(Boolean);
	}

	function getField(wiki, field) {
		var t = wiki.getTiddler(APP_TITLE);
		return t ? t.fields[field] : undefined;
	}

	// --- add operation ---

	describe("add operation", function() {

		it("should add a channel to an empty list", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="tab"/>');

			expect(getChannelList(wiki)).toEqual(["tab"]);
		});

		it("should append a channel to an existing list", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="mode"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "mode"]);
		});

		it("should be a no-op if channel already exists", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="tab"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "mode"]);
		});

		it("should set default value when provided", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="tab" value="overview"/>');

			expect(getChannelList(wiki)).toEqual(["tab"]);
			expect(getField(wiki, "appify-default-tab")).toBe("overview");
		});

		it("should not set default field when value is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="tab"/>');

			expect(getField(wiki, "appify-default-tab")).toBeUndefined();
		});

		it("should not set default when channel already exists even with value", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="tab" value="new-default"/>');

			expect(getField(wiki, "appify-default-tab")).toBeUndefined();
		});
	});

	// --- delete operation ---

	describe("delete operation", function() {

		it("should remove a channel from the list", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode priority" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="mode"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "priority"]);
		});

		it("should remove the default field for the deleted channel", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode", "appify-default-mode": "edit" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="mode"/>');

			expect(getField(wiki, "appify-default-mode")).toBeUndefined();
		});

		it("should produce empty channel list when deleting the only channel", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="tab"/>');

			expect(getChannelList(wiki)).toEqual([]);
		});

		it("should be a no-op if channel does not exist", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="nonexistent"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "mode"]);
		});

		it("should remove statewrap-rule when blocks referencing the channel from body", function() {
			var body = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="detail" value="info"/>\n</$statewrap-rule>\n\n' +
				'<$statewrap-rule when="mode">\n<$action-statewrap-set channel="panel" value="edit"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode", text: body }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="tab"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).not.toContain('when="tab"');
			expect(app.fields.text).toContain('when="mode"');
		});

		it("should remove action-statewrap-set lines targeting the channel from other rules", function() {
			var body = '<$statewrap-rule when="project">\n' +
				'<$action-statewrap-set channel="tab" value="details"/>\n' +
				'<$action-statewrap-set channel="mode" value="edit"/>\n' +
				'</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode", text: body }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="tab"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).not.toContain('channel="tab"');
			expect(app.fields.text).toContain('channel="mode"');
		});

		it("should clean up empty rule blocks after removing actions", function() {
			var body = '<$statewrap-rule when="project">\n' +
				'<$action-statewrap-set channel="tab" value="details"/>\n' +
				'</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", text: body }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="tab"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).not.toContain('statewrap-rule');
		});

		it("should not modify body when there are no rules", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", text: "" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="delete" channel="tab"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toBe("");
		});
	});

	// --- rename operation ---

	describe("rename operation", function() {

		it("should rename a channel in the list", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="tab" value="detail-tab"/>');

			expect(getChannelList(wiki)).toEqual(["detail-tab", "mode"]);
		});

		it("should migrate the default field to the new name", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", "appify-default-tab": "overview" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="tab" value="detail-tab"/>');

			expect(getField(wiki, "appify-default-tab")).toBeUndefined();
			expect(getField(wiki, "appify-default-detail-tab")).toBe("overview");
		});

		it("should rename when attribute in rule blocks", function() {
			var body = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="detail" value="info"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", text: body }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="tab" value="main-tab"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('when="main-tab"');
			expect(app.fields.text).not.toContain('when="tab"');
		});

		it("should rename channel attribute in action-statewrap-set", function() {
			var body = '<$statewrap-rule when="project">\n<$action-statewrap-set channel="tab" value="details"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", text: body }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="tab" value="main-tab"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('channel="main-tab"');
			expect(app.fields.text).not.toContain('channel="tab"');
		});

		it("should be a no-op when renaming to the same name", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="tab" value="tab"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "mode"]);
		});

		it("should be a no-op when value is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="tab"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "mode"]);
		});

		it("should be a no-op when channel does not exist in list", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab mode" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="rename" channel="nonexistent" value="newname"/>');

			expect(getChannelList(wiki)).toEqual(["tab", "mode"]);
		});
	});

	// --- set-default operation ---

	describe("set-default operation", function() {

		it("should set the default value for a channel", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="set-default" channel="tab" value="overview"/>');

			expect(getField(wiki, "appify-default-tab")).toBe("overview");
		});

		it("should clear the default when value is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", "appify-default-tab": "overview" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="set-default" channel="tab"/>');

			expect(getField(wiki, "appify-default-tab")).toBeUndefined();
		});

		it("should be a no-op when channel is not in the list", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="set-default" channel="nonexistent" value="something"/>');

			expect(getField(wiki, "appify-default-nonexistent")).toBeUndefined();
		});

		it("should overwrite existing default", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", "appify-default-tab": "old" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="set-default" channel="tab" value="new"/>');

			expect(getField(wiki, "appify-default-tab")).toBe("new");
		});
	});

	// --- edge cases ---

	describe("edge cases", function() {

		it("should do nothing for unknown operation", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="bogus" channel="tab"/>');

			expect(getChannelList(wiki)).toEqual(["tab"]);
		});

		it("should do nothing when app tiddler does not exist", function() {
			var wiki = setupWiki([]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="tab"/>');

			expect(wiki.getTiddler(APP_TITLE)).toBeUndefined();
		});

		it("should do nothing when channel attribute is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel=""/>');

			expect(getChannelList(wiki)).toEqual(["tab"]);
		});

		it("should do nothing when app attribute is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="" operation="add" channel="new"/>');

			expect(getChannelList(wiki)).toEqual(["tab"]);
		});

		it("should preserve other fields on the tiddler", function() {
			var wiki = setupWiki([{ title: APP_TITLE, "appify-channels": "tab", tags: "MyTag", "appify-layout": "sidebar-main" }]);
			renderAndInvoke(wiki, '<$action-appify-channel app="' + APP_TITLE + '" operation="add" channel="mode"/>');

			var t = wiki.getTiddler(APP_TITLE);
			expect(t.fields.tags).toContain("MyTag");
			expect(t.fields["appify-layout"]).toBe("sidebar-main");
		});
	});
});
