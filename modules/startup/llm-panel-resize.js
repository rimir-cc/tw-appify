/*\
title: $:/plugins/rimir/appify/modules/startup/llm-panel-resize
type: application/javascript
module-type: startup

Adds edge and corner resize handles to the appify LLM chat panel

\*/
(function() {

"use strict";

exports.name = "appify-llm-panel-resize";
exports.platforms = ["browser"];
exports.after = ["render"];

var EDGE = 6;
var MIN_W = 320;
var MIN_H = 300;

exports.startup = function() {
	var state = null;

	document.addEventListener("mousedown", function(e) {
		var panel = findPanel(e.target);
		if (!panel) return;

		var zone = hitTest(panel, e.clientX, e.clientY);
		if (!zone) return;

		e.preventDefault();
		e.stopImmediatePropagation();

		var rect = panel.getBoundingClientRect();
		// Convert to top/left positioning and clear max-height constraint
		panel.style.left = rect.left + "px";
		panel.style.top = rect.top + "px";
		panel.style.right = "auto";
		panel.style.bottom = "auto";
		panel.style.width = rect.width + "px";
		panel.style.height = rect.height + "px";
		panel.style.maxHeight = "none";

		state = {
			panel: panel,
			zone: zone,
			startX: e.clientX,
			startY: e.clientY,
			startRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
		};

		document.body.style.cursor = cursorFor(zone);
		document.body.style.userSelect = "none";
		document.body.style.webkitUserSelect = "none";
	}, true);

	document.addEventListener("mousemove", function(e) {
		if (!state) {
			// Update cursor on hover
			var panel = findPanel(e.target);
			if (panel) {
				var zone = hitTest(panel, e.clientX, e.clientY);
				if (zone) {
					panel.style.cursor = cursorFor(zone);
				} else if (panel.style.cursor && panel.style.cursor !== "grab") {
					panel.style.cursor = "";
				}
			}
			return;
		}

		e.preventDefault();
		var dx = e.clientX - state.startX;
		var dy = e.clientY - state.startY;
		var s = state.startRect;
		var z = state.zone;
		var p = state.panel;

		var newLeft = s.left;
		var newTop = s.top;
		var newW = s.width;
		var newH = s.height;

		if (z.indexOf("w") !== -1) {
			newW = Math.max(MIN_W, s.width - dx);
			newLeft = s.left + s.width - newW;
		}
		if (z.indexOf("e") !== -1) {
			newW = Math.max(MIN_W, s.width + dx);
		}
		if (z.indexOf("n") !== -1) {
			newH = Math.max(MIN_H, s.height - dy);
			newTop = s.top + s.height - newH;
		}
		if (z.indexOf("s") !== -1) {
			newH = Math.max(MIN_H, s.height + dy);
		}

		p.style.left = newLeft + "px";
		p.style.top = newTop + "px";
		p.style.width = newW + "px";
		p.style.height = newH + "px";
	}, true);

	document.addEventListener("mouseup", function() {
		if (!state) return;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		document.body.style.webkitUserSelect = "";
		state = null;
	}, true);
};

function findPanel(el) {
	return el.closest ? el.closest(".appify-llm-panel") : null;
}

function hitTest(panel, cx, cy) {
	var r = panel.getBoundingClientRect();
	var inLeft = cx - r.left < EDGE;
	var inRight = r.right - cx < EDGE;
	var inTop = cy - r.top < EDGE;
	var inBottom = r.bottom - cy < EDGE;

	if (!inLeft && !inRight && !inTop && !inBottom) return null;

	var zone = "";
	if (inTop) zone += "n";
	if (inBottom) zone += "s";
	if (inLeft) zone += "w";
	if (inRight) zone += "e";
	return zone || null;
}

function cursorFor(zone) {
	var map = {
		n: "n-resize", s: "s-resize", w: "w-resize", e: "e-resize",
		nw: "nw-resize", ne: "ne-resize", sw: "sw-resize", se: "se-resize"
	};
	return map[zone] || "default";
}

})();
