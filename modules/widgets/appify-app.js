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

function esc(s) { return s.replace(/"/g, "&quot;"); }

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
	this.propConfigTitle = propConfigTitle;
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
	this.splitsConfigTitle = "$:/config/rimir/appify/splits/" + appTitle;
	var splitsTiddler = this.wiki.getTiddler(this.splitsConfigTitle);
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
	if(editMode) {
		var debugBarChildren = [];

		// Channel values (only if channels exist)
		if(channelNames.length > 0) {
			var statePrefix = "$:/state/rimir/statewrap/" + appTitle + "/";
			debugBarChildren.push({
				type: "element", tag: "span",
				attributes: { "class": { type: "string", value: "appify-debug-title" } },
				children: [{ type: "text", text: "Channels" }]
			});
			for(var k = 0; k < channelNames.length; k++) {
				var chName = channelNames[k];
				if(k > 0) {
					debugBarChildren.push({
						type: "element", tag: "span",
						attributes: { "class": { type: "string", value: "appify-debug-sep" } },
						children: [{ type: "text", text: "|" }]
					});
				}
				debugBarChildren.push({
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
		}

		// Modal trigger buttons (always shown in edit mode)
		var escApp = esc(appTitle);
		var btnWt = '<span class="appify-debug-actions">' +
			'<$button class="appify-debug-btn" tooltip="Channel editor">' +
			'<$action-sendmessage $message="tm-modal" $param="$:/plugins/rimir/appify/ui/modal-channels" app="' + escApp + '"/>' +
			'\u2699</$button>' +
			'<$button class="appify-debug-btn" tooltip="Rule editor">' +
			'<$action-appify-rule app="' + escApp + '" operation="parse"/>' +
			'<$action-sendmessage $message="tm-modal" $param="$:/plugins/rimir/appify/ui/modal-rules" app="' + escApp + '"/>' +
			'\u21C4</$button>' +
			'<$button class="appify-debug-btn" tooltip="Debug inspector">' +
			'<$action-appify-rule app="' + escApp + '" operation="parse"/>' +
			'<$action-sendmessage $message="tm-modal" $param="$:/plugins/rimir/appify/ui/modal-debug" app="' + escApp + '"/>' +
			'\uD83D\uDD0D</$button>' +
			'<$button class="appify-debug-btn" tooltip="Clone app">' +
			'<$action-setfield $tiddler="$:/state/rimir/appify/clone-name" text="' + esc((fields.caption || "App") + " (copy)") + '"/>' +
			'<$action-sendmessage $message="tm-modal" $param="$:/plugins/rimir/appify/ui/modal-clone" app="' + escApp + '"/>' +
			'\u29C9</$button>' +
			'<$button class="appify-debug-btn appify-debug-btn-danger" tooltip="Delete app">' +
			'<$action-sendmessage $message="tm-modal" $param="$:/plugins/rimir/appify/ui/modal-delete" app="' + escApp + '"/>' +
			'\u2715</$button>' +
			'</span>';

		var btnParsed = this.wiki.parseText("text/vnd.tiddlywiki", btnWt, { parseAsInline: false });
		if(btnParsed && btnParsed.tree) {
			debugBarChildren = debugBarChildren.concat(btnParsed.tree);
		}

		preGridNodes.push({
			type: "element", tag: "div",
			attributes: { "class": { type: "string", value: "appify-debug-bar" } },
			children: debugBarChildren
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

	// Edit overlay (in-DOM, not a modal — FramedEngine needs ownerDocument)
	var editOverlayNodes = [];
	if(editMode) {
		var editStateTitle = "$:/state/rimir/appify/edit-target/" + appTitle;

		var overlayWt = '<$let app="' + esc(appTitle) + '">' +
			'<$transclude $tiddler="$:/plugins/rimir/appify/ui/edit-overlay"/>' +
			'</$let>';

		var overlayParsed = this.wiki.parseText("text/vnd.tiddlywiki", overlayWt, { parseAsInline: false });
		if(overlayParsed && overlayParsed.tree) {
			editOverlayNodes.push({
				type: "reveal",
				attributes: {
					"stateTitle": { type: "string", value: editStateTitle },
					"type": { type: "string", value: "nomatch" },
					"text": { type: "string", value: "" }
				},
				children: overlayParsed.tree
			});
		}
	}

	var statewrapNode = {
		type: "statewrap",
		attributes: statewrapAttrs,
		children: bodyTree.concat(preGridNodes).concat([gridNode]).concat(editOverlayNodes)
	};

	// Wrap in importvariables so global macros/functions/procedures are
	// available inside dynamically generated wikitext (stacked views, splits).
	var importNode = {
		type: "importvariables",
		attributes: {
			"filter": { type: "string", value: "[all[shadows+tiddlers]tag[$:/tags/Global]] [all[shadows+tiddlers]tag[$:/tags/Macro]]" }
		},
		children: [statewrapNode]
	};

	this.makeChildWidgets([importNode]);
};

// --- Recursive slot builders ---

AppifyAppWidget.prototype.buildSlotContent = function(node, defaultView, editMode, appTitle, address) {
	if(node && node.direction) {
		return this.buildSplitContent(node, editMode, appTitle, address);
	}
	var view = (node && node.view !== undefined) ? node.view : defaultView;
	return this.buildLeafContent(view, editMode, appTitle, address, node);
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

	var handleNode = {
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: "appify-split-handle appify-split-handle-" + (isH ? "h" : "v") },
			"data-split-path": { type: "string", value: address },
			"data-appify-app": { type: "string", value: appTitle }
		}
	};

	var pane0Node, pane1Node, handleResult;

	if(editMode) {
		// Edit mode: show ALL panes regardless of conditions (maximal layout)
		pane0Node = {
			type: "element", tag: "div",
			attributes: {
				"class": { type: "string", value: pane0Class },
				"style": { type: "string", value: "flex: " + ratio + ";" }
			},
			children: child0
		};
		pane1Node = {
			type: "element", tag: "div",
			attributes: {
				"class": { type: "string", value: pane1Class },
				"style": { type: "string", value: "flex: " + (1 - ratio) + ";" }
			},
			children: child1
		};
		handleResult = handleNode;
	} else {
		// View mode: conditional panes wrapped in $list, flex normalized
		var cond0 = node.children[0] ? node.children[0].condition : null;
		var cond1 = node.children[1] ? node.children[1].condition : null;

		if(!cond0 && node.children[0] && node.children[0].views) {
			cond0 = this.derivePaneCondition(node.children[0]);
		}
		if(!cond1 && node.children[1] && node.children[1].views) {
			cond1 = this.derivePaneCondition(node.children[1]);
		}

		var flex0 = ratio, flex1 = 1 - ratio;
		if(cond0 && !cond1) {
			flex1 = 1;
			flex0 = ratio / (1 - ratio);
		} else if(cond1 && !cond0) {
			flex0 = 1;
			flex1 = (1 - ratio) / ratio;
		}

		pane0Node = {
			type: "element", tag: "div",
			attributes: {
				"class": { type: "string", value: pane0Class },
				"style": { type: "string", value: "flex: " + flex0 + ";" }
			},
			children: child0
		};
		pane1Node = {
			type: "element", tag: "div",
			attributes: {
				"class": { type: "string", value: pane1Class },
				"style": { type: "string", value: "flex: " + flex1 + ";" }
			},
			children: child1
		};

		if(cond0) {
			pane0Node = {
				type: "list",
				attributes: { filter: { type: "string", value: cond0 + "+[limit[1]]" }, variable: { type: "string", value: "__cond__" } },
				children: [pane0Node]
			};
		}
		if(cond1) {
			pane1Node = {
				type: "list",
				attributes: { filter: { type: "string", value: cond1 + "+[limit[1]]" }, variable: { type: "string", value: "__cond__" } },
				children: [pane1Node]
			};
		}

		handleResult = handleNode;
		if(cond1) {
			handleResult = { type: "list", attributes: { filter: { type: "string", value: cond1 + "+[limit[1]]" }, variable: { type: "string", value: "__cond__" } }, children: [handleResult] };
		}
		if(cond0) {
			handleResult = { type: "list", attributes: { filter: { type: "string", value: cond0 + "+[limit[1]]" }, variable: { type: "string", value: "__cond__" } }, children: [handleResult] };
		}
	}

	return [{
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: "appify-split appify-split-" + (isH ? "h" : "v") },
			"data-split-path": { type: "string", value: address },
			"data-appify-app": { type: "string", value: appTitle }
		},
		children: [pane0Node, handleResult, pane1Node]
	}];
};

// Derive a combined condition filter for a stacked-views leaf node.
// Returns null if any view has no condition (always visible → pane always visible).
// Otherwise returns a filter that produces output if at least one view's condition is met.
AppifyAppWidget.prototype.derivePaneCondition = function(node) {
	var views = node.views;
	if(!views || !views.length) return null;
	var conditions = [];
	for(var i = 0; i < views.length; i++) {
		if(!views[i].condition) return null; // at least one always-visible → pane always visible
		conditions.push(views[i].condition);
	}
	// Combine: each condition is a separate filter run; TW appends all results.
	// If ANY run produces output, the combined result is non-empty → $list renders.
	// Wrap each in limit[1] to keep output minimal.
	return conditions.map(function(c) { return c + "+[limit[1]]"; }).join(" ");
};

// Helper: build condition editor via transcluded template (ui/edit-condition.tid).
// Pre-populates temp tiddler with current condition to stay in sync with config.
AppifyAppWidget.prototype.buildConditionEditor = function(appTitle, address, currentCondition, operation, indexAttr) {
	var condTemp = "$:/temp/rimir/appify/condition-input/" + address + (indexAttr !== undefined ? "." + indexAttr : "");
	if(currentCondition) {
		this.wiki.setText(condTemp, "text", null, currentCondition);
	}
	var clearOp = operation.replace("set-", "clear-");
	var idx = (indexAttr !== undefined) ? "" + indexAttr : "-1";
	return '<$transclude $tiddler="$:/plugins/rimir/appify/ui/edit-condition" app="' + esc(appTitle) +
		'" slot="' + esc(address) + '" temp="' + esc(condTemp) +
		'" operation="' + operation + '" clearOperation="' + clearOp + '" index="' + idx + '"/>';
};

// Helper: build view selector via transcluded template (ui/edit-view-selector.tid).
// Pre-populates temp tiddler with current view to show it preselected in the dropdown.
// For stacked views, pass operation="set-stack-view" and index to target a specific view entry.
AppifyAppWidget.prototype.buildViewSelector = function(appTitle, address, tempTiddler, currentView, operation, index) {
	if(currentView) {
		this.wiki.setText(tempTiddler, "text", null, currentView);
	}
	var attrs = ' app="' + esc(appTitle) + '" slot="' + esc(address) + '" temp="' + esc(tempTiddler) + '"';
	if(operation) attrs += ' operation="' + operation + '"';
	if(index !== undefined) attrs += ' index="' + index + '"';
	return '<$transclude $tiddler="$:/plugins/rimir/appify/ui/edit-view-selector"' + attrs + '/>';
};

AppifyAppWidget.prototype.buildLeafContent = function(viewTiddler, editMode, appTitle, address, node) {
	var content = [];

	// Check for stacked views
	if(node && node.views && node.views.length > 0) {
		return this.buildStackedContent(node.views, editMode, appTitle, address);
	}

	if(editMode) {
		// Build all edit-mode content as a single wikitext string to avoid
		// paragraph wrappers from multiple separate parse operations.
		var isSubSlot = address.indexOf(".") !== -1;
		var viewLabel = viewTiddler ? " \u2192 " + viewTiddler : "";
		var condition = (node && node.condition) ? node.condition : "";

		var wt = '<div class="appify-slot-label">' +
			'<span class="appify-slot-label-text">' + address + '<span class="appify-slot-label-tiddler">' + viewLabel + '</span></span>' +
			'<span class="appify-slot-actions">';

		if(viewTiddler) {
			wt += '<$button class="appify-split-btn" tooltip="Edit view tiddler">' +
				'<$action-appify-edit app="' + esc(appTitle) + '" tiddler="' + esc(viewTiddler) + '" operation="open"/>' +
				'\u270E</$button>' +
				'<$button class="appify-split-btn" tooltip="Clone view to app namespace">' +
				'<$action-appify-clone-view app="' + esc(appTitle) + '" slot="' + esc(address) + '" tiddler="' + esc(viewTiddler) + '"/>' +
				'\u29C9</$button>';
		}

		wt += '<$button class="appify-split-btn" tooltip="Split horizontal">' +
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

		// Condition editor (for pane-level conditions)
		if(isSubSlot) {
			wt += this.buildConditionEditor(appTitle, address, condition, "set-condition");
		}

		// View selector (always shown, with current view preselected)
		var tempTiddler = "$:/temp/rimir/appify/view-input/" + address;
		wt += this.buildViewSelector(appTitle, address, tempTiddler, viewTiddler || "");

		// Editor textarea (only when view is assigned)
		if(viewTiddler) {
			wt += '<$edit-text tiddler="' + esc(viewTiddler) + '" field="text" tag="textarea" class="appify-editor-textarea" default=""/>';
		}

		var parsed = this.wiki.parseText("text/vnd.tiddlywiki", wt, { parseAsInline: false });
		if(parsed && parsed.tree) {
			content = content.concat(parsed.tree);
		}
	} else {
		// View mode
		if(viewTiddler) {
			content.push({
				type: "transclude",
				attributes: {
					"$tiddler": { type: "string", value: viewTiddler },
					"$mode": { type: "string", value: "block" }
				}
			});
		}
	}

	return content;
};

// Build content for a leaf with stacked views (tab groups).
// views: array of {view, label, condition}
AppifyAppWidget.prototype.buildStackedContent = function(views, editMode, appTitle, address) {
	var tabStateTiddler = "$:/state/rimir/appify/tab/" + appTitle + "/" + address;
	var defaultView = views[0].view || "";
	var wt = "";

	if(editMode) {
		// Edit mode: functional tabs with editors per view
		var isSubSlot = address.indexOf(".") !== -1;

		// Label bar (pencil opens edit overlay for the currently active tab)
		wt += '<$set name="__activeView__" filter="[[' + esc(tabStateTiddler) + ']get[text]else[' + esc(defaultView) + ']]" select="0">' +
			'<div class="appify-slot-label">' +
			'<span class="appify-slot-label-text">' + address +
			'<span class="appify-slot-label-tiddler"> \u2192 [stacked]</span></span>' +
			'<span class="appify-slot-actions">' +
			'<$button class="appify-split-btn" tooltip="Edit active view tiddler">' +
			'<$action-appify-edit app="' + esc(appTitle) + '" tiddler=<<__activeView__>> operation="open"/>' +
			'\u270E</$button>' +
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
		wt += '</span></div></$set>';

		// Tab bar (all views, no condition filtering in edit mode)
		wt += '<$set name="__editTab__" filter="[[' + esc(tabStateTiddler) + ']get[text]else[' + esc(defaultView) + ']]" select="0">' +
			'<div class="appify-tab-bar appify-tab-bar-edit">';
		for(var t = 0; t < views.length; t++) {
			var tv = views[t];
			var tLabel = tv.label || (tv.view ? tv.view.split("/").pop() : "Tab " + t);
			wt += '<$transclude $tiddler="$:/plugins/rimir/appify/ui/tab-button" setTiddler="' + esc(tabStateTiddler) +
				'" value="' + esc(tv.view || ("__tab_" + t)) + '" activeValue=<<__editTab__>> label="' + esc(tLabel) + '"/>';
		}
		wt += '</div></$set>';

		// Tab content panels with editors (newlines for block-level parsing)
		wt += '\n<$set name="__editTab__" filter="[[' + esc(tabStateTiddler) + ']get[text]else[' + esc(defaultView) + ']]" select="0">' +
			'\n<div class="appify-tab-content appify-tab-content-edit">\n';
		for(var p = 0; p < views.length; p++) {
			var pv = views[p];
			var pvId = pv.view || ("__tab_" + p);
			wt += '<$list filter="[<__editTab__>match[' + esc(pvId) + ']]" variable="__x__">\n';

			// Action buttons: edit + clone
			if(pv.view) {
				wt += '<div class="appify-stacked-view-actions">' +
					'<$button class="appify-split-btn" tooltip="Edit view tiddler">' +
					'<$action-appify-edit app="' + esc(appTitle) + '" tiddler="' + esc(pv.view) + '" operation="open"/>' +
					'\u270E</$button>' +
					'<$button class="appify-split-btn" tooltip="Clone view to app namespace">' +
					'<$action-appify-clone-view app="' + esc(appTitle) + '" slot="' + esc(address) + '" tiddler="' + esc(pv.view) + '" index="' + p + '"/>' +
					'\u29C9</$button>' +
					'</div>\n';
			}

			// View selector (with current view preselected)
			var stackTemp = "$:/temp/rimir/appify/view-input/" + address + "." + p;
			wt += this.buildViewSelector(appTitle, address, stackTemp, pv.view || "", "set-stack-view", p) + '\n';

			// Condition editor for this view
			wt += this.buildConditionEditor(appTitle, address, pv.condition || "", "set-view-condition", p) + '\n';

			// Editor textarea
			if(pv.view) {
				wt += '<$edit-text tiddler="' + esc(pv.view) + '" field="text" tag="textarea" class="appify-editor-textarea" default=""/>\n';
			}

			wt += '</$list>\n';
		}
		wt += '</div></$set>';
	} else {
		// View mode: compute effective tab that falls back to first visible view
		// when the stored tab's condition becomes false.
		for(var d = 0; d < views.length; d++) {
			if(!views[d].condition) { defaultView = views[d].view || ""; break; }
		}

		// Each conditional view gets its own $set to evaluate independently.
		// The + prefix in TW filter runs operates on ALL accumulated output,
		// so conditions can't share a single filter expression.
		var setCloseCount = 0;
		for(var v = 0; v < views.length; v++) {
			var vTitle = views[v].view || "";
			var vn = "__vis_" + v + "__";
			if(views[v].condition) {
				wt += '<$set name="' + vn + '" filter="' + esc(views[v].condition) + '+[limit[1]then[' + esc(vTitle) + ']]" emptyValue="">';
			} else {
				wt += '<$set name="' + vn + '" value="' + esc(vTitle) + '">';
			}
			setCloseCount++;
		}

		// Compute effective tab from individual visibility variables (avoids enlist/join)
		// Step 1: read stored tab
		wt += '<$set name="__rawTab__" filter="[[' + esc(tabStateTiddler) + ']get[text]else[' + esc(defaultView) + ']]" select="0">';

		// Step 2: check if stored tab matches any visible view
		var matchFilter = "";
		for(var vm = 0; vm < views.length; vm++) {
			matchFilter += "[<__vis_" + vm + "__>match<__rawTab__>] ";
		}
		matchFilter += "+[first[]]";
		wt += '<$set name="__matchResult__" filter="' + esc(matchFilter.trim()) + '" select="0" emptyValue="">';

		// Step 3: use match if found, else first visible view (~ = else-if-empty prefix)
		var fallbackFilter = "[<__matchResult__>!is[blank]]";
		for(var vf = 0; vf < views.length; vf++) {
			fallbackFilter += " ~[<__vis_" + vf + "__>!is[blank]]";
		}
		wt += '<$set name="__effectiveTab__" filter="' + esc(fallbackFilter.trim()) + '" select="0">';

		// Tab bar — buttons write to state tiddler, visual active state from __effectiveTab__
		// Auto-hides via CSS :only-child when a single tab is visible.
		wt += '<div class="appify-tab-bar">';
		for(var t2 = 0; t2 < views.length; t2++) {
			var tv2 = views[t2];
			var tLabel2 = tv2.label || (tv2.view ? tv2.view.split("/").pop() : "Tab " + t2);
			var tabBtn = '<$transclude $tiddler="$:/plugins/rimir/appify/ui/tab-button" setTiddler="' + esc(tabStateTiddler) +
				'" value="' + esc(tv2.view || "") + '" activeValue=<<__effectiveTab__>> label="' + esc(tLabel2) + '"/>';
			if(tv2.condition) {
				wt += '<$list filter="' + esc(tv2.condition) + '">' + tabBtn + '</$list>';
			} else {
				wt += tabBtn;
			}
		}
		wt += '</div>';

		// Content panel — single $transclude driven by the computed effective tab
		wt += '\n<div class="appify-tab-content">\n' +
			'<$transclude $tiddler=<<__effectiveTab__>> $mode="block"/>\n' +
			'</div>';

		// Close $set wrappers: 3 (rawTab + matchResult + effectiveTab) + N (per-view visibility)
		wt += '</$set></$set></$set>';
		for(var vc = 0; vc < setCloseCount; vc++) {
			wt += '</$set>';
		}
	}

	var parsed = this.wiki.parseText("text/vnd.tiddlywiki", wt, { parseAsInline: false });
	return (parsed && parsed.tree) ? parsed.tree : [];
};

AppifyAppWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(changedAttributes.tiddler) {
		this.refreshSelf();
		return true;
	}
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
	if(this.propConfigTitle && changedTiddlers[this.propConfigTitle]) {
		this.refreshSelf();
		return true;
	}
	if(this.splitsConfigTitle && changedTiddlers[this.splitsConfigTitle]) {
		this.refreshSelf();
		return true;
	}
	return this.refreshChildren(changedTiddlers);
};

exports["appify-app"] = AppifyAppWidget;

})();
