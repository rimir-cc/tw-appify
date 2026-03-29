/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-delete.js
type: application/javascript
module-type: widget

Delete an app and its associated tiddlers (views, splits, proportions, state).

Usage:
  <$action-appify-delete app="AppTiddlerTitle"/>

Deletes:
  - The app tiddler itself
  - All view tiddlers referenced in appify-view-* fields
  - Splits config: $:/config/rimir/appify/splits/<app>
  - Proportions config: $:/config/rimir/appify/proportions/<app>
  - Layout configs: $:/config/rimir/appify/layout-config/<app>/*
  - Deactivates the app if it was active

Does NOT delete:
  - Shadow tiddlers (blueprint views/apps under $:/plugins/) — only overrides are removed
  - State tiddlers ($:/state/) — these are transient

\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ACTIVE_APP = "$:/state/rimir/appify/active-app";
var EDIT_MODE = "$:/state/rimir/appify/edit-mode";

var ActionAppifyDelete = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyDelete.prototype = new Widget();

ActionAppifyDelete.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyDelete.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
};

ActionAppifyDelete.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyDelete.prototype.invokeAction = function() {
	var appTitle = this.actionApp;
	if(!appTitle) return true;

	var appTiddler = this.wiki.getTiddler(appTitle);
	if(!appTiddler) return true;

	// Don't delete shadow-only tiddlers (blueprints)
	if(this.wiki.isShadowTiddler(appTitle) && !this.wiki.tiddlerExists(appTitle)) return true;

	var fields = appTiddler.fields;

	// Delete view tiddlers
	var fieldKeys = Object.keys(fields);
	for(var i = 0; i < fieldKeys.length; i++) {
		var key = fieldKeys[i];
		if(key.indexOf("appify-view-") === 0) {
			var viewTitle = fields[key];
			if(viewTitle && this.wiki.tiddlerExists(viewTitle)) {
				this.wiki.deleteTiddler(viewTitle);
			}
		}
	}

	// Delete config tiddlers
	var configPrefixes = [
		"$:/config/rimir/appify/splits/",
		"$:/config/rimir/appify/proportions/"
	];
	for(var ci = 0; ci < configPrefixes.length; ci++) {
		var configTitle = configPrefixes[ci] + appTitle;
		if(this.wiki.tiddlerExists(configTitle)) {
			this.wiki.deleteTiddler(configTitle);
		}
	}

	// Delete layout-config tiddlers (pattern: .../layout-config/<app>/<layout>)
	var layoutConfigPrefix = "$:/config/rimir/appify/layout-config/" + appTitle + "/";
	var allTiddlers = this.wiki.filterTiddlers("[prefix[" + layoutConfigPrefix + "]]");
	for(var li = 0; li < allTiddlers.length; li++) {
		this.wiki.deleteTiddler(allTiddlers[li]);
	}

	// Deactivate if this was the active app
	var activeApp = this.wiki.getTiddlerText(ACTIVE_APP, "");
	if(activeApp === appTitle) {
		this.wiki.setText(ACTIVE_APP, "text", null, "");
		this.wiki.setText(EDIT_MODE, "text", null, "no");
		// Remove rimir/appify from llm-help active context
		var ctxTiddler = "$:/temp/rimir/llm-help/active-context";
		var ctx = this.wiki.getTiddlerText(ctxTiddler, "");
		var keys = ctx.split(/\s+/).filter(function(k) { return k && k !== "rimir/appify"; });
		this.wiki.setText(ctxTiddler, "text", null, keys.join(" "));
	}

	// Delete the app tiddler
	this.wiki.deleteTiddler(appTitle);

	return true;
};

exports["action-appify-delete"] = ActionAppifyDelete;

})();
