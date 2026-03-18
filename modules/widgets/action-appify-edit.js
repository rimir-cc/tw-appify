/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-edit.js
type: application/javascript
module-type: widget

Action widget for opening/saving/canceling tiddler editing with proper draft lifecycle.

Usage:
  <$action-appify-edit app="AppTitle" tiddler="ViewTiddler" operation="open"/>
  <$action-appify-edit app="AppTitle" operation="save"/>
  <$action-appify-edit app="AppTitle" operation="cancel"/>

Operations:
  open   — creates draft tiddler, stores draft title in state tiddler
  save   — copies draft fields back to original, deletes draft, clears state
  cancel — deletes draft, clears state
\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var EDIT_STATE_PREFIX = "$:/state/rimir/appify/edit-target/";

var ActionAppifyEdit = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyEdit.prototype = new Widget();

ActionAppifyEdit.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyEdit.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
	this.actionTiddler = this.getAttribute("tiddler", "");
	this.actionOp = this.getAttribute("operation", "");
};

ActionAppifyEdit.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyEdit.prototype.invokeAction = function() {
	var wiki = this.wiki;
	var appTitle = this.actionApp;
	var operation = this.actionOp;
	var stateTitle = EDIT_STATE_PREFIX + appTitle;

	if(!appTitle || !operation) return true;

	switch(operation) {
		case "open":
			var targetTitle = this.actionTiddler;
			if(!targetTitle) return true;

			var originalTiddler = wiki.getTiddler(targetTitle);
			if(!originalTiddler) return true;

			// Create draft tiddler — copy all fields, add draft.of/draft.title
			var draftTitle = "Draft of '" + targetTitle + "'";
			var draftFields = {};
			var fieldKeys = Object.keys(originalTiddler.fields);
			for(var i = 0; i < fieldKeys.length; i++) {
				draftFields[fieldKeys[i]] = originalTiddler.fields[fieldKeys[i]];
			}
			draftFields.title = draftTitle;
			draftFields["draft.of"] = targetTitle;
			draftFields["draft.title"] = targetTitle;

			wiki.addTiddler(new $tw.Tiddler(draftFields));

			// Store draft title in state tiddler
			wiki.setText(stateTitle, "text", null, draftTitle);
			break;

		case "save":
			var draftTitleSave = wiki.getTiddlerText(stateTitle, "");
			if(!draftTitleSave) return true;

			var draftTiddler = wiki.getTiddler(draftTitleSave);
			if(!draftTiddler) { wiki.deleteTiddler(stateTitle); return true; }

			var originalTitle = draftTiddler.fields["draft.of"];
			if(!originalTitle) { wiki.deleteTiddler(stateTitle); return true; }

			// Copy draft fields to original, excluding draft.of/draft.title
			var saveFields = {};
			var draftKeys = Object.keys(draftTiddler.fields);
			for(var j = 0; j < draftKeys.length; j++) {
				var fn = draftKeys[j];
				if(fn === "draft.of" || fn === "draft.title") continue;
				saveFields[fn] = draftTiddler.fields[fn];
			}
			saveFields.title = originalTitle;

			wiki.addTiddler(new $tw.Tiddler(saveFields));
			wiki.deleteTiddler(draftTitleSave);
			wiki.deleteTiddler(stateTitle);
			break;

		case "cancel":
			var draftTitleCancel = wiki.getTiddlerText(stateTitle, "");
			if(draftTitleCancel) {
				wiki.deleteTiddler(draftTitleCancel);
			}
			wiki.deleteTiddler(stateTitle);
			break;
	}

	return true;
};

exports["action-appify-edit"] = ActionAppifyEdit;

})();
