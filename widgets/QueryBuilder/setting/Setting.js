
define([
    'dojo/_base/declare',
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidgetSetting'
  ],
  function(declare, _WidgetsInTemplateMixin, BaseWidgetSetting) {
    return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {
      baseClass: 'ev-widget-queryBuilder-setting'
    });
  });