
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
		'dijit/form/ComboBox', 
		'dijit/form/Button',
		'dijit/form/TextBox'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred,
		domConstruct, html, lang, Color, array, domStyle, domClass,
		esriConfig, esriRequest, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, FeatureLayer, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, WidgetManager, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchParcel',
			baseClass : 'ev-widget-searchParcel',
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

			postCreate : function () {
				this.inherited(arguments);
				this._qualifyURLs(); 
				this._initSearch();
				this._initSearchForm();
			},
			
			_qualifyURLs : function () {
				this.config.layer = this._convertToAbsURL(this.config.layer); 
				this.config.visibleLayers = this._convertToAbsURLs(this.config.visibleLayers);	

				this.config.state.layer = this._convertToAbsURL(this.config.state.layer); 
				this.config.county.layer = this._convertToAbsURL(this.config.county.layer); 
			},
			
			_initSearch : function () {

				this._infoTemplate = new InfoTemplate("Properties", "${*}");
				
				this._renderType = this.config.renderType || "graphicLayer"; 
				
				if (this.config.renderSymbols) {
					this._symbols = this.config.renderSymbols; 
				}
				
				if (!this.config.visibleLayers) {
					this.config.visibleLayers = []; 
				} 
				// by default, display the query layer 
				this.config.visibleLayers.push(this.config.layer); 				
			},

			_initSearchForm : function () {				

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
				this.countyInput.set('value', '');
				// clear the message
				this._hideMessage(); 
				
				if (this._renderType === "featureLayer") {
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

			_onStateNameChanged: function() {
				
				var stateName = this.stateInput.get('value');

				this._fetchCountiesByState(stateName);
			},
			
			_fetchStateNames : function() {
				this._showMessage("retrieving states...");
				
				this.stateInput.store = new Memory({data: []});

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
							this.stateInput.store = valueStore;
							
							this._hideMessage();
						} else {
							this._showMessage("no state found", "warning");
						}
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},

			_fetchCountiesByState : function(stateName) {
				this._showMessage("retrieving counties for " + stateName + "...");
				
				this.countyInput.store = new Memory({data: []});
				this.countyInput.set('value', '');
				
				var query = new Query();
				query.where = this.config.county.relatedFields["state"] + " = '" + stateName + "'";
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
							this.countyInput.store = valueStore;
							
							this._hideMessage();
						} else {
							this._showMessage("no county found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},
			
			_onBtnEndClicked : function () {
				var critera = []; 
				if (this.stateInput.get('value').length > 0) {
					critera.push(this.config.state.field + " = '" + this.stateInput.get('value').trim() + "'"); 
				} else if (this.config.state.required === true) {
					this._showMessage("the State field can't be empty", "error"); 
					return;
				}
				if (this.countyInput.get('value').length > 0) {
					critera.push(this.config.county.field + " = '" + this.countyInput.get('value').trim() + "'"); 
				} else if (this.config.county.required === true) {
					this._showMessage("the County field can't be empty", "error"); 
					return;
				}
				if (this.cityInput.get('value').length > 0) {
					critera.push(this.config.city.field + " like '%" + this.cityInput.get('value') + "%'"); 
				}
				if (this.zipcodeInput.get('value').length > 0) {
					critera.push(this.config.zipcode.field + " = '" + this.zipcodeInput.get('value') + "'"); 
				}
				if (this.addressInput.get('value').length > 0) {
					critera.push(this.config.address.field + " like '%" + this.addressInput.get('value') + "%'"); 
				}
				if (this.subdivInput.get('value').length > 0) {
					critera.push(this.config.subdiv.field + " = '" + this.subdivInput.get('value') + "'"); 
				}
				if (this.blockInput.get('value').length > 0) {
					critera.push(this.config.block.field + " = '" + this.blockInput.get('value') + "'"); 
				}
				if (this.lotInput.get('value').length > 0) {
					critera.push(this.config.lot.field + " = '" + this.lotInput.get('value') + "'"); 
				}
				if (this.apnInput.get('value').length > 0) {
					critera.push(this.config.apn.field + " = '" + this.apnInput.get('value') + "'"); 
				}
				if (this.lastNameInput.get('value').length > 0) {
					critera.push(this.config.lastName.field + " like '%" + this.lastNameInput.get('value') + "%'"); 
				}
				if (this.legalDesptInput.get('value').length > 0) {
					critera.push(this.config.legalDespt.field + " like '%" + this.legalDesptInput.get('value') + "%'"); 
				}
				
				var whereClause = critera.join(" and "); 
				if (whereClause) {
					this._executeSearch(whereClause);
				} else {
					this._showMessage("invalid search parameters", "error");
				}
			},

			_convertToAbsURLs : function(relativeURLs) {
				if (relativeURLs instanceof Array) {
					var absoluteURLs = []; 
					for(var u=0,l=relativeURLs.length; u<l; u++) {
						absoluteURLs[u] = this._convertToAbsURL(relativeURLs[u]); 
					} 
					return absoluteURLs;
				}
				return relativeURLs; // return as is
			},
			
			_convertToAbsURL : function(relativeURL) {
				if (relativeURL && /^https?:\/\//i.test(relativeURL) == false) {
					var urlRegExp = new RegExp(relativeURL.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") + "$", "i"); 
					if (this.map.itemInfo && this.map.itemInfo.itemData && this.map.itemInfo.itemData.operationalLayers) {
						var operationalLayers = this.map.itemInfo.itemData.operationalLayers; 
						for(var p=0,pl=operationalLayers.length; p<pl; p++) {
							var serviceLayer = operationalLayers[p]; 
							for(var f=0,fl=serviceLayer.resourceInfo.layers.length; f<fl; f++) {
								var featureLayer = serviceLayer.resourceInfo.layers[f]; 
								var layerURL = serviceLayer["url"] + "/" + featureLayer["id"]; 
								if (urlRegExp.test(layerURL) == true) {
									return layerURL; 
								}
							}
							for(var t=0,tl=serviceLayer.resourceInfo.tables.length; t<tl; t++) {
								var featureTable = serviceLayer.resourceInfo.tables[t]; 
								var tableURL = serviceLayer["url"] + "/" + featureTable["id"]; 
								if (urlRegExp.test(tableURL) == true) {
									return tableURL; 
								}
							} 
						}
					} 
				}
				return relativeURL; // return as is 
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

				var queryTask = new QueryTask(this.config.layer);
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
							// turn on query layer and other relevant layers
							this._displayMapLayers(this.config.visibleLayers); 
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
					}));
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
					}));

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
			}, 
			
			_displayMapLayers : function(layerUrls) {
				if (layerUrls && layerUrls.length > 0)  {
					array.forEach(this.map.layerIds, lang.hitch(this, function(layerId) {
						var dynamicLayer = this.map.getLayer(layerId); 
						var subLayersVisible = dynamicLayer.visibleLayers; 
						var visibilityChanged = false; 
						array.forEach(layerUrls, lang.hitch(this, function(layerUrl) {
							if (layerUrl.indexOf(dynamicLayer.url) > -1) {
								var layerUrlParts = layerUrl.split("/"); 
								var subLayerIndex = layerUrlParts[layerUrlParts.length-1]; 
								if (array.indexOf(subLayersVisible, subLayerIndex) == -1) {
									subLayersVisible.push(Number(subLayerIndex)); 
									visibilityChanged = true; 
								} 
							}
						}));
						if (visibilityChanged == true) {
							subLayersVisible.sort(); 
							dynamicLayer.setVisibleLayers(subLayersVisible); 
							dynamicLayer.setVisibility(true); 
						}
					})); 
				}
			}

		});

	return clazz;
});

