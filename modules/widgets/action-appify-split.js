/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-split.js
type: application/javascript
module-type: widget

Action widget for split/delete/set-view operations on appify layout slots.

Usage:
  <$action-appify-split app="AppTitle" slot="main" operation="split-h"/>
  <$action-appify-split app="AppTitle" slot="main.0" operation="delete"/>
  <$action-appify-split app="AppTitle" slot="main.1" operation="set-view" value="TiddlerTitle"/>

Operations: split-h, split-v, delete, set-view

\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ActionAppifySplit = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifySplit.prototype = new Widget();

ActionAppifySplit.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifySplit.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
	this.actionSlot = this.getAttribute("slot", "");
	this.actionOp = this.getAttribute("operation", "");
	this.actionValue = this.getAttribute("value", "");
};

ActionAppifySplit.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifySplit.prototype.invokeAction = function() {
	var appTitle = this.actionApp;
	var slotAddr = this.actionSlot;
	var operation = this.actionOp;
	var value = this.actionValue;

	if(!appTitle || !slotAddr || !operation) return true;

	// Parse address
	var parts = slotAddr.split(".");
	var rootSlot = parts[0];
	var pathIndices = [];
	for(var i = 1; i < parts.length; i++) {
		pathIndices.push(parseInt(parts[i], 10));
	}

	// Read current config
	var configTitle = "$:/config/rimir/appify/splits/" + appTitle;
	var config = {};
	var tiddler = this.wiki.getTiddler(configTitle);
	if(tiddler && tiddler.fields.text) {
		try { config = JSON.parse(tiddler.fields.text); } catch(e) {}
	}

	switch(operation) {
		case "split-h":
		case "split-v":
			var direction = operation === "split-h" ? "horizontal" : "vertical";
			performSplit(config, rootSlot, pathIndices, direction, this.wiki, appTitle);
			break;
		case "delete":
			performDelete(config, rootSlot, pathIndices);
			break;
		case "set-view":
			performSetView(config, rootSlot, pathIndices, value);
			break;
		default:
			return true;
	}

	// Clean up: remove root entries that are leaves with empty view
	if(config[rootSlot] && !config[rootSlot].direction && !config[rootSlot].view) {
		delete config[rootSlot];
	}

	// Save config
	this.wiki.addTiddler(new $tw.Tiddler({
		title: configTitle,
		type: "application/json",
		text: JSON.stringify(config)
	}));

	// Trigger widget refresh
	this.wiki.setText("$:/temp/rimir/appify/splits-changed", "text", null, Date.now().toString());

	return true;
};

function performSplit(config, rootSlot, pathIndices, direction, wiki, appTitle) {
	if(pathIndices.length === 0) {
		// Splitting at root level
		var current = config[rootSlot];
		if(current && current.direction) return; // already a split
		var currentView = "";
		if(current && current.view !== undefined) {
			currentView = current.view;
		} else {
			var appTiddler = wiki.getTiddler(appTitle);
			currentView = appTiddler ? (appTiddler.fields["appify-view-" + rootSlot] || "") : "";
		}
		config[rootSlot] = {
			direction: direction,
			children: [{ view: currentView }, { view: "" }],
			ratio: 0.5
		};
	} else {
		// Splitting a nested leaf
		var node = config[rootSlot];
		if(!node) return;
		for(var i = 0; i < pathIndices.length - 1; i++) {
			if(!node.children) return;
			node = node.children[pathIndices[i]];
		}
		if(!node.children) return;
		var idx = pathIndices[pathIndices.length - 1];
		var target = node.children[idx];
		if(!target || target.direction) return;
		node.children[idx] = {
			direction: direction,
			children: [{ view: target.view || "" }, { view: "" }],
			ratio: 0.5
		};
	}
}

function performDelete(config, rootSlot, pathIndices) {
	if(pathIndices.length === 0) {
		delete config[rootSlot];
		return;
	}
	var childIdx = pathIndices[pathIndices.length - 1];
	var siblingIdx = childIdx === 0 ? 1 : 0;

	// Navigate to the parent split node
	var parentNode;
	if(pathIndices.length === 1) {
		parentNode = config[rootSlot];
	} else {
		parentNode = config[rootSlot];
		for(var i = 0; i < pathIndices.length - 1; i++) {
			if(!parentNode || !parentNode.children) return;
			parentNode = parentNode.children[pathIndices[i]];
		}
	}
	if(!parentNode || !parentNode.children) return;
	var sibling = parentNode.children[siblingIdx];

	// Replace the parent with the sibling in its grandparent
	if(pathIndices.length === 1) {
		config[rootSlot] = sibling;
	} else {
		var grandparent = config[rootSlot];
		for(var j = 0; j < pathIndices.length - 2; j++) {
			grandparent = grandparent.children[pathIndices[j]];
		}
		grandparent.children[pathIndices[pathIndices.length - 2]] = sibling;
	}
}

function performSetView(config, rootSlot, pathIndices, value) {
	if(pathIndices.length === 0) {
		config[rootSlot] = { view: value };
		return;
	}
	var node = config[rootSlot];
	for(var i = 0; i < pathIndices.length - 1; i++) {
		if(!node || !node.children) return;
		node = node.children[pathIndices[i]];
	}
	if(!node || !node.children) return;
	node.children[pathIndices[pathIndices.length - 1]] = { view: value };
}

exports["action-appify-split"] = ActionAppifySplit;

})();
