/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-clone.js
type: application/javascript
module-type: widget

Clone a sample/blueprint app and its view tiddlers into user-configurable namespace.

Usage:
  <$action-appify-clone source="$:/plugins/rimir/appify/samples/demo-app" name="My App"/>

Reads clone prefix from $:/config/rimir/appify/clone-prefix (default: $:/config/rimir/appify).
Creates:
  - App tiddler at <prefix>/apps/<name>
  - View tiddlers at <prefix>/views/<viewBaseName>
  - Rewrites appify-view-* fields to point to cloned views
  - Activates the cloned app

\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var DEFAULT_PREFIX = "$:/config/rimir/appify";
var PREFIX_CONFIG = "$:/config/rimir/appify/clone-prefix";
var ACTIVE_APP = "$:/state/rimir/appify/active-app";

var ActionAppifyClone = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyClone.prototype = new Widget();

ActionAppifyClone.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyClone.prototype.execute = function() {
	this.actionSource = this.getAttribute("source", "");
	this.actionName = this.getAttribute("name", "");
};

ActionAppifyClone.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyClone.prototype.invokeAction = function() {
	var source = this.actionSource;
	var name = this.actionName;
	if(!source || !name) return true;

	var sourceTiddler = this.wiki.getTiddler(source);
	if(!sourceTiddler) return true;

	var prefix = (this.wiki.getTiddlerText(PREFIX_CONFIG) || DEFAULT_PREFIX).replace(/\/+$/, "");
	var appTitle = prefix + "/apps/" + name;

	// Check if target already exists
	if(this.wiki.tiddlerExists(appTitle)) return true;

	// Clone view tiddlers and build field map
	var sourceFields = sourceTiddler.fields;
	var newFields = {};
	var fieldKeys = Object.keys(sourceFields);
	for(var i = 0; i < fieldKeys.length; i++) {
		var key = fieldKeys[i];
		var val = sourceFields[key];
		if(key.indexOf("appify-view-") === 0 && typeof val === "string" && val) {
			// Clone the view tiddler
			var viewBaseName = val.split("/").pop();
			var newViewTitle = prefix + "/views/" + viewBaseName;
			var viewTiddler = this.wiki.getTiddler(val);
			if(viewTiddler) {
				var viewFields = {};
				var vKeys = Object.keys(viewTiddler.fields);
				for(var vi = 0; vi < vKeys.length; vi++) {
					if(vKeys[vi] !== "title") {
						viewFields[vKeys[vi]] = viewTiddler.fields[vKeys[vi]];
					}
				}
				viewFields.title = newViewTitle;
				// Remove the llm-accessible tag — user tiddlers don't need it
				if(viewFields.tags) {
					var tags = $tw.utils.parseStringArray(viewFields.tags);
					tags = tags.filter(function(t) { return t !== "$:/tags/rimir/llm-accessible"; });
					viewFields.tags = $tw.utils.stringifyList(tags);
				}
				this.wiki.addTiddler(new $tw.Tiddler(viewFields));
			}
			newFields[key] = newViewTitle;
		} else if(key !== "title") {
			newFields[key] = val;
		}
	}

	// Remove llm-accessible tag from cloned app
	if(newFields.tags) {
		var appTags = $tw.utils.parseStringArray(newFields.tags);
		appTags = appTags.filter(function(t) { return t !== "$:/tags/rimir/llm-accessible"; });
		newFields.tags = $tw.utils.stringifyList(appTags);
	}

	newFields.title = appTitle;
	newFields.caption = name;
	this.wiki.addTiddler(new $tw.Tiddler(newFields));

	// Activate the new app
	this.wiki.setText(ACTIVE_APP, "text", null, appTitle);

	return true;
};

exports["action-appify-clone"] = ActionAppifyClone;

})();
