var map, idbLayer, untiled, cacheWrite;
var cacheHits = 0;
var seeding = false;
OpenLayers.ProxyHost = "/cgi-bin/proxy.cgi?url=";

var DeleteFeature = OpenLayers.Class(OpenLayers.Control, {
    initialize: function(layer, options) {
        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        this.layer = layer;
        this.handler = new OpenLayers.Handler.Feature(
            this, layer, {click: this.clickFeature}
        );
    },
    clickFeature: function(feature) {
        // if feature doesn't have a fid, destroy it
        if(feature.fid == undefined) {
            this.layer.destroyFeatures([feature]);
        } else {
            feature.state = OpenLayers.State.DELETE;
            this.layer.events.triggerEvent("afterfeaturemodified", 
                                           {feature: feature});
            feature.renderIntent = "select";
            this.layer.drawFeature(feature);
        }
    },
    setMap: function(map) {
        this.handler.setMap(map);
        OpenLayers.Control.prototype.setMap.apply(this, arguments);
    },
    CLASS_NAME: "OpenLayers.Control.DeleteFeature"
});

function init() {

    var extent = new OpenLayers.Bounds(
        405000, 110000, 415000, 120000
    );
    
    var maxExtent = new OpenLayers.Bounds(
        0,0,700000,1300000
    );


    map = new OpenLayers.Map('map', {
        projection: new OpenLayers.Projection("EPSG:27700"),
		units: 'm',
        displayProjection: new OpenLayers.Projection("EPSG:27700"),
        extent: extent,
        maxExtent: maxExtent,
        controls: [
            new OpenLayers.Control.PanZoom(),
            new OpenLayers.Control.Navigation()
        ]
    });
    // setup single tiled layer
	untiled = new OpenLayers.Layer.WMS(
		"Job polygons WMS", "http://osvm275:9090/geoserver/cite/wms",
		{
			LAYERS: 'cite:region_co_polys',
			STYLES: '',
			format: 'image/png',
			transparent: true
		},
		{
		   singleTile: true, 
		   ratio: 1, 
		   isBaseLayer: false,
		   yx : {'EPSG:27700' : false}
		} 
	);
   
   var protocol = new OpenLayers.Protocol.IndexedDb("TestDb12", 1, "TestFeatures");
   var bboxStrategy = new OpenLayers.Strategy.BBOX({autoActivate: false});
   var saveStrategy = new OpenLayers.Strategy.SaveIndexedDb();
   var editLayerName = "Editable Features";
   idbLayer = new OpenLayers.Layer.Vector(editLayerName, {
        strategies: [bboxStrategy, saveStrategy],
        protocol: protocol
    });
    
    protocol.openDb(function(){bboxStrategy.activate();}, this);

	var openspaceLayer = new OpenLayers.Layer.OsOpenSpace(
		"OS OpenSpace Layer",
		"http://openspace.ordnancesurvey.co.uk/osmapapi/ts",
		{ key: "CC19DCDCAA577402E0405F0ACA603788" },
		{ isBaseLayer: true, opacity: 0.2, eventListeners: {
                    tileloaded: updateStatus
                } 
            }
	);
    
    map.addLayers([openspaceLayer, untiled, idbLayer]);

    var panel = new OpenLayers.Control.Panel({
        displayClass: 'customEditingToolbar',
        allowDepress: true
    });
    
    var draw = new OpenLayers.Control.DrawFeature(
        idbLayer, OpenLayers.Handler.Polygon,
        {
            title: "Draw Feature",
            displayClass: "olControlDrawFeaturePolygon",
            multi: true
        }
    );
    
    var edit = new OpenLayers.Control.ModifyFeature(idbLayer, {
        title: "Modify Feature",
        displayClass: "olControlModifyFeature"
    });

    var del = new DeleteFeature(idbLayer, {title: "Delete Feature"});
   
    var save = new OpenLayers.Control.Button({
        title: "Save Changes",
        trigger: function() {
            if(edit.feature) {
                edit.selectControl.unselectAll();
            }
            saveStrategy.save();
        },
        displayClass: "olControlSaveFeatures"
    });
    
    var checkOutBtn = new OpenLayers.Control.Button({
        title: "Check out data for current extent",
        trigger: clickReadWfst,
        displayClass: "olControlSaveFeatures"
    });
/* 
    function clickReadWfst() {
        var bounds = map.getExtent();
        var wfstOptions = {
            version: "1.1.0",
            srsName: "EPSG:27700",
            url: "http://osvm275:9090/geoserver/wfs",
            featureNS :  "http://www.opengeospatial.net/cite",
            featureType: "cite:region_co_polys",
            geometryName: "geom",
        };
        var wfstProxy = new OpenLayers.WfstProxy(wfstOptions, readWfstCallback, this);
        wfstProxy.readFeatures(bounds);
    }
*/    
    
    function clickReadWfst() {
        var bounds = map.getExtent();
        var wfstOptions = {
            version: "1.1.0",
            srsName: "EPSG:27700",
            url: "http://osvm275:9090/geoserver/wfs",
            featurePrefix: "cite",
            featureNS :  "http://www.opengeospatial.net/cite",
            featureType: "region_co_polys",
            geometryName: "geom",
        };
        var wfstProxy = new OpenLayers.WfstProxy(wfstOptions, readWfstCallback, this);
        wfstProxy.readFeatures(bounds);
    }
    
    
    function readWfstCallback(features) {
        var protocol = map.getLayersByName(editLayerName)[0].protocol;
        protocol.commit(features, {callback: loadWfstCallback, scope: this});

    }
    
    function loadWfstCallback(response) {
        console.log("WFST records inserted, response code: " + response.code);
        for(var i = 0; i < idbLayer.strategies.length; i++) {
        	var strategy = idbLayer.strategies[i];
            if (strategy instanceof OpenLayers.Strategy.BBOX) {
            	strategy.update({force: true});
            	break;
            }
        }
    }
    
    // try cache before loading from remote resource
    var cacheRead1 = new OpenLayers.Control.CacheRead({
        eventListeners: {
            activate: function() {
                console.log("cacheRead1 active");
            }
        }
    });
        
    cacheWrite = new OpenLayers.Control.CacheWrite({
        imageFormat: "image/png",
        eventListeners: {
            cachefull: function() {
                console.log("Cache full.");
                if (!window.localStorage) { return; }
                var i, key;
                for (i=0; i < 10; i++) {
                    key = window.localStorage.key(i);
                    if (key.substr(0, 8) === "olCache_") {
                        window.localStorage.removeItem(key);
                    }
                }
                updateStatus();
            },
            activate: function() {
                console.log("cacheWrite active");
            },
            deactivate: function() {
                console.log("cacheWrite inactive");
            }
        }
    });
        
    map.addControl(cacheRead1);
    map.addControl(cacheWrite);
    /* cache end */

    panel.addControls([save, del, edit, draw, checkOutBtn]);
    map.addControl(panel);
    map.zoomToExtent(extent, true);
}

