# For HTTP calls
import httplib, urllib, json,urllib2,arcpy,os,traceback

# For system tools
import sys

import datetime,time

def Main(rootFolder):
    for root,folder,files in os.walk(rootFolder):
        if root.find("Z_Old") <0:
            for file in files:
                fname,fext = os.path.splitext(file)
                if fext.lower() != ".mxd":
                    continue
                
                mxdPath = os.path.join(root,file)
                serverFolder = os.path.basename(root)
                mxd = arcpy.mapping.MapDocument(mxdPath)
                layers = arcpy.mapping.ListLayers(mxd)
                isSDE = True
                arcpy.AddMessage(" Updating Data Soruce for " + mxdPath)
                for layer in layers:
                    try:
                        if layer.dataSource.find(".sde") >= 0:
                            try:
                                arcpy.AddMessage ("Updating Data source for " + layer.name)
                                layer.replaceDataSource(sde_Connection,"SDE_WORKSPACE")
                            except:
                                arcpy.AddError("Failed Updating The Data Source")
                                continue
                    except:
                        continue
                mxd.save()
    
    arcpy.AddMessage("Process Completed Successfully")
if __name__ == "__main__":
    rootFolder = arcpy.GetParameterAsText(0)
    sde_Connection = arcpy.GetParameterAsText(1)
    ##sde_Connection = r"\\enervest.net\shared\ArcGIS\GIS\Geoscience Technology\Admin\Connections\EnerVest GIS Test.sde"
    ##rootFolder = r"\\enervest.net\shared\ArcGIS\GIS\Geoscience Technology\Map Services\Test\MidCon"
    Main(rootFolder)
