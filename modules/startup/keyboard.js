/*\
title: $:/plugins/rimir/appify/modules/startup/keyboard.js
type: application/javascript
module-type: startup

Handles Ctrl+M keyboard shortcut for toggling edit mode.
Only activates when an app is currently active.

\*/
(function(){

"use strict";

exports.name = "appify-keyboard";
exports.platforms = ["browser"];
exports.after = ["startup"];

exports.startup = function() {
	document.addEventListener("keydown", function(e) {
		if(e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "m") {
			var activeApp = $tw.wiki.getTiddlerText("$:/state/rimir/appify/active-app", "");
			if(activeApp) {
				e.preventDefault();
				var current = $tw.wiki.getTiddlerText("$:/state/rimir/appify/edit-mode", "no");
				$tw.wiki.setText("$:/state/rimir/appify/edit-mode", "text", null,
					current === "yes" ? "no" : "yes");
			}
		}
	});
};

})();
