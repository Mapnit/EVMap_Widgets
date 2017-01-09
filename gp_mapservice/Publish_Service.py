# For HTTP calls
import httplib, urllib, json,urllib2,arcpy,os,traceback

# For system tools
import sys
import xml.dom.minidom as DOM 
import datetime,time

def Main(rootFolder,scratch,agscon):
    for root,folder,files in os.walk(rootFolder):
        if root.find("Z_Old") <0:
            for file in files:
                fname,fext = os.path.splitext(file)
                if fext.lower() != ".mxd":
                    continue
                try:
                    mxdPath = os.path.join(root,file)
                    serverFolder = os.path.basename(root)
                    mxd = arcpy.mapping.MapDocument(mxdPath)
                    arcpy.AddMessage ("Currently Publishing " + mxdPath)
                    sddraft = os.path.join(scratch,mxd.title + '.sddraft')
                    sd = os.path.join(scratch,mxd.title + '.sd')
                    serverURL = "/arcgis/admin/services/"
                    servicename = str(file).replace(".mxd","")
                                   
                    try:
                        analysis = arcpy.mapping.CreateMapSDDraft(mxd, sddraft, servicename, 'ARCGIS_SERVER',agscon,False,serverFolder,mxd.summary,mxd.tags)
                    except:
                        tb = sys.exc_info()[2]
                        tbinfo = traceback.format_tb(tb)[0]
                        pymsg = "PYTHON ERRORS:\nTraceback Info:\n" + tbinfo + "\nError Info:\n    " + str(sys.exc_type)+ ": " + str(sys.exc_value) + "\n"
                        arcpy.AddError(pymsg + "\n" + "Service Name = " + mxd.title)
                        continue                    
                    
                    if analysis['errors'] == {}:
                        # rename sddraft
                        sddraft_xml = sddraft + ".xml"
                        if os.path.exists(sddraft_xml):
                            os.remove(sddraft_xml)
                        os.rename(sddraft, sddraft_xml)
                        # modify sddraft 
                        xmldoc = DOM.parse(sddraft_xml)
                        typeNames = xmldoc.getElementsByTagName('TypeName')
                        for typeName in typeNames:
                            if typeName.firstChild.data == 'KmlServer':
                                # disable KmlServer
                                extension = typeName.parentNode
                                for extElement in extension.childNodes:
                                    if extElement.tagName == 'Enabled':
                                        extElement.firstChild.data = 'false'
                                        break
                            elif typeName.firstChild.data == 'WMSServer':
                                # enable WMSServer
                                extension = typeName.parentNode
                                for extElement in extension.childNodes:
                                    if extElement.tagName == 'Enabled':
                                        extElement.firstChild.data = 'true'
                                        break
                        keyNames = xmldoc.getElementsByTagName('Key')
                        for keyName in keyNames:
                            if keyName.firstChild.data == 'enableDynamicLayers':
                                # enable DynamicLayers
                                serviceProperty = keyName.parentNode
                                for propElement in serviceProperty.childNodes:
                                    if propElement.tagName == 'Value':
                                        propElement.firstChild.data = 'true'
                                        break
                            if keyName.firstChild.data == 'schemaLockingEnabled':
                                # disable SchemaLocking
                                serviceProperty = keyName.parentNode
                                for propElement in serviceProperty.childNodes:
                                    if propElement.tagName == 'Value':
                                        propElement.firstChild.data = 'false'
                                        break

                        # modify description in sddraft
                        descriptions = xmldoc.getElementsByTagName('Description')
                        for desc in descriptions:
                            if desc.parentNode.tagName == 'ItemInfo':
                                # modify the Description
                                if desc.hasChildNodes():
                                    desc.firstChild.data = mxd.description
                                else:
                                    txtNode = doc.createTextNode(mxd.description)
                                    desc.appendChild(txtNode)

                        # save the modified sddraft
                        with open(sddraft, 'w') as f:
                            xmldoc.writexml(f)
                            
                        # convert sddraft to sd 
                        try:
                            if (os.path.exists(sd)):
                                os.remove(sd)
                            arcpy.StageService_server(sddraft, sd)
                            arcpy.AddMessage ("Created SD File ")
                        except:
                            tb = sys.exc_info()[2]
                            tbinfo = traceback.format_tb(tb)[0]
                            pymsg = "PYTHON ERRORS:\nTraceback Info:\n" + tbinfo + "\nError Info:\n    " + str(sys.exc_type)+ ": " + str(sys.exc_value) + "\n"
                            arcpy.AddError(pymsg + "\n" + "Service Name = " + mxd.title)
                            continue
                        
                        token = getToken(username, password, serverName, serverPort)
                        isFolder = CreateServerFolder(token,serverURL,serverFolder,serverName, serverPort)
                        DeleteExistingServices(serverName, serverPort,serverURL + serverFolder,servicename,token)
                        
                        # Execute UploadServiceDefinition
                        try:
                            arcpy.AddMessage ("Uploading SD File")
                            arcpy.UploadServiceDefinition_server(sd, agscon)
                            arcpy.AddMessage ("Uploaded SD File! " + "\n")
                        except:
                            tb = sys.exc_info()[2]
                            tbinfo = traceback.format_tb(tb)[0]
                            pymsg = "PYTHON ERRORS:\nTraceback Info:\n" + tbinfo + "\nError Info:\n    " + str(sys.exc_type)+ ": " + str(sys.exc_value) + "\n"
                            arcpy.AddError(pymsg + "\n" + "Service Name = " + mxd.title)
                        '''
                        serviceProperties = GetServiceProperties(token,serverURL,serverFolder,servicename,serverName,serverPort)
                        if serviceProperties:
                            id = [id for id in range(len(serviceProperties["extensions"])) if serviceProperties["extensions"][id]["typeName"] == "WMSServer"]
                            if len(id) == 1:
                                serviceProperties["extensions"][id[0]]["enabled"] = 'true'
                                serviceProperties["properties"]["schemaLockingEnabled"] = 'false'
                                serviceProperties["properties"]["enableDynamicLayers"] = 'true'
                                service = json.dumps(serviceProperties)
                                UpdateServiceProperties(token,serverURL,serverFolder,servicename,serverName,serverPort,service)
                                arcpy.AddMessage ("Enabled WMS, Schema Lock Disabled, Enabled Dynamic Layers " + "\n")
                        else:
                            arcpy.AddError("Service Published with Default Settings. Could not unlock Schema, Enable WMS and Enable Dynamic Layers")
                        '''
                        arcpy.AddMessage ("Service Published with WMS and Dynamic Layers Enabled and Schema Lock Disabled " + "\n")
                    else:
                        for key in ('messages', 'warnings', 'errors'):
                            print "----" + key.upper() + "---"
                            vars = analysis[key]
                            for ((message, code), layerlist) in vars.iteritems():
                                print "    ", message, " (CODE %i)" % code
                                print "       applies to:",
                                for layer in layerlist:
                                    print layer.name,
                                    print
                except:
                    tb = sys.exc_info()[2]
                    tbinfo = traceback.format_tb(tb)[0]
                    pymsg = "PYTHON ERRORS:\nTraceback Info:\n" + tbinfo + "\nError Info:\n    " + str(sys.exc_type)+ ": " + str(sys.exc_value) + "\n"
                    arcpy.AddError(pymsg + "\n" + "Service Name = " + str(file))
                    continue
                    
                    
