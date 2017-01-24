# ---------------------------------------------------------------------------
# Publish_ZMap_Grid.py
# Created on: 2017-01-23 14:14:49.00000
# Usage: Publish_ZMap_Grid <Input_File_Projection> <Input_File> <Summary> <Tags>
# Description:
#   Publish Geographix export ZMap Grid file to Portal as Map Tile Service
#   - Dependency: ExproDat Team-GIS Data Assistant to convert Geographix export to a tif image
# ---------------------------------------------------------------------------

import os
import tempfile
from shutil import copyfile

# Import arcpy module
import arcpy

# Load required toolboxes
arcpy.ImportToolbox("C:/Users/cliang/AppData/Roaming/ESRI/Desktop10.4/ArcToolbox/My Toolboxes/Team-GIS Data Assistant.tbx")

# Script arguments
Input_File = arcpy.GetParameterAsText(0)

Input_File_Projection = arcpy.GetParameterAsText(1)

Tile_Format = arcpy.GetParameterAsText(2)

Levels_Of_Details = arcpy.GetParameterAsText(3)

Service_Summary = arcpy.GetParameterAsText(4)

Service_Tags = arcpy.GetParameterAsText(5)

# Require a live connection to Portal
#Portal_Username = arcpy.GetParameterAsText(6)
#Portal_Password = arcpy.GetParameterAsText(7)

# Environmental variables
mxd_template = r'C:\Users\cliang\Documents\ArcGIS\zmap_grid\tool\template.mxd'
if os.path.exists(arcpy.env.ScratchWorkSpace):
    Scratch_WS = arcpy.env.ScratchWorkSpace
else:
    Scratch_WS = tempfile.gettempdir()

arcpy.env.overwriteOutput = True

# Local variables:
Data_Name = os.path.splitext(os.path.basename(Input_File))[0]
Data_Name = Data_Name.replace(' ', '_')
Output_Package = os.path.join(Scratch_WS, Data_Name + '.tpk')

# Process: ZMap Grid
arcpy.AddMessage("Importing ZMap data...")
arcpy.ImportInterpZMapGrid_DA(Input_File, Input_File_Projection, Scratch_WS, Data_Name)

# Process: Create a working mxd file
arcpy.AddMessage("Creating a working mxd...")
copyfile(mxd_template, os.path.join(Scratch_WS, Data_Name + '.mxd'))

# Process: Add Tiff Image to MXD
arcpy.AddMessage("Adding ZMap data to the working mxd...")
mxd_filePath = os.path.join(Scratch_WS, Data_Name + '.mxd')
mxd = arcpy.mapping.MapDocument(mxd_filePath)
df = arcpy.mapping.ListDataFrames(mxd, "Layers")[0]

imgLayer = arcpy.mapping.Layer(os.path.join(Scratch_WS, Data_Name + ".tif"))
arcpy.mapping.AddLayer(df, imgLayer, "BOTTOM")

mxd.save()
del mxd, imgLayer

# Process: Create Map Tile Package
arcpy.AddMessage("Creating a tile package...")
arcpy.CreateMapTilePackage_management(mxd_filePath, "ONLINE", Output_Package, Tile_Format, Levels_Of_Details)

# Process: Share Package
arcpy.AddMessage("Uploading the tile package to Portal...")
arcpy.SharePackage_management(Output_Package, "#", "#", Service_Summary, Service_Tags)
