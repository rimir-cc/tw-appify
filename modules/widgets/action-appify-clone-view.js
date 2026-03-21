/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-clone-view.js
type: application/javascript
module-type: widget

Clone a single view tiddler into the user's namespace and update the split config reference.

Usage:
  <$action-appify-clone-view app="AppTitle" slot="main.0" tiddler="SourceView"/>
  <$action-appify-clone-view app="AppTitle" slot="main.0" tiddler="SourceView" index="1"/>

Reads clone prefix from $:/config/rimir/appify/clone-prefix (default: $:/config/rimir/appify).
Creates cloned view at <prefix>/views/<baseName>, updates the split config to point to the clone.
For stacked views, the optional index attribute targets a specific view in the views array.

\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var DEFAULT_PREFIX = "$:/config/rimir/appify";
var PREFIX_CONFIG = "$:/config/rimir/appify/clone-prefix";
var VIEW_TAG = "$:/tags/rimir/appify/view";

var ActionAppifyCloneView = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyCloneView.prototype = new Widget();

ActionAppifyCloneView.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyCloneView.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
	this.actionSlot = this.getAttribute("slot", "");
	this.actionTiddler = this.getAttribute("tiddler", "");
	this.actionIndex = parseInt(this.getAttribute("index", "-1"), 10);
};

ActionAppifyCloneView.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyCloneView.prototype.invokeAction = function() {
	var appTitle = this.actionApp;
	var slotAddr = this.actionSlot;
	var sourceTiddler = this.actionTiddler;
	var viewIndex = this.actionIndex;

	if(!appTitle || !slotAddr || !sourceTiddler) return true;

	var source = this.wiki.getTiddler(sourceTiddler);
	if(!source) return true;

	// Compute clone title
	var prefix = (this.wiki.getTiddlerText(PREFIX_CONFIG) || DEFAULT_PREFIX).replace(/\/+$/, "");
	var baseName = sourceTiddler.split("/").pop();
	var newTitle = prefix + "/views/" + baseName;

	// Handle naming collisions
	if(this.wiki.tiddlerExists(newTitle)) {
		var suffix = 2;
		while(this.wiki.tiddlerExists(newTitle + "-" + suffix)) suffix++;
		newTitle = newTitle + "-" + suffix;
	}

	// Clone: copy all fields except title, add view tag, strip llm-accessible
	var newFields = {};
	var fieldKeys = Object.keys(source.fields);
	for(var i = 0; i < fieldKeys.length; i++) {
		if(fieldKeys[i] !== "title") {
			newFields[fieldKeys[i]] = source.fields[fieldKeys[i]];
		}
	}
	newFields.title = newTitle;

	// Ensure view tag is present, strip llm-accessible
	var tags = newFields.tags ? $tw.utils.parseStringArray(newFields.tags) : [];
	tags = tags.filter(function(t) { return t !== "$:/tags/rimir/llm-accessible"; });
	if(tags.indexOf(VIEW_TAG) === -1) tags.push(VIEW_TAG);
	newFields.tags = $tw.utils.stringifyList(tags);

	this.wiki.addTiddler(new $tw.Tiddler(newFields));

	// Update split config reference
	var parts = slotAddr.split(".");
	var rootSlot = parts[0];
	var pathIndices = [];
	for(var j = 1; j < parts.length; j++) {
		pathIndices.push(parseInt(parts[j], 10));
	}

	var configTitle = "$:/config/rimir/appify/splits/" + appTitle;
	var config = {};
	var configTiddler = this.wiki.getTiddler(configTitle);
	if(configTiddler && configTiddler.fields.text) {
		try { config = JSON.parse(configTiddler.fields.text); } catch(e) {}
	}

	// Navigate to the leaf node
	var node;
	if(pathIndices.length === 0) {
		node = config[rootSlot];
	} else {
		var current = config[rootSlot];
		for(var k = 0; k < pathIndices.length - 1; k++) {
			if(!current || !current.children) { node = null; break; }
			current = current.children[pathIndices[k]];
		}
		if(current && current.children) {
			node = current.children[pathIndices[pathIndices.length - 1]];
		}
	}

	if(node) {
		if(node.views && viewIndex >= 0 && viewIndex < node.views.length) {
			node.views[viewIndex].view = newTitle;
		} else if(node.view !== undefined) {
			node.view = newTitle;
		}

		this.wiki.addTiddler(new $tw.Tiddler({
			title: configTitle,
			type: "application/json",
			text: JSON.stringify(config)
		}));
	}

	// Trigger refresh
	this.wiki.setText("$:/temp/rimir/appify/splits-changed", "text", null, Date.now().toString());

	return true;
};

exports["action-appify-clone-view"] = ActionAppifyCloneView;

})();
