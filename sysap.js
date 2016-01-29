var config = require('./config.js');
var xmpp_client = require('node-xmpp-client');
var ltx = require('ltx');
var helper = require('./ltxhelper.js');
var pd = require('pretty-data').pd;

var house = {
	floor : {},
	room : {}
};
var actuators = {};
var strings = {};

var sysap = new xmpp_client({
	bosh: {
		url: config.bosh.url
	},
	jid: config.bosh.jid,
	password: config.bosh.password,
	preferred: 'DIGEST-MD5'
});

var getAll = function () {
		var allData = new xmpp_client.Element('iq', {
		type: 'set',
		to: 'mrha@busch-jaeger.de/rpc',
	})
	.c('query', {
		xmlns: 'jabber:iq:rpc'
	})
		.c('methodCall', {})
			.c('methodName', {})
				.t('RemoteInterface.getAll').up()
			.c('params', {})
				.c('param', {})
					.c('value', {})
						.c('string', {})
							.t('de')
							.up()
						.up()
					.up()
				.c('param', {})
					.c('value', {})
						.c('int', {})
							.t('4')
							.up()
						.up()
					.up()
				.c('param', {})
					.c('value', {})
						.c('int', {})
							.t('0')
							.up()
						.up()
					.up()
				.c('param', {})
					.c('value', {})
						.c('int', {})
							.t('0')
	
	sysap.send(allData);
}

var niceXML = function (ltxIn) {
	return pd.xml(ltxIn.toString())
}

sysap.on('online', function() {
	console.log('online');
	
	var talkToMe =  new xmpp_client.Element('presence', {
		type: 'subscribe',
		to: 'mrha@busch-jaeger.de/rpc',
		xmlns: 'jabber:client'
	});
	sysap.send(talkToMe);
	var talkToMe2 =  new xmpp_client.Element('presence', {
		xmlns: 'jabber:client'
	})
		.c('c', {
			xmlns: 'http://jabber.org/protocol/caps',
			ver: '1.0',
			node: 'http://gonicus.de/caps',
		});
	sysap.send(talkToMe2);
	getAll();
	console.log('subscribed');
});

sysap.on('stanza', function(stanza) {

	var rightNow = new Date();
	console.log("\n\n"+rightNow.toISOString());
	
	
	// UPDATE PACKET
	if (stanza.attrs.type == 'headline' && 
		stanza.attrs.from == 'mrha@busch-jaeger.de' && 
		helper.getElementAttr(stanza, ['event', 'items'], 'node') == 'http://abb.com/protocol/update') {
		
		console.log('update packet:');
		updatePacket(stanza);
	
	
	// MASTER STATUS UPDATE
	} else if (stanza.attrs.type == 'result' && 
			   stanza.attrs.from == 'mrha@busch-jaeger.de/rpc') {
		
		console.log('master update:');
		masterUpdate(stanza);
	
	
	// EVERYTHING ELSE
	} else {
		console.log('Incoming stanza: ' + "\n" + pd.xml(stanza.toString()) + "\n");
	}
});


function updatePacket (stanza) {
	helper.getElements(stanza, ['event', 'items', 'item']).forEach(function (item) {
		var update = ltx.parse(helper.getElementText(item, ['update', 'data']));
		helper.getElements(update, ['devices', 'device']).forEach(function (device) {
			if (helper.getAttr(device, 'commissioningState') == 'ready') {
				helper.getElements(device, ['channels', 'channel']).forEach(function (channel) {
					console.log('Channel: ' + channel.attrs.i);
					channel.children.forEach(function (dp) {
						dp.getChildren('dataPoint').forEach(function (datapoint) {
							console.log(datapoint.attrs.i + ': ' + datapoint.getChildText('value'));
						});
					
						// XXX DEV ONLY
						if (dp.name != 'inputs' && dp.name != 'outputs' && dp.children.length > 0) {
							console.log('NEW STUFF: ' + "\n" + pd.xml(dp.toString()));
						}
					
					});
				});
			}
			
		});
	});
}

function masterUpdate (stanza) {
	helper.getElements(stanza, ['query', 'methodResponse', 'params', 'param']).forEach(function (param) {
		helper.getElements(param, ['value', 'string']).forEach(function (value) {
			
			// valid XML is not necessary for all parsers, but it helps (and ltx is small and fast BECAUSE it doesn't accept shitty XML)
			var allDataText = value.getText();
			allDataText = allDataText.replace('<Channel selector OR>', '&lt;Channel selector OR&gt;');
			allDataText = allDataText.replace('<Channel selector AND>', '&lt;Channel selector AND&gt;');
			allDataText = allDataText.replace('<The following strings from F000 to FFFF are not to be translated!>', '&lt;The following strings from F000 to FFFF are not to be translated!&gt;');
			var allData = ltx.parse(allDataText);
			
			// floors and rooms
			helper.getElements(allData, ['entities', 'entity']).forEach(function (entity) {
				var entityData = JSON.parse(entity.getText());
				if (entity.attrs.type == 'floor' || entity.attrs.type == 'room') {
					house[entity.attrs.type][entity.attrs.uid] = entityData.name;
				}
			});
			
			// strings
			helper.getElements(allData, ['strings', 'string']).forEach(function (string) {
				strings[string.attrs.nameId] = string.getText();
			});
			
			// actuators
			helper.getElements(allData, ['devices', 'device']).forEach(function (device) {
				
				
				
				// NICE INFO FOR DEV
				//actuators[string.attrs.nameId] = string.getText();
				var floor, room, name;
				if (device.getChildByAttr('name', 'floor')) {
					floor = house.floor[device.getChildByAttr('name', 'floor').getText()];
				}
				if (device.getChildByAttr('name', 'room')) {
					room = house.room[device.getChildByAttr('name', 'room').getText()];
				}
				if (device.getChildByAttr('name', 'displayName')) {
					name = device.getChildByAttr('name', 'displayName').getText();
				}
				console.log(device.attrs.serialNumber + ': ' + floor + ' > ' + room + ' > ' + name + ' [' + strings[device.attrs.nameId] + ']');
				// END NICE INFO
				
			});
			
		});
	});
	
	console.log(house);
//	console.log(strings);
	
}
