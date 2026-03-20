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
		var escAttr = function(s) { return s.replace(/"/g, "&quot;"); };
		var escApp = escAttr(appTitle);
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
			'<$action-setfield $tiddler="$:/state/rimir/appify/clone-name" text="' + escAttr((fields.caption || "App") + " (copy)") + '"/>' +
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

		var overlayWt = '<$let app="' + escAttr(appTitle) + '">' +
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

	this.makeChildWidgets([statewrapNode]);
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

	// Read conditions from child nodes
	var cond0 = node.children[0] ? node.children[0].condition : null;
	var cond1 = node.children[1] ? node.children[1].condition : null;

	// For stacked views leaves: derive condition if all views have conditions
	if(!cond0 && node.children[0] && node.children[0].views) {
		cond0 = this.derivePaneCondition(node.children[0]);
	}
	if(!cond1 && node.children[1] && node.children[1].views) {
		cond1 = this.derivePaneCondition(node.children[1]);
	}

	// Conditional panes: $list wraps the pane div entirely.
	// When condition false: pane div removed from DOM, sibling fills via flex:1.
	// When one pane has a condition, the non-conditional sibling gets flex:1 and
	// the conditional pane gets a relative ratio (e.g. ratio=0.6 → flex:1 vs flex:0.667 → 60/40).
	var flex0 = ratio, flex1 = 1 - ratio;
	if(cond0 && !cond1) {
		flex1 = 1;
		flex0 = ratio / (1 - ratio);
	} else if(cond1 && !cond0) {
		flex0 = 1;
		flex1 = (1 - ratio) / ratio;
	}

	var pane0Node = {
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: pane0Class },
			"style": { type: "string", value: "flex: " + flex0 + ";" }
		},
		children: child0
	};
	var pane1Node = {
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: pane1Class },
			"style": { type: "string", value: "flex: " + flex1 + ";" }
		},
		children: child1
	};
	var handleNode = {
		type: "element", tag: "div",
		attributes: {
			"class": { type: "string", value: "appify-split-handle appify-split-handle-" + (isH ? "h" : "v") },
			"data-split-path": { type: "string", value: address },
			"data-appify-app": { type: "string", value: appTitle }
		}
	};

	// Wrap conditional panes in $list (removed from DOM when condition false)
	if(cond0) {
		pane0Node = {
			type: "list",
			attributes: {
				filter: { type: "string", value: cond0 + "+[limit[1]]" },
				variable: { type: "string", value: "__cond__" }
			},
			children: [pane0Node]
		};
	}
	if(cond1) {
		pane1Node = {
			type: "list",
			attributes: {
				filter: { type: "string", value: cond1 + "+[limit[1]]" },
				variable: { type: "string", value: "__cond__" }
			},
			children: [pane1Node]
		};
	}

	// Handle: hide when either conditional sibling is hidden (nested $list, no placeholder needed)
	var handleResult = handleNode;
	if(cond1) {
		handleResult = { type: "list", attributes: { filter: { type: "string", value: cond1 + "+[limit[1]]" }, variable: { type: "string", value: "__cond__" } }, children: [handleResult] };
	}
	if(cond0) {
		handleResult = { type: "list", attributes: { filter: { type: "string", value: cond0 + "+[limit[1]]" }, variable: { type: "string", value: "__cond__" } }, children: [handleResult] };
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

AppifyAppWidget.prototype.buildLeafContent = function(viewTiddler, editMode, appTitle, address, node) {
	var content = [];

	// Check for stacked views
	if(node && node.views && node.views.length > 0) {
		return this.buildStackedContent(node.views, editMode, appTitle, address);
	}

	if(editMode) {
		// Build label with split/delete buttons via parsed wikitext
		var isSubSlot = address.indexOf(".") !== -1;
		var viewLabel = viewTiddler ? " \u2192 " + viewTiddler : "";
		var esc = function(s) { return s.replace(/"/g, "&quot;"); };

		var wt = '<div class="appify-slot-label">' +
			'<span class="appify-slot-label-text">' + address + '<span class="appify-slot-label-tiddler">' + viewLabel + '</span></span>' +
			'<span class="appify-slot-actions">';

		if(viewTiddler) {
			wt += '<$button class="appify-split-btn" tooltip="Edit view tiddler">' +
				'<$action-appify-edit app="' + esc(appTitle) + '" tiddler="' + esc(viewTiddler) + '" operation="open"/>' +
				'\u270E</$button>';
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

// Build content for a leaf with stacked views (tab groups).
// views: array of {view, label, condition}
AppifyAppWidget.prototype.buildStackedContent = function(views, editMode, appTitle, address) {
	var esc = function(s) { return s.replace(/"/g, "&quot;"); };
	var tabStateTiddler = "$:/state/rimir/appify/tab/" + appTitle + "/" + address;
	var wt = "";

	if(editMode) {
		// Edit mode: show label bar with stacked indicator
		var isSubSlot = address.indexOf(".") !== -1;
		wt += '<div class="appify-slot-label">' +
			'<span class="appify-slot-label-text">' + address +
			'<span class="appify-slot-label-tiddler"> \u2192 [' + views.length + ' stacked views]</span></span>' +
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

		// Show each view entry with condition info
		wt += '<div class="appify-stacked-edit-list">';
		for(var i = 0; i < views.length; i++) {
			var v = views[i];
			var label = v.label || (v.view ? v.view.split("/").pop() : "empty");
			wt += '<div class="appify-stacked-edit-item">' +
				'<span class="appify-stacked-edit-label">' + label + '</span>' +
				' <span class="appify-stacked-edit-view">' + (v.view || "(no view)") + '</span>';
			if(v.condition) {
				wt += ' <span class="appify-stacked-edit-cond" title="' + esc(v.condition) + '">\u26A1</span>';
			}
			wt += '</div>';
		}
		wt += '</div>';
	} else {
		// View mode: tab bar + content panels.
		// $list wraps conditional views, $reveal switches active tab.
		// Tab bar auto-hides via CSS :only-child when a single tab is visible.

		// Default tab: first unconditional view, or first view
		var defaultView = views[0].view || "";
		for(var d = 0; d < views.length; d++) {
			if(!views[d].condition) { defaultView = views[d].view || ""; break; }
		}

		// All $reveal widgets get default=defaultView so the first view shows
		// when the state tiddler doesn't exist yet.
		wt += '<div class="appify-tab-bar">';
		for(var t = 0; t < views.length; t++) {
			var tv = views[t];
			var tLabel = tv.label || (tv.view ? tv.view.split("/").pop() : "Tab " + t);
			var tabBtn = '<$button class="appify-tab-btn" ' +
				'set="' + esc(tabStateTiddler) + '" setTo="' + esc(tv.view || "") + '">' +
				'<$reveal stateTitle="' + esc(tabStateTiddler) + '" type="match" text="' + esc(tv.view || "") + '" default="' + esc(defaultView) + '">' +
				'<span class="appify-tab-active">' + tLabel + '</span>' +
				'</$reveal>' +
				'<$reveal stateTitle="' + esc(tabStateTiddler) + '" type="nomatch" text="' + esc(tv.view || "") + '" default="' + esc(defaultView) + '">' +
				tLabel +
				'</$reveal>' +
				'</$button>';
			if(tv.condition) {
				wt += '<$list filter="' + esc(tv.condition) + '">' + tabBtn + '</$list>';
			} else {
				wt += tabBtn;
			}
		}
		wt += '</div>';

		// Build content panels
		wt += '<div class="appify-tab-content">';
		for(var p = 0; p < views.length; p++) {
			var pv = views[p];
			var panel = '<$reveal stateTitle="' + esc(tabStateTiddler) + '" type="match" text="' + esc(pv.view || "") + '" default="' + esc(defaultView) + '">' +
				(pv.view ? '<$transclude $tiddler="' + esc(pv.view) + '"/>' : '') +
				'</$reveal>';
			if(pv.condition) {
				wt += '<$list filter="' + esc(pv.condition) + '">' + panel + '</$list>';
			} else {
				wt += panel;
			}
		}
		wt += '</div>';
	}

	var parsed = this.wiki.parseText("text/vnd.tiddlywiki", wt, { parseAsInline: false });
	return (parsed && parsed.tree) ? parsed.tree : [];
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
