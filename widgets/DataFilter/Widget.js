
define([
		'dojo/_base/declare',
		'dijit/_WidgetsInTemplateMixin',
		'jimu/BaseWidget',
		'dojo/on',
		'dojo/Deferred',
		'dojo/html',
		'dojo/_base/lang',
		'esri/Color',
		'dojo/_base/array',
		'dojo/dom-construct',
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
		'jimu/utils',
		'jimu/SpatialReference/wkidUtils',
		'jimu/LayerInfos/LayerInfos',
		"dojo/store/Memory",
		'jimu/dijit/Filter', 
		'jimu/dijit/LoadingIndicator',
		'jimu/dijit/Popup',
		'dijit/form/ComboBox',
		'dijit/form/DateTextBox',
		'dijit/form/NumberSpinner'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred,
		html, lang, Color, array, domConstruct, domStyle, domClass,
		esriConfig, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, FeatureLayer, jimuUtils, wkidUtils, LayerInfos,
		Memory, Filter, LoadingIndicator, Popup, ComboBox, DateTextBox, NumberSpinner) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'dataFilter',
			baseClass : 'ev-widget-dataFilter',
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
			_targetValues : [],
			_jimuFilter : null, 
			_targetUrl : null, 
			_limitToMapExtent : false, 

			postCreate : function () {
				this.inherited(arguments);
				
				this._initSearch();
				this._initSearchForm();
			},
			
			_initSearch : function () {
				this._infoTemplate = new InfoTemplate("Properties", "${*}");
				
				this._limitToMapExtent = this.config.limitToMapExtent; 
			},

			_initSearchForm : function () {
				this.limitToMapExtent.checked = this._limitToMapExtent; 
				
				this._targetValues = new ComboBox({
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						onChange: lang.hitch(this, this._onSearchTargetChanged)
					}, this.targetInput);
				this._targetValues.startup(); 
				
				this._jimuFilter = new Filter({
					noFilterTip: this.nls.noFilterTip,
					style: "width:100%;margin-top:22px;"
				}, this.filterSection);
				this._jimuFilter.startup(); 				
			},

			onActive : function () {
				this.map.setInfoWindowOnClick(false);
			},

			onDeActive : function () {
				this.map.setInfoWindowOnClick(true);
			},
			
			onOpen : function() {				
				this._graphicLayer = new GraphicsLayer();
				this.map.addLayer(this._graphicLayer);
			},

			onClose : function () {
				this._graphicLayer.clear();
				this.map.removeLayer(this._graphicLayer);
			},

			destroy : function () {},

			startup : function () {
				this.inherited(arguments);

				this._fetchSearchTargets(); 
			},
			
			_fetchSearchTargets : function() {							
				var valueStore = new Memory({data: []});
				if (this.map.itemInfo && this.map.itemInfo.itemData && this.map.itemInfo.itemData.operationalLayers) {
					var operationalLayers = this.map.itemInfo.itemData.operationalLayers; 
					array.forEach(operationalLayers, lang.hitch(this, function(serviceLayer, s) {
						//TODO: handle group layers
						array.forEach(serviceLayer.resourceInfo.layers, lang.hitch(this, function(featureLayer, f) {
								valueStore.put({
										"id" : serviceLayer["id"] + "_" + featureLayer["id"],
										"name" : serviceLayer["title"] + "/" + featureLayer["name"], 
										"url" : serviceLayer["url"] + "/" + featureLayer["id"]
									});	
							})); 
						array.forEach(serviceLayer.resourceInfo.tables, lang.hitch(this, function(featureTable, t) {
								valueStore.put({
										"id" : serviceLayer["id"] + "_" + featureTable["id"],
										"name" : serviceLayer["title"] + "/" + featureTable["name"], 
										"url" : serviceLayer["url"] + "/" + featureTable["id"]
									});	
							})); 
						})); 
				}
				//TODO: sort by alphabet
				this._targetValues.store = valueStore;
			},
			
			_onBtnEndClicked : function () {
				this._hideMessage();
				
				var filterObj = this._jimuFilter.toJson(); 
				if (filterObj.parts && filterObj.parts.length > 0) {
					var whereClause = filterObj.expr; 
					if (whereClause) {
						this._executeSearch(this._targetUrl, whereClause);
					} else {
						this._showMessage("invalid search criteria", "error");
					}
				} else {
					this._showMessage("invalid search criteria", "error");
				}
			},

			_onLimitToMapExtentChecked : function (evt) {
				this._limitToMapExtent = evt.currentTarget.checked;
			},

			_onSearchTargetChanged : function (targetName) { 
				var selectedTarget = this._targetValues.store.query({name:targetName}); 
				if (selectedTarget.length == 1) {
					this._targetUrl = selectedTarget[0].url; 
					this._jimuFilter.buildByExpr(selectedTarget[0].url, null, null); 
				} else if (selectedTarget.length < 1) {
					this._showMessage("invalid data source", "error"); 
				} else {
					this._showMessage("duplicate data sources", "error"); 
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

			_executeSearch : function (layerUrl, whereClause) {
				var query = new Query();
				query.where = whereClause;
				query.outSpatialReference = this.map.spatialReference;
				query.returnGeometry = true;
				query.outFields = ["*"];

				if (this._limitToMapExtent === true) {
					query.geometry = this.map.extent;
					query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
				}

				var queryTask = new QueryTask(layerUrl); 
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
