
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
		'dijit/form/ComboBox'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred,
		domConstruct, html, lang, Color, array, domStyle, domClass,
		esriConfig, Graphic, QueryTask, Query, Extent, Point, Polyline, Polygon, webMercatorUtils,
		GeometryService, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, FeatureLayer, ViewStack, jimuUtils, wkidUtils, LayerInfos,
		Memory, LoadingIndicator, Popup, ComboBox) {

	var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
			name : 'SearchSurvey',
			baseClass : 'jimu-widget-searchSurvey',
			_gs : null,
			_defaultGsUrl : '//tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer', 
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
			_countyValues : null,
			_abstractValues : null,
			_sectionValues : null, 
			_searchTarget : null, 

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
			},

			_initSearch : function () {

				this._infoTemplate = new InfoTemplate("Properties", "${*}");
			},

			_initSearchForm : function () {
				
				this._countyValues = new ComboBox({
						hasDownArrow: false,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						onChange: lang.hitch(this, this._onCountyNameChanged)
					}, this.countyInput);
				this._countyValues.startup();

				this._abstractValues = new ComboBox({
						hasDownArrow: false,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						disabled: true
					}, this.abstractInput);
				this._abstractValues.startup(); 
				
				this._sectionValues = new ComboBox({
						hasDownArrow: false,
						style: "width: 175px; height:25px",
						store: new Memory({data: []}),
						searchAttr: "name",
						disabled: true
					}, this.sectionInput);
				this._sectionValues.startup(); 				
			},

			onActive : function () {
				this.map.setInfoWindowOnClick(false);
			},

			onDeActive : function () {
				this.map.setInfoWindowOnClick(true);
			},
			
			onOpen : function () {
				this._graphicLayer = new GraphicsLayer();
				this.map.addLayer(this._graphicLayer);	
			},

			onClose : function () {
				this._countyValues.set('value', '');
				this._abstractValues.set('value', '');
				this._sectionValues.set('value', '');
				
				this._hideMessage(); 
				
				this._graphicLayer.clear();
				this.map.removeLayer(this._graphicLayer);
			},

			destroy : function () {},

			startup : function () {
				this.inherited(arguments);

				this._fetchCountyNames(); 
			},
			
			_onSearchOptionChanged: function(evt) {
				var rdoInput = evt.currentTarget; 
				this._searchTarget = rdoInput.value; 
				if (rdoInput.value === "abstract") {
					this._abstractValues.set('disabled', !rdoInput.checked);
					this._sectionValues.set('disabled', rdoInput.checked);
				} else if (rdoInput.value === "section") {
					this._abstractValues.set('disabled', rdoInput.checked);
					this._sectionValues.set('disabled', !rdoInput.checked);
				}
				if (this._abstractValues.get('disabled')) {
					this._abstractValues.set('value', '');
				}
				if (this._sectionValues.get('disabled')) {
					this._sectionValues.set('value', '');
				}
			},
			
			_onCountyNameChanged: function() {
				
				this._fetchSectionNamesByCounty();
				this._fetchAbstractNumbersByCounty();
			},
			
			_fetchCountyNames : function() {
				this._countyValues.store = new Memory({data: []});

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
							this._countyValues.store = valueStore;
						} else {
							this._showMessage("no county found", "warning");
						}
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},

			_fetchSectionNamesByCounty : function() {
				this._sectionValues.store = new Memory({data: []});
				this._sectionValues.set('value', '');
				
				this._hideMessage(); 
				
				var countyName = this._countyValues.get('value');
				
				var query = new Query();
				query.where = this.config.section.relatedFields["county"] + " like '" + countyName + "%'";
				query.returnGeometry = false;
				query.outFields = [this.config.section.field];
				query.orderByFields = [this.config.section.field];
				query.returnDistinctValues = true; 

				var queryTask = new QueryTask(this.config.section.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.section.field]
									});
								}));
							this._sectionValues.store = valueStore;
						} else {
							this._showMessage("no section found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},
			
			_fetchAbstractNumbersByCounty : function() {
				this._abstractValues.store = new Memory({data: []});
				this._abstractValues.set('value', '');
				
				this._hideMessage(); 
				
				var countyName = this._countyValues.get('value');
				
				var query = new Query();
				query.where = this.config.abstract.relatedFields["county"] + " like '" + countyName + "%'";
				query.returnGeometry = false;
				query.outFields = [this.config.abstract.field];
				query.orderByFields = [this.config.abstract.field];
				query.returnDistinctValues = true; 

				var queryTask = new QueryTask(this.config.abstract.layer); 
				queryTask.execute(query, lang.hitch(this, function (resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							var valueStore = new Memory({data: []});
							
							array.forEach(resultSet.features, lang.hitch(this, function(feature, i) {
								valueStore.put({
										"id" : i,
										"name" : feature.attributes[this.config.abstract.field]
									});
								}));
							this._abstractValues.store = valueStore;
						} else {
							this._showMessage("no abstract found", "warning");
						} 
					}), lang.hitch(this, function (err) {
						this._showMessage(err.message, "error");
					}));
			},			
			
			_onBtnEndClicked : function () {
				var whereClause = null; 
				switch(this._searchTarget) {
				case "abstract":
					whereClause = 
						this.config.abstract.relatedFields["county"] + " like '" + this._countyValues.get('value') + "%'" 
						+ " and " + this.config.abstract.field + " = '" + this._abstractValues.get('value') + "'" ;
					break;
				case "section":
					whereClause = 
						this.config.section.relatedFields["county"] + " like '" + this._countyValues.get('value') + "%'" 
						+ " and " + this.config.section.field + " = '" + this._sectionValues.get('value') + "'" ;
					break;
				default: 
					this._showMessage("invalid search", "error"); 
					
				}
				if (whereClause) {
					this._executeSearch(whereClause);
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

			_executeSearch : function (whereClause) {
				this._hideMessage(); 
				
				var query = new Query();
				query.where = whereClause;
				query.outSpatialReference = this.map.spatialReference;
				query.returnGeometry = true;
				query.outFields = ["*"];

				var queryTask = new QueryTask(this.config.layer);
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