def UpdateServiceProperties(token,serverURL,serverFolder,servicename,serverName,serverPort,serviceprop):
    try:
        serviceURL = serverURL+serverFolder+"/"+servicename+"."+"MapServer"
        httpConn = httplib.HTTPSConnection(serverName, serverPort)

        editServiceURL = serviceURL + "/edit"
        
        params = urllib.urlencode({'token': token, 'service': serviceprop, 'f': 'json'})

        headers = {"Content-type": "application/x-www-form-urlencoded", "Accept": "text/plain"}

            # Connect to URL and post parameters
        httpConn.request("POST", editServiceURL, params, headers)

        # Read response
        response = httpConn.getresponse()
        if (response.status != 200):
            httpConn.close()
            print "Error while creating the service."
            return
        else:
            data = response.read()
            httpConn.close()

            # Check that data returned is not an error object
            if not assertJsonSuccess(data):
                print "Error returned by operation. " + data
            else:
                print "Update Service successfully!"

            return

    except Exception as e:
        print" - Error creating a service"
        print e
    
def GetServiceProperties(token,serverURL,serverFolder,servicename,serverName,serverPort):
    try:
        # Construct URL to retrieve a service
        serviceURL = serverURL+serverFolder+"/"+servicename+"."+"MapServer?f=json"
        httpConn = httplib.HTTPSConnection(serverName, serverPort)

        serviceheaders = {"Content-type": "application/x-www-form-urlencoded", "Accept": "text/plain"}

        serviceparams = urllib.urlencode({'token': token, 'f': 'json'})


        # Connect to URL and post parameters
        httpConn.request("POST", serviceURL, serviceparams, serviceheaders)
        serviceresponse = httpConn.getresponse()

        if(serviceresponse.status != 200):
            httpConn.close()
            print "Error while creating the folder.Folder might already exist."
            #return
        else:
            data= serviceresponse.read()
            httpConn.close()

        # Check that data returned is not an error object
        if not assertJsonSuccess(data):
            print "Error returned by operation. " + data
        else:
            return json.loads(data)

    except Exception as e:
        print " - Error Creating a folder...."
        print e
    
    

