/*\
title: $:/plugins/rimir/appify/test/test-action-rule.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for appify action-appify-rule widget: parse, apply, delete-rule, add-action operations.

\*/
"use strict";

describe("appify: action-appify-rule", function() {

	var RULES_TEMP_PREFIX = "$:/temp/rimir/appify/rules/";
	var APP_TITLE = "TestApp";
	var TEMP_TITLE = RULES_TEMP_PREFIX + APP_TITLE;

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

	function getTempRules(wiki) {
		var tiddler = wiki.getTiddler(TEMP_TITLE);
		if(!tiddler || !tiddler.fields.text) return [];
		try { return JSON.parse(tiddler.fields.text); } catch(e) { return []; }
	}

	function setTempRules(wiki, rules) {
		wiki.addTiddler(new $tw.Tiddler({
			title: TEMP_TITLE,
			type: "application/json",
			text: JSON.stringify(rules, null, 2)
		}));
	}

	function makeRuleWikitext(rules) {
		var lines = [];
		for(var i = 0; i < rules.length; i++) {
			var rule = rules[i];
			lines.push('<$statewrap-rule when="' + rule.when + '">');
			for(var j = 0; j < rule.actions.length; j++) {
				var a = rule.actions[j];
				lines.push('<$action-statewrap-set channel="' + a.channel + '" value="' + a.value + '"/>');
			}
			lines.push('</$statewrap-rule>');
			if(i < rules.length - 1) lines.push('');
		}
		return lines.join('\n') + '\n';
	}

	// --- parse operation ---

	describe("parse operation", function() {

		it("should parse a single rule from app body", function() {
			var body = '<$statewrap-rule when="channel">\n<$action-statewrap-set channel="ch" value="val"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: body }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
			expect(rules[0].when).toBe("channel");
			expect(rules[0].actions.length).toBe(1);
			expect(rules[0].actions[0].channel).toBe("ch");
			expect(rules[0].actions[0].value).toBe("val");
		});

		it("should parse multiple rules", function() {
			var body = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="detail" value="info"/>\n</$statewrap-rule>\n\n' +
				'<$statewrap-rule when="mode">\n<$action-statewrap-set channel="panel" value="edit"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: body }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(2);
			expect(rules[0].when).toBe("tab");
			expect(rules[1].when).toBe("mode");
		});

		it("should parse a rule with multiple actions", function() {
			var body = '<$statewrap-rule when="project">\n' +
				'<$action-statewrap-set channel="task" value="open"/>\n' +
				'<$action-statewrap-set channel="panel" value="details"/>\n' +
				'</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: body }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
			expect(rules[0].actions.length).toBe(2);
			expect(rules[0].actions[0].channel).toBe("task");
			expect(rules[0].actions[1].channel).toBe("panel");
		});

		it("should return empty array for empty body", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "" }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(0);
		});

		it("should return empty array for body with no rules", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "Just some plain wikitext content." }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(0);
		});

		it("should return empty array when app has no text field", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(0);
		});

		it("should skip actions without a channel attribute", function() {
			var body = '<$statewrap-rule when="tab">\n' +
				'<$action-statewrap-set value="orphan"/>\n' +
				'<$action-statewrap-set channel="valid" value="ok"/>\n' +
				'</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: body }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules[0].actions.length).toBe(1);
			expect(rules[0].actions[0].channel).toBe("valid");
		});

		it("should parse value as empty string when value attribute is missing", function() {
			var body = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="ch"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: body }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var rules = getTempRules(wiki);
			expect(rules[0].actions[0].value).toBe("");
		});

		it("should do nothing when app tiddler does not exist", function() {
			var wiki = setupWiki([]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');

			var tiddler = wiki.getTiddler(TEMP_TITLE);
			expect(tiddler).toBeUndefined();
		});
	});

	// --- apply operation ---

	describe("apply operation", function() {

		it("should generate wikitext from rule JSON", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "old body" }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "detail", value: "info" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('<$statewrap-rule when="tab">');
			expect(app.fields.text).toContain('<$action-statewrap-set channel="detail" value="info"/>');
			expect(app.fields.text).toContain('</$statewrap-rule>');
		});

		it("should generate wikitext for multiple rules", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "" }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] },
				{ when: "mode", actions: [{ channel: "b", value: "2" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('when="tab"');
			expect(app.fields.text).toContain('when="mode"');
		});

		it("should generate wikitext for a rule with multiple actions", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "" }]);
			setTempRules(wiki, [
				{ when: "project", actions: [
					{ channel: "task", value: "open" },
					{ channel: "panel", value: "details" }
				]}
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('channel="task" value="open"');
			expect(app.fields.text).toContain('channel="panel" value="details"');
		});

		it("should produce empty body for empty rules array", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "old content" }]);
			setTempRules(wiki, []);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toBe("");
		});

		it("should produce empty body when temp tiddler does not exist", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "old content" }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toBe("");
		});

		it("should preserve non-text fields on app tiddler", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "", "appify-channels": "tab mode", tags: "MyTag" }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "detail", value: "x" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields["appify-channels"]).toBe("tab mode");
			expect(app.fields.tags).toContain("MyTag");
		});

		it("should escape special characters in attribute values", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "" }]);
			setTempRules(wiki, [
				{ when: "test&case", actions: [{ channel: "ch<1>", value: 'val"ue' }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('when="test&amp;case"');
			expect(app.fields.text).toContain('channel="ch&lt;1&gt;"');
			expect(app.fields.text).toContain('value="val&quot;ue"');
		});

		it("should skip rules with no when value", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "" }]);
			setTempRules(wiki, [
				{ when: "", actions: [{ channel: "a", value: "1" }] },
				{ when: "valid", actions: [{ channel: "b", value: "2" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).not.toContain('when=""');
			expect(app.fields.text).toContain('when="valid"');
		});

		it("should skip rules with empty actions array", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "" }]);
			setTempRules(wiki, [
				{ when: "empty", actions: [] },
				{ when: "valid", actions: [{ channel: "b", value: "2" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).not.toContain('when="empty"');
			expect(app.fields.text).toContain('when="valid"');
		});
	});

	// --- delete-rule operation ---

	describe("delete-rule operation", function() {

		it("should remove a rule by when value", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] },
				{ when: "mode", actions: [{ channel: "b", value: "2" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="delete-rule" when="tab"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
			expect(rules[0].when).toBe("mode");
		});

		it("should leave rules unchanged if when value not found", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="delete-rule" when="nonexistent"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
			expect(rules[0].when).toBe("tab");
		});

		it("should produce empty array when deleting the only rule", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="delete-rule" when="tab"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(0);
		});

		it("should do nothing when when attribute is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="delete-rule"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
		});

		it("should handle empty temp tiddler gracefully", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="delete-rule" when="tab"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(0);
		});
	});

	// --- add-action operation ---

	describe("add-action operation", function() {

		it("should add action to existing rule matching when", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" when="tab" channel="b" value="2"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
			expect(rules[0].actions.length).toBe(2);
			expect(rules[0].actions[1].channel).toBe("b");
			expect(rules[0].actions[1].value).toBe("2");
		});

		it("should create new rule when when value does not exist", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			setTempRules(wiki, [
				{ when: "tab", actions: [{ channel: "a", value: "1" }] }
			]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" when="mode" channel="panel" value="edit"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(2);
			expect(rules[1].when).toBe("mode");
			expect(rules[1].actions[0].channel).toBe("panel");
		});

		it("should create rule from empty temp state", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" when="tab" channel="detail" value="info"/>');

			var rules = getTempRules(wiki);
			expect(rules.length).toBe(1);
			expect(rules[0].when).toBe("tab");
			expect(rules[0].actions[0].channel).toBe("detail");
			expect(rules[0].actions[0].value).toBe("info");
		});

		it("should do nothing when when attribute is missing", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" channel="a" value="1"/>');

			var tiddler = wiki.getTiddler(TEMP_TITLE);
			expect(tiddler).toBeUndefined();
		});

		it("should do nothing when channel attribute is missing", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" when="tab" value="1"/>');

			var tiddler = wiki.getTiddler(TEMP_TITLE);
			expect(tiddler).toBeUndefined();
		});

		it("should allow empty value", function() {
			var wiki = setupWiki([{ title: APP_TITLE }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" when="tab" channel="ch"/>');

			var rules = getTempRules(wiki);
			expect(rules[0].actions[0].value).toBe("");
		});
	});

	// --- round-trip tests ---

	describe("round-trip: parse then apply", function() {

		it("should produce equivalent wikitext after parse then apply", function() {
			var originalBody = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="detail" value="info"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: originalBody }]);

			// Parse
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');
			// Apply
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('when="tab"');
			expect(app.fields.text).toContain('channel="detail" value="info"');
		});

		it("should produce valid wikitext after parse, add-action, then apply", function() {
			var originalBody = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="detail" value="info"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: originalBody }]);

			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="add-action" when="tab" channel="panel" value="edit"/>');
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toContain('channel="detail" value="info"');
			expect(app.fields.text).toContain('channel="panel" value="edit"');
		});

		it("should produce valid wikitext after parse, delete-rule, then apply", function() {
			var body = '<$statewrap-rule when="tab">\n<$action-statewrap-set channel="a" value="1"/>\n</$statewrap-rule>\n\n' +
				'<$statewrap-rule when="mode">\n<$action-statewrap-set channel="b" value="2"/>\n</$statewrap-rule>\n';
			var wiki = setupWiki([{ title: APP_TITLE, text: body }]);

			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="parse"/>');
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="delete-rule" when="tab"/>');
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="apply"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).not.toContain('when="tab"');
			expect(app.fields.text).toContain('when="mode"');
		});
	});

	// --- edge cases ---

	describe("edge cases", function() {

		it("should do nothing for unknown operation", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "unchanged" }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation="bogus"/>');

			var app = wiki.getTiddler(APP_TITLE);
			expect(app.fields.text).toBe("unchanged");
		});

		it("should do nothing when app attribute is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "unchanged" }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="" operation="parse"/>');

			var tiddler = wiki.getTiddler(TEMP_TITLE);
			expect(tiddler).toBeUndefined();
		});

		it("should do nothing when operation attribute is empty", function() {
			var wiki = setupWiki([{ title: APP_TITLE, text: "unchanged" }]);
			renderAndInvoke(wiki, '<$action-appify-rule app="' + APP_TITLE + '" operation=""/>');

			var tiddler = wiki.getTiddler(TEMP_TITLE);
			expect(tiddler).toBeUndefined();
		});
	});
});
