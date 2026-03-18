/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-layout.js
type: application/javascript
module-type: widget

Action widget for switching appify layouts with config persistence.

Usage:
  <$action-appify-layout app="AppTitle" layout="focus"/>

On switch:
1. Saves current layout's config (view bindings, splits, proportions)
   to $:/config/rimir/appify/layout-config/<appTitle>/<layoutName>
2. Sets new layout on the app tiddler
3. Restores saved config for the new layout if it exists
4. Cleans up stale data for slots not in the new layout
\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var LAYOUT_PREFIX = "$:/plugins/rimir/appify/layouts/";
var LAYOUT_CONFIG_PREFIX = "$:/config/rimir/appify/layout-config/";

var ActionAppifyLayout = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyLayout.prototype = new Widget();

ActionAppifyLayout.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyLayout.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
	this.actionLayout = this.getAttribute("layout", "");
};

ActionAppifyLayout.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyLayout.prototype.invokeAction = function() {
	var wiki = this.wiki;
	var appTitle = this.actionApp;
	var newLayoutName = this.actionLayout;

	if(!appTitle || !newLayoutName) return true;

	var appTiddler = wiki.getTiddler(appTitle);
	if(!appTiddler) return true;

	var oldLayoutName = appTiddler.fields["appify-layout"] || "sidebar-main";
	if(oldLayoutName === newLayoutName) return true;

	// Validate new layout exists
	var newLayoutTiddler = wiki.getTiddler(LAYOUT_PREFIX + newLayoutName);
	if(!newLayoutTiddler) return true;

	var oldSlots = getLayoutSlots(wiki, oldLayoutName);
	var newSlots = getLayoutSlots(wiki, newLayoutName);

	// --- Save current layout config ---
	var saveConfig = { views: {} };

	for(var i = 0; i < oldSlots.length; i++) {
		var viewVal = appTiddler.fields["appify-view-" + oldSlots[i]];
		if(viewVal) {
			saveConfig.views[oldSlots[i]] = viewVal;
		}
	}

	var splitsTitle = "$:/config/rimir/appify/splits/" + appTitle;
	var splitsTiddler = wiki.getTiddler(splitsTitle);
	if(splitsTiddler && splitsTiddler.fields.text) {
		try { saveConfig.splits = JSON.parse(splitsTiddler.fields.text); } catch(e) {}
	}

	var propTitle = "$:/config/rimir/appify/proportions/" + appTitle;
	var propTiddler = wiki.getTiddler(propTitle);
	if(propTiddler && propTiddler.fields.text) {
		try { saveConfig.proportions = JSON.parse(propTiddler.fields.text); } catch(e) {}
	}

	var saveTitle = LAYOUT_CONFIG_PREFIX + appTitle + "/" + oldLayoutName;
	wiki.addTiddler(new $tw.Tiddler({
		title: saveTitle,
		type: "application/json",
		text: JSON.stringify(saveConfig)
	}));

	// --- Load saved config for new layout ---
	var restoreConfig = null;
	var restoreTitle = LAYOUT_CONFIG_PREFIX + appTitle + "/" + newLayoutName;
	var restoreTiddler = wiki.getTiddler(restoreTitle);
	if(restoreTiddler) {
		var restoreText = restoreTiddler.fields.text;
		if(typeof restoreText === "string" && restoreText) {
			try { restoreConfig = JSON.parse(restoreText); } catch(e) {}
		} else if(typeof restoreText === "object" && restoreText !== null) {
			restoreConfig = restoreText;
		}
	}

	// --- Build new app tiddler fields from scratch ---
	// Copy all non-view fields from original tiddler
	var newFields = {};
	var fieldKeys = Object.keys(appTiddler.fields);
	for(var k = 0; k < fieldKeys.length; k++) {
		var fn = fieldKeys[k];
		// Skip ALL appify-view-* fields — we rebuild them below
		if(fn.indexOf("appify-view-") === 0) continue;
		newFields[fn] = appTiddler.fields[fn];
	}

	// Set new layout
	newFields["appify-layout"] = newLayoutName;

	// Add view fields for new layout's slots
	var newSlotSet = {};
	for(var s = 0; s < newSlots.length; s++) {
		var slot = newSlots[s];
		newSlotSet[slot] = true;
		var view = null;

		// Priority 1: restore from saved config for this layout
		if(restoreConfig && restoreConfig.views && restoreConfig.views[slot]) {
			view = restoreConfig.views[slot];
		}
		// Priority 2: shared slot — keep current binding
		else if(appTiddler.fields["appify-view-" + slot]) {
			view = appTiddler.fields["appify-view-" + slot];
		}

		if(view) {
			newFields["appify-view-" + slot] = view;
		}
	}

	wiki.addTiddler(new $tw.Tiddler(newFields));

	// --- Restore or clean splits ---
	if(restoreConfig && restoreConfig.splits) {
		var newSplits = {};
		var sKeys = Object.keys(restoreConfig.splits);
		for(var p = 0; p < sKeys.length; p++) {
			if(newSlotSet[sKeys[p]]) {
				newSplits[sKeys[p]] = restoreConfig.splits[sKeys[p]];
			}
		}
		if(Object.keys(newSplits).length > 0) {
			wiki.addTiddler(new $tw.Tiddler({
				title: splitsTitle,
				type: "application/json",
				text: JSON.stringify(newSplits)
			}));
		} else {
			wiki.deleteTiddler(splitsTitle);
		}
	} else if(splitsTiddler) {
		// No saved splits for new layout — keep only entries for shared slots
		try {
			var oldSplits = JSON.parse(splitsTiddler.fields.text);
			var keptSplits = {};
			var oKeys = Object.keys(oldSplits);
			for(var r = 0; r < oKeys.length; r++) {
				if(newSlotSet[oKeys[r]]) keptSplits[oKeys[r]] = oldSplits[oKeys[r]];
			}
			if(Object.keys(keptSplits).length > 0) {
				wiki.addTiddler(new $tw.Tiddler({
					title: splitsTitle,
					type: "application/json",
					text: JSON.stringify(keptSplits)
				}));
			} else {
				wiki.deleteTiddler(splitsTitle);
			}
		} catch(e) { wiki.deleteTiddler(splitsTitle); }
	}

	// --- Restore or clear proportions ---
	if(restoreConfig && restoreConfig.proportions) {
		wiki.addTiddler(new $tw.Tiddler({
			title: propTitle,
			type: "application/json",
			text: JSON.stringify(restoreConfig.proportions)
		}));
	} else {
		wiki.deleteTiddler(propTitle);
	}

	// Trigger appify-app refresh
	wiki.setText("$:/temp/rimir/appify/splits-changed", "text", null, Date.now().toString());

	return true;
};

function getLayoutSlots(wiki, layoutName) {
	var tiddler = wiki.getTiddler(LAYOUT_PREFIX + layoutName);
	if(!tiddler) return [];
	return (tiddler.fields["appify-slots"] || "").split(/\s+/).filter(Boolean);
}

exports["action-appify-layout"] = ActionAppifyLayout;

})();
