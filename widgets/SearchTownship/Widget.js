
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
		'esri/request', 
		'esri/graphic',
		'esri/tasks/QueryTask',
		'esri/tasks/query',
		'esri/geometry/Extent',
		'esri/geometry/Point',
		'esri/geometry/Polyline',
		'esri/geometry/Polygon',
		'esri/geometry/webMercatorUtils',
		'esri/tasks/GeometryService',
		'esri/layers/FeatureLayer',
		'esri/layers/GraphicsLayer',
		'esri/symbols/SimpleMarkerSymbol',
		'esri/symbols/SimpleLineSymbol',
		'esri/symbols/SimpleFillSymbol',
		'esri/InfoTemplate',
		'jimu/WidgetManager', 
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
		esriConfig, esriRequest, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, FeatureLayer, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, WidgetManager, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchTownship',
			baseClass : 'ev-widget-searchTownship',
			_queryTask : null, 
			_renderType : null /*graphicLayer (default) or featureLayer*/,
			_featureLayer : null, 
			_graphicLayer : null,
			_symbols : { /*default rendering symbols*/
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
				this._queryTask = new QueryTask(this.config.layer);

				this._infoTemplate = new InfoTemplate("Properties", "${*}");
				
				this._renderType = this.config.renderType || "graphicLayer"; 
				
				if (this.config.renderSymbols) {
					this._symbols = this.config.renderSymbols; 
				}
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
				if (this._renderType === "featureLayer") {
					esriRequest({
						"url": this.config.layer,
						"content": {
						  "f": "json"
						}
					}).then(lang.hitch(this, function(layerInfo) {
						var featureCollection = {
							"featureSet": {
								"features": [],
								"geometryType": layerInfo.geometryType
							}, 
							"layerDefinition": {
								"geometryType": layerInfo.geometryType,
								"objectIdField": layerInfo.objectIdField,
								"drawingInfo": {
									"renderer": {
										"type": "simple",
										"symbol": this._symbols[layerInfo.geometryType], 
									}
								},
								"fields": layerInfo.fields 
							}
						};
						this._featureLayer = new FeatureLayer(featureCollection, {
							id: layerInfo.name + "_searchResults", 
							infoTemplate: this._infoTemplate
						});
						this.map.addLayer(this._featureLayer); 
						console.debug("the search results to be rendered as features"); 
					}), lang.hitch(this, function(err) {
						this._showMessage(err.message, "error");
					}));
				} else { 
					this._graphicLayer = new GraphicsLayer({
						id: this.name + "_searchResults", 
						infoTemplate: this._infoTemplate
					});
					this.map.addLayer(this._graphicLayer);	
					console.debug("the search results to be rendered as graphics"); 
				}
			},

			onClose : function () {
				// clear the message
				this._hideMessage(); 
				
				if (this._renderType === "featureLayer") {
					// close the AttributeTable widget
					this._closeAttributeTable(); 
					// clean up featureLayer
					this.map.removeLayer(this._featureLayer); 
					this._featureLayer.clear(); 
					this._featureLayer = null; 
				} else {
					this.map.removeLayer(this._graphicLayer); 
					this._graphicLayer.clear();
					this._graphicLayer = null; 
				}
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

			_executeSearch : function (whereClause, boundByMapExtent) {
				this._showMessage("searching..."); 
				
				var query = new Query();
				query.where = whereClause;
				query.outSpatialReference = this.map.spatialReference;
				query.returnGeometry = true;
				query.outFields = ["*"];
				
				if (boundByMapExtent === true) {
					query.geometry = this.map.extent;
					query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
				}

				this._queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features) {
							if (resultSet.features.length > 0) {
								if (resultSet.exceededTransferLimit === true) {
									this._showMessage("exceed search limit. only first " 
										+ resultSet.features.length + " feature(s) displayed", "warning"); 
								} else {
									this._showMessage(resultSet.features.length + " feature(s) found");
								}
							} else {
								this._showMessage("no feature found", "warning");
							} 
						} else {
							// in case null resultSet, set empty value
							resultSet = {"features": []}; 
						} 
						if (this._renderType === "featureLayer") {
							this._drawFeaturesOnMap(resultSet); 
						} else {
							this._drawGraphicsOnMap(resultSet); 
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
						// clear the render layer
						if (this._renderType === "featureLayer") {
							this._featureLayer.clear(); 
						} else {
							this._graphicLayer.clear(); 
						} 
					})
				);
			},

			_drawGraphicsOnMap : function (resultSet, clearFirst/*default: true*/) {
				if (clearFirst !== false) {
					this._graphicLayer.clear();
				}
				
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
				default: 
					this._showMessage("not support such geometry", "error"); 
				};

				array.forEach(resultSet.features, lang.hitch(this, function (feature) {
						var graphic = new Graphic(feature.geometry);
						graphic.setSymbol(highlightSymbol);
						graphic.setAttributes(feature.attributes);
						this._graphicLayer.add(graphic);

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
					})
				);

				this._zoomToExtent(resultExtent); 
			}, 

			_drawFeaturesOnMap : function (resultSet, clearFirst/*default: true*/) {
				if (clearFirst !== false) {
					this._featureLayer.clear();
				}
				
				var resultExtent = null,
					featureArray = []; 
				
				array.forEach(resultSet.features, lang.hitch(this, function (feature) {
						var graphic = new Graphic(feature.geometry); 
						graphic.setAttributes(feature.attributes);
						featureArray.push(graphic);

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
					})
				);

				this._zoomToExtent(resultExtent); 

				if (featureArray.length > 0) {
					this._featureLayer.applyEdits(featureArray, null, null, 
						lang.hitch(this, function() {
							console.debug("resultset is added into FeatureLayer");  
							// open AttributeTable and display the results 
							this._showResultsInAttributeTable(); 
						}), 
						lang.hitch(this, function(err) {
							this._showMessage(err.message || "failed to show search results", "error"); 
						})
					); 	
				} else {
					// close AttributeTable
					this._closeAttributeTable(); 
				}
				
			}, 
			
			_zoomToExtent: function(resultExtent) {
				if (resultExtent) {
					if (resultExtent.getHeight() === 0 || resultExtent.getWidth() === 0) {
						this.map.centerAndZoom(resultExtent.getCenter(), 15);
					} else {
						this.map.setExtent(resultExtent, true);
					}
				} 
			},
			
			_showResultsInAttributeTable : function() {
				var attributeTableWidgetEle =
					this.appConfig.getConfigElementsByName("AttributeTable")[0];
				var widgetManager = WidgetManager.getInstance();
				widgetManager.triggerWidgetOpen(attributeTableWidgetEle.id).then(
					lang.hitch(this, function() {
						this.publishData({
							'target': 'AttributeTable',
							'layer': this._featureLayer
						});
					})
				);	
			}, 
			
			_closeAttributeTable : function() {
				var attributeTableWidgetEle =
					this.appConfig.getConfigElementsByName("AttributeTable")[0];
				var widgetManager = WidgetManager.getInstance();
				var attributeTableWidget = widgetManager.getWidgetById(attributeTableWidgetEle.id); 
				if (attributeTableWidget) {
					widgetManager.closeWidget(attributeTableWidget);
				} 
			}
		});

	return clazz;
});
