/*\
title: $:/plugins/rimir/appify/modules/startup/drag-resize.js
type: application/javascript
module-type: startup

Adds draggable resize handles to appify grid layouts.
Observes DOM for .appify-grid elements, creates handles at track boundaries,
and saves proportions to config tiddlers on drag end.

\*/
(function(){

"use strict";

exports.name = "appify-drag-resize";
exports.platforms = ["browser"];
exports.after = ["startup"];

var HANDLE_WIDTH = 8;
var MIN_TRACK_SIZE = 50;
var dragState = null;

exports.startup = function() {
	// Observe DOM for grid elements appearing
	var observer = new MutationObserver(function(mutations) {
		var grids = [];
		for(var m = 0; m < mutations.length; m++) {
			var added = mutations[m].addedNodes;
			for(var i = 0; i < added.length; i++) {
				var node = added[i];
				if(node.nodeType !== 1) continue;
				if(node.classList && node.classList.contains("appify-grid") && node.dataset.appifyApp) {
					if(grids.indexOf(node) === -1) grids.push(node);
				}
				if(node.querySelectorAll) {
					var nested = node.querySelectorAll(".appify-grid[data-appify-app]");
					for(var j = 0; j < nested.length; j++) {
						if(grids.indexOf(nested[j]) === -1) grids.push(nested[j]);
					}
				}
			}
		}
		if(grids.length > 0) {
			requestAnimationFrame(function() {
				for(var k = 0; k < grids.length; k++) {
					setupDragHandles(grids[k]);
				}
			});
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });

	// Reposition handles on window resize
	window.addEventListener("resize", function() {
		var grids = document.querySelectorAll(".appify-grid[data-appify-app]");
		for(var i = 0; i < grids.length; i++) {
			if(grids[i]._appifyDragSetup) {
				repositionHandles(grids[i]);
			}
		}
	});

	// Split handle drag via event delegation
	document.addEventListener("mousedown", function(e) {
		var handle = e.target;
		if(!handle.classList || !handle.classList.contains("appify-split-handle")) return;
		e.preventDefault();
		e.stopPropagation();
		startSplitDrag(handle, e.clientX, e.clientY);
	}, false);
};

function setupDragHandles(gridEl) {
	if(gridEl._appifyDragSetup) return;
	gridEl._appifyDragSetup = true;
	gridEl.style.position = "relative";

	var computed = window.getComputedStyle(gridEl);
	var colSizes = parseSizes(computed.gridTemplateColumns);
	var rowSizes = parseSizes(computed.gridTemplateRows);
	var gap = parseFloat(computed.gap) || parseFloat(computed.columnGap) || 1;

	// Column handles (between each pair of columns)
	var cumWidth = 0;
	for(var i = 0; i < colSizes.length - 1; i++) {
		cumWidth += colSizes[i] + gap;
		createHandle(gridEl, "col", i,
			cumWidth - gap / 2 - HANDLE_WIDTH / 2, 0,
			HANDLE_WIDTH, "100%");
	}

	// Row handles — skip if original template contains "auto"
	var originalRows = gridEl.dataset.appifyOriginalRows || "";
	if(originalRows.indexOf("auto") === -1 && rowSizes.length > 1) {
		var cumHeight = 0;
		for(var j = 0; j < rowSizes.length - 1; j++) {
			cumHeight += rowSizes[j] + gap;
			createHandle(gridEl, "row", j,
				0, cumHeight - gap / 2 - HANDLE_WIDTH / 2,
				"100%", HANDLE_WIDTH);
		}
	}
}

function createHandle(gridEl, type, index, left, top, width, height) {
	var handle = document.createElement("div");
	handle.className = "appify-drag-handle appify-drag-handle-" + type;
	handle.style.position = "absolute";
	handle.style.left = (typeof left === "number") ? left + "px" : left;
	handle.style.top = (typeof top === "number") ? top + "px" : top;
	handle.style.width = (typeof width === "number") ? width + "px" : width;
	handle.style.height = (typeof height === "number") ? height + "px" : height;
	handle.style.zIndex = "10";
	handle.dataset.handleType = type;
	handle.dataset.handleIndex = index;
	gridEl.appendChild(handle);

	handle.addEventListener("mousedown", function(e) {
		e.preventDefault();
		e.stopPropagation();
		startDrag(gridEl, type, index, e.clientX, e.clientY);
	});
}

function startDrag(gridEl, type, index, startX, startY) {
	var computed = window.getComputedStyle(gridEl);
	var sizes = type === "col"
		? parseSizes(computed.gridTemplateColumns)
		: parseSizes(computed.gridTemplateRows);

	dragState = {
		gridEl: gridEl,
		type: type,
		index: index,
		startPos: type === "col" ? startX : startY,
		startSizes: sizes.slice()
	};

	document.addEventListener("mousemove", onDrag, true);
	document.addEventListener("mouseup", onDragEnd, true);
	document.body.style.cursor = type === "col" ? "col-resize" : "row-resize";
	document.body.style.userSelect = "none";
	document.body.style.webkitUserSelect = "none";
}

function onDrag(e) {
	if(!dragState) return;
	e.preventDefault();

	var pos = dragState.type === "col" ? e.clientX : e.clientY;
	var delta = pos - dragState.startPos;
	var sizes = dragState.startSizes.slice();
	var i = dragState.index;

	var newA = sizes[i] + delta;
	var newB = sizes[i + 1] - delta;

	// Enforce minimums
	if(newA < MIN_TRACK_SIZE) {
		delta = MIN_TRACK_SIZE - dragState.startSizes[i];
		newA = MIN_TRACK_SIZE;
		newB = dragState.startSizes[i + 1] - delta;
	}
	if(newB < MIN_TRACK_SIZE) {
		delta = dragState.startSizes[i + 1] - MIN_TRACK_SIZE;
		newA = dragState.startSizes[i] + delta;
		newB = MIN_TRACK_SIZE;
	}

	sizes[i] = newA;
	sizes[i + 1] = newB;

	// Convert to fr proportions
	var total = 0;
	for(var t = 0; t < sizes.length; t++) total += sizes[t];
	var frValues = [];
	for(var f = 0; f < sizes.length; f++) {
		frValues.push((sizes[f] / total).toFixed(6) + "fr");
	}

	if(dragState.type === "col") {
		dragState.gridEl.style.gridTemplateColumns = frValues.join(" ");
	} else {
		dragState.gridEl.style.gridTemplateRows = frValues.join(" ");
	}

	repositionHandles(dragState.gridEl);
}

function onDragEnd() {
	if(!dragState) return;

	saveProportions(dragState.gridEl);

	document.removeEventListener("mousemove", onDrag, true);
	document.removeEventListener("mouseup", onDragEnd, true);
	document.body.style.cursor = "";
	document.body.style.userSelect = "";
	document.body.style.webkitUserSelect = "";
	dragState = null;
}

function saveProportions(gridEl) {
	var appTitle = gridEl.dataset.appifyApp;
	if(!appTitle) return;

	var computed = window.getComputedStyle(gridEl);
	var colSizes = parseSizes(computed.gridTemplateColumns);
	var rowSizes = parseSizes(computed.gridTemplateRows);

	var colTotal = 0, rowTotal = 0;
	for(var i = 0; i < colSizes.length; i++) colTotal += colSizes[i];
	for(var j = 0; j < rowSizes.length; j++) rowTotal += rowSizes[j];
	colTotal = colTotal || 1;
	rowTotal = rowTotal || 1;

	var proportions = { columns: [], rows: [] };
	for(var ci = 0; ci < colSizes.length; ci++) {
		proportions.columns.push(+(colSizes[ci] / colTotal).toFixed(6));
	}
	for(var ri = 0; ri < rowSizes.length; ri++) {
		proportions.rows.push(+(rowSizes[ri] / rowTotal).toFixed(6));
	}

	var configTitle = "$:/config/rimir/appify/proportions/" + appTitle;
	$tw.wiki.addTiddler(new $tw.Tiddler({
		title: configTitle,
		type: "application/json",
		text: JSON.stringify(proportions)
	}));
}

function repositionHandles(gridEl) {
	var computed = window.getComputedStyle(gridEl);
	var colSizes = parseSizes(computed.gridTemplateColumns);
	var rowSizes = parseSizes(computed.gridTemplateRows);
	var gap = parseFloat(computed.gap) || parseFloat(computed.columnGap) || 1;

	var colHandles = gridEl.querySelectorAll(".appify-drag-handle-col");
	var cumWidth = 0;
	for(var i = 0; i < colHandles.length; i++) {
		cumWidth += colSizes[i] + gap;
		colHandles[i].style.left = (cumWidth - gap / 2 - HANDLE_WIDTH / 2) + "px";
	}

	var rowHandles = gridEl.querySelectorAll(".appify-drag-handle-row");
	var cumHeight = 0;
	for(var j = 0; j < rowHandles.length; j++) {
		cumHeight += rowSizes[j] + gap;
		rowHandles[j].style.top = (cumHeight - gap / 2 - HANDLE_WIDTH / 2) + "px";
	}
}

function parseSizes(str) {
	if(!str) return [];
	var parts = str.trim().split(/\s+/);
	var result = [];
	for(var i = 0; i < parts.length; i++) {
		var n = parseFloat(parts[i]);
		if(!isNaN(n)) result.push(n);
	}
	return result;
}

// --- Split handle drag ---

function startSplitDrag(handle, startX, startY) {
	var container = handle.parentElement;
	if(!container || !container.classList.contains("appify-split")) return;

	var isH = container.classList.contains("appify-split-h");
	var panes = [];
	var children = container.children;
	for(var i = 0; i < children.length; i++) {
		if(children[i].classList.contains("appify-split-pane")) {
			panes.push(children[i]);
		}
	}
	if(panes.length !== 2) return;

	var containerRect = container.getBoundingClientRect();
	var totalSize = isH ? containerRect.width : containerRect.height;
	var handleSize = isH ? handle.offsetWidth : handle.offsetHeight;
	var usableSize = totalSize - handleSize;
	var startSize0 = isH ? panes[0].getBoundingClientRect().width : panes[0].getBoundingClientRect().height;

	dragState = {
		type: "split",
		isH: isH,
		startPos: isH ? startX : startY,
		startSize0: startSize0,
		usableSize: usableSize,
		pane0: panes[0],
		pane1: panes[1],
		splitPath: handle.dataset.splitPath || "",
		appTitle: handle.dataset.appifyApp || ""
	};

	document.addEventListener("mousemove", onSplitDrag, true);
	document.addEventListener("mouseup", onSplitDragEnd, true);
	document.body.style.cursor = isH ? "col-resize" : "row-resize";
	document.body.style.userSelect = "none";
	document.body.style.webkitUserSelect = "none";
}

function onSplitDrag(e) {
	if(!dragState || dragState.type !== "split") return;
	e.preventDefault();

	var pos = dragState.isH ? e.clientX : e.clientY;
	var delta = pos - dragState.startPos;
	var newSize0 = Math.max(MIN_TRACK_SIZE, Math.min(
		dragState.usableSize - MIN_TRACK_SIZE, dragState.startSize0 + delta));
	var ratio = newSize0 / dragState.usableSize;

	dragState.pane0.style.flex = ratio;
	dragState.pane1.style.flex = 1 - ratio;
	dragState.lastRatio = ratio;
}

function onSplitDragEnd() {
	if(!dragState || dragState.type !== "split") return;

	if(dragState.appTitle && dragState.splitPath && dragState.lastRatio !== undefined) {
		saveSplitRatio(dragState.appTitle, dragState.splitPath, dragState.lastRatio);
	}

	document.removeEventListener("mousemove", onSplitDrag, true);
	document.removeEventListener("mouseup", onSplitDragEnd, true);
	document.body.style.cursor = "";
	document.body.style.userSelect = "";
	document.body.style.webkitUserSelect = "";
	dragState = null;
}

function saveSplitRatio(appTitle, splitPath, ratio) {
	var configTitle = "$:/config/rimir/appify/splits/" + appTitle;
	var config = {};
	var tiddler = $tw.wiki.getTiddler(configTitle);
	if(tiddler && tiddler.fields.text) {
		try { config = JSON.parse(tiddler.fields.text); } catch(e) {}
	}

	var parts = splitPath.split(".");
	var rootSlot = parts[0];
	var node = config[rootSlot];
	if(!node) return;

	// Navigate to the split node
	for(var i = 1; i < parts.length; i++) {
		if(!node || !node.children) return;
		node = node.children[parseInt(parts[i], 10)];
	}

	if(node && node.direction) {
		node.ratio = +ratio.toFixed(4);
		$tw.wiki.addTiddler(new $tw.Tiddler({
			title: configTitle,
			type: "application/json",
			text: JSON.stringify(config)
		}));
	}
}

})();

