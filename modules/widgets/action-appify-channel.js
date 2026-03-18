/*\
title: $:/plugins/rimir/appify/modules/widgets/action-appify-channel.js
type: application/javascript
module-type: widget

Action widget for channel CRUD operations on appify apps.

Usage:
  <$action-appify-channel app="AppTitle" operation="add" channel="priority"/>
  <$action-appify-channel app="AppTitle" operation="delete" channel="priority"/>
  <$action-appify-channel app="AppTitle" operation="rename" channel="tab" value="detail-tab"/>
  <$action-appify-channel app="AppTitle" operation="set-default" channel="tab" value="overview"/>

Operations: add, delete, rename, set-default
\*/
(function(){

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ActionAppifyChannel = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

ActionAppifyChannel.prototype = new Widget();

ActionAppifyChannel.prototype.render = function(parent, nextSibling) {
	this.computeAttributes();
	this.execute();
};

ActionAppifyChannel.prototype.execute = function() {
	this.actionApp = this.getAttribute("app", "");
	this.actionOp = this.getAttribute("operation", "");
	this.actionChannel = this.getAttribute("channel", "");
	this.actionValue = this.getAttribute("value", "");
};

ActionAppifyChannel.prototype.refresh = function() {
	var changed = this.computeAttributes();
	if(Object.keys(changed).length > 0) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionAppifyChannel.prototype.invokeAction = function() {
	var appTitle = this.actionApp;
	var operation = this.actionOp;
	var channel = this.actionChannel;
	var value = this.actionValue;

	if(!appTitle || !operation || !channel) return true;

	var tiddler = this.wiki.getTiddler(appTitle);
	if(!tiddler) return true;

	var fields = {};
	var fieldKeys = Object.keys(tiddler.fields);
	for(var i = 0; i < fieldKeys.length; i++) {
		fields[fieldKeys[i]] = tiddler.fields[fieldKeys[i]];
	}

	var channelList = (fields["appify-channels"] || "").split(/\s+/).filter(Boolean);

	switch(operation) {
		case "add":
			if(channelList.indexOf(channel) === -1) {
				channelList.push(channel);
				fields["appify-channels"] = channelList.join(" ");
				if(value) {
					fields["appify-default-" + channel] = value;
				}
			}
			break;

		case "delete":
			var delIdx = channelList.indexOf(channel);
			if(delIdx !== -1) {
				channelList.splice(delIdx, 1);
				fields["appify-channels"] = channelList.join(" ");
				delete fields["appify-default-" + channel];
				// Rewrite body to remove rules referencing this channel
				if(fields.text) {
					fields.text = removeChannelFromRules(fields.text, channel);
				}
			}
			break;

		case "rename":
			if(!value || channel === value) break;
			var renIdx = channelList.indexOf(channel);
			if(renIdx !== -1) {
				channelList[renIdx] = value;
				fields["appify-channels"] = channelList.join(" ");
				// Rename default field
				if(fields["appify-default-" + channel] !== undefined) {
					fields["appify-default-" + value] = fields["appify-default-" + channel];
					delete fields["appify-default-" + channel];
				}
				// Rewrite body to rename channel references in rules
				if(fields.text) {
					fields.text = renameChannelInRules(fields.text, channel, value);
				}
			}
			break;

		case "set-default":
			if(channelList.indexOf(channel) !== -1) {
				if(value) {
					fields["appify-default-" + channel] = value;
				} else {
					delete fields["appify-default-" + channel];
				}
			}
			break;

		default:
			return true;
	}

	this.wiki.addTiddler(new $tw.Tiddler(fields));

	// Trigger appify-app refresh
	this.wiki.setText("$:/temp/rimir/appify/splits-changed", "text", null, Date.now().toString());

	return true;
};

function removeChannelFromRules(text, channel) {
	// Remove entire <$statewrap-rule when="channel"> blocks
	var whenPattern = new RegExp(
		'<\\$statewrap-rule\\s+when="' + escapeRegExp(channel) + '"\\s*>[\\s\\S]*?<\\/\\$statewrap-rule>\\s*',
		'g'
	);
	text = text.replace(whenPattern, '');

	// Remove individual <$action-statewrap-set channel="channel" .../> lines from remaining rules
	var actionPattern = new RegExp(
		'\\s*<\\$action-statewrap-set\\s+channel="' + escapeRegExp(channel) + '"[^/]*/>' ,
		'g'
	);
	text = text.replace(actionPattern, '');

	// Clean up empty rules (rule blocks with no actions left)
	text = text.replace(/<\$statewrap-rule\s+when="[^"]*"\s*>\s*<\/\$statewrap-rule>\s*/g, '');

	return text.trim() ? text.trim() + '\n' : '';
}

function renameChannelInRules(text, oldName, newName) {
	// Rename when="oldName" to when="newName"
	var whenPattern = new RegExp(
		'(<\\$statewrap-rule\\s+when=")' + escapeRegExp(oldName) + '(")',
		'g'
	);
	text = text.replace(whenPattern, '$1' + newName + '$2');

	// Rename channel="oldName" to channel="newName"
	var channelPattern = new RegExp(
		'(<\\$action-statewrap-set\\s+channel=")' + escapeRegExp(oldName) + '(")',
		'g'
	);
	text = text.replace(channelPattern, '$1' + newName + '$2');

	return text;
}

function escapeRegExp(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports["action-appify-channel"] = ActionAppifyChannel;

})();
