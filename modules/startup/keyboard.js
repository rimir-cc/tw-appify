/*\
title: $:/plugins/rimir/appify/modules/startup/keyboard.js
type: application/javascript
module-type: startup

Core appify startup:
- Renders FAB on document.body (visible in wiki mode; app mode includes FAB via layout)
- Switches $:/layout to swap between TW's default page and the app layout
- Manages Ctrl+M shortcut for edit mode

\*/
(function(){

"use strict";

exports.name = "appify-keyboard";
exports.platforms = ["browser"];
exports.after = ["render"];

var STATE_TIDDLER = "$:/state/rimir/appify/active-app";
var EDIT_MODE_TIDDLER = "$:/state/rimir/appify/edit-mode";
var LAYOUT_TIDDLER = "$:/layout";
var APP_LAYOUT = "$:/plugins/rimir/appify/ui/app-layout";

exports.startup = function() {
	// --- FAB for wiki mode: render on body ---
	var fabContainer = document.createElement("div");
	fabContainer.className = "appify-fab-wrapper";
	document.body.appendChild(fabContainer);

	var fabParser = $tw.wiki.parseTiddler("$:/plugins/rimir/appify/ui/fab");
	var fabWidget = $tw.wiki.makeWidget(fabParser, {
		document: document,
		parentWidget: $tw.rootWidget
	});
	fabWidget.render(fabContainer, null);

	var currentAppTitle = "";

	function updateLayout() {
		var activeApp = $tw.wiki.getTiddlerText(STATE_TIDDLER, "");
		currentAppTitle = activeApp;

		if(activeApp) {
			$tw.wiki.setText(LAYOUT_TIDDLER, "text", null, APP_LAYOUT);
			fabContainer.style.display = "none";
		} else {
			// Always clear our layout (handles persisted state from previous session)
			var currentLayout = $tw.wiki.getTiddlerText(LAYOUT_TIDDLER, "");
			if(currentLayout === APP_LAYOUT) {
				$tw.wiki.deleteTiddler(LAYOUT_TIDDLER);
			}
			fabContainer.style.display = "";
		}
	}

	// --- Change listener ---
	$tw.wiki.addEventListener("change", function(changes) {
		if(changes[STATE_TIDDLER]) {
			updateLayout();
		}
		// Only refresh fab widget when visible (wiki mode).
		// In app mode, fab is hidden and the same template is transcluded
		// in app-layout.tid — refreshing both creates duplicate $click-outside
		// handlers that conflict with each other.
		if(fabContainer.style.display !== "none") {
			fabWidget.refresh(changes);
		}
	});

	// --- Ctrl+M keyboard shortcut ---
	document.addEventListener("keydown", function(e) {
		if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "m") {
			if(currentAppTitle) {
				e.preventDefault();
				var current = $tw.wiki.getTiddlerText(EDIT_MODE_TIDDLER, "no");
				$tw.wiki.setText(EDIT_MODE_TIDDLER, "text", null,
					current === "yes" ? "no" : "yes");
			}
		}
	});

	// --- Initial state ---
	updateLayout();
};

})();
