
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
		'esri/toolbars/draw', 
		'esri/toolbars/edit', 
		'dijit/Menu', 
		'dijit/MenuItem', 
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
		esriConfig, Graphic, Draw, Edit, Menu, MenuItem, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, FeatureLayer, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox, DateTextBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchLAS',
			baseClass : 'jimu-widget-searchLAS',
			_gs : null,
			_defaultGsUrl : '//tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer',
			_searchParams : {}, 
			_queryTask : null,
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
			_currentViewIndex : 0,
			_filterValues : [],
			_drawTool : null, 
			_editTool : null, 
			_editCxtMenu : null, 
			_searchPolygon : null, 

			postMixInProperties : function () {
				this.inherited(arguments);

				if (esriConfig.defaults.geometryService) {
					this._gs = esriConfig.defaults.geometryService;
				} else {
					this._gs = new GeometryService(this._defaultGsUrl);
				}
			},

			postCreate : function () {
				this.inherited(arguments);
				this._initSearch();
				this._initSearchForm();

				this.viewStack = new ViewStack({
						viewType : 'dom',
						views : [this.drawSection, this.filterSection]
					});
				domConstruct.place(this.viewStack.domNode, this.parameterSection, "only");
			},

			_initSearch : function () {
				this._queryTask = new QueryTask(this.config.layer);

				this._infoTemplate = new InfoTemplate("Properties", "${*}");

				this._filterValues = []; 
			},

			_initSearchForm : function () {

				array.forEach(this.config.logAliases, lang.hitch(this, function (opt) {
						var optionDiv = domConstruct.create("div");
						var checkBtn = domConstruct.create("input", {
								"type" : "checkbox",
								"name" : "logAliases",
								"value" : opt.field
							});
						optionDiv.appendChild(checkBtn);
						var checkLabel = domConstruct.create("label", {
								"innerHTML" : opt.label
							});
						optionDiv.appendChild(checkLabel);
						this.logAliasFieldList.appendChild(optionDiv);

						jimuUtils.combineRadioCheckBoxWithLabel(checkBtn, checkLabel);

						on(checkBtn, "change", lang.hitch(this, this._onLogAliasFieldChecked));
					}));
				
				jimuUtils.combineRadioCheckBoxWithLabel(this.includePreviousLogs, this.includePreviousLogsLabel);
				jimuUtils.combineRadioCheckBoxWithLabel(this.searchLogAliasField, this.searchLogAliasFieldLabel);
				
				jimuUtils.combineRadioCheckBoxWithLabel(this.queryTypeOr, this.queryTypeOrLabel);
				jimuUtils.combineRadioCheckBoxWithLabel(this.queryTypeAnd, this.queryTypeAndLabel);
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
				
				this._createGraphicsMenu(this._graphicLayer); 

				this._currentViewIndex = 0;
				this.viewStack.switchView(this._currentViewIndex);
			},

			onClose : function () {
				this._graphicLayer.clear();
				//TODO: remove the event handlers on graphicLayer
				this.map.removeLayer(this._graphicLayer);
				this._graphicLayer = null; 
				
				if (this._drawTool) {
					this._drawTool.deactivate(); 
				}
				this.map.enableMapNavigation();				
			},

			destroy : function () {},

			startup : function () {
				this.inherited(arguments);

				this.viewStack.startup();
				this.viewStack.switchView(this._currentViewIndex);
			},

			_onBtnGoToPrevClicked : function () {
				this._hideMessage();

				this._currentViewIndex = Math.max(--this._currentViewIndex, 0);
				this.viewStack.switchView(this._currentViewIndex);
			},

			_onBtnGoToNextClicked : function () {
				this._hideMessage();
				
				this._currentViewIndex = Math.min(++this._currentViewIndex, this.viewStack.views.length - 1);
				this.viewStack.switchView(this.filterSection);
			},

			_onBtnEndClicked : function () {
				var whereClause;
			},

			_onLogAliasFieldChecked : function (evt) {
				var logAlias = evt.currentTarget; 
				if (logAlias.checked === true) {
					if (!this._searchParams["logAliasFields"]) {
						this._searchParams["logAliasFields"] = []; 
					}
					this._searchParams["logAliasFields"].push(logAlias.value); 
				} else {
					this._searchParams["logAliasFields"] = array.filter(
						this._searchParams["logAliasFields"], function(unwanted) {
							return unwanted === logAlias.value; 
					}); 
				}
			},

			_onSelectByPolygonClicked : function (evt) {
				// clear the old one
				this._graphicLayer.clear(); 
				this._searchParams["searchPolygon"] = null; 
				// draw a new one
				if (!this._drawTool) {
					this._drawTool = new Draw(this.map); 
					this._drawTool.on("draw-end", lang.hitch(this, this._setSearchPolygon));
				}
				
				this.map.disableMapNavigation();
				this._drawTool.activate("polygon");
			},
			
			_setSearchPolygon : function(evt) {
				this._drawTool.deactivate(); 
				this.map.enableMapNavigation();

				var highlightSymbol = new SimpleFillSymbol(this._symbols["esriGeometryPolygon"]);				
				this._searchPolygon = new Graphic(evt.geometry, highlightSymbol); 
				this._graphicLayer.add(this._searchPolygon);				
				
				// create context menu for graphic editing
				if (!this._editTool) {
					this._editTool = new Edit(this.map);
					
					this.map.on("click", lang.hitch(this, function(evt) {
						this._editTool.deactivate();
					}));
				}
			},

			_createGraphicsMenu : function(graphicsLayer) {
			  // Creates right-click context menu for GRAPHICS
			  this._editCxtMenu = new Menu({});
			  this._editCxtMenu.addChild(new MenuItem({ 
				label: "Edit",
				onClick: lang.hitch(this, function() {
				  this._editTool.activate(Edit.EDIT_VERTICES, this._searchPolygon);
				}) 
			  }));

			  this._editCxtMenu.addChild(new MenuItem({ 
				label: "Move",
				onClick: lang.hitch(this, function() {
				  this._editTool.activate(Edit.MOVE, this._searchPolygon);
				}) 
			  }));

			  this._editCxtMenu.addChild(new MenuItem({ 
				label: "Rotate/Scale",
				onClick: lang.hitch(this, function() {
					this._editTool.activate(Edit.ROTATE | Edit.SCALE, this._searchPolygon);
				})
			  }));

			  this._editCxtMenu.startup();

			  graphicsLayer.on("mouse-over", lang.hitch(this, function(evt) {
				// Let's bind to the graphic underneath the mouse cursor           
				this._editCxtMenu.bindDomNode(evt.graphic.getDojoShape().getNode());
			  }));

			  graphicsLayer.on("mouse-out", lang.hitch(this, function(evt) {
				this._editCxtMenu.unBindDomNode(evt.graphic.getDojoShape().getNode());
			  }));
			  
			},

			_onSearchLogAliasFieldsChanged : function (evt) {
				this._searchParams["searchLogAliasField"] = evt.currentTarget.checked; 
			},

			_onIncludePreviousLogsChanged : function (evt) {
				this._searchParams["includePreviousLogs"] = evt.currentTarget.checked; 
			},
			
			_onQueryTypeChanged : function (evt) {
				this._searchParams["queryTypeOpr"] = evt.currentTarget.value; 
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

			_filterByPolygon : function () {
				var deferred = new Deferred();
				
				if (this._searchPolygon === true) {
					var query = new Query();
					query.where = whereClause;
					query.outSpatialReference = this.map.spatialReference;
					query.returnGeometry = true;
					query.outFields = ["*"];
					query.geometry = this._searchPolygon;
					query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;

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
					this._showMessage("Draw a search polygon first", "error"); 
				}
			},

			_executeSearch : function (whereClause) {
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