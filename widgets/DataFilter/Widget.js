
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
		esriConfig, esriRequest, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, FeatureLayer, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, WidgetManager, jimuUtils, wkidUtils, LayerInfos,
		Memory, Filter, LoadingIndicator, Popup, ComboBox, DateTextBox, NumberSpinner) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'DataFilter',
			baseClass : 'ev-widget-dataFilter',
			_renderType : null /*graphicLayer (default) or featureLayer*/,
			_featureLayer : null, 
			_graphicLayer : null,
			_symbols : { /*default rendering symbols*/
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
				
				this._renderType = this.config.renderType || "graphicLayer"; 
				
				if (this.config.renderSymbols) {
					this._symbols = this.config.renderSymbols; 
				}
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
					style: "width:100%;border:2px groove;"
				}, this.filterInput);
				this._jimuFilter.startup(); 
				
				jimuUtils.combineRadioCheckBoxWithLabel(this.limitToMapExtent, this.limitToMapExtentLabel);
			},
			
			onOpen : function() {				
				this._graphicLayer = new GraphicsLayer();
				this.map.addLayer(this._graphicLayer);
			},

			onClose : function () {
				// clear the message
				this._hideMessage(); 
				
				if (this._renderType === "featureLayer" && this._featureLayer) {
					// close the AttributeTable widget
					this._closeAttributeTable(); 
					// clean up featureLayer
					this.map.removeLayer(this._featureLayer); 
					this._featureLayer.clear(); 
					this._featureLayer = null; 
				} else if (this._graphicLayer) {
					this.map.removeLayer(this._graphicLayer); 
					this._graphicLayer.clear();
					this._graphicLayer = null; 
				}
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
				var filterObj = this._jimuFilter.toJson(); 
				if (filterObj.parts && filterObj.parts.length > 0) {
					var whereClause = filterObj.expr; 
					if (whereClause) {
						this._executeSearch(this._targetUrl, whereClause, this._limitToMapExtent);
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
					this._initRenderLayer(targetName, this._targetUrl);
					this._jimuFilter.buildByExpr(selectedTarget[0].url, null, null); 
				} else if (selectedTarget.length < 1) {
					this._showMessage("invalid data source", "error"); 
				} else {
					this._showMessage("duplicate data sources", "error"); 
				}
			},
			
			_initRenderLayer : function(layerName, layerUrl) {
				
				if (this._renderType === "featureLayer") {
					esriRequest({
						"url": layerUrl,
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

			_executeSearch : function (layerUrl, whereClause, boundByMapExtent) {				
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

				var queryTask = new QueryTask(layerUrl); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
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
					return; 
				};

				array.forEach(resultSet.features, lang.hitch(this, function (feature) {
						var graphic = new Graphic(feature.geometry);
						graphic.setSymbol(highlightSymbol);
						graphic.setAttributes(feature.attributes);
						this._graphicLayer.add(graphic);

						if (feature.geometry) {
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

						if (feature.geometry) {
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