def CreateServerFolder(token,serverURL,serverFolder,serverName,serverPort):
    
    folderURL = serverURL + serverFolder
    httpConn = httplib.HTTPSConnection(serverName, serverPort)

    headers = {"Content-type": "application/x-www-form-urlencoded", "Accept": "text/plain"}

    params = urllib.urlencode({'token': token, 'foldername': serverFolder, 'decription': serverFolder, 'f': 'json'})
    folderCreateURL = serverURL + "/createfolder"

    # Connect to URL and post parameters
    httpConn.request("POST", folderCreateURL, params, headers)
    createfolderresponse = httpConn.getresponse()

    if(createfolderresponse.status != 200):
        httpConn.close()
        print "Error while creating the folder.Folder might already exist."
        #return
    else:
        data= createfolderresponse.read()
        httpConn.close()

         # Check that data returned is not an error object
        if not assertJsonSuccess(data):
            print "Error returned by operation. " + data
        else:
            arcpy.AddMessage("Folder created successfully!")




def DeleteExistingServices(server,port,folderURL,serviceName,token):
    try:
        httpConn = httplib.HTTPSConnection(server, port)
        deleteServiceURL = folderURL +"/"+ serviceName+".MapServer/delete"

            # This request needs the token, the JSON defining the service properties,
            #  and the response format
        params = urllib.urlencode({'token': token, 'f': 'json'})

        headers = {"Content-type": "application/x-www-form-urlencoded", "Accept": "text/plain"}

        # Connect to URL and post parameters
        #httpConn = httplib.HTTPSConnection(self.serverName, self.serverPort)
        httpConn.request("POST", deleteServiceURL, params, headers)

        # Read response
        response = httpConn.getresponse()
        if (response.status != 200):
            httpConn.close()
            print "Error while deleting the service."
            return
        else:
            data = response.read()
            httpConn.close()

            # Check that data returned is not an error object
            if not assertJsonSuccess(data):
                print "Error returned by operation. " + data
            else:
                arcpy.AddMessage("Service was deleted successfully")

    except Exception as e:
        print " - Error trying to delete a service."
        print e



def getToken(username, password, serverName, serverPort):
    # Token URL is typically http://server[:port]/arcgis/admin/generateToken
    tokenURL = "/arcgis/admin/generateToken"
    
    params = urllib.urlencode({'username': username, 'password': password, 'client': 'requestip', 'f': 'json'})
    
    headers = {"Content-type": "application/x-www-form-urlencoded", "Accept": "text/plain"}
    
    # Connect to URL and post parameters
    httpConn = httplib.HTTPSConnection(serverName, serverPort)  # over HTTPS
    httpConn.request("POST", tokenURL, params, headers)
    
    # Read response
    response = httpConn.getresponse()
    if (response.status != 200):
        httpConn.close()
        print "Error while fetching tokens from admin URL. Please check the URL and try again."
        return
    else:
        data = response.read()
        httpConn.close()
        
        # Check that data returned is not an error object
        if not assertJsonSuccess(data):            
            return
        
        # Extract the token from it
        token = json.loads(data)        
        return token['token']            
        

# A function that checks that the input JSON object 
#  is not an error object.
def assertJsonSuccess(data):
    obj = json.loads(data)
    if 'status' in obj and obj['status'] == "error":
        print "Error: JSON object returns an error. " + str(obj)
        return False
    else:
        return True
    

if __name__ == "__main__":
##    rootFolder = r"\\enervest.net\shared\ArcGIS\GIS\Geoscience Technology\Map Services\Prod\Charleston"
##    ArcGIS_Server_Connection = r"\\enervest.net\shared\ArcGIS\GIS\Geoscience Technology\Admin\Prod\EnerVest Map Services.ags"
##    scratch = r"C:\scratch"
##    username = "siteadmin"
##    password = "Houston123"
##     # Ask for server name &2port
##    serverName ="ev-hdc-arcgis01.enervest.net"
##    serverPort = 6080
    rootFolder = arcpy.GetParameterAsText(0)
    ArcGIS_Server_Connection = arcpy.GetParameterAsText(1)
    scratch = arcpy.GetParameterAsText(2)
    username = arcpy.GetParameterAsText(3)
    password = arcpy.GetParameterAsText(4)
    serverName = arcpy.GetParameterAsText(5)
    serverPort = str(arcpy.GetParameterAsText(6))

   
    Main(rootFolder,scratch,ArcGIS_Server_Connection)
