
define([
		'dojo/_base/declare',
		'dijit/_WidgetsInTemplateMixin',
		'jimu/BaseWidget',
		'dojo/on',
		'dojo/Deferred',
		'dojo/dom-construct',
		'dojo/html',
		'dojo/_base/lang',
		'esri/Color',
		'dojo/_base/array',
		'dojo/dom-style',
		'dojo/dom-class',
		'esri/config',
		'esri/graphic',
		'esri/tasks/QueryTask',
		'esri/tasks/query',
		'esri/geometry/Extent',
		'esri/geometry/Point',
		'esri/geometry/Polyline',
		'esri/geometry/Polygon',
		'esri/geometry/webMercatorUtils',
		'esri/tasks/GeometryService',
		'esri/layers/GraphicsLayer',
		'esri/symbols/SimpleMarkerSymbol',
		'esri/symbols/SimpleLineSymbol',
		'esri/symbols/SimpleFillSymbol',
		'esri/InfoTemplate',
		'esri/layers/FeatureLayer',
		'jimu/dijit/ViewStack',
		'jimu/utils',
		'jimu/SpatialReference/wkidUtils',
		'jimu/LayerInfos/LayerInfos',
		"dojo/store/Memory",
		'jimu/dijit/LoadingIndicator',
		'jimu/dijit/Popup',
		'dijit/form/ComboBox'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred,
		domConstruct, html, lang, Color, array, domStyle, domClass,
		esriConfig, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, FeatureLayer, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchParcel',
			baseClass : 'ev-widget-searchParcel',
			_graphicLayer : null,
			_symbols : {
				"esriGeometryPolygon" : {
					"type" : "esriSFS",
					"style" : "esriSFSSolid",
					"color" : [255, 0, 0, 64],
					"outline" : {
						"type" : "esriSLS",
						"style" : "esriSLSSolid",
						"color" : [0, 255, 255, 255],
						"width" : 2
					}
				},
				"esriGeometryPolyline" : {
					"type" : "esriSLS",
					"style" : "esriSLSDashDot",
					"color" : [0, 255, 255, 255],
					"width" : 2
				},
				"esriGeometryPoint" : {
					"type" : "esriSMS",
					"style" : "esriSMSCircle",
					"color" : [255, 0, 0, 128],
					"size" : 8,
					"angle" : 0,
					"xoffset" : 0,
					"yoffset" : 0,
					"outline" : {
						"type" : "esriSLS",
						"style" : "esriSLSSolid",
						"color" : [0, 255, 255, 255],
						"width" : 1,
					}
				}
			},
			_stateValues : null,
			_countyValues : null,

			postCreate : function () {
				this.inherited(arguments);
				
				this._initSearch();
				this._initSearchForm();
			},

			_initSearch : function () {

				this._infoTemplate = new InfoTemplate("Properties", "${*}");
			},

			_initSearchForm : function () {				
				this._stateValues = new ComboBox({
						hasDownArrow: false,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						onChange: lang.hitch(this, this._onStateNameChanged)
					}, this.stateInput);
				this._stateValues.startup();

				this._countyValues = new ComboBox({
						hasDownArrow: false,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name"
					}, this.countyInput);
				this._countyValues.startup(); 			
			},
			
			onOpen : function () {
				this._graphicLayer = new GraphicsLayer();
				this.map.addLayer(this._graphicLayer);	
			},

			onClose : function () {
				this._countyValues.set('value', '');
				
				this._hideMessage(); 
				
				this._graphicLayer.clear();
				this.map.removeLayer(this._graphicLayer);
			},

			destroy : function () {},

			startup : function () {
				this.inherited(arguments);

				this._fetchStateNames(); 
			},

			_onStateNameChanged: function() {
				
				this._fetchCountiesByState();
			},
			
			_fetchStateNames : function() {
				this._stateValues.store = new Memory({data: []});

				var query = new Query();
				query.where = "1=1"; 
				query.returnGeometry = false;
				query.outFields = [this.config.state.field];
				query.orderByFields = [this.config.state.field];
				query.returnDistinctValues = true; 
				
				var queryTask = new QueryTask(this.config.state.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.state.field]
									});
								}));
							this._stateValues.store = valueStore;
						} else {
							this._showMessage("no state found", "warning");
						}
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},

			_fetchCountiesByState : function() {
				this._countyValues.store = new Memory({data: []});
				this._countyValues.set('value', '');
				
				this._hideMessage(); 
				
				var stateName = this._stateValues.get('value');
				
				var query = new Query();
				query.where = this.config.county.relatedFields["state"] + " like '" + stateName + "%'";
				query.returnGeometry = false;
				query.outFields = [this.config.county.field];
				query.orderByFields = [this.config.county.field];
				query.returnDistinctValues = true; 

				var queryTask = new QueryTask(this.config.county.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.county.field]
									});
								}));
							this._countyValues.store = valueStore;
						} else {
							this._showMessage("no county found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},
			
			
			_onBtnEndClicked : function () {
				var critera = []; 
				if (this._stateValues.get('value').trim()) {
					critera.push(this.config.state.field + " = '" + this._stateValues.get('value').trim() + "'"); 
				}
				if (this._countyValues.get('value').trim()) {
					critera.push(this.config.county.field + " = '" + this._countyValues.get('value').trim() + "'"); 
				}
				if (this.cityInput.value.trim()) {
					critera.push(this.config.city.field + " = '" + this.cityInput.value.trim() + "'"); 
				}
				if (this.zipcodeInput.value.trim()) {
					critera.push(this.config.zipcode.field + " = '" + this.zipcodeInput.value.trim() + "'"); 
				}
				if (this.addressInput.value.trim()) {
					critera.push(this.config.address.field + " = '" + this.addressInput.value.trim() + "'"); 
				}
				if (this.subdivInput.value.trim()) {
					critera.push(this.config.subdiv.field + " = '" + this.subdivInput.value.trim() + "'"); 
				}
				if (this.blockInput.value.trim()) {
					critera.push(this.config.block.field + " = '" + this.blockInput.value.trim() + "'"); 
				}
				if (this.lotInput.value.trim()) {
					critera.push(this.config.lot.field + " = '" + this.lotInput.value.trim() + "'"); 
				}
				if (this.apnInput.value.trim()) {
					critera.push(this.config.apn.field + " = '" + this.apnInput.value.trim() + "'"); 
				}
				
				var whereClause = critera.join(" and "); 
				if (whereClause) {
					this._executeSearch(whereClause);
				}				
			},

			_showMessage : function (textMsg, lvl) {
				domClass.remove(this.searchMessage);
				switch (lvl) {
				case "error":
					domClass.add(this.searchMessage, "message-error");
					break;
				case "warning":
					domClass.add(this.searchMessage, "message-warning");
					break;
				case "info":
					domClass.add(this.searchMessage, "message-info");
					break;
				default:
					domClass.add(this.searchMessage, "message-info");
				}
				this.searchMessage.innerText = textMsg;
			},

			_hideMessage : function () {
				this.searchMessage.innerText = "";
			},

			_executeSearch : function (whereClause) {
				this._hideMessage(); 
				
				var query = new Query();
				query.where = whereClause;
				query.outSpatialReference = this.map.spatialReference;
				query.returnGeometry = true;
				query.outFields = ["*"];

				var queryTask = new QueryTask(this.config.layer);
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							this._showMessage(resultSet.features.length + " feature(s) found");
							this._drawResultsOnMap(resultSet);
						} else {
							this._showMessage("no feature found", "warning");
						}
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},

			_drawResultsOnMap : function (resultSet) {
				this._graphicLayer.clear();
				var resultExtent = null,
				highlightSymbol;

				switch (resultSet.geometryType) {
				case "esriGeometryPoint":
					highlightSymbol = new SimpleMarkerSymbol(this._symbols[resultSet.geometryType]);
					break;
				case "esriGeometryPolyline":
					highlightSymbol = new SimpleLineSymbol(this._symbols[resultSet.geometryType]);
					break;
				case "esriGeometryPolygon":
					highlightSymbol = new SimpleFillSymbol(this._symbols[resultSet.geometryType]);
					break;
				};

				array.forEach(resultSet.features, lang.hitch(this, function (feature) {
						this._graphicLayer.add(new Graphic(
							feature.geometry,
							highlightSymbol,
							feature.attributes,
							this._infoTemplate));

						if (resultSet.geometryType === "esriGeometryPoint") {
							if (resultExtent) {
								resultExtent = resultExtent.union(new Extent(
									feature.geometry.x, feature.geometry.y,
									feature.geometry.x, feature.geometry.y,
									feature.geometry.spatialReference));
							} else {
								resultExtent = new Extent(
									feature.geometry.x, feature.geometry.y,
									feature.geometry.x, feature.geometry.y,
									feature.geometry.spatialReference);
							}
						} else {
							if (resultExtent) {
								resultExtent = resultExtent.union(feature.geometry.getExtent());
							} else {
								resultExtent = feature.geometry.getExtent();
							}
						}
					}));

				if (resultExtent) {
					if (resultExtent.getHeight() === 0 || resultExtent.getWidth() === 0) {
						this.map.centerAndZoom(resultExtent.getCenter(), 15);
					} else {
						this.map.setExtent(resultExtent, true);
					}
				}
			}

		});

	return clazz;
});

