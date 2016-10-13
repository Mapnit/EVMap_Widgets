
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
			name : 'SearchSurvey',
			baseClass : 'ev-widget-searchSurvey', 
			partialMatchMaxNumber : 100, 
			partialMatchMinInputLength : 3, 
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
			_abstractNames : null,
			_surveyNames : null, 
			_blockNames : null, 
			_searchTarget : null, 

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
				
				if (!this.config.visibleLayers) {
					this.config.visibleLayers = []; 
				} 
				// by default, display the query layer 
				this.config.visibleLayers.push(this.config.layer); 				
			},

			_initSearchForm : function () {
				this.abstractNumberInput.set('disabled', true); 

				this._abstractNames = new ComboBox({
						hasDownArrow: true,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						disabled: true, 
						onKeyUp: lang.hitch(this, this._onFilterInputValueEntered)
					}, this.abstractNameInput);
				this._abstractNames.startup(); 
				
				this.blockNumberInput.set('disabled', true); 

				this._blockNames = new ComboBox({
						hasDownArrow: true,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						disabled: true, 
						onKeyUp: lang.hitch(this, this._onFilterInputValueEntered)
					}, this.blockNameInput);
				this._blockNames.startup(); 	
				
				this.surveyNumberInput.set('disabled', true); 

				this._surveyNames = new ComboBox({
						hasDownArrow: true,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						disabled: true, 
						onKeyUp: lang.hitch(this, this._onFilterInputValueEntered)
					}, this.surveyNameInput);
				this._surveyNames.startup(); 	
				
				jimuUtils.combineRadioCheckBoxWithLabel(this.abstractNumberInputRadio, this.abstractNumberInputLabel);	
				jimuUtils.combineRadioCheckBoxWithLabel(this.abstractNameInputRadio, this.abstractNameInputLabel);	
				jimuUtils.combineRadioCheckBoxWithLabel(this.blockNumberInputRadio, this.blockNumberInputLabel);	
				jimuUtils.combineRadioCheckBoxWithLabel(this.blockNameInputRadio, this.blockNameInputLabel);	
				jimuUtils.combineRadioCheckBoxWithLabel(this.surveyNumberInputRadio, this.surveyNumberInputLabel);	
				jimuUtils.combineRadioCheckBoxWithLabel(this.surveyNameInputRadio, this.surveyNameInputLabel);	
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
				this.abstractNumberInput.set('value', ''); 
				this._abstractNames.set('value', '');
				this.blockNumberInput.set('value', ''); 
				this._blockNames.set('value', '');
				this.surveyNumberInput.set('value', ''); 
				this._surveyNames.set('value', '');
				
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

				this._fetchCountyNames(); 
			},
			
			_onCountyNameChanged: function() { 
				this.abstractNumberInput.set('value', ''); 
				this._abstractNames.set('value', '');
				this.blockNumberInput.set('value', ''); 
				this._blockNames.set('value', '');
				this.surveyNumberInput.set('value', '');
				this._surveyNames.set('value', '');	
				
				var countyName = this.countyInput.get('value');
				if (!countyName) {
					this._showMessage("no county is selected", "error"); 
				} else {
					switch(this._searchTarget) {
					case "abstractName":
						this._fetchAbstractNamesByCounty(countyName);
						break; 
					case "blockName":
						this._fetchBlockNamesByCounty(countyName);
						break;
					case "surveyName":
						this._fetchSurveyNamesByCounty(countyName);
						break;
					} 
				}
			},
			
			_onSearchOptionChanged: function(evt) {
				var rdoInput = evt.currentTarget; 
				console.debug("search option changed: " + rdoInput.value + " " + rdoInput.checked);

				this._searchTarget = rdoInput.value; 
				
				this.abstractNumberInput.set('disabled', this._searchTarget !== "abstractNumber");
				if (this.abstractNumberInput.get('disabled')) {
					this.abstractNumberInput.set('value', '');
				}
				this._abstractNames.set('disabled', this._searchTarget !== "abstractName");
				if (this._abstractNames.get('disabled')) {
					this._abstractNames.set('value', '');
				}

				this.blockNumberInput.set('disabled', this._searchTarget !== "blockNumber");
				if (this.blockNumberInput.get('disabled')) {
					this.blockNumberInput.set('value', '');
				}
				this._blockNames.set('disabled', this._searchTarget !== "blockName");
				if (this._blockNames.get('disabled')) {
					this._blockNames.set('value', '');
				}

				this.surveyNumberInput.set('disabled', this._searchTarget !== "surveyNumber");
				if (this.surveyNumberInput.get('disabled')) {
					this.surveyNumberInput.set('value', '');
				}
				this._surveyNames.set('disabled', this._searchTarget !== "surveyName");
				if (this._surveyNames.get('disabled')) {
					this._surveyNames.set('value', '');
				}
				
				// manually call the event handler
				this._onCountyNameChanged();
			},
			
			_onFilterInputValueEntered: function(evt) {
				//console.debug(evt.key + " pressed ");
				if (this._isKeyPrintable(evt.keyCode) !== true) {
					// ignore any non-printable char
					return; 
				}
				
				var countyName = this.countyInput.get('value');
				if (!countyName) {
					this._showMessage("no county is selected", "error");
					return; 
				}

				switch(this._searchTarget) {
					case "abstractName":
						var blockNameInputValue = this._blockNames.get('value');
						if (blockNameInputValue && blockNameInputValue.length >= this.partialMatchMinInputLength) {
							this._fetchblockNamesByCounty(countyName, blockNameInputValue);
						}
						break;
					case "blockName":
						var blockNameInputValue = this._blockNames.get('value');
						if (blockNameInputValue && blockNameInputValue.length >= this.partialMatchMinInputLength) {
							this._fetchblockNamesByCounty(countyName, blockNameInputValue);
						}
						break;					
					case "surveyName":
						var surveyNameInputValue = this._surveyNames.get('value');
						if (surveyNameInputValue && surveyNameInputValue.length >= this.partialMatchMinInputLength) {
							this._fetchSurveyNamesByCounty(countyName, surveyNameInputValue);
						}
						break; 
				}
				
			}, 
			
			_fetchCountyNames : function() {
				this._showMessage("retrieving counties...");
				
				this.countyInput.store = new Memory({data: []});

				var query = new Query();
				query.where = "1=1"; 
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

			_fetchAbstractNamesByCounty : function(countyName, filterAbstractName) {
				this._showMessage("retrieving abstract names for " + countyName + "...");

				this._abstractNames.store = new Memory({data: []});
				//this._abstractNames.set('value', '');
				
				var whereClause = this.config.abstractName.relatedFields["county"] + " like '" + countyName + "%'";
				if (filterAbstractName) {
					whereClause += (" and " + this.config.abstractName.field + " like '%" + filterAbstractName + "%'");
				}
				
				var query = new Query();
				query.where = whereClause;
				query.returnGeometry = false;
				query.outFields = [this.config.abstractName.field];
				query.orderByFields = [this.config.abstractName.field];
				query.returnDistinctValues = true; 
				query.num = this.partialMatchMaxNumber;

				var queryTask = new QueryTask(this.config.abstractName.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.abstractName.field]
									});
								}));
							this._abstractNames.store = valueStore;
							
							this._hideMessage();
						} else {
							this._showMessage("no abstract found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},	
			
			_fetchBlockNamesByCounty : function(countyName, filterBlockName) {
				this._showMessage("retrieving block names for " + countyName + "...");

				this._blockNames.store = new Memory({data: []});
				//this._blockNames.set('value', '');	
				
				var whereClause = this.config.blockName.relatedFields["county"] + " like '" + countyName + "%'"; 
				if (filterBlockName) {
					whereClause += (" and " + this.config.blockName.field + " like '%" + filterBlockName + "%'");
				}
			
				var query = new Query();
				query.where = whereClause;
				query.returnGeometry = false;
				query.outFields = [this.config.blockName.field];
				query.orderByFields = [this.config.blockName.field];
				query.returnDistinctValues = true; 
				query.num = this.partialMatchMaxNumber;

				var queryTask = new QueryTask(this.config.blockName.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.blockName.field]
									});
								}));
							this._blockNames.store = valueStore;
							
							this._hideMessage();
						} else {
							this._showMessage("no block found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},
			
			_fetchSurveyNamesByCounty : function(countyName, filterSurveyNameName) {
				this._showMessage("retrieving survey names for " + countyName + "...");

				this._surveyNames.store = new Memory({data: []});
				//this._surveyNames.set('value', '');	
				
				var whereClause = this.config.surveyName.relatedFields["county"] + " like '" + countyName + "%'"; 
				if (filterSurveyNameName) {
					whereClause += (" and " + this.config.surveyName.field + " like '%" + filterSurveyNameName + "%'");
				}
			
				var query = new Query();
				query.where = whereClause;
				query.returnGeometry = false;
				query.outFields = [this.config.surveyName.field];
				query.orderByFields = [this.config.surveyName.field];
				query.returnDistinctValues = true; 
				query.num = this.partialMatchMaxNumber;

				var queryTask = new QueryTask(this.config.surveyName.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.surveyName.field]
									});
								}));
							this._surveyNames.store = valueStore;
							
							this._hideMessage();
						} else {
							this._showMessage("no survey found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},
			
			_onBtnEndClicked : function () {
				var whereClause = this.config.county.field + " like '" + this.countyInput.get('value') + "%'"; 
				switch(this._searchTarget) {
				case "abstractNumber":
					whereClause += 
						(" and " + this.config.abstractNumber.field + " = '" + this.abstractNumberInput.get('value') + "'");
					break;
				case "abstractName":
					whereClause += 
						(" and " + this.config.abstractName.field + " = '" + this._abstractNames.get('value') + "'");
					break;
				case "blockNumber":
					whereClause += 
						(" and " + this.config.blockNumber.field + " = '" + this.blockNumberInput.get('value') + "'");
					break;
				case "blockName":
					whereClause += 
						(" and " + this.config.blockName.field + " = '" + this._blockNames.get('value') + "'");
					break;
				case "surveyNumber":
					whereClause += 
						(" and " + this.config.surveyNumber.field + " = '" + this.surveyNumberInput.get('value') + "'");
					break;
				case "surveyName":
					whereClause += 
						(" and " + this.config.surveyName.field + " = '" + this._surveyNames.get('value') + "'");
					break;
				default: 
					this._showMessage("invalid search parameters", "error"); 
					return; 
				}
				if (whereClause) {
					this._executeSearch(whereClause);
				}				
			},

			_isKeyPrintable : function(keyCode) {
				return (
					(keyCode > 64 && keyCode < 91)   || /* letter keys */
					(keyCode > 47 && keyCode < 58)   || /* number keys */
					(keyCode > 95 && keyCode < 112)  || /* numpad keys */ 
					keyCode == 32 || keyCode == 8    || /* spacebar or backspace */
					(keyCode > 185 && keyCode < 193) || /* ;=,-./` (in order) */ 
					(keyCode > 218 && keyCode < 223)    /* [\]' (in order)) */ 
					); 
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
