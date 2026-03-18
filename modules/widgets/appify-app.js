/*\
title: $:/plugins/rimir/appify/modules/widgets/appify-app.js
type: application/javascript
module-type: widget

Renders an app's layout with statewrap integration.
Reads app tiddler fields for channels, layout, and view bindings.
Dynamically builds a statewrap → grid → slot widget tree.
Supports edit mode (Ctrl+M), splits, and stored proportions.

Usage: <$appify-app tiddler="AppTiddlerTitle"/>

\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var EDIT_MODE_TIDDLER = "$:/state/rimir/appify/edit-mode";
var SPLITS_CHANGED_TIDDLER = "$:/temp/rimir/appify/splits-changed";

var AppifyAppWidget = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

AppifyAppWidget.prototype = new Widget();

AppifyAppWidget.prototype.render = function(parent, nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
	this.renderChildren(parent, nextSibling);
};

AppifyAppWidget.prototype.execute = function() {
	var appTitle = this.getAttribute("tiddler", "");
	this.appTitle = appTitle;

	var appTiddler = this.wiki.getTiddler(appTitle);
	if(!appTiddler) {
		this.makeChildWidgets([]);
		return;
	}

	var fields = appTiddler.fields;
	var layoutName = fields["appify-layout"] || "sidebar-main";
	var editMode = this.wiki.getTiddlerText(EDIT_MODE_TIDDLER, "no") === "yes";
	this.editMode = editMode;

	// Read layout template
	this.layoutTitle = "$:/plugins/rimir/appify/layouts/" + layoutName;
	var layoutTiddler = this.wiki.getTiddler(this.layoutTitle);
	if(!layoutTiddler) {
		this.makeChildWidgets([{
			type: "element", tag: "div",
			attributes: { "class": { type: "string", value: "appify-error" } },
			children: [{ type: "text", text: "Unknown layout: " + layoutName }]
		}]);
		return;
	}

	var layoutFields = layoutTiddler.fields;
	var slots = (layoutFields["appify-slots"] || "").split(/\s+/).filter(Boolean);
	var gridAreas = layoutFields["appify-grid-areas"] || "";
	var gridColumns = layoutFields["appify-grid-columns"] || "";
	var gridRows = layoutFields["appify-grid-rows"] || "";
	var originalRows = gridRows;

	// Load stored proportions
	var colCount = gridColumns.split(/\s+/).filter(Boolean).length;
	var rowCount = gridRows.split(/\s+/).filter(Boolean).length;
	var propConfigTitle = "$:/config/rimir/appify/proportions/" + appTitle;
	var propTiddler = this.wiki.getTiddler(propConfigTitle);
	if(propTiddler && propTiddler.fields.text) {
		try {
			var stored = JSON.parse(propTiddler.fields.text);
			if(stored.columns && stored.columns.length === colCount) {
				var colFr = [];
				for(var ci = 0; ci < stored.columns.length; ci++) colFr.push(stored.columns[ci] + "fr");
				gridColumns = colFr.join(" ");
			}
			if(stored.rows && stored.rows.length === rowCount) {
				var rowFr = [];
				for(var ri = 0; ri < stored.rows.length; ri++) rowFr.push(stored.rows[ri] + "fr");
				gridRows = rowFr.join(" ");
			}
		} catch(e) {}
	}

	// Read splits config
	var splitsConfig = {};
	var splitsTiddler = this.wiki.getTiddler("$:/config/rimir/appify/splits/" + appTitle);
	if(splitsTiddler && splitsTiddler.fields.text) {
		try { splitsConfig = JSON.parse(splitsTiddler.fields.text); } catch(e) {}
	}

	// Build statewrap attributes
	var channels = fields["appify-channels"] || "";
	var channelNames = channels.split(/\s+/).filter(Boolean);
	var statewrapAttrs = {
		channels: { type: "string", value: channels },
		instid: { type: "string", value: appTitle }
	};
	var fieldKeys = Object.keys(fields);
	for(var i = 0; i < fieldKeys.length; i++) {
		var fn = fieldKeys[i];
		if(fn.indexOf("appify-default-") === 0) {
			statewrapAttrs["default-" + fn.substring("appify-default-".length)] = {
				type: "string", value: fields[fn]
			};
		}
	}

	// Parse app body (statewrap rules)
	var bodyTree = [];
	if(fields.text) {
		var parser = this.wiki.parseText("text/vnd.tiddlywiki", fields.text, { parseAsInline: false });
		if(parser && parser.tree) bodyTree = parser.tree;
	}

	// Build slot nodes with recursive split support
	var slotChildren = [];
	for(var j = 0; j < slots.length; j++) {
		var slotName = slots[j];
		var defaultView = fields["appify-view-" + slotName] || "";
		var splitNode = splitsConfig[slotName] || null;
		var hasSplit = splitNode && splitNode.direction;

		var slotContent = this.buildSlotContent(splitNode, defaultView, editMode, appTitle, slotName);
		var slotClass = "appify-slot appify-slot-" + slotName;
		if(hasSplit) {
			slotClass += " appify-slot-split";
		} else if(editMode) {
			slotClass += " appify-slot-edit";
		}

		slotChildren.push({
			type: "element", tag: "div",
			attributes: {
				"class": { type: "string", value: slotClass },
				"style": { type: "string", value: "grid-area: " + slotName + ";" }
			},
			children: slotContent
		});
	}

	// Debug bar (edit mode only)
	var preGridNodes = [];
	if(editMode && channelNames.length > 0) {
		var statePrefix = "$:/state/rimir/statewrap/" + appTitle + "/";
		var debugItems = [];
		for(var k = 0; k < channelNames.length; k++) {
			var chName = channelNames[k];
			if(k > 0) {
				debugItems.push({
					type: "element", tag: "span",
					attributes: { "class": { type: "string", value: "appify-debug-sep" } },
					children: [{ type: "text", text: "|" }]
				});
			}
			debugItems.push({
				type: "element", tag: "span",
				attributes: { "class": { type: "string", value: "appify-debug-channel" } },
				children: [
					{ type: "element", tag: "span",
					  attributes: { "class": { type: "string", value: "appify-debug-name" } },
					  children: [{ type: "text", text: chName }] },
					{ type: "text", text: " = " },
					{ type: "element", tag: "span",
					  attributes: { "class": { type: "string", value: "appify-debug-value" } },
					  children: [{
						type: "transclude",
						attributes: {
							"$tiddler": { type: "string", value: statePrefix + chName },
							"$field": { type: "string", value: "text" }
						},
						children: [
							{ type: "element", tag: "em",
							  attributes: { "class": { type: "string", value: "appify-debug-empty" } },
							  children: [{ type: "text", text: "(empty)" }] }
						]
					}] }
				]
			});
		}
		preGridNodes.push({
			type: "element", tag: "div",
			attributes: { "class": { type: "string", value: "appify-debug-bar" } },
			children: [
				{ type: "element", tag: "span",
				  attributes: { "class": { type: "string", value: "appify-debug-title" } },
				  children: [{ type: "text", text: "Channels" }] }
			].concat(debugItems)
		});
	}

	// Build grid
	var gridStyle = "";
	if(gridAreas) gridStyle += "grid-template-areas: " + gridAreas + ";";
	if(gridColumns) gridStyle += " grid-template-columns: " + gridColumns + ";";
	if(gridRows) gridStyle += " grid-template-rows: " + gridRows + ";";

	var gridNode = {
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: "appify-grid appify-layout-" + layoutName },
			"style": { type: "string", value: gridStyle },
			"data-appify-app": { type: "string", value: appTitle },
			"data-appify-original-rows": { type: "string", value: originalRows }
		},
		children: slotChildren
	};

	var statewrapNode = {
		type: "statewrap",
		attributes: statewrapAttrs,
		children: bodyTree.concat(preGridNodes).concat([gridNode])
	};

	this.makeChildWidgets([statewrapNode]);
};

// --- Recursive slot builders ---

AppifyAppWidget.prototype.buildSlotContent = function(node, defaultView, editMode, appTitle, address) {
	if(node && node.direction) {
		return this.buildSplitContent(node, editMode, appTitle, address);
	}
	var view = (node && node.view !== undefined) ? node.view : defaultView;
	return this.buildLeafContent(view, editMode, appTitle, address);
};

AppifyAppWidget.prototype.buildSplitContent = function(node, editMode, appTitle, address) {
	var isH = node.direction === "horizontal";
	var ratio = node.ratio || 0.5;

	var child0 = this.buildSlotContent(node.children[0], "", editMode, appTitle, address + ".0");
	var child1 = this.buildSlotContent(node.children[1], "", editMode, appTitle, address + ".1");

	var child0HasSplit = node.children[0] && node.children[0].direction;
	var child1HasSplit = node.children[1] && node.children[1].direction;

	var pane0Class = "appify-split-pane" + (editMode && !child0HasSplit ? " appify-split-pane-edit" : "");
	var pane1Class = "appify-split-pane" + (editMode && !child1HasSplit ? " appify-split-pane-edit" : "");
	if(child0HasSplit) pane0Class += " appify-split-pane-nested";
	if(child1HasSplit) pane1Class += " appify-split-pane-nested";

	return [{
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: "appify-split appify-split-" + (isH ? "h" : "v") },
			"data-split-path": { type: "string", value: address },
			"data-appify-app": { type: "string", value: appTitle }
		},
		children: [
			{
				type: "element", tag: "div",
				attributes: {
					"class": { type: "string", value: pane0Class },
					"style": { type: "string", value: "flex: " + ratio + ";" }
				},
				children: child0
			},
			{
				type: "element", tag: "div",
				attributes: {
					"class": { type: "string", value: "appify-split-handle appify-split-handle-" + (isH ? "h" : "v") },
					"data-split-path": { type: "string", value: address },
					"data-appify-app": { type: "string", value: appTitle }
				}
			},
			{
				type: "element", tag: "div",
				attributes: {
					"class": { type: "string", value: pane1Class },
					"style": { type: "string", value: "flex: " + (1 - ratio) + ";" }
				},
				children: child1
			}
		]
	}];
};

AppifyAppWidget.prototype.buildLeafContent = function(viewTiddler, editMode, appTitle, address) {
	var content = [];

	if(editMode) {
		// Build label with split/delete buttons via parsed wikitext
		var isSubSlot = address.indexOf(".") !== -1;
		var viewLabel = viewTiddler ? " \u2192 " + viewTiddler : "";
		var esc = function(s) { return s.replace(/"/g, "&quot;"); };

		var wt = '<div class="appify-slot-label">' +
			'<span class="appify-slot-label-text">' + address + '<span class="appify-slot-label-tiddler">' + viewLabel + '</span></span>' +
			'<span class="appify-slot-actions">' +
			'<$button class="appify-split-btn" tooltip="Split horizontal">' +
			'<$action-appify-split app="' + esc(appTitle) + '" slot="' + esc(address) + '" operation="split-h"/>' +
			'\u2194</$button>' +
			'<$button class="appify-split-btn" tooltip="Split vertical">' +
			'<$action-appify-split app="' + esc(appTitle) + '" slot="' + esc(address) + '" operation="split-v"/>' +
			'\u2195</$button>';

		if(isSubSlot) {
			wt += '<$button class="appify-split-btn appify-split-btn-delete" tooltip="Remove this pane">' +
				'<$action-appify-split app="' + esc(appTitle) + '" slot="' + esc(address) + '" operation="delete"/>' +
				'\u2715</$button>';
		}
		wt += '</span></div>';

		var labelParsed = this.wiki.parseText("text/vnd.tiddlywiki", wt, { parseAsInline: false });
		if(labelParsed && labelParsed.tree) {
			content = content.concat(labelParsed.tree);
		}

		// Editor or view-input for empty slots
		if(viewTiddler) {
			content.push({
				type: "edit-text",
				attributes: {
					tiddler: { type: "string", value: viewTiddler },
					field: { type: "string", value: "text" },
					tag: { type: "string", value: "textarea" },
					"class": { type: "string", value: "appify-editor-textarea" },
					"default": { type: "string", value: "" }
				}
			});
		} else {
			var tempTiddler = "$:/temp/rimir/appify/view-input/" + address;
			var inputWt = '<div class="appify-view-input-container">' +
				'<$edit-text tiddler="' + esc(tempTiddler) + '" field="text" tag="input" ' +
				'placeholder="Enter tiddler title..." class="appify-view-input"/>' +
				'<$button class="appify-split-btn appify-split-btn-apply">' +
				'<$action-appify-split app="' + esc(appTitle) + '" slot="' + esc(address) + '" ' +
				'operation="set-view" value={{' + tempTiddler + '}}/>' +
				'Apply</$button></div>';
			var inputParsed = this.wiki.parseText("text/vnd.tiddlywiki", inputWt, { parseAsInline: false });
			if(inputParsed && inputParsed.tree) {
				content = content.concat(inputParsed.tree);
			}
		}
	} else {
		// View mode
		if(viewTiddler) {
			content.push({
				type: "transclude",
				attributes: { "$tiddler": { type: "string", value: viewTiddler } }
			});
		}
	}

	return content;
};

AppifyAppWidget.prototype.refresh = function(changedTiddlers) {
	if(this.appTitle && changedTiddlers[this.appTitle]) {
		this.refreshSelf();
		return true;
	}
	if(this.layoutTitle && changedTiddlers[this.layoutTitle]) {
		this.refreshSelf();
		return true;
	}
	if(changedTiddlers[EDIT_MODE_TIDDLER]) {
		this.refreshSelf();
		return true;
	}
	if(changedTiddlers[SPLITS_CHANGED_TIDDLER]) {
		this.refreshSelf();
		return true;
	}
	return this.refreshChildren(changedTiddlers);
};

exports["appify-app"] = AppifyAppWidget;

})();
