
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
			baseClass : 'ev-widget-searchLAS',
			_searchParams : {}, 
			_queryTask : null,
			_graphicLayer : null,
			_symbols : {
				"esriGeometryPolygon" : {
					"type" : "esriSFS",
					"style" : "esriSFSSolid",
					"color" : [0, 255, 255, 0],
					"outline" : {
						"type" : "esriSLS",
						"style" : "esriSLSSolid",
						"color" : [255, 0, 0, 255],
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
			_drawTool : null, 
			_editTool : null, 
			_editCxtMenu : null, 
			_searchPolygon : null, 

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

				this._searchParams = {
					"searchLogAliasFields": false, 
					"logAliasFields": [], 
					"includePurchasedLogs": false, 
					"queryTypeOpr": "OR"
				}; 
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
				
				jimuUtils.combineRadioCheckBoxWithLabel(this.includePurchasedLogs, this.includePurchasedLogsLabel);
				jimuUtils.combineRadioCheckBoxWithLabel(this.searchLogAliasFields, this.searchLogAliasFieldsLabel);
				
				jimuUtils.combineRadioCheckBoxWithLabel(this.queryTypeOr, this.queryTypeOrLabel);
				jimuUtils.combineRadioCheckBoxWithLabel(this.queryTypeAnd, this.queryTypeAndLabel);
				
				if (this.config.purchasedLogs) {
					domStyle.set(this.includePurchasedLogsSection, "display", "block"); 
				} else {
					domStyle.set(this.includePurchasedLogsSection, "display", "none"); 
				}
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
				if (this._searchPolygon) {
					this._hideMessage();
					
					this._currentViewIndex = Math.min(++this._currentViewIndex, this.viewStack.views.length - 1);
					this.viewStack.switchView(this.filterSection);
				} else {
					this._showMessage("no search polygon captured", "error"); 
				}
			},

			_onBtnEndClicked : function () {
				var criteria = [], aliasCriteria = []; 
				if (this._searchParams["searchLogAliasFields"] === true) {
					if (this._searchParams["logAliasFields"] && this._searchParams["logAliasFields"].length > 0) {
						aliasCriteria = array.map(this._searchParams["logAliasFields"], lang.hitch(this, function(alias) {
							return alias + "=1";
						})); 
						criteria.push("(" + aliasCriteria.join(" " + this._searchParams["queryTypeOpr"] + " ") + ")"); 
					}					
				}
				if (this.curveName.value) {
					criteria.push(this.config.curveName.field + " like '%" + this.curveName.value + "%'"); 
				}
				if (this.wellTDMinValue.value) {
					if (this._isNumeric(this.wellTDMinValue.value)) {
						criteria.push(this.config.wellTDValue.field + " > " + this.wellTDMinValue.value); 
					}
				}
				if (this.wellTDMaxValue.value) {
					if (this._isNumeric(this.wellTDMaxValue.value)) {
						criteria.push(this.config.wellTDValue.field + " < " + this.wellTDMaxValue.value); 
					}
				}
				if (this.config.purchasedLogs) {
					if (this._searchParams["includePurchasedLogs"] === true) {
						criteria.push("UPPER(" + this.config.purchasedLogs.field + ")=UPPER('Purchased')");
					} else if (this._searchParams["includePurchasedLogs"] === false) {
						criteria.push("UPPER(" + this.config.purchasedLogs.field + ")=UPPER('Not Purchased')");
					}					
				}
				
				if (criteria.length > 0) {
					var whereClause = criteria.join (" and "); 
					this._executeSearch(whereClause); 
				} else {
					this._showMessage("empty search parameter", "error"); 
				}
			},
			
			_isNumeric : function(n) {
			  return !isNaN(parseFloat(n)) && isFinite(n);
			}, 

			_onLogAliasFieldChecked : function (evt) {
				var logAlias = evt.currentTarget; 
				if (logAlias.checked === true) {
					this._searchParams["logAliasFields"].push(logAlias.value); 
				} else {
					this._searchParams["logAliasFields"] = array.filter(
						this._searchParams["logAliasFields"], lang.hitch(this, function(unwanted) {
							return unwanted !== logAlias.value; 
					})); 
				}
			},

			_onSelectByPolygonClicked : function (evt) {
				this._searchPolygon = null; 
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
				
				this._showMessage("draw a search polygon on map"); 
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
				
				this._showMessage("search polygon is captured. Right click to make changes"); 
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
				this._searchParams["searchLogAliasFields"] = evt.currentTarget.checked;
				if (evt.currentTarget.checked) {
					domStyle.set(this.logAliasFieldList, "display", "block"); 
				} else {
					domStyle.set(this.logAliasFieldList, "display", "none"); 
				}
			},

			_onIncludePurchasedLogsChanged : function (evt) {
				this._searchParams["includePurchasedLogs"] = evt.currentTarget.checked; 
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
				query.geometry = this._searchPolygon.geometry;
				query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;

				this._queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							if (resultSet.exceededTransferLimit === true) {
								this._showMessage("exceed search limit. only first " 
									+ resultSet.features.length + " feature(s) displayed", "warning"); 
							} else {
								this._showMessage(resultSet.features.length + " feature(s) found");
							}
							this._drawResultsOnMap(resultSet, false);
						} else {
							this._showMessage("no feature found", "warning");
						}
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},

			_drawResultsOnMap : function (resultSet, clearFirst/*default: true*/) {
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
					this._showMessage("not support such a geometry", "error"); 
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
