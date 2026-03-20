/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-split.js
type: application/javascript
module-type: widget

Action widget for split/delete/set-view/set-condition/clear-condition/set-views operations on appify layout slots.

Usage:
  <$action-appify-split app="AppTitle" slot="main" operation="split-h"/>
  <$action-appify-split app="AppTitle" slot="main.0" operation="delete"/>
  <$action-appify-split app="AppTitle" slot="main.1" operation="set-view" value="TiddlerTitle"/>
  <$action-appify-split app="AppTitle" slot="main.1" operation="set-condition" value="[statewrap-get[project]!is[blank]]"/>
  <$action-appify-split app="AppTitle" slot="main.1" operation="clear-condition"/>
  <$action-appify-split app="AppTitle" slot="main.0" operation="set-views" value='[{"view":"A","label":"Tab A"},{"view":"B","label":"Tab B","condition":"[filter]"}]'/>

Operations: split-h, split-v, delete, set-view, set-condition, clear-condition, set-views

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
		case "set-condition":
			performSetCondition(config, rootSlot, pathIndices, value);
			break;
		case "clear-condition":
			performClearCondition(config, rootSlot, pathIndices);
			break;
		case "set-views":
			performSetViews(config, rootSlot, pathIndices, value);
			break;
		default:
			return true;
	}

	// Clean up: remove root entries that are leaves with empty view and no views array
	if(config[rootSlot] && !config[rootSlot].direction && !config[rootSlot].view && !config[rootSlot].views) {
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

// Navigate to a node in the split tree. Returns {parent, node, index} or null.
// For root (pathIndices.length === 0), parent is null, node is config[rootSlot].
function navigateToNode(config, rootSlot, pathIndices) {
	if(pathIndices.length === 0) {
		return { parent: null, node: config[rootSlot] || null, index: -1 };
	}
	var node = config[rootSlot];
	if(!node) return null;
	for(var i = 0; i < pathIndices.length - 1; i++) {
		if(!node || !node.children) return null;
		node = node.children[pathIndices[i]];
	}
	if(!node || !node.children) return null;
	var idx = pathIndices[pathIndices.length - 1];
	return { parent: node, node: node.children[idx], index: idx };
}

function performSplit(config, rootSlot, pathIndices, direction, wiki, appTitle) {
	if(pathIndices.length === 0) {
		// Splitting at root level
		var current = config[rootSlot];
		if(current && current.direction) return; // already a split
		var currentView = "";
		if(current && current.view !== undefined) {
			currentView = current.view;
		} else if(current && current.views) {
			// Splitting a stacked-views leaf: keep the views array on the first child
			config[rootSlot] = {
				direction: direction,
				children: [{ views: current.views }, { view: "" }],
				ratio: 0.5
			};
			return;
		} else {
			var appTiddler = wiki.getTiddler(appTitle);
			currentView = appTiddler ? (appTiddler.fields["appify-view-" + rootSlot] || "") : "";
		}
		// Clear condition when splitting (user is restructuring)
		config[rootSlot] = {
			direction: direction,
			children: [{ view: currentView }, { view: "" }],
			ratio: 0.5
		};
	} else {
		// Splitting a nested leaf
		var nav = navigateToNode(config, rootSlot, pathIndices);
		if(!nav || !nav.parent) return;
		var target = nav.node;
		if(!target || target.direction) return;
		var newChild;
		if(target.views) {
			// Keep stacked views on first child
			newChild = { views: target.views };
		} else {
			newChild = { view: target.view || "" };
		}
		// Clear condition when splitting
		nav.parent.children[nav.index] = {
			direction: direction,
			children: [newChild, { view: "" }],
			ratio: 0.5
		};
	}
}

function performDelete(config, rootSlot, pathIndices) {
	if(pathIndices.length === 0) {
		delete config[rootSlot];
		return;
	}
	var nav = navigateToNode(config, rootSlot, pathIndices);
	if(!nav || !nav.parent) return;
	var siblingIdx = nav.index === 0 ? 1 : 0;
	var sibling = nav.parent.children[siblingIdx];

	// Replace the parent split with the sibling in its grandparent
	if(pathIndices.length === 1) {
		config[rootSlot] = sibling;
	} else {
		var grandNav = navigateToNode(config, rootSlot, pathIndices.slice(0, -1));
		if(!grandNav || !grandNav.parent) return;
		grandNav.parent.children[grandNav.index] = sibling;
	}
}

function performSetView(config, rootSlot, pathIndices, value) {
	if(pathIndices.length === 0) {
		config[rootSlot] = { view: value };
		return;
	}
	var nav = navigateToNode(config, rootSlot, pathIndices);
	if(!nav || !nav.parent) return;
	nav.parent.children[nav.index] = { view: value };
}

function performSetCondition(config, rootSlot, pathIndices, value) {
	if(pathIndices.length === 0) {
		if(!config[rootSlot]) config[rootSlot] = { view: "" };
		config[rootSlot].condition = value;
		return;
	}
	var nav = navigateToNode(config, rootSlot, pathIndices);
	if(!nav || !nav.node) return;
	nav.node.condition = value;
}

function performClearCondition(config, rootSlot, pathIndices) {
	if(pathIndices.length === 0) {
		if(config[rootSlot]) delete config[rootSlot].condition;
		return;
	}
	var nav = navigateToNode(config, rootSlot, pathIndices);
	if(!nav || !nav.node) return;
	delete nav.node.condition;
}

function performSetViews(config, rootSlot, pathIndices, value) {
	var views;
	try { views = JSON.parse(value); } catch(e) { return; }
	if(!Array.isArray(views)) return;

	if(pathIndices.length === 0) {
		config[rootSlot] = { views: views };
		return;
	}
	var nav = navigateToNode(config, rootSlot, pathIndices);
	if(!nav || !nav.parent) return;
	nav.parent.children[nav.index] = { views: views };
}

exports["action-appify-split"] = ActionAppifySplit;

})();
