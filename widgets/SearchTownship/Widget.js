
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
			name : 'SearchTownship',
			baseClass : 'ev-widget-searchTownship',
			_graphicLayer : null,
			_symbols : {
				"esriGeometryPolygon" : {
					"type" : "esriSFS",
					"style" : "esriSFSSolid",
					"color" : [0, 255, 255, 64],
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
					"color" : [0, 255, 255, 128],
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
			_stateValues: null, 
			_vtlDirValue: null,
			_hrzDirValue: null, 

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
						hasDownArrow: true,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						onChange: lang.hitch(this, this._onStateNameChanged)
					}, this.stateInput);
				this._stateValues.startup();			
			
				jimuUtils.combineRadioCheckBoxWithLabel(this.vtlDirNorth, this.vtlDirNorthLabel);
				jimuUtils.combineRadioCheckBoxWithLabel(this.vtlDirSouth, this.vtlDirSouthLabel);

				jimuUtils.combineRadioCheckBoxWithLabel(this.hrzDirEast, this.hrzDirEastLabel);
				jimuUtils.combineRadioCheckBoxWithLabel(this.hrzDirWest, this.hrzDirWestLabel);				
			},
			
			onOpen : function () {
				this._graphicLayer = new GraphicsLayer();
				this.map.addLayer(this._graphicLayer);	
			},

			onClose : function () {
				this._hideMessage(); 
				
				this._graphicLayer.clear();
				this.map.removeLayer(this._graphicLayer);
			},

			destroy : function () {},

			startup : function () {
				this.inherited(arguments);

				this._fetchStateNames();
			},
			
			_onStateNameChanged : function() {
				this._hideMessage();
			},
			
			_onVtlDirChanged: function(evt) {
				var rdoInput = evt.currentTarget; 
				if (rdoInput.checked) {
					this._vtlDirValue = rdoInput.value; 
				}
			},
			
			_onHrzDirChanged: function(evt) {
				var rdoInput = evt.currentTarget; 
				if (rdoInput.checked) {
					this._hrzDirValue = rdoInput.value; 
				}
			},
			
			_onBtnEndClicked : function () {
				var whereClause = this.config.state.field + " = '" + this._stateValues.get('value') + "'";
				if (this.sectionInput.value.trim().length > 0) {
					whereClause += (" and " + this.config.section.field + " = '" + this.sectionInput.value + "'");
				}
				if (this.townshipInput.value.trim().length > 0) {
					whereClause += (" and " + this.config.township.field + " = '" + this.townshipInput.value + "'");
				}
				if (this.rangeInput.value.trim().length > 0) {
					whereClause += (" and " + this.config.range.field + " = '" + this.rangeInput.value + "'");
				}
				if (this._vtlDirValue) {
					whereClause += (" and " + this.config.vtlDir.field + " = '" + this._vtlDirValue + "'");
				}
				if (this._hrzDirValue) {
					whereClause += (" and " + this.config.hrzDir.field + " = '" + this._hrzDirValue + "'");
				}
				
				this._executeSearch(whereClause);
			},
			
			_fetchStateNames : function() {
				this._showMessage("retrieving states...");
				
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
							
							this._hideMessage();
						} else {
							this._showMessage("no state found", "warning");
						}
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));				
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
				
				domStyle.set(this.searchMessage, "display", "block"); 
			},

			_hideMessage : function () {
				domStyle.set(this.searchMessage, "display", "none"); 
				
				this.searchMessage.innerText = "";
			},

			_executeSearch : function (whereClause) {
				this._showMessage("searching...");
				
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
