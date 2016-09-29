
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
		'dijit/form/ComboBox',
		'dijit/form/DateTextBox',
		'dijit/form/Select',
		'dijit/form/NumberSpinner'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred,
		domConstruct, html, lang, Color, array, domStyle, domClass,
		esriConfig, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, FeatureLayer, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox, DateTextBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchData',
			baseClass : 'ev-widget-searchData',
			_searchParams : {},
			_selectedOption : null,
			_queryTask : null,
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
			},

			_initSearchForm : function () {

				this.optionListPrompt.innerText = this.config.prompt;

				array.forEach(this.config.options, lang.hitch(this, function (opt) {
						var optionDiv = domConstruct.create("div");
						var radioBtn = domConstruct.create("input", {
								"type" : "radio",
								"name" : "searchOption",
								"value" : opt.name
							});
						optionDiv.appendChild(radioBtn);
						var radioLabel = domConstruct.create("label", {
								"innerHTML" : opt.label
							});
						optionDiv.appendChild(radioLabel);
						this.optionList.appendChild(optionDiv);

						jimuUtils.combineRadioCheckBoxWithLabel(radioBtn, radioLabel);

						on(radioBtn, "change", lang.hitch(this, this._onSearchOptionChecked));

					}));

				jimuUtils.combineRadioCheckBoxWithLabel(this.limitToMapExtent, this.limitToMapExtentLabel);
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

				this.viewStack.startup();
				this.viewStack.switchView(this._currentViewIndex);
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
				this._currentViewIndex = Math.min(++this._currentViewIndex, this.viewStack.views.length - 1);
				this.viewStack.switchView(this.filterSection);
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
									"row" : "5",
									"style" : "width:175px"
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
							this._hideMessage();
							this._filterValues[0] = domConstruct.create("select", {
									"name" : "searchVal",
									"multiple" : "multiple",
									"style" : "width:175px"
								});
							this.filterInput.appendChild(this._filterValues[0]);
							this._fetchPartialMatches("").then(
								lang.hitch(this, function (valueArray) {
									array.forEach(valueArray, lang.hitch(this, function (valItem) {
											var valOption = domConstruct.create("option", {
													"value" : valItem,
													"innerHTML" : (valItem) ? valItem : "n/a"
												});
											this._filterValues[0].appendChild(valOption);
										}));
								}), lang.hitch(this, function (err) {
									this._showMessage(err.message, "error");
								}));
							break;
						}
						break;
					case "range":
						this._hideMessage();
						var valueContainer = domConstruct.create("div"); 						
						this.filterInput.appendChild(valueContainer);
						
						array.forEach(this._selectedOption.rangeLabels, lang.hitch(this, function(lbl, i) {
							var limitLabel = domConstruct.create("label", {
								"innerHTML": lbl
							});
							valueContainer.appendChild(limitLabel);
							
							var limitVal;
							switch(this._selectedOption.dataType) {
							case "text":
							case "number":
								limitVal = domConstruct.create("input", {
										"type" : "text",
										"style" : "width:100px"
									});	
								valueContainer.appendChild(limitVal);
								this._filterValues.push(limitVal);
								break;
							case "date":
								limitVal = domConstruct.create("input", {
										"type" : "text"
									});	
								valueContainer.appendChild(limitVal);
								this._filterValues.push(
									new DateTextBox({}, limitVal)
									);
								this._filterValues[i%2].startup();
								break;
							}
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
					if (textInput.length > 3) {
						this._hideMessage(); 
						this._fetchPartialMatches(textInput).then(lang.hitch(this, function (valueArray) {
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
								} else {
									this._showMessage("no value found", "warning");
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
			},

			_hideMessage : function () {
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
							if (resultSet && resultSet.features && resultSet.features.length > 0) {
								this._showMessage(resultSet.features.length + " feature(s) found");
								this._drawResultsOnMap(resultSet);
							} else {
								this._showMessage("no feature found", "warning");
							}
						}), lang.hitch(this, function (err) {
							this._showMessage(err.message, "error");
						}));
				}
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
				default: 
					this._showMessage("not support such geometry", "error"); 
				};

				array.forEach(resultSet.features, lang.hitch(this, function (feature) {
						var graphic = new Graphic(
							feature.geometry,
							highlightSymbol,
							feature.attributes,
							this._infoTemplate);
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
