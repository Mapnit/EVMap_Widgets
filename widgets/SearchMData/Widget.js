
define([
		'dojo/_base/declare',
		'dijit/_WidgetsInTemplateMixin',
		'jimu/BaseWidget',
		'dojo/on',
		'dojo/Deferred',
		'dojo/promise/all', 
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
		'dijit/form/NumberSpinner', 
		'dijit/form/Button'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred, all, 
		domConstruct, html, lang, Color, array, domStyle, domClass,
		esriConfig, esriRequest, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, FeatureLayer, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, WidgetManager, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox, DateTextBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchMData',
			baseClass : 'ev-widget-searchMData',
			partialMatchMaxNumber : 100, 
			partialMatchMinInputLength : 3, 
			_searchParams : {},
			_selectedOption : null,
			_renderType : null /*graphicLayer (default) or featureLayer*/,
			_featureLayers : {}, 
			_graphicLayers : {},
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
				this._qualifyURLs(); 
				this._initSearch();
				this._initSearchForm();

				this.viewStack = new ViewStack({
						viewType : 'dom',
						views : [this.optionSection, this.filterSection]
					});
				domConstruct.place(this.viewStack.domNode, this.ParameterSection, "only");
			},
			
			_qualifyURLs : function () {
				array.forEach(this.config.options, lang.hitch(this, function(opt) {
					if (opt.layer) {
						opt.layer = this._convertToAbsURL(opt.layer); 
					}
				})); 
				array.forEach(this.config.dataSources, lang.hitch(this, function(ds) {
					if (ds.layer) {
						ds.layer = this._convertToAbsURL(ds.layer); 
					}
				})); 
				this.config.visibleLayers = this._convertToAbsURLs(this.config.visibleLayers);	
			},

			_initSearch : function () {
				this._infoTemplate = new InfoTemplate("Properties", "${*}");

				this._filterValues = []; 
				
				this._searchParams["limitToMapExtent"] = this.config.limitToMapExtent; 
				
				this._renderType = this.config.renderType || "graphicLayer"; 
				
				if (this.config.renderSymbols) {
					this._symbols = this.config.renderSymbols; 
				}
				
				if (!this.config.visibleLayers) {
					this.config.visibleLayers = []; 
				} 
				// by default, display the data source layers
				array.forEach(this.config.dataSources, lang.hitch(this, function(ds) {
					if (ds.layer) {
						this.config.visibleLayers.push(ds.layer);
					}
				}));
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
					array.forEach(this.config.dataSources, lang.hitch(this, function(ds) {
						esriRequest({
							"url": ds.layer,
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
							this._featureLayers[layerInfo.name] = new FeatureLayer(featureCollection, {
								id: layerInfo.name + "_searchResults", 
								infoTemplate: this._infoTemplate
							});
							this.map.addLayer(this._featureLayers[layerInfo.name]); 
						}), lang.hitch(this, function(err) {
							this._showMessage(err.message, "error"); 
						})); 						
						console.debug("the search results to be rendered as features"); 
					})); 
				} else { 
					array.forEach(this.config.dataSources, lang.hitch(this, function(ds) {
						this._graphicLayers[layerInfo.name] = new GraphicsLayer({
							id: ds.name + "_searchResults", 
							infoTemplate: this._infoTemplate
						});
					})); 
					this.map.addLayer(this._graphicLayers); 
					console.debug("the search results to be rendered as graphics"); 
				}
			},

			onClose : function () {
				// clear the message
				this._hideMessage(); 
				
				if (this._renderType === "featureLayer") {
					// clean up featureLayer
					for(var k in this._featureLayers) {
						this.map.removeLayer(this._featureLayers[k]); 
						this._featureLayers[k].clear(); 
						this._featureLayers[k] = null; 
					}
					this._featureLayers = {}; 
				} else {
					for(var k in this._graphicLayers) {
						this.map.removeLayer(this._graphicLayers[k]); 
						this._graphicLayers[k].clear(); 
						this._graphicLayers[k] = null; 
					}
					this._graphicLayers = {}; 
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
				this._hideMessage(); 
				
				var searchDeferredList = []; 
				array.forEach(this.config.dataSources, lang.hitch(this, function(ds) {
					var whereClause;
					switch (this._selectedOption.input) {
					case "single":
						var searchVal = this._filterValues[0].value.trim();
						whereClause = ds.fields[this._selectedOption.name] + " = '" + searchVal + "'";
						break;
					case "multiple":
						var textInput = this._filterValues[0].value.trim();
						var valOptions = textInput.split(/[\,|\n]/);
						var searchVals = [];
						array.forEach(valOptions, function (opt) {
							if (opt && opt.length > 0) {
								searchVals.push("'" + opt.trim() + "'");
							}
						});
						whereClause = ds.fields[this._selectedOption.name] + " in (" + searchVals.join() + ")";
						break;
					case "select":
						var searchVals = [];
						array.forEach(this._filterValues[0].options, function (opt) {
							if (opt.selected) {
								searchVals.push("'" + opt.value + "'");
							}
						});
						whereClause = ds.fields[this._selectedOption.name] + " in (" + searchVals.join() + ")";
						break;
					case "range":
						searchVals = [];
						array.forEach(this._filterValues, function (fltrVal, i) {
							searchVals[i%2] = fltrVal.get('displayedValue');
						});
						var rangeLimits = [];
						if (searchVals[0]) {
							rangeLimits.push(ds.fields[this._selectedOption.name] + " >= '" + searchVals[0] + "'");
						}
						if (searchVals[1]) {
							rangeLimits.push(ds.fields[this._selectedOption.name] + " <= '" + searchVals[1] + "'");
						}
						whereClause = rangeLimits.join(' and ');
						break;
					default: 
						this._showMessage("invalid search option", "error"); 
					}
					if (whereClause) {
						searchDeferredList.push(
							this._executeSearch(ds, whereClause, this._searchParams["limitToMapExtent"])
						);
					} else {
						this._showMessage("invalid search criteria", "error");
					} 
				})); 
				
				all(searchDeferredList).then(lang.hitch(this, function(resultSetArray) {
					array.forEach(resultSetArray, lang.hitch(this, function(resultSet, index) {
						var ds = this.config.dataSources[index];
						this._onSearchComplete(ds.name, resultSet); 
					})); 
				}), lang.hitch(this, function(err) {
					this._showMessage(err, "error"); 
				})); 
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
									domStyle.set(this._filterValues[0], 'height', 
										Math.min(Math.max(30*valueArray.length, 100), 250) + "px");
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
				//console.debug(evt.key + " pressed ");
				if (this._isKeyPrintable(evt.keyCode) !== true) {
					// ignore any non-printable char
					return; 
				}
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
			
			_isKeyPrintable : function(keyCode) {
				return (
					(keyCode > 64 && keyCode < 91)   || /* letter keys */
					(keyCode > 47 && keyCode < 58)   || /* number keys */
					(keyCode > 95 && keyCode < 112)  || /* numpad keys */ 
					keyCode == 32 || keyCode == 8    || /* spacebar, backspace */
					(keyCode > 185 && keyCode < 193) || /* ;=,-./` (in order) */ 
					(keyCode > 218 && keyCode < 223)    /* [\]' (in order)) */ 
					); 
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
							if (serviceLayer.errors && serviceLayer.errors.length > 0) {
								this._showMessage("failed to load " + serviceLayer.title, "error"); 
							} else {
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
				}
				return relativeURL; // return as is 
			}, 

			_showMessage : function (textMsg, lvl, additional) {
				var msgNode = domConstruct.create("p", {
					innerHTML: textMsg
				}); 
				
				switch (lvl) {
					case "error":
						domClass.add(msgNode, "message-error");
						break;
					case "warning":
						domClass.add(msgNode, "message-warning");
						break;
					case "info":
						domClass.add(msgNode, "message-info");
						break;
					default:
						domClass.add(msgNode, "message-info");
				}
				
				domConstruct.place(msgNode, this.searchMessages, additional==true?"last":"only"); 
				
				domStyle.set(this.searchMessages, "display", "block"); 
			},

			_hideMessage : function () {
				domStyle.set(this.searchMessages, "display", "none"); 
				
				domConstruct.empty(this.searchMessages);
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

					var queryTask = new QueryTask(this._selectedOption.layer); 
					queryTask.execute(query, lang.hitch(this, function (resultSet) {
							var valueArray = [];
							if (resultSet && resultSet.features && resultSet.features.length > 0) {
								array.forEach(resultSet.features, lang.hitch(this, function (feature, i) {
										valueArray.push(feature.attributes[this._selectedOption.field]);
										//console.debug("partial match: " + feature.attributes[this._selectedOption.field]);
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
			
			_executeSearch : function (dataSource, whereClause, boundByMapExtent) {
				var query = new Query();
				query.where = whereClause;
				query.outSpatialReference = this.map.spatialReference;
				query.returnGeometry = true;
				query.outFields = ["*"];

				if (boundByMapExtent === true) {
					query.geometry = this.map.extent;
					query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
				}

				var queryTask = new QueryTask(dataSource.layer);
				
				return queryTask.execute(query); 
			}, 
			
			_onSearchComplete : function(dataSourceName, resultSet) {
				if (resultSet && resultSet.features) {
					console.debug(dataSourceName + " results: " + resultSet.features.length);
					if (resultSet.features.length > 0) {
						if (resultSet.exceededTransferLimit === true) {
							this._showMessage(dataSourceName + ": exceed search limit. only first " 
								+ resultSet.features.length + " feature(s) displayed", "warning", true); 
						} else {
							this._showMessage(dataSourceName + ": " + resultSet.features.length 
								+ " feature(s) found", "info", true);
						}
						if (this._renderType === "featureLayer") {
							this._drawFeaturesOnMap(dataSourceName, resultSet); 
						} else {
							this._drawGraphicsOnMap(resultSet); 
						} 
					} else {
						this._showMessage(dataSourceName + ": no feature found", "warning", true);
					}
				} 
				// turn on query layer and other relevant layers
				this._displayMapLayers(this.config.visibleLayers); 
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

			_drawFeaturesOnMap : function (dataSourceName, resultSet, clearFirst/*default: true*/) {
				var featureLayer = this._featureLayers[dataSourceName]; 
				if (!featureLayer) {
					this._showMessage(dataSourceName + ": can't find results", "error", true); 
					return; 
				}
				
				if (clearFirst !== false) {
					featureLayer.clear();
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
					featureLayer.applyEdits(featureArray, null, null, 
						lang.hitch(this, function() {
							console.debug("resultset is added into FeatureLayer for " + dataSourceName);  
							// open AttributeTable and display the results 
							this._showResultsInAttributeTable(dataSourceName); 
						}), 
						lang.hitch(this, function(err) {
							this._showMessage( dataSourceName + ": " 
								+ (err.message || "failed to show search results"), "error", true); 
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
			
			_showResultsInAttributeTable : function(dataSourceName) {
				var attributeTableWidgetEle =
					this.appConfig.getConfigElementsByName("AttributeTable")[0];
				var widgetManager = WidgetManager.getInstance();
				widgetManager.triggerWidgetOpen(attributeTableWidgetEle.id).then(
					lang.hitch(this, function() {
						this.publishData({
							'target': 'AttributeTable',
							'layer': this._featureLayers[dataSourceName]
						});
					})
				);	
			}, 
			
			_closeAttributeTable : function() {
				var attributeTableWidgetEle =
					this.appConfig.getConfigElementsByName("AttributeTable")[0];
				var widgetManager = WidgetManager.getInstance();
				widgetManager.closeWidget(attributeTableWidgetEle.id);
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
