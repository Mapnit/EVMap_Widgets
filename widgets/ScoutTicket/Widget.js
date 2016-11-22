define(['dojo/_base/declare', 'jimu/BaseWidget'],
function(declare, BaseWidget) {
  //To create a widget, you need to derive from BaseWidget.
  return declare([BaseWidget], {
    // DemoWidget code goes here

    //please note that this property is be set by the framework when widget is loaded.
    //templateString: template,

    baseClass: 'jimu-widget-scoutticket',

    postCreate: function() {
      this.inherited(arguments);
      console.log('postCreate');
    },

    startup: function() {
      this.inherited(arguments);
      console.log('startup');
    },

    onOpen: function(){
      console.log('onOpen');
    },

    onClose: function(){
      console.log('onClose');
    },

    onMinimize: function(){
      console.log('onMinimize');
    },

    onMaximize: function(){
      console.log('onMaximize');
    },

    onSignIn: function(credential){
      /* jshint unused:false*/
      console.log('onSignIn');
    },

    onSignOut: function(){
      console.log('onSignOut');
    },

    showScoutTicket: function(uwi){
      this.uwi.innerHTML = 'Scout Ticket for well: ' + uwi;

      // the rest endpoint for the scout ticket report
      var url = "https://energydataservices.ihsenergy.com/rest/v2/Reports/Well/" + uwi;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';

      // the call returns a pdf.
      xhr.onload = function () {
          if (this.status === 200) {
              var index = url.lastIndexOf('/');
              var fileName = url.substring(index + 1) + ".pdf"
              console.log(fileName);

              var a = document.createElement('a');
              document.body.appendChild(a);
              a.style = 'display: none';
              var file = new Blob([xhr.response], {type: 'application/pdf'});
              var fileURL = (window.URL || window.webkitURL).createObjectURL(file);
              a.href = fileURL;
              a.download = fileName;
              a.click();
              (window.URL || window.webkitURL).revokeObjectURL(file);        }
      };

      // these two custom header keys are required
      xhr.setRequestHeader("Eds_Application_Id", "demotool")
      xhr.setRequestHeader("Authorization", "Basic " + btoa(this.config.userName + ":" + this.config.password));

      // execute the request
      xhr.send();
    }
  });
});