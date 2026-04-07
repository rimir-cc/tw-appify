/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-rule.js
type: application/javascript
module-type: widget

Action widget for rule management on appify apps.

Usage:
  <$action-appify-rule app="AppTitle" operation="apply"/>
  <$action-appify-rule app="AppTitle" operation="delete-rule" when="project"/>
  <$action-appify-rule app="AppTitle" operation="parse"/>
  <$action-appify-rule app="AppTitle" operation="add-action" when="project" channel="task" value=""/>

Operations:
  apply       — reads rule JSON from temp tiddler, generates statewrap-rule wikitext, writes to app body
  delete-rule — removes the statewrap-rule block for the given "when" channel
  parse       — parses app body into rule JSON and writes to temp tiddler
  add-action  — adds an action to a rule (creates rule if needed) in the temp tiddler
\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var RULES_TEMP_PREFIX = "$:/temp/rimir/appify/rules/";

var ActionAppifyRule = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyRule.prototype = new Widget();

ActionAppifyRule.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyRule.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
	this.actionOp = this.getAttribute("operation", "");
	this.actionWhen = this.getAttribute("when", "");
	this.actionChannel = this.getAttribute("channel", "");
	this.actionValue = this.getAttribute("value", "");
};

ActionAppifyRule.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyRule.prototype.invokeAction = function() {
	var appTitle = this.actionApp;
	var operation = this.actionOp;

	if(!appTitle || !operation) return true;

	var tiddler = this.wiki.getTiddler(appTitle);
	if(!tiddler) return true;

	var tempTitle = RULES_TEMP_PREFIX + appTitle;

	switch(operation) {
		case "parse":
			var rules = parseRulesFromBody(tiddler.fields.text || "", this.wiki);
			this.wiki.addTiddler(new $tw.Tiddler({
				title: tempTitle,
				type: "application/json",
				text: JSON.stringify(rules, null, 2)
			}));
			break;

		case "apply":
			var ruleJson = [];
			var tempTiddler = this.wiki.getTiddler(tempTitle);
			if(tempTiddler && tempTiddler.fields.text) {
				try { ruleJson = JSON.parse(tempTiddler.fields.text); } catch(e) {}
			}
			var wikitext = generateRuleWikitext(ruleJson);
			var fields = {};
			var fieldKeys = Object.keys(tiddler.fields);
			for(var i = 0; i < fieldKeys.length; i++) {
				fields[fieldKeys[i]] = tiddler.fields[fieldKeys[i]];
			}
			fields.text = wikitext;
			this.wiki.addTiddler(new $tw.Tiddler(fields));
			break;

		case "delete-rule":
			var when = this.actionWhen;
			if(!when) break;
			var currentRules = [];
			var currentTemp = this.wiki.getTiddler(tempTitle);
			if(currentTemp && currentTemp.fields.text) {
				try { currentRules = JSON.parse(currentTemp.fields.text); } catch(e) {}
			}
			var filtered = [];
			for(var j = 0; j < currentRules.length; j++) {
				if(currentRules[j].when !== when) {
					filtered.push(currentRules[j]);
				}
			}
			this.wiki.addTiddler(new $tw.Tiddler({
				title: tempTitle,
				type: "application/json",
				text: JSON.stringify(filtered, null, 2)
			}));
			break;

		case "add-action":
			var addWhen = this.actionWhen;
			var addChannel = this.actionChannel;
			var addValue = this.actionValue;
			if(!addWhen || !addChannel) break;
			var addRules = [];
			var addTemp = this.wiki.getTiddler(tempTitle);
			if(addTemp && addTemp.fields.text) {
				try { addRules = JSON.parse(addTemp.fields.text); } catch(e) {}
			}
			// Find existing rule for this "when" or create new one
			var found = false;
			for(var m = 0; m < addRules.length; m++) {
				if(addRules[m].when === addWhen) {
					addRules[m].actions.push({ channel: addChannel, value: addValue });
					found = true;
					break;
				}
			}
			if(!found) {
				addRules.push({ when: addWhen, actions: [{ channel: addChannel, value: addValue }] });
			}
			this.wiki.addTiddler(new $tw.Tiddler({
				title: tempTitle,
				type: "application/json",
				text: JSON.stringify(addRules, null, 2)
			}));
			break;

		default:
			return true;
	}

	// Trigger appify-app refresh
	this.wiki.setText("$:/temp/rimir/appify/splits-changed", "text", null, Date.now().toString());

	return true;
};

/**
 * Parse app body wikitext into rule JSON.
 * Walks the parse tree looking for statewrap-rule nodes.
 */
function parseRulesFromBody(text, wiki) {
	if(!text || !text.trim()) return [];

	var parser = wiki.parseText("text/vnd.tiddlywiki", text, { parseAsInline: false });
	if(!parser || !parser.tree) return [];

	var rules = [];
	collectRules(parser.tree, rules);
	return rules;
}

/**
 * Recursively walk the parse tree to find statewrap-rule nodes.
 * TW's wikitext parser may wrap widgets in <p> elements, so we
 * need to search children, not just the top level.
 */
function collectRules(nodes, rules) {
	if(!nodes) return;
	for(var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		if(isWidget(node, "$statewrap-rule")) {
			var when = "";
			if(node.attributes && node.attributes.when) {
				when = node.attributes.when.value || "";
			}
			var actions = [];
			if(node.children) {
				for(var j = 0; j < node.children.length; j++) {
					var child = node.children[j];
					if(isWidget(child, "$action-statewrap-set") && child.attributes) {
						var ch = child.attributes.channel ? (child.attributes.channel.value || "") : "";
						var val = child.attributes.value ? (child.attributes.value.value || "") : "";
						if(ch) {
							actions.push({ channel: ch, value: val });
						}
					}
				}
			}
			if(when) {
				rules.push({ when: when, actions: actions });
			}
		} else if(node.children) {
			collectRules(node.children, rules);
		}
	}
}

/**
 * Generate statewrap-rule wikitext from rule JSON.
 */
function generateRuleWikitext(rules) {
	if(!rules || !rules.length) return '';

	var lines = [];
	for(var i = 0; i < rules.length; i++) {
		var rule = rules[i];
		if(!rule.when || !rule.actions || !rule.actions.length) continue;

		lines.push('<$statewrap-rule when="' + escapeAttr(rule.when) + '">');
		for(var j = 0; j < rule.actions.length; j++) {
			var action = rule.actions[j];
			lines.push('<$action-statewrap-set channel="' + escapeAttr(action.channel) +
				'" value="' + escapeAttr(action.value) + '"/>');
		}
		lines.push('</$statewrap-rule>');
		if(i < rules.length - 1) lines.push('');
	}
	return lines.join('\n') + '\n';
}

/**
 * Check if a parse tree node matches a widget tag.
 * TW parser produces { type: "element", tag: "$widget-name" } for <$widget-name>.
 */
function isWidget(node, tag) {
	return node.tag === tag && (node.type === "element" || node.type === "widget" ||
		node.type === tag.substring(1));
}

function escapeAttr(str) {
	return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

exports["action-appify-rule"] = ActionAppifyRule;

})();
