# -*- #################
# ---------------------------------------------------------------------------
# Export_JSON_To_Shapefile.py
# Created on: 2016-10-19 15:40:33.00000
# Usage: Export_JSON_To_Shapefile <Point_Input_JSON> <Line_Input_JSON> <Polygon_Input_JSON>
# Description: 
# ---------------------------------------------------------------------------

# Import arcpy module
import arcpy
import json
import os, random
import zipfile


# Script arguments
Point_Input_JSON = arcpy.GetParameterAsText(0)
Line_Input_JSON = arcpy.GetParameterAsText(1)
Polygon_Input_JSON = arcpy.GetParameterAsText(2)

# local variables
scatch_ws = arcpy.env.scratchWorkspace

Features_By_Shape = {}

#
# main process
#
if Point_Input_JSON is None or len(Point_Input_JSON.strip()) == 0:
    arcpy.AddMessage("empty point data")
else:
    try:
        Features_By_Shape["Point"] = json.loads(Point_Input_JSON)
    except Exception as e:
        arcpy.AddError("ignore point data. %s" % e.message)
        pass

if Line_Input_JSON is None or len(Line_Input_JSON.strip()) == 0:
    arcpy.AddMessage("empty line data")
else:
    try:
        Features_By_Shape["Line"] = json.loads(Line_Input_JSON)
    except Exception as e:
        arcpy.AddError("ignore line data. %s" % e.message)
        pass

if Polygon_Input_JSON is None or len(Polygon_Input_JSON.strip()) == 0:
    arcpy.AddMessage("empty polygon data")
else:
    try:
        Features_By_Shape["Polygon"] = json.loads(Polygon_Input_JSON)
    except Exception as e:
        arcpy.AddError("ignore polygon data. %s" % e.message)
        pass

# create the staging folders
stg_json_folder = os.path.join(scatch_ws, "json")
os.mkdir(stg_json_folder)
stg_shp_folder = os.path.join(scatch_ws, "shape")
os.mkdir(stg_shp_folder)

# convert json to shapefile
for shape_type in Features_By_Shape.keys():
    if len(Features_By_Shape[shape_type]) > 0:
        # Process: JSON To Features
        with open(os.path.join(stg_json_folder, shape_type+".json"), "w") as json_file:
            json_file.write(json.dumps(Features_By_Shape[shape_type]))
        featureClass = "in_memory\\" + shape_type
        arcpy.JSONToFeatures_conversion(json_file.name, featureClass)
        # Process: Feature Class To Shapefile (multiple)
        arcpy.FeatureClassToShapefile_conversion(featureClass, stg_shp_folder)

Export_File_Path = os.path.join(scatch_ws, "export.zip")
with zipfile.ZipFile(Export_File_Path, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirname, subdirs, files in os.walk(stg_shp_folder):
        for filename in files:
            zf.write(os.path.join(dirname, filename), filename)

arcpy.SetParameter(3, Export_File_Path)

arcpy.AddMessage("export completed")
