///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define(['dojo/_base/declare',
  'dojo/_base/html',
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/_base/event',
  'dojo/on',
  'dojo/Evented',
  'dojo/dom-style', 
  'dojo/dom-geometry',
  'jimu/FeatureActionManager',
  'jimu/utils',
  'jimu/dijit/PopupMenu',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dijit/_WidgetsInTemplateMixin',
  'dojo/text!./SelectableLayerItem.html',
  './ClearSelectionAction'
], function(declare, html, lang, array, Event, on, Evented, domStyle, domGeom,
FeatureActionManager, jimuUtils, PopupMenu, _WidgetBase, _TemplatedMixin,
_WidgetsInTemplateMixin, template, ClearSelectionAction) {
  return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Evented], {
    baseClass: 'selectable-layer-item',
    templateString: template,

    layerName: 'layer',
    layerVisible: true,
    checked: false,
    allowExport: false,
    inited: false,

    postCreate: function() {
      this.inherited(arguments);

      this.popupMenu = PopupMenu.getInstance();

      this.layerInfo.getLayerObject().then(lang.hitch(this, function(layerObject) {
        if(layerObject) {
          this._init(layerObject);
        }
      }));
    },

    _init: function(layerObject) {
      this.featureLayer = layerObject;

      if(!this.featureLayer) {
        return;
      }

      var selectedCount = this.featureLayer.getSelectedFeatures().length;
      this.layerName = this.layerInfo.title || 'layer';

      this.selectedCountNode.innerHTML = selectedCount;

      if(selectedCount > 0) {
        html.removeClass(this.domNode, 'no-action');
      } else {
        html.addClass(this.domNode, 'no-action');
      }

      this.own(on(this.featureLayer, 'selection-complete', lang.hitch(this, function(){
        var selectedCount = this.featureLayer.getSelectedFeatures().length;
        this.selectedCountNode.innerHTML = selectedCount;
        if(selectedCount === 0) {
          html.addClass(this.domNode, 'no-action');
        } else {
          html.removeClass(this.domNode, 'no-action');
        }
      })));

      this.own(on(this.featureLayer, 'selection-clear', lang.hitch(this, function(){
        this.selectedCountNode.innerHTML = 0;
        html.addClass(this.domNode, 'no-action');
      })));

      this.layerNameNode.innerHTML = this.layerName;
      this.layerNameNode.title = this.layerName;

      if(!this.layerVisible) {
        domStyle.set(this.domNode, 'display', 'none'); 
        html.addClass(this.domNode, 'invisible');
      }

      if(this.checked) {
        html.addClass(this.selectableCheckBox, 'checked');
      } else {
        html.removeClass(this.selectableCheckBox, 'checked');
      }

      this.own(on(this.selectableCheckBox, 'click', lang.hitch(this, this._toggleChecked)));
      this.own(on(this.layerContent, 'click', lang.hitch(this, this._toggleContent)));
      this.own(on(this.actionBtn, 'click', lang.hitch(this, this._showActions)));

      this.inited = true;
      this.emit('inited');
    },

    isLayerVisible: function() {
      return this.layerVisible;
    },

    isChecked: function() {
      return this.checked;
    },

    updateLayerVisibility: function() {
      var visible = this.layerInfo.isShowInMap() && this.layerInfo.isInScale();

      if (visible !== this.layerVisible) {
        this.layerVisible = visible;

        if(this.layerVisible) {
          domStyle.set(this.domNode, 'display', 'block');
          html.removeClass(this.domNode, 'invisible');
        } else {
          domStyle.set(this.domNode, 'display', 'none');
          html.addClass(this.domNode, 'invisible');
        }
        this.emit('stateChange', {
          visible: this.layerVisible,
          layerInfo: this.layerInfo
        });
      }
    },

    _toggleChecked: function(event) {
      Event.stop(event);

      html.toggleClass(this.selectableCheckBox, 'checked');
      this.checked = html.hasClass(this.selectableCheckBox, 'checked');

      this.emit('stateChange', {
        checked: this.checked,
        layerInfo: this.layerInfo
      });
    },

    _toggleContent: function(event) {
      Event.stop(event);

      if(!html.hasClass(this.domNode, 'no-action')){
        this.emit('switchToDetails', this);
      }
    },

    _createActions: function() {
      var fm = FeatureActionManager.getInstance();
      var graphics = this.featureLayer.getSelectedFeatures();
      var selectedFeatureSet = jimuUtils.toFeatureSet(graphics);
      return fm.getSupportedActions(selectedFeatureSet).then(lang.hitch(this, function(actions) {
        array.forEach(actions, function(action){
          action.data = selectedFeatureSet;
        }, this);
        if(graphics.length > 0) {
          actions.push(new ClearSelectionAction({
            folderUrl: this.folderUrl,
            data: this.featureLayer
          }));
        }
        if(!this.allowExport) {
          actions = array.filter(actions, function(action) {
            return action.name.indexOf('Export') !== 0;
          });
        }
        this.popupMenu.setActions(actions);
      }));
    },

    _showActions: function(event) {
      Event.stop(event);

      if(html.hasClass(this.domNode, 'no-action')) {
        return;
      }

      this._createActions().then(lang.hitch(this, function() {
        var position = domGeom.position(event.target);
        this.popupMenu.show(position, this.nls.actionsTitle);
      }));
    }
  });
});