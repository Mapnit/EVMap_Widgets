
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
		'dijit/form/DateTextBox',
		'dijit/form/Select',
		'dijit/form/NumberSpinner'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred,
		domConstruct, html, lang, Color, array, domStyle, domClass,
		esriConfig, esriRequest, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, FeatureLayer, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, WidgetManager, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox, DateTextBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchData',
			baseClass : 'ev-widget-searchData',
			partialMatchMaxNumber : 100, 
			partialMatchMinInputLength : 3, 
			_searchParams : {},
			_selectedOption : null,
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
			_currentViewIndex : 0,
			_filterValues : [],

			postCreate : function () {
				this.inherited(arguments);
				this._initSearch();
				this._initSearchForm();

				this.viewStack = new ViewStack({
						viewType : 'dom',
						views : [this.optionSection, this.filterSection]
					});
				domConstruct.place(this.viewStack.domNode, this.ParameterSection, "only");
			},

			_initSearch : function () {
				this._queryTask = new QueryTask(this.config.layer);

				this._infoTemplate = new InfoTemplate("Properties", "${*}");

				this._filterValues = []; 
				
				this._searchParams["limitToMapExtent"] = this.config.limitToMapExtent; 
				
				this._renderType = this.config.renderType || "graphicLayer"; 
				
				if (this.config.renderSymbols) {
					this._symbols = this.config.renderSymbols; 
				}
			},

			_initSearchForm : function () {

				this.optionListPrompt.innerText = this.config.prompt;
				this.limitToMapExtent.checked = this.config.limitToMapExtent; 

				array.forEach(this.config.options, lang.hitch(this, function (opt) {
						var optionDiv = domConstruct.create("div");
						domClass.add(optionDiv, "option-list-item"); 
						var radioBtn = domConstruct.create("input", {
								"type" : "radio",
								"name" : "searchOption",
								"value" : opt.name
							});
						optionDiv.appendChild(radioBtn);
						var radioLabel = domConstruct.create("label", {
								"innerHTML" : opt.label
							});
						domClass.add(radioLabel, "filter-input-label");
						optionDiv.appendChild(radioLabel);
						
						this.optionList.appendChild(optionDiv);

						jimuUtils.combineRadioCheckBoxWithLabel(radioBtn, radioLabel);

						on(radioBtn, "change", lang.hitch(this, this._onSearchOptionChecked));

					}));

				jimuUtils.combineRadioCheckBoxWithLabel(this.limitToMapExtent, this.limitToMapExtentLabel);
			},
			
			onOpen : function() {
				// show the 1st view
				this._currentViewIndex = 0; 
				this.viewStack.switchView(this._currentViewIndex);
				
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

				this.viewStack.startup();
			},

			_onBtnCancelClicked : function () {
				this._currentViewIndex = 0;
				this.viewStack.switchView(this._currentViewIndex);
				
				this._hideMessage();
			},

			_onBtnGoToPrevClicked : function () {
				this._currentViewIndex = Math.max(--this._currentViewIndex, 0);
				this.viewStack.switchView(this._currentViewIndex);

				this._hideMessage();
			},

			_onBtnGoToNextClicked : function () {
				if (this._selectedOption) {
					this._currentViewIndex = Math.min(++this._currentViewIndex, this.viewStack.views.length - 1);
					this.viewStack.switchView(this.filterSection);
				} else {
					this._showMessage("no search option selected", "error"); 
				}
			},

			_onBtnEndClicked : function () {
				var whereClause;
				switch (this._selectedOption.input) {
				case "single":
					var searchVal = this._filterValues[0].value.trim();
					whereClause = this._selectedOption.field + " = '" + searchVal + "'";
					break;
				case "multiple":
					var textInput = this._filterValues[0].value.trim();
					var valOptions = textInput.split(/[\,|\n]/);
					var searchVals = [];
					array.forEach(valOptions, function (opt) {
						if (opt) {
							searchVals.push("'" + opt.trim() + "'");
						}
					});
					whereClause = this._selectedOption.field + " in (" + searchVals.join() + ")";
					break;
				case "select":
					var searchVals = [];
					array.forEach(this._filterValues[0].options, function (opt) {
						if (opt.selected) {
							searchVals.push("'" + opt.value + "'");
						}
					});
					whereClause = this._selectedOption.field + " in (" + searchVals.join() + ")";
					break;
				case "range":
					searchVals = [];
					array.forEach(this._filterValues, function (fltrVal, i) {
						searchVals[i%2] = fltrVal.get('displayedValue');
					});
					var rangeLimits = [];
					if (searchVals[0]) {
						rangeLimits.push(this._selectedOption.field + " >= '" + searchVals[0] + "'");
					}
					if (searchVals[1]) {
						rangeLimits.push(this._selectedOption.field + " <= '" + searchVals[1] + "'");
					}
					whereClause = rangeLimits.join(' and ');
					break;
				}
				if (whereClause) {
					this._executeSearch(whereClause);
				} else {
					this._showMessage("invalid search criteria", "error");
				}
			},

			_onSearchOptionChecked : function (evt) {
				this._hideMessage();
				
				this._searchParams["searchOption"] = evt.currentTarget.value;

				this._selectedOption = null;
				for (var i = 0, len = this.config.options.length; i < len; i++) {
					if (this.config.options[i].name === this._searchParams["searchOption"]) {
						this._selectedOption = this.config.options[i];
						break;
					}
				}

				if (this._selectedOption) {
					this.filterPrompt.innerText = this._selectedOption.prompt;
					// remove existing child elements
					while (this.filterInput.hasChildNodes()) {
						this.filterInput.removeChild(this.filterInput.lastChild);
					}
					this._filterValues = [];
					// add new child elements
					var filterLabel = domConstruct.create("label", {
							"innerHTML" : this._selectedOption.label
						});
					domClass.add(filterLabel, "filter-input-label");
					this.filterInput.appendChild(filterLabel);
					
					switch (this._selectedOption.input) {
					case "single":
						switch (this._selectedOption.dataType) {
						case "text":
						case "number":
							var valInput = domConstruct.create("input", {
									"type" : "text",
									"style" : "width:175px"
								});
							this.filterInput.appendChild(valInput);
							// on(this._filterValues[0], "keyup", lang.hitch(this, this._onFilterValueEntered));
							this._filterValues[0] = new ComboBox({
									//hasDownArrow: false,
									style: "width: 175px; height:25px",
									store: new Memory({data: []}),
									searchAttr: "name",
									onKeyUp: lang.hitch(this, this._onFilterValueEntered)
								}, valInput);
							this._filterValues[0].startup();
							break;
						case "date":
						}
						break;
					case "multiple":
						switch (this._selectedOption.dataType) {
						case "text":
						case "number":
							this._filterValues[0] = domConstruct.create("textarea", {
									"row" : "10",
									"style" : "height:50px;width:90%;"
								});
							this.filterInput.appendChild(this._filterValues[0]);
							break;
						case "date":
						}
						break;
					case "select":
						switch (this._selectedOption.dataType) {
						case "text":
						case "number":
							this._filterValues[0] = domConstruct.create("select", {
									"name" : "searchVal",
									"multiple" : "multiple"
								});
							this.filterInput.appendChild(this._filterValues[0]);
							
							this._showMessage("retrieving " + this._selectedOption.label + "..."); 
							this._fetchPartialMatches("").then(
								lang.hitch(this, function (valueArray) {
									array.forEach(valueArray, lang.hitch(this, function (valItem) {
											var valOption = domConstruct.create("option", {
													"value" : valItem,
													"innerHTML" : (valItem) ? valItem : "n/a"
												});
											this._filterValues[0].appendChild(valOption);
										}));
									this._hideMessage(); 
								}), lang.hitch(this, function (err) {
									this._showMessage(err.message, "error");
								}));
							break;
						}
						break;
					case "range":
						this._hideMessage();
						var valueContainer = domConstruct.create("table"); 
						this.filterInput.appendChild(valueContainer); 
						array.forEach(this._selectedOption.rangeLabels, lang.hitch(this, function(lbl, i) {
							var valueRow = domConstruct.create("tr");
							
							var limitLabelCell = domConstruct.create("td");
							var limitLabel = domConstruct.create("label", {
								"innerHTML": lbl
							});
							domClass.add(limitLabel, "filter-input-label");
							limitLabelCell.appendChild(limitLabel);
							valueRow.appendChild(limitLabelCell);
							
							var limitValCell = domConstruct.create("td");
							var limitVal;
							switch(this._selectedOption.dataType) {
							case "text":
							case "number":
								limitVal = domConstruct.create("input", {
										"type" : "text",
										"style" : "width:100px"
									});	
								limitValCell.appendChild(limitVal);
								this._filterValues.push(limitVal);
								break;
							case "date":
								limitVal = domConstruct.create("input", {
										"type" : "text"
									});	
								limitValCell.appendChild(limitVal);
								this._filterValues.push(
									new DateTextBox({
										"style": "width:125px;height:30px;"
									}, limitVal)
									);
								this._filterValues[i%2].startup();
								break;
							}
							valueRow.appendChild(limitValCell);
							
							valueContainer.appendChild(valueRow); 
						}));
						break;
					}
				}
			},

			_onLimitToMapExtentChecked : function (evt) {
				this._searchParams["limitToMapExtent"] = evt.currentTarget.checked;
			},

			_onFilterValueEntered : function (evt) { 
				var fltrValue = this._filterValues[0].get('value'); 
				if (fltrValue) {
					var textInput = fltrValue.trim();
					if (textInput.length >= this.partialMatchMinInputLength) {
						this._showMessage("retrieving partial matches on " + this._selectedOption.label + "...");  
						this._fetchPartialMatches(textInput).then(
							lang.hitch(this, function (valueArray) {
								var valueStore = new Memory({data: []});
								this._filterValues[0].store = valueStore;
								if (valueArray && valueArray.length > 0) {
									array.forEach(valueArray, lang.hitch(this, function (valItem, i) {
											//console.debug("partial match: " + valItem);
											valueStore.put({
												"id" : i,
												"name" : valItem
											});	
										}));
									this._filterValues[0].store = valueStore;
									this._showMessage("click the dropdown arrow to show partial matches");
								} else {
									this._showMessage("no partial match found", "warning");
								}
							}), lang.hitch(this, function (err) {
								this._showMessage(err.message, "error");
							}));
					}
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

			_fetchPartialMatches : function (textInput) {
				var deferred = new Deferred();

				if (this._selectedOption) {
					var query = new Query();
					query.where = this._selectedOption.field + " like '%" + textInput + "%'";
					query.returnGeometry = false;
					query.orderByFields = [this._selectedOption.field];
					query.returnDistinctValues = true;
					query.outFields = [this._selectedOption.field];
					query.num = this.partialMatchMaxNumber; 

					this._queryTask.execute(query, lang.hitch(this, function (resultSet) {
							var valueArray = [];
							if (resultSet && resultSet.features && resultSet.features.length > 0) {
								array.forEach(resultSet.features, lang.hitch(this, function (feature, i) {
										valueArray.push(feature.attributes[this._selectedOption.field]);
										console.debug("partial match: " + feature.attributes[this._selectedOption.field]);
									}));
							} else {
								this._showMessage("no feature found", "warning");
							}
							return deferred.resolve(valueArray);
						}), lang.hitch(this, function (err) {
							return deferred.reject(err);
						}));
				} else {
					return deferred.reject({
						"message" : "no search option selected"
					});
				}

				return deferred.promise;
			},

			_executeSearch : function (whereClause) {
				if (this._selectedOption) {
					this._showMessage("searching..."); 
					
					var query = new Query();
					query.where = whereClause;
					query.outSpatialReference = this.map.spatialReference;
					query.returnGeometry = true;
					query.outFields = ["*"];

					if (this._searchParams["limitToMapExtent"] === true) {
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
				}
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
