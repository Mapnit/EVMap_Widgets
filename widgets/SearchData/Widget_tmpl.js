
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
    'jimu/dijit/LoadingIndicator',
		'jimu/dijit/Popup',
		'dijit/form/FilteringSelect', 
    'dijit/form/Select',
    'dijit/form/NumberSpinner',
		'dijit/form/DateTextBox'
  ],
  function(declare, _WidgetsInTemplateMixin, BaseWidget, on, Deferred, 
    domConstruct, html, lang, Color, array, domStyle, domClass, 
    esriConfig, Graphic, QueryTask, Query, Point, Polyline, Polygon, webMercatorUtils,
    GeometryService, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol,
		InfoTemplate, FeatureLayer, ViewStack, jimuUtils, wkidUtils, LayerInfos,
    LoadingIndicator, Popup) {

    var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
      name: 'SearchData',
      baseClass: 'jimu-widget-searchData',
      _gs: null,
      _defaultGsUrl: '//tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer',
      _searchParams: {}, 
			_selectedOption: null, 
	    _queryTask: null, 
      _graphicLayer: null,
			_symbols: {
				"esriGeometryPolygon": {
					"type": "esriSFS",
					"style": "esriSFSSolid",
					"color": [255, 0, 0, 64],
					"outline": {
							"type": "esriSLS",
							"style": "esriSLSSolid",
							"color": [0, 255, 255, 255],
							"width": 2
					}
				},				
				"esriGeometryPolyline": {
					"type": "esriSLS",
					"style": "esriSLSDashDot",
					"color": [255, 0, 0, 255],
					"width": 2
				},				
				"esriGeometryPoint": {
					"type": "esriSMS",
					"style": "esriSMSCircle",
					"color": [255, 0, 0, 64],
					"size": 12,
					"angle": 0,
					"xoffset": 0,
					"yoffset": 0,
					"outline": {
							"type": "esriSLS",
							"style": "esriSLSSolid",
							"color": [0, 0, 0, 255],
							"width": 1,
					}
				}
			},
			_currentViewIndex: 0, 

      postMixInProperties: function(){
        this.inherited(arguments);

        if(esriConfig.defaults.geometryService){
          this._gs = esriConfig.defaults.geometryService;
        }else{
          this._gs = new GeometryService(this._defaultGsUrl);
        }
      },

      postCreate: function() {
        this.inherited(arguments);
        this._initSearch();
				this._initSearchForm(); 
		
        this.viewStack = new ViewStack({
          viewType: 'dom',
          views: [this.optionSection, this.filterSection]
        });
        domConstruct.place(this.viewStack.domNode, this.ParameterSection, "only");
      },
	  
			_initSearch: function() {	
				this._queryTask = new QueryTask(this.config.layer); 
			
				this._graphicLayer = new GraphicsLayer();
				this.map.addLayer(this._graphicLayer);
				
				this._infoTemplate = new InfoTemplate("Properties", "${*}");
			},
			
			_initSearchForm: function() {
				
				this.searchTitle.innerText = this.config.title;
				this.optionListPrompt.innerText = this.config.prompt; 
								
				array.forEach(this.config.options, function(opt) {
					var optionDiv = domConstruct.create("div"); 
					var radioBtn = domConstruct.create("input", 
						{"type":"radio", "name":"searchOption", "value":opt.name}); 					
					optionDiv.appendChild(radioBtn);
					var radioLabel = domConstruct.create("label",
						{"innerText": opt.label}); 
					optionDiv.appendChild(radioLabel); 
					this.optionList.appendChild(optionDiv); 

					jimuUtils.combineRadioCheckBoxWithLabel(radioBtn, radioLabel);
					
					on(radioBtn, "change", this._onSearchOptionChecked);
					
				}); 
				
        jimuUtils.combineRadioCheckBoxWithLabel(this.limitToMapExtent, this.limitToMapExtentLabel);
			}, 

			onActive: function(){
				this.map.setInfoWindowOnClick(false);
			},

			onDeActive: function(){
				this.map.setInfoWindowOnClick(true);
			},

			onClose: function () {
				this._graphicLayer.clear(); 
				this.map.removeLayer(this._graphicLayer); 
			},

			destroy: function() {
			},

			startup: function() {
				this.inherited(arguments);
		
				this.viewStack.startup();
				this.viewStack.switchView(this._currentViewIndex);
			},
			
			_onBtnCancelClicked: function() {
				this._currentViewIndex = 0; 
				this.viewStack.switchView(this._currentViewIndex);
			}, 
			
			_onBtnGoToPrevClicked: function() {
				this._currentViewIndex = Math.max(--this._currentViewIndex, 0); 
				this.viewStack.switchView(this._currentViewIndex);
				
				this._hideMessage(); 
			}, 
			
			_onBtnGoToNextClicked: function() {
				this._currentViewIndex = Math.min(++this._currentViewIndex, this.viewStack.views.length-1); 
				this.viewStack.switchView(this.filterSection);
			}, 
			
			_onBtnEndClicked: function() {
				this._executeSearch(); 
			}, 
			
			_onSearchOptionChecked: function(evt) {
				this._searchParams["searchOption"] = evt.currentTarget.value; 
				
				this._selectedOption = null; 
				for(var i=0,len=this.config.options.length; i<len; i++) { 
					if (this.config.options[i].name === this._searchParams["searchOption"]) {
						this._selectedOption = this.config.options[i]; 
						break; 
					}
				}
			}, 
			
			_onLimitToMapExtentChecked: function(evt) {
				this._searchParams["limitToMapExtent"] = evt.currentTarget.checked; 
			},
			
			_onFilterValueChanged: function(evt) {
				if (this.filterValue.value) {
					var textInput = this.filterValue.value.trim(); 
					if (textInput.length > 3) {
						this._fetchPartialMatches(textInput); 
					}
				}
			},
			
			_showMessage: function(textMsg, lvl) {
				domClass.remove(this.searchMessage); 
				switch(lvl) {
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
			
			_hideMessage: function() {
				this.searchMessage.innerText = ""; 
			}, 
			
			_fetchPartialMatches: function(textInput) {
				this._hideMessage();
				
				if (this._selectedOption) {
					var query = new Query(); 
					query.where = this._selectedOption.field + " like '%" + this.filterValue.value.trim() + "%'"; 
					query.returnGeometry = false;
					query.orderByFields = [this._selectedOption.field];
					//WHY? it's conflicting with a spatial filter
					query.returnDistinctValues = true; 
					query.outFields = [this._selectedOption.field];
					
					if (this._searchParams["limitToMapExtent"] === true) {
						query.geometry = this.map.extent; 
						query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS; 
					}
					
					this._queryTask.execute(query, lang.hitch(this, function(resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							array.forEach(resultSet.features, lang.hitch(this, function(feature) {
								console.debug("partial match: " + feature.attributes[this._selectedOption.field]);
							}));
						} else {
							this._showMessage("no feature found", "warning"); 
						}
					}), lang.hitch(this, function(err) {
						this._showMessage(err.message, "error"); 
					}));
				}
			}, 
					
			_executeSearch: function() {
				if (this._selectedOption) {
					var query = new Query(); 
					query.where = this._selectedOption.field + " = '" + this.filterValue.value.trim() + "'"; 
					query.outSpatialReference = this.map.spatialReference; 
					query.returnGeometry = true; 
					query.outFields = ["*"];
					
					if (this._searchParams["limitToMapExtent"] === true) {
						query.geometry = this.map.extent; 
						query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS; 
					}
					
					this._queryTask.execute(query, lang.hitch(this, function(resultSet) {
						if (resultSet && resultSet.features && resultSet.features.length > 0) {
							this._showMessage(resultSet.features.length + " feature(s) found"); 
							this._drawResultsOnMap(resultSet);							
						} else {
							this._showMessage("no feature found", "warning"); 
						}
					}), lang.hitch(this, function(err) {
						this._showMessage(err.message, "error"); 
					}));
				}				
			}, 
			
			_drawResultsOnMap: function(resultSet) {
				this._graphicLayer.clear();
				var resultExtent = null, highlightSymbol; 
				
				switch(resultSet.geometryType) {
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
				
				array.forEach(resultSet.features, lang.hitch(this, function(feature) {
					this._graphicLayer.add(new Graphic(
						feature.geometry, 
						highlightSymbol, 
						feature.attributes,	
						this._infoTemplate
					));
					
					if (resultSet.geometryType === "esriGeometryPoint") {
						if (resultExtent) {
							resultExtent = resultExtent.union(new Extent(
								feature.geometry.x, feature.geometry.y, 
								feature.geometry.x, feature.geometry.y, 
								feature.geometry.spatialReference
							));
						} else {
							resultExtent = new Extent(
								feature.geometry.x, feature.geometry.y, 
								feature.geometry.x, feature.geometry.y, 
								feature.geometry.spatialReference
							);
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
					this.map.setExtent(resultExtent, true); 
				}				
			}
	  
    });
	
		return clazz; 
  });